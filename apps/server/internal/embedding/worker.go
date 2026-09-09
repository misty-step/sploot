package embedding

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type claim struct {
	id            string
	owner         string
	token         string
	pathname      string
	thumbnailPath *string
	mime          string
	attempts      int
}

// Run is the sole bounded indexing executor. Claims and attempt counters commit
// before inference, and results are fenced by both owner and processing token.
// An interrupted claim is recoverable after its two-minute lease, including a
// final attempt that must become failed rather than silently replenishing work.
func (s *Service) Run(ctx context.Context) error {
	if !s.running.CompareAndSwap(false, true) {
		return errors.New("embedding executor is already running")
	}
	defer s.running.Store(false)
	if err := s.available(); err != nil {
		return err
	}
	if err := s.prepareQueue(ctx); err != nil {
		return fmt.Errorf("recover indexing queue: %w", err)
	}
	for ctx.Err() == nil {
		if err := s.compute.acquire(ctx, false); err != nil {
			return err
		}
		if err := s.available(); err != nil {
			s.compute.release()
			return err
		}
		job, err := s.claimNext(ctx)
		if err != nil || job == nil {
			s.compute.release()
			if err != nil && ctx.Err() == nil {
				s.opts.Logger.Error("indexing.claim_failed", "error", err)
			}
			if !s.wait(ctx, time.Second) {
				break
			}
			continue
		}
		s.index(ctx, *job)
		s.compute.release()
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

func (s *Service) prepareQueue(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id, owner_user_id)
		SELECT a.id, a.owner_user_id FROM assets a LEFT JOIN asset_embeddings e ON e.asset_id = a.id
		WHERE e.asset_id IS NULL`)
	if err != nil {
		return err
	}
	// An explicit model/preprocessing change requires a new aligned image
	// projection. Never search mixed vector spaces or keep a stale result cache.
	// Reconcile trash too; claims exclude it until restoration makes it visible.
	_, err = tx.ExecContext(ctx, `UPDATE asset_embeddings SET model_name = ?1, model_version = ?2,
		dim = 0, image_embedding = NULL, status = 'pending', attempts = 0, error = NULL,
		processing_token = NULL, processing_until = NULL, next_attempt_at = NULL, updated_at = ?3
		WHERE model_version != '' AND model_version != ?2 AND status != 'processing'`, modelName, inference.ModelVersion, time.Now().UTC())
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) claimNext(ctx context.Context) (*claim, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	_, err = tx.ExecContext(ctx, `UPDATE asset_embeddings SET
		status = CASE WHEN attempts >= ?1 THEN 'failed' ELSE 'pending' END,
		processing_token = NULL, processing_until = NULL, error = 'embedding_interrupted',
		next_attempt_at = CASE WHEN attempts >= ?1 THEN NULL ELSE ?2 END, updated_at = ?2
		WHERE status = 'processing' AND processing_until <= ?2`, maxAttempts, now)
	if err != nil {
		return nil, err
	}
	var job claim
	err = tx.QueryRowContext(ctx, `SELECT a.id, a.owner_user_id, a.pathname, a.thumbnail_path, a.mime, e.attempts
		FROM asset_embeddings e JOIN assets a ON a.id = e.asset_id AND a.owner_user_id = e.owner_user_id
		WHERE a.deleted_at IS NULL AND e.status = 'pending' AND e.attempts < ?1
		AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= ?2)
		ORDER BY e.created_at, a.id LIMIT 1`, maxAttempts, now).Scan(&job.id, &job.owner, &job.pathname, &job.thumbnailPath, &job.mime, &job.attempts)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, tx.Commit()
	}
	if err != nil {
		return nil, err
	}
	job.token = model.NewID()
	err = tx.QueryRowContext(ctx, `UPDATE asset_embeddings SET status = 'processing', model_name = ?4, model_version = ?5,
		processing_token = ?3, processing_until = ?6, attempts = attempts + 1, error = NULL, next_attempt_at = NULL, updated_at = ?7
		WHERE asset_id = ?1 AND owner_user_id = ?2 AND status = 'pending' AND attempts < ?8
		RETURNING attempts`, job.id, job.owner, job.token, modelName, inference.ModelVersion, now.Add(processingTTL), now, maxAttempts).Scan(&job.attempts)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *Service) mediaInput(job claim) (string, error) {
	relative := job.pathname
	if job.thumbnailPath != nil && *job.thumbnailPath != "" {
		relative = *job.thumbnailPath
	} else if job.mime == "video/mp4" || job.mime == "video/webm" || job.mime == "video/quicktime" {
		return "", errors.New("video is missing its indexing poster")
	}
	if !filepath.IsLocal(relative) {
		return "", errors.New("invalid private media pathname")
	}
	root, err := filepath.EvalSymlinks(s.opts.MediaDirectory)
	if err != nil {
		return "", err
	}
	root, err = filepath.Abs(root)
	if err != nil {
		return "", err
	}
	filename, err := filepath.EvalSymlinks(filepath.Join(root, relative))
	if err != nil {
		return "", err
	}
	contained, err := filepath.Rel(root, filename)
	if err != nil || !filepath.IsLocal(contained) {
		return "", errors.New("private media path escapes library directory")
	}
	info, err := os.Stat(filename)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("private media is not a regular file")
	}
	return filename, nil
}

func (s *Service) index(ctx context.Context, job claim) {
	engine, err := s.currentEngine()
	var filename string
	if err == nil {
		filename, err = s.mediaInput(job)
	}
	if err == nil {
		computeCtx, cancel := context.WithTimeout(ctx, inferenceTimeout)
		var vector []float32
		vector, err = engine.Image(computeCtx, filename)
		cancel()
		if err == nil {
			err = validateVector(vector)
		}
		if err == nil {
			settle, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			applied, writeErr := s.complete(settle, job, vector)
			if writeErr != nil {
				s.opts.Logger.Error("indexing.completion_failed", "asset_id", job.id, "error", writeErr)
			} else if applied {
				s.opts.Logger.Info("indexing.ready", "asset_id", job.id, "attempt", job.attempts)
			}
			return
		}
	}
	s.opts.Logger.Warn("indexing.attempt_failed", "asset_id", job.id, "attempt", job.attempts, "error", err)
	settle, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if writeErr := s.fail(settle, job, err); writeErr != nil {
		s.opts.Logger.Error("indexing.failure_write_failed", "asset_id", job.id, "error", writeErr)
	}
}

func (s *Service) complete(ctx context.Context, job claim, vector []float32) (bool, error) {
	data, err := encodeVector(vector)
	if err != nil {
		return false, err
	}
	result, err := s.db.ExecContext(ctx, `UPDATE asset_embeddings SET model_name = ?4, model_version = ?5, dim = ?6, image_embedding = ?7,
		status = 'ready', error = NULL, processing_token = NULL, processing_until = NULL, next_attempt_at = NULL, updated_at = ?8
		WHERE asset_id = ?1 AND owner_user_id = ?2 AND status = 'processing' AND processing_token = ?3
		AND EXISTS (SELECT 1 FROM assets a WHERE a.id = asset_id AND a.owner_user_id = ?2 AND a.deleted_at IS NULL)`,
		job.id, job.owner, job.token, modelName, inference.ModelVersion, inference.Dimension, data, time.Now().UTC())
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (s *Service) fail(ctx context.Context, job claim, cause error) error {
	now := time.Now().UTC()
	status := "pending"
	var next *time.Time
	if job.attempts >= maxAttempts {
		status = "failed"
	} else {
		due := now.Add(retryBase * time.Duration(1<<max(0, job.attempts-1)))
		next = &due
	}
	reason := "embedding_inference_failed"
	if errors.Is(cause, context.Canceled) || errors.Is(cause, context.DeadlineExceeded) {
		reason = "embedding_interrupted"
	}
	// Keep the detailed local error in logs, not in another account's public
	// response or durable error field (which could contain a filesystem path).
	_, err := s.db.ExecContext(ctx, `UPDATE asset_embeddings SET status = ?4, error = ?5, next_attempt_at = ?6,
		processing_token = NULL, processing_until = NULL, updated_at = ?7
		WHERE asset_id = ?1 AND owner_user_id = ?2 AND status = 'processing' AND processing_token = ?3`, job.id, job.owner, job.token, status, reason, next, now)
	return err
}

// Retry rearms durable state only. Automatic work is finite; an explicit owner
// retry starts a new bounded cycle without spawning a second executor.
func (s *Service) Retry(ctx context.Context, owner, assetID string) error {
	if owner == "" {
		return apiError(401, "Authentication required", "unauthorized", 0)
	}
	if err := s.available(); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id string
	err = tx.QueryRowContext(ctx, `SELECT id FROM assets WHERE id = ?1 AND owner_user_id = ?2 AND deleted_at IS NULL`, assetID, owner).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return apiError(404, "Asset not found", "not_found", 0)
	}
	if err != nil {
		return err
	}
	var state, version string
	var until, next sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT status, model_version, processing_until, next_attempt_at FROM asset_embeddings WHERE asset_id = ?1 AND owner_user_id = ?2`, assetID, owner).Scan(&state, &version, &until, &next)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	now := time.Now().UTC()
	if state == "ready" && version == inference.ModelVersion {
		return nil
	}
	if state == "processing" && until.Valid && until.Time.After(now) {
		return apiError(409, "Embedding is already processing", "embedding_processing", retrySeconds(until.Time, now))
	}
	if next.Valid && next.Time.After(now) {
		return apiError(429, "Embedding retry is scheduled", "embedding_cooldown", retrySeconds(next.Time, now))
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id, owner_user_id) VALUES (?1, ?2)
		ON CONFLICT(asset_id) DO UPDATE SET status = 'pending', model_name = ?3, model_version = ?4, dim = 0, image_embedding = NULL,
		attempts = CASE WHEN asset_embeddings.status IN ('failed', 'ready') OR asset_embeddings.attempts >= ?6 THEN 0 ELSE asset_embeddings.attempts END,
		error = NULL, processing_token = NULL, processing_until = NULL, next_attempt_at = NULL, updated_at = ?5
		WHERE asset_embeddings.owner_user_id = ?2`, assetID, owner, modelName, inference.ModelVersion, now, maxAttempts)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
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
	Error         *string    `json:"error,omitempty"`
	NextAttemptAt *time.Time `json:"nextAttemptAt,omitempty"`
	TerminalAt    *time.Time `json:"terminalAt,omitempty"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (s *Service) Status(ctx context.Context, owner, assetID string) (Status, error) {
	if owner == "" {
		return Status{}, apiError(401, "Authentication required", "unauthorized", 0)
	}
	var status Status
	var updated *time.Time
	err := s.db.QueryRowContext(ctx, `SELECT a.id, COALESCE(e.status, 'pending'), e.image_embedding IS NOT NULL,
		COALESCE(e.model_name, ?3), COALESCE(e.dim, 0), COALESCE(e.attempts, 0), e.error, e.next_attempt_at, e.updated_at, a.updated_at
		FROM assets a LEFT JOIN asset_embeddings e ON e.asset_id = a.id AND e.owner_user_id = ?2
		WHERE a.id = ?1 AND a.owner_user_id = ?2 AND a.deleted_at IS NULL`, assetID, owner, modelName).Scan(
		&status.AssetID, &status.Status, &status.HasEmbedding, &status.ModelName, &status.Dimension, &status.AttemptCount, &status.Error, &status.NextAttemptAt, &updated, &status.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Status{}, apiError(404, "Asset not found", "not_found", 0)
	}
	if err != nil {
		return Status{}, err
	}
	if updated != nil {
		status.UpdatedAt = *updated
	}
	if status.Status == "failed" {
		status.TerminalAt = &status.UpdatedAt
	}
	if status.Status == "ready" {
		status.CompletedAt = &status.UpdatedAt
	}
	return status, nil
}
