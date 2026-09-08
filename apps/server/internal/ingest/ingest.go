// Package ingest owns the only save boundary: original media, physical quota,
// metadata and the durable embedding intent become owned together.
package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const processWaitDelay = time.Second

// LocalImportOrigin admits only one explicit loopback IP origin in a known
// nonproduction environment; it is not a general private-network escape hatch.
type Options struct {
	BlobToken         string
	MediaDirectory    string
	Environment       string
	UploadsEnabled    bool
	Logger            *slog.Logger
	FFmpegPath        string
	FFprobePath       string
	LocalImportOrigin string
}

type Input struct {
	Filename       string
	MIME           string
	Reader         io.Reader
	IdempotencyKey string
	Tags           []string
}

type Service struct {
	pool              *pgxpool.Pool
	store             *objectStore
	logger            *slog.Logger
	ffmpeg            string
	ffprobe           string
	enabled           bool
	localImportOrigin string
	fetchClient       *http.Client
}

func New(pool *pgxpool.Pool, opts Options) (*Service, error) {
	if pool == nil {
		return nil, errors.New("ingestion requires a PostgreSQL pool")
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	local := opts.Environment == "development" || opts.Environment == "test" || opts.Environment == "qa" || opts.Environment == "local"
	if opts.MediaDirectory != "" && !local {
		return nil, errors.New("local media storage requires an explicit nonproduction environment")
	}
	if opts.MediaDirectory != "" && opts.BlobToken != "" {
		return nil, errors.New("choose either Blob storage or explicit local media storage")
	}
	origin, err := validateLocalImportOrigin(opts.LocalImportOrigin, local)
	if err != nil {
		return nil, err
	}
	s := &Service{pool: pool, logger: logger, enabled: opts.UploadsEnabled, localImportOrigin: origin}
	s.fetchClient = newFetchClient(origin)
	if !opts.UploadsEnabled {
		return s, nil
	}
	s.store, err = newObjectStore(opts.BlobToken, opts.MediaDirectory)
	if err != nil {
		return nil, err
	}
	if opts.FFmpegPath == "" {
		opts.FFmpegPath = "ffmpeg"
	}
	if opts.FFprobePath == "" {
		opts.FFprobePath = "ffprobe"
	}
	s.ffmpeg, err = exec.LookPath(opts.FFmpegPath)
	if err != nil {
		return nil, fmt.Errorf("FFmpeg is required for media ingestion: %w", err)
	}
	s.ffprobe, err = exec.LookPath(opts.FFprobePath)
	if err != nil {
		return nil, fmt.Errorf("ffprobe is required for media metadata: %w", err)
	}
	return s, nil
}

func (s *Service) Save(ctx context.Context, owner string, input Input) (model.UploadResponse, error) {
	return s.saveRequest(ctx, owner, input, "")
}

// SaveURL claims the request before fetching. Replaying a completed URL save
// cannot refetch a remote URL, decode media, or incur a Blob/embedding call.
func (s *Service) SaveURL(ctx context.Context, owner, rawURL string, input Input) (model.UploadResponse, error) {
	if rawURL == "" {
		return model.UploadResponse{}, invalid("A media URL is required")
	}
	return s.saveRequest(ctx, owner, input, rawURL)
}

func (s *Service) saveRequest(ctx context.Context, owner string, input Input, rawURL string) (result model.UploadResponse, err error) {
	if !s.enabled {
		return result, &model.APIError{Status: 503, Code: "uploads_disabled", Message: "Uploads are temporarily disabled"}
	}
	if owner == "" {
		return result, &model.APIError{Status: 401, Message: "Authentication is required"}
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(contract.UploadTimeoutMS)*time.Millisecond)
	defer cancel()
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if input.IdempotencyKey != "" && !idempotencyPattern.MatchString(input.IdempotencyKey) {
		return result, invalid("Invalid upload idempotency key")
	}
	claim, replay, err := s.claim(ctx, owner, input.IdempotencyKey)
	if err != nil {
		return result, err
	}
	if replay != nil {
		return *replay, nil
	}
	state := stagedWrite{store: s.store, logger: s.logger}
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		state.cleanup(cleanupCtx)
		if err != nil && state.outcome != commitUncertain && claim != nil {
			if _, releaseErr := s.pool.Exec(cleanupCtx, `DELETE FROM upload_idempotency WHERE owner_user_id=$1 AND id=$2 AND lease_token=$3 AND status='processing'`, owner, claim.id, claim.token); releaseErr != nil {
				s.logger.Error("upload receipt release failed", "owner", owner, "error", releaseErr)
			}
		}
	}()
	tags, err := sanitizeTags(input.Tags)
	if err != nil {
		return result, err
	}
	if rawURL != "" {
		body, filename, mime, fetchErr := s.Fetch(ctx, rawURL)
		if fetchErr != nil {
			return result, fetchErr
		}
		defer body.Close()
		input.Reader, input.Filename, input.MIME = body, filename, mime
	}
	input.MIME = normalizeMIME(input.MIME)
	if !contract.IsAllowedMIME(input.MIME) {
		return result, invalid("Use JPEG, PNG, WebP, GIF, MP4, or WebM media")
	}
	directory, err := os.MkdirTemp("", "sploot-ingest-")
	if err != nil {
		return result, err
	}
	defer os.RemoveAll(directory)
	original, err := spool(ctx, directory, input.Reader, input.MIME)
	if err != nil {
		return result, err
	}
	filename := safeFilename(input.Filename, input.MIME)
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return result, err
	}
	defer func() {
		rollbackCtx, done := context.WithTimeout(context.Background(), 3*time.Second)
		defer done()
		_ = tx.Rollback(rollbackCtx)
	}()
	// This is the same transaction-scoped lock used by the existing enrollment,
	// quota and tag writers. No session locks: pooled Neon uses PgBouncer.
	if err = lockOwner(ctx, tx, owner); err != nil {
		return result, err
	}
	if err = fenceClaim(ctx, tx, owner, claim); err != nil {
		return result, err
	}
	existing, err := duplicate(ctx, tx, owner, original.checksum)
	if err != nil {
		return result, err
	}
	if existing != nil {
		result = *existing
		if err = completeClaim(ctx, tx, owner, claim, result); err != nil {
			return result, err
		}
		if err = state.commit(ctx, tx); err != nil {
			return result, saveCommitError(err)
		}
		return result, nil
	}
	// Holding the quota row until commit prevents overlapping physical writes
	// from taking the same headroom. Existing durable reservations also count.
	if err = admitQuota(ctx, tx, owner, original.size); err != nil {
		return result, err
	}
	prepared, err := s.prepare(ctx, original)
	if err != nil {
		return result, err
	}
	if err = admitQuota(ctx, tx, owner, original.size+int64(len(prepared.poster))); err != nil {
		return result, err
	}
	if err = admitTags(ctx, tx, owner, tags); err != nil {
		return result, err
	}
	assetID := model.NewID()
	ownerHash := sha256.Sum256([]byte(owner))
	prefix := "uploads/" + hex.EncodeToString(ownerHash[:10]) + "/" + assetID
	originalObject, err := s.store.putFile(ctx, prefix+"/"+filename, original)
	state.track(originalObject)
	if err != nil {
		return result, err
	}
	posterObject, err := s.store.putBytes(ctx, prefix+"/poster/preview.jpg", prepared.poster, "image/jpeg", prepared.posterChecksum)
	state.track(posterObject)
	if err != nil {
		return result, err
	}
	var createdAt time.Time
	err = tx.QueryRow(ctx, `INSERT INTO assets
		(id,owner_user_id,blob_url,thumbnail_url,pathname,thumbnail_path,storage_provider,storage_key,storage_source_key,thumbnail_storage_key,thumbnail_storage_source_key,storage_config_fingerprint,storage_size,storage_sha256,thumbnail_storage_size,thumbnail_storage_sha256,mime,width,height,size,checksum_sha256,favorite,"updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,'vercel',$5,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$9,false,now())
		ON CONFLICT (owner_user_id,checksum_sha256) DO NOTHING RETURNING "createdAt"`, assetID, owner, originalObject.url, posterObject.url, originalObject.key, posterObject.key, s.store.fingerprint, original.size, original.checksum, len(prepared.poster), prepared.posterChecksum, input.MIME, prepared.width, prepared.height).Scan(&createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// A writer predating the owner lock may win the checksum constraint.
		// Return its actual asset, never a receipt for the discarded objects.
		existing, lookupErr := duplicate(ctx, tx, owner, original.checksum)
		if lookupErr != nil {
			return result, lookupErr
		}
		if existing == nil {
			return result, errors.New("checksum conflict without a visible owner asset")
		}
		result = *existing
		if err = completeClaim(ctx, tx, owner, claim, result); err != nil {
			return result, err
		}
		if err = state.commitReceiptOnly(ctx, tx); err != nil {
			return result, saveCommitError(err)
		}
		return result, nil
	}
	if err != nil {
		return result, err
	}
	for _, rendition := range []struct {
		name   string
		object storedObject
	}{{"original", originalObject}, {"thumbnail", posterObject}} {
		o := rendition.object
		_, err = tx.Exec(ctx, `INSERT INTO asset_storage_replicas (id,asset_id,rendition,provider,source_key,logical_key,delivery_url,size,sha256,content_type,generation,active,updated_at) VALUES ($1,$2,$3,'vercel',$4,$4,$5,$6,$7,$8,0,true,now())`, model.NewID(), assetID, rendition.name, o.key, o.url, o.size, o.checksum, o.mime)
		if err != nil {
			return result, err
		}
	}
	if err = recordTags(ctx, tx, owner, assetID, tags); err != nil {
		return result, err
	}
	// No provider invocation follows this insert. The background executor owns
	// pending work, so indexing failure cannot enter the blob rollback path.
	_, err = tx.Exec(ctx, `INSERT INTO asset_embeddings (asset_id,owner_user_id,model_name,model_version,dim,status,next_attempt_at,"updatedAt") VALUES ($1,$2,$3,$4,0,'pending',now(),now())`, assetID, owner, contract.EmbeddingModel, contract.EmbeddingVersion)
	if err != nil {
		return result, err
	}
	result = model.UploadResponse{Success: true, Asset: &model.UploadAsset{ID: assetID, BlobURL: originalObject.url, Pathname: originalObject.key, Filename: filename, MIMEType: input.MIME, Size: original.size, Checksum: original.checksum, CreatedAt: createdAt, NeedsEmbedding: true}, Message: "Upload successful", IsDuplicate: false}
	if err = completeClaim(ctx, tx, owner, claim, result); err != nil {
		return result, err
	}
	if err = state.commit(ctx, tx); err != nil {
		// COMMIT acknowledgement can be lost even after durable success. Keep
		// bytes in that case; a same-key replay/checksum lookup resolves it.
		return model.UploadResponse{}, saveCommitError(err)
	}
	return result, nil
}

func lockOwner(ctx context.Context, tx pgx.Tx, owner string) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "sploot:enrollment:user:"+owner); err != nil {
		return err
	}
	var found string
	if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR KEY SHARE`, owner).Scan(&found); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &model.APIError{Status: 403, Code: "enrollment_unavailable", Message: "An existing enrolled account is required"}
		}
		return err
	}
	return nil
}

func duplicate(ctx context.Context, tx pgx.Tx, owner, checksum string) (*model.UploadResponse, error) {
	var asset model.UploadAsset
	var deleted bool
	err := tx.QueryRow(ctx, `SELECT a.id,a.blob_url,a.pathname,a.mime,a.size,a.checksum_sha256,a."createdAt",a.deleted_at IS NOT NULL,
		NOT EXISTS (SELECT 1 FROM asset_embeddings e WHERE e.asset_id=a.id AND e.owner_user_id=$1 AND e.model_name=$3 AND e.model_version=$4 AND e.status='ready' AND e.image_embedding IS NOT NULL)
		FROM assets a WHERE a.owner_user_id=$1 AND a.checksum_sha256=$2`, owner, checksum, contract.EmbeddingModel, contract.EmbeddingVersion).Scan(&asset.ID, &asset.BlobURL, &asset.Pathname, &asset.MIMEType, &asset.Size, &asset.Checksum, &asset.CreatedAt, &deleted, &asset.NeedsEmbedding)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	asset.Filename = path.Base(asset.Pathname)
	if !deleted {
		// Repair only a missing intent; failed/terminal jobs retain their paid
		// attempt and revival bounds instead of being reset by duplicate saves.
		_, err = tx.Exec(ctx, `INSERT INTO asset_embeddings (asset_id,owner_user_id,model_name,model_version,dim,status,next_attempt_at,"updatedAt") VALUES ($1,$2,$3,$4,0,'pending',now(),now()) ON CONFLICT (asset_id) DO NOTHING`, asset.ID, owner, contract.EmbeddingModel, contract.EmbeddingVersion)
		if err != nil {
			return nil, err
		}
	}
	message := "This media already exists in your library"
	if deleted {
		message = "This media already exists in your trash; restore it to browse it"
	}
	return &model.UploadResponse{Success: true, Asset: &asset, Message: message, IsDuplicate: true}, nil
}

const physicalUsageSQL = `SELECT COALESCE(SUM(
	COALESCE((SELECT SUM(r.size) FROM asset_storage_replicas r WHERE r.asset_id=a.id AND r.rendition='original' AND r.active),a.storage_size,a.size)
	+ COALESCE((SELECT SUM(r.size) FROM asset_storage_replicas r WHERE r.asset_id=a.id AND r.rendition='thumbnail' AND r.active),a.thumbnail_storage_size,0)),0)::bigint
	FROM assets a WHERE a.owner_user_id=$1`

func admitQuota(ctx context.Context, tx pgx.Tx, owner string, incoming int64) error {
	if _, err := tx.Exec(ctx, `INSERT INTO user_storage_quotas (user_id,updated_at) VALUES ($1,now()) ON CONFLICT (user_id) DO NOTHING`, owner); err != nil {
		return err
	}
	var quota model.Quota
	if err := tx.QueryRow(ctx, `SELECT limit_bytes FROM user_storage_quotas WHERE user_id=$1 FOR UPDATE`, owner).Scan(&quota.LimitBytes); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM storage_quota_reservations WHERE owner_user_id=$1 AND expires_at<=clock_timestamp()`, owner); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, physicalUsageSQL, owner).Scan(&quota.UsedBytes); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(bytes),0)::bigint FROM storage_quota_reservations WHERE owner_user_id=$1 AND expires_at>clock_timestamp()`, owner).Scan(&quota.ReservedBytes); err != nil {
		return err
	}
	quota.IncomingBytes = incoming
	quota.RemainingBytes = max(0, quota.LimitBytes-quota.UsedBytes-quota.ReservedBytes-incoming)
	if incoming <= 0 || incoming > quota.LimitBytes-quota.UsedBytes-quota.ReservedBytes {
		return &model.APIError{Status: 403, Code: "quota_exceeded", Message: "This upload exceeds your storage quota, including originals, posters, and trash", Quota: &quota}
	}
	return nil
}

func admitTags(ctx context.Context, tx pgx.Tx, owner string, names []string) error {
	if len(names) == 0 {
		return nil
	}
	var existing, matching int
	if err := tx.QueryRow(ctx, `SELECT count(*),count(*) FILTER (WHERE name=ANY($2::text[])) FROM tags WHERE owner_user_id=$1`, owner, names).Scan(&existing, &matching); err != nil {
		return err
	}
	if existing+len(names)-matching > contract.TagMaxPerUser {
		return invalid("The account tag limit has been reached")
	}
	return nil
}

func recordTags(ctx context.Context, tx pgx.Tx, owner, assetID string, names []string) error {
	if len(names) == 0 {
		return nil
	}
	ids := make([]string, len(names))
	for index := range ids {
		ids[index] = model.NewID()
	}
	if _, err := tx.Exec(ctx, `INSERT INTO tags (id,owner_user_id,name,"updatedAt")
		SELECT input.id,$1,input.name,now() FROM unnest($2::text[],$3::text[]) AS input(id,name)
		ON CONFLICT (owner_user_id,name) DO NOTHING`, owner, ids, names); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO asset_tags (asset_id,tag_id)
		SELECT a.id,t.id FROM assets a JOIN tags t ON t.owner_user_id=$1 AND t.name=ANY($3::text[])
		WHERE a.id=$2 AND a.owner_user_id=$1 ON CONFLICT (asset_id,tag_id) DO NOTHING`, owner, assetID, names)
	return err
}

var idempotencyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

type uploadClaim struct {
	id    string
	token string
}

func (s *Service) claim(ctx context.Context, owner, key string) (*uploadClaim, *model.UploadResponse, error) {
	if key == "" {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id=$1)`, owner).Scan(&exists); err != nil {
			return nil, nil, err
		}
		if !exists {
			return nil, nil, &model.APIError{Status: 403, Code: "enrollment_unavailable", Message: "An existing enrolled account is required"}
		}
		return nil, nil, nil
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM upload_idempotency WHERE owner_user_id=$1 AND
		((status='completed' AND retained_until<clock_timestamp()) OR
		(status='processing' AND lease_expires_at<clock_timestamp()-interval '10 minutes' AND "updatedAt"<clock_timestamp()-interval '10 minutes'))`, owner); err != nil {
		return nil, nil, err
	}
	claim := &uploadClaim{id: model.NewID(), token: model.NewID()}
	err := s.pool.QueryRow(ctx, `INSERT INTO upload_idempotency (id,owner_user_id,key,lease_token,lease_expires_at,retained_until,"updatedAt")
		SELECT $1,u.id,$3,$4,clock_timestamp()+interval '2 minutes',clock_timestamp()+interval '7 days',now() FROM users u WHERE u.id=$2
		ON CONFLICT (owner_user_id,key) DO UPDATE SET status='processing',result=NULL,lease_token=EXCLUDED.lease_token,lease_expires_at=EXCLUDED.lease_expires_at,retained_until=EXCLUDED.retained_until,"updatedAt"=now()
		WHERE (upload_idempotency.status='processing' AND upload_idempotency.lease_expires_at<clock_timestamp()) OR (upload_idempotency.status='completed' AND upload_idempotency.retained_until<clock_timestamp())
		RETURNING id`, claim.id, owner, key, claim.token).Scan(&claim.id)
	if err == nil {
		return claim, nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, err
	}
	var status string
	var payload []byte
	err = s.pool.QueryRow(ctx, `SELECT status,result FROM upload_idempotency WHERE owner_user_id=$1 AND key=$2`, owner, key).Scan(&status, &payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, &model.APIError{Status: 403, Code: "enrollment_unavailable", Message: "An existing enrolled account is required"}
	}
	if err != nil {
		return nil, nil, err
	}
	if status != "completed" {
		return nil, nil, inProgress()
	}
	response, err := decodeReceipt(payload)
	if err != nil {
		return nil, nil, err
	}
	return nil, &response, nil
}

func decodeReceipt(payload []byte) (model.UploadResponse, error) {
	// Existing Node receipts contain IngestImageResult rather than the public
	// response. Read them directly instead of invalidating seven-day replays.
	var receipt struct {
		model.UploadResponse
		Kind  string `json:"kind"`
		Error struct {
			UserMessage string `json:"userMessage"`
			StatusCode  int    `json:"statusCode"`
		} `json:"error"`
	}
	if err := json.Unmarshal(payload, &receipt); err != nil {
		return model.UploadResponse{}, fmt.Errorf("invalid durable upload receipt: %w", err)
	}
	if receipt.Kind == "invalid" {
		return model.UploadResponse{}, &model.APIError{Status: receipt.Error.StatusCode, Message: receipt.Error.UserMessage}
	}
	if receipt.Kind == "created" || receipt.Kind == "duplicate" {
		receipt.Success = true
		receipt.IsDuplicate = receipt.Kind == "duplicate"
	}
	if !receipt.Success || receipt.Asset == nil || receipt.Asset.ID == "" {
		return model.UploadResponse{}, errors.New("durable upload receipt has no successful asset")
	}
	return receipt.UploadResponse, nil
}

func fenceClaim(ctx context.Context, tx pgx.Tx, owner string, claim *uploadClaim) error {
	if claim == nil {
		return nil
	}
	var id string
	err := tx.QueryRow(ctx, `SELECT id FROM upload_idempotency WHERE owner_user_id=$1 AND id=$2 AND lease_token=$3 AND status='processing' AND lease_expires_at>clock_timestamp() FOR UPDATE`, owner, claim.id, claim.token).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return inProgress()
	}
	return err
}

func completeClaim(ctx context.Context, tx pgx.Tx, owner string, claim *uploadClaim, result model.UploadResponse) error {
	if claim == nil {
		return nil
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}
	updated, err := tx.Exec(ctx, `UPDATE upload_idempotency SET status='completed',result=$4::jsonb,retained_until=clock_timestamp()+interval '7 days',"updatedAt"=now() WHERE owner_user_id=$1 AND id=$2 AND lease_token=$3 AND status='processing' AND lease_expires_at>clock_timestamp()`, owner, claim.id, claim.token, json.RawMessage(payload))
	if err != nil {
		return err
	}
	if updated.RowsAffected() != 1 {
		return inProgress()
	}
	return nil
}

type commitOutcome uint8

const (
	uncommitted commitOutcome = iota
	commitUncertain
	committed
)

type stagedWrite struct {
	store   *objectStore
	logger  *slog.Logger
	objects []storedObject
	outcome commitOutcome
}

func (s *stagedWrite) track(object storedObject) {
	if object.key != "" {
		s.objects = append(s.objects, object)
	}
}
func (s *stagedWrite) commit(ctx context.Context, tx pgx.Tx) error {
	// Change state before sending COMMIT: an acknowledgement failure is not
	// evidence of rollback. Only a definite server rejection reopens cleanup.
	s.outcome = commitUncertain
	err := tx.Commit(ctx)
	if err == nil {
		s.outcome = committed
	} else {
		var postgresError *pgconn.PgError
		if errors.Is(err, pgx.ErrTxCommitRollback) || errors.As(err, &postgresError) && postgresError.Severity == "ERROR" {
			s.outcome = uncommitted
		}
		s.logger.Error("upload transaction commit failed", "outcome", s.outcome, "error", err)
	}
	return err
}
func (s *stagedWrite) commitReceiptOnly(ctx context.Context, tx pgx.Tx) error {
	err := s.commit(ctx, tx)
	// This transaction records the winning asset's receipt, never our staged
	// objects. They are safe to remove even if that receipt's ACK was lost.
	s.outcome = uncommitted
	return err
}
func (s *stagedWrite) cleanup(ctx context.Context) {
	if s.outcome != uncommitted {
		return
	}
	for _, object := range s.objects {
		if err := s.store.delete(ctx, object); err != nil {
			s.logger.Error("uncommitted media cleanup failed", "key", object.key, "error", err)
		}
	}
}
func invalid(message string) *model.APIError {
	return &model.APIError{Status: 400, Code: "invalid_upload", Message: message}
}
func tooLarge() *model.APIError {
	return &model.APIError{Status: 413, Code: "invalid_upload", Message: fmt.Sprintf("Media exceeds the %d-byte upload limit", contract.UploadMaxBytes)}
}
func inProgress() *model.APIError {
	return &model.APIError{Status: 409, Code: "UPLOAD_IN_PROGRESS", Message: "Upload is already being processed; retry with the same idempotency key", Retryable: true, RetryAfter: 2}
}
func saveCommitError(err error) error {
	return &model.APIError{Status: 503, Code: "server_error", Message: "The save acknowledgement was interrupted; retry with the same idempotency key", Retryable: true, RetryAfter: 2}
}
