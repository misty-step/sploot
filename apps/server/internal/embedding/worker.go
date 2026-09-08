package embedding

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type claim struct {
	id           string
	owner        string
	token        string
	blobURL      string
	thumbnailURL *string
	mime         string
}

// Run is the only indexing executor. Retry only rearms durable state; it never
// starts a second provider path. Postgres claims permit safe process overlap,
// while the atomic running flag rejects accidental duplicate local executors.
func (s *Service) Run(ctx context.Context) error {
	if !s.running.CompareAndSwap(false, true) {
		return errors.New("embedding executor is already running")
	}
	defer s.running.Store(false)
	for ctx.Err() == nil {
		if !s.opts.Enabled || s.opts.CostAdmissionHalted {
			if !s.wait(ctx, 30*time.Second) {
				break
			}
			continue
		}
		job, err := s.claimNext(ctx)
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			s.report("embedding-executor.claim-failed", "limiter_unavailable", 30)
			if !s.wait(ctx, 30*time.Second) {
				break
			}
			continue
		}
		if job == nil {
			if !s.wait(ctx, time.Second) {
				break
			}
			continue
		}
		if delay := s.index(ctx, *job); delay > 0 && !s.wait(ctx, delay) {
			break
		}
	}
	return ctx.Err()
}

func (s *Service) wait(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-s.wake:
		return true
	case <-timer.C:
		return true
	}
}

func (s *Service) claimNext(ctx context.Context) (*claim, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	var job claim
	var attempts int
	// The age gate applies to abandoned processing/failed states, NEVER to a
	// newly committed pending asset. Originals with no intent row are recovered.
	err = tx.QueryRow(ctx, `SELECT a.id,a.owner_user_id,a.blob_url,a.thumbnail_url,a.mime,COALESCE(e.attempt_count,0)
		FROM assets a LEFT JOIN asset_embeddings e ON e.asset_id=a.id
		WHERE a.deleted_at IS NULL AND (e.asset_id IS NULL OR (
			e.terminal_at IS NULL AND e.image_embedding IS NULL AND e.dim=0
			AND (e.next_attempt_at IS NULL OR e.next_attempt_at<=CURRENT_TIMESTAMP)
			AND (e.status IS NULL OR e.status='pending'
				OR (e.status='failed' AND e."updatedAt"<CURRENT_TIMESTAMP-$1::interval)
				OR (e.status='processing' AND e."updatedAt"<CURRENT_TIMESTAMP-$2::interval)
				OR (e.status='ready' AND e."completedAt" IS NULL))))
		ORDER BY a."createdAt",a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED`, durationInterval(failedCooldown), durationInterval(processingTTL)).Scan(
		&job.id, &job.owner, &job.blobURL, &job.thumbnailURL, &job.mime, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if attempts >= maxAttempts {
		_, err = tx.Exec(ctx, `UPDATE asset_embeddings SET status='failed',processing_claim_token=NULL,next_attempt_at=NULL,
			terminal_at=CURRENT_TIMESTAMP,error='Embedding attempt budget exhausted after interrupted work',"updatedAt"=CURRENT_TIMESTAMP
			WHERE asset_id=$1 AND owner_user_id=$2 AND terminal_at IS NULL AND image_embedding IS NULL AND dim=0
			AND attempt_count>=$3 AND (status IS DISTINCT FROM 'processing' OR "updatedAt"<CURRENT_TIMESTAMP-$4::interval)`,
			job.id, job.owner, maxAttempts, durationInterval(processingTTL))
		if err != nil {
			return nil, err
		}
		return nil, tx.Commit(ctx)
	}
	job.token = newToken()
	var token string
	err = tx.QueryRow(ctx, `INSERT INTO asset_embeddings (asset_id,model_name,model_version,dim,status,processing_claim_token,"createdAt","updatedAt")
		VALUES ($1,'pending','pending',0,'processing',$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
		ON CONFLICT (asset_id) DO UPDATE SET status='processing',processing_claim_token=EXCLUDED.processing_claim_token,error=NULL,"updatedAt"=CURRENT_TIMESTAMP
		WHERE asset_embeddings.terminal_at IS NULL AND asset_embeddings.image_embedding IS NULL AND asset_embeddings.dim=0
		AND asset_embeddings.attempt_count<$3
		AND (asset_embeddings.next_attempt_at IS NULL OR asset_embeddings.next_attempt_at<=CURRENT_TIMESTAMP)
		AND (asset_embeddings.status IS NULL OR asset_embeddings.status='pending'
			OR (asset_embeddings.status='failed' AND asset_embeddings."updatedAt"<CURRENT_TIMESTAMP-$4::interval)
			OR (asset_embeddings.status='processing' AND asset_embeddings."updatedAt"<CURRENT_TIMESTAMP-$5::interval)
			OR (asset_embeddings.status='ready' AND asset_embeddings."completedAt" IS NULL))
		RETURNING processing_claim_token`, job.id, job.token, maxAttempts, durationInterval(failedCooldown), durationInterval(processingTTL)).Scan(&token)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *Service) index(ctx context.Context, job claim) time.Duration {
	input, err := s.mediaInput(job)
	if err == nil {
		var vector []float64
		vector, err = s.generate(ctx, job.owner, "embedding_index", "image", input, &job)
		if err == nil {
			settleCtx, cancel := detachedContext()
			defer cancel()
			applied, writeErr := s.complete(settleCtx, job, vector)
			if writeErr != nil {
				// The paid attempt was already counted. Leave the exact claim in
				// place; its bounded TTL recovery cannot erase that charge.
				s.report("embedding-executor.completion-failed", "store_unavailable", 30)
			} else if applied {
				s.opts.Logger.Info("embedding-executor.ready", "asset_id", job.id)
			}
			return 0
		}
	}
	if errors.Is(err, errClaimLost) {
		return 0
	}
	settleCtx, cancel := detachedContext()
	defer cancel()
	if writeErr := s.fail(settleCtx, job, err); writeErr != nil {
		s.report("embedding-executor.failure-write-failed", "store_unavailable", 30)
	}
	var denied *admissionError
	if errors.As(err, &denied) && (circuitOpening(denied.reason) || denied.reason == "provider_circuit_open" || denied.reason == "global_concurrency" || denied.reason == "index_window") {
		return time.Duration(max(30, denied.retryAfter)) * time.Second
	}
	return 0
}

func (s *Service) complete(ctx context.Context, job claim, vector []float64) (bool, error) {
	if err := validateVector(vector); err != nil {
		return false, err
	}
	updated, err := s.pool.Exec(ctx, `UPDATE asset_embeddings e SET model_name=$4,model_version=$5,dim=$6,image_embedding=$7::vector,
		status='ready',error=NULL,attempt_count=0,next_attempt_at=NULL,terminal_at=NULL,processing_claim_token=NULL,"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
		WHERE asset_id=$1 AND owner_user_id=$2 AND status='processing' AND processing_claim_token=$3
		AND terminal_at IS NULL AND image_embedding IS NULL AND dim=0
		AND EXISTS (SELECT 1 FROM assets a WHERE a.id=e.asset_id AND a.owner_user_id=$2 AND a.deleted_at IS NULL)`,
		job.id, job.owner, job.token, contract.EmbeddingModel, contract.EmbeddingVersion, contract.EmbeddingDimension, vectorSQL(vector))
	return updated.RowsAffected() == 1, err
}

func (s *Service) fail(ctx context.Context, job claim, cause error) error {
	var denied *admissionError
	var api *model.APIError
	var provider *providerError
	if errors.As(cause, &denied) {
		_, err := s.pool.Exec(ctx, `UPDATE asset_embeddings SET status='pending',processing_claim_token=NULL,error=$4,
			next_attempt_at=CURRENT_TIMESTAMP+$5::interval,"updatedAt"=CURRENT_TIMESTAMP
			WHERE asset_id=$1 AND owner_user_id=$2 AND processing_claim_token=$3 AND status='processing' AND terminal_at IS NULL AND image_embedding IS NULL AND dim=0`,
			job.id, job.owner, job.token, denied.reason, durationInterval(time.Duration(max(30, denied.retryAfter))*time.Second))
		return err
	}
	reason := "embedding_media_unavailable"
	terminal := true
	retryAfter := providerBackoff
	if errors.As(cause, &provider) {
		reason = provider.reason
		terminal = provider.terminal
		retryAfter = time.Duration(max(30, provider.retryAfter)) * time.Second
	}
	if errors.As(cause, &api) {
		reason = api.Code
	}
	_, err := s.pool.Exec(ctx, `UPDATE asset_embeddings SET status=CASE WHEN $5 OR attempt_count>=$6 THEN 'failed' ELSE 'pending' END,
		processing_claim_token=NULL,error=$4,
		next_attempt_at=CASE WHEN $5 OR attempt_count>=$6 THEN NULL ELSE CURRENT_TIMESTAMP+GREATEST(GREATEST(1,attempt_count)*$7::interval,$8::interval) END,
		terminal_at=CASE WHEN $5 OR attempt_count>=$6 THEN CURRENT_TIMESTAMP ELSE NULL END,"updatedAt"=CURRENT_TIMESTAMP
		WHERE asset_id=$1 AND owner_user_id=$2 AND processing_claim_token=$3 AND status='processing' AND terminal_at IS NULL AND image_embedding IS NULL AND dim=0`,
		job.id, job.owner, job.token, reason, terminal, maxAttempts, durationInterval(retryBase), durationInterval(retryAfter))
	if reason == "embedding_configuration" {
		s.report("embedding-provider.configuration-failed", reason, 0)
	}
	return err
}

// Retry is owner-scoped scheduling, not a bypass for admission, cooldowns or
// failed-media budgets. The database trigger owns the one lifetime revival.
func (s *Service) Retry(ctx context.Context, owner, assetID string) error {
	if owner == "" {
		return apiError(401, "Authentication required", "unauthorized", 0)
	}
	if err := s.providerConfigured(); err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id string
	if err = tx.QueryRow(ctx, `SELECT id FROM assets WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL FOR UPDATE`, assetID, owner).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return apiError(404, "Asset not found", "not_found", 0)
	} else if err != nil {
		return err
	}
	var state Status
	var now time.Time
	err = tx.QueryRow(ctx, `SELECT COALESCE(status,'pending'),image_embedding IS NOT NULL,terminal_at,revive_count,next_attempt_at,"updatedAt",clock_timestamp()
		FROM asset_embeddings WHERE asset_id=$1 AND owner_user_id=$2 FOR UPDATE`, assetID, owner).Scan(
		&state.Status, &state.HasEmbedding, &state.TerminalAt, &state.ReviveCount, &state.NextAttemptAt, &state.UpdatedAt, &now)
	if errors.Is(err, pgx.ErrNoRows) {
		_, err = tx.Exec(ctx, `INSERT INTO asset_embeddings (asset_id,model_name,model_version,dim,status,"createdAt","updatedAt") VALUES ($1,'pending','pending',0,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, assetID)
	} else if err == nil {
		if state.HasEmbedding {
			return nil
		}
		if state.TerminalAt != nil {
			if until := state.TerminalAt.Add(revivalQuarantine); until.After(now) {
				return apiError(429, "Embedding retry is in quarantine", "embedding_quarantine", retrySeconds(until, now))
			}
			if state.ReviveCount >= maxRevivals {
				return apiError(409, "Embedding recovery budget is exhausted", "embedding_revival_exhausted", 0)
			}
			_, err = tx.Exec(ctx, `UPDATE asset_embeddings SET attempt_count=0,status='pending',error=NULL,next_attempt_at=NULL,
				terminal_at=NULL,processing_claim_token=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE asset_id=$1 AND owner_user_id=$2
				AND terminal_at IS NOT NULL AND image_embedding IS NULL AND dim=0 AND revive_count<$3`, assetID, owner, maxRevivals)
		} else {
			if state.NextAttemptAt != nil && state.NextAttemptAt.After(now) {
				return apiError(429, "Embedding retry is scheduled", "embedding_cooldown", retrySeconds(*state.NextAttemptAt, now))
			}
			if state.Status == "processing" && state.UpdatedAt.Add(processingTTL).After(now) {
				return apiError(409, "Embedding is already processing", "embedding_processing", retrySeconds(state.UpdatedAt.Add(processingTTL), now))
			}
			if state.Status == "failed" && state.UpdatedAt.Add(failedCooldown).After(now) {
				return apiError(429, "Embedding retry is cooling down", "embedding_cooldown", retrySeconds(state.UpdatedAt.Add(failedCooldown), now))
			}
			_, err = tx.Exec(ctx, `UPDATE asset_embeddings SET status='pending',processing_claim_token=NULL,error=NULL,next_attempt_at=NULL,"updatedAt"=CURRENT_TIMESTAMP
				WHERE asset_id=$1 AND owner_user_id=$2 AND terminal_at IS NULL AND image_embedding IS NULL AND dim=0`, assetID, owner)
		}
	}
	if err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	select {
	case s.wake <- struct{}{}:
	default:
	}
	return nil
}

type Status struct {
	AssetID       string     `json:"assetId"`
	Status        string     `json:"status"`
	HasEmbedding  bool       `json:"hasEmbedding"`
	ModelName     string     `json:"modelName"`
	Dimension     int        `json:"dimension"`
	AttemptCount  int        `json:"attemptCount"`
	ReviveCount   int        `json:"reviveCount"`
	Error         *string    `json:"error,omitempty"`
	NextAttemptAt *time.Time `json:"nextAttemptAt,omitempty"`
	TerminalAt    *time.Time `json:"terminalAt,omitempty"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (s *Service) Status(ctx context.Context, owner, assetID string) (Status, error) {
	var status Status
	err := s.pool.QueryRow(ctx, `SELECT a.id,COALESCE(e.status,'pending'),COALESCE(e.image_embedding IS NOT NULL,false),COALESCE(e.model_name,'pending'),COALESCE(e.dim,0),
		COALESCE(e.attempt_count,0),COALESCE(e.revive_count,0),e.error,e.next_attempt_at,e.terminal_at,e."completedAt",COALESCE(e."updatedAt",a."updatedAt")
		FROM assets a LEFT JOIN asset_embeddings e ON e.asset_id=a.id AND e.owner_user_id=$2 WHERE a.id=$1 AND a.owner_user_id=$2 AND a.deleted_at IS NULL`, assetID, owner).Scan(
		&status.AssetID, &status.Status, &status.HasEmbedding, &status.ModelName, &status.Dimension, &status.AttemptCount, &status.ReviveCount, &status.Error, &status.NextAttemptAt, &status.TerminalAt, &status.CompletedAt, &status.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Status{}, apiError(404, "Asset not found", "not_found", 0)
	}
	return status, err
}
