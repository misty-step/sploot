// Package ingest owns the save boundary: immutable originals and posters,
// metadata, the receipt, and durable indexing intent become owned together.
package ingest

import (
	"context"
	"crypto/sha256"
	"database/sql"
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

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/medialock"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const processWaitDelay = time.Second

// LocalImportOrigin admits one explicit loopback IP origin only in a known
// nonproduction environment. Private persistent storage is used in every mode.
type Options struct {
	MediaDirectory      string
	Environment         string
	UploadsEnabled      bool
	Logger              *slog.Logger
	LocalImportOrigin   string
	StorageLimitBytes   int64
	StorageReserveBytes int64
}

type Input struct {
	Filename       string
	MIME           string
	Reader         io.Reader
	IdempotencyKey string
	Tags           []string
}

type Service struct {
	db                  *sql.DB
	store               *objectStore
	logger              *slog.Logger
	ffmpeg              string
	ffprobe             string
	enabled             bool
	localImportOrigin   string
	fetchClient         *http.Client
	storageLimitBytes   int64
	storageReserveBytes int64
	availableBytes      func() (int64, error)
}

func New(db *sql.DB, opts Options) (*Service, error) {
	if db == nil {
		return nil, errors.New("ingestion requires a SQLite database")
	}
	if opts.StorageLimitBytes < 0 || opts.StorageReserveBytes < 0 {
		return nil, errors.New("storage limit and free-disk reserve must be nonnegative")
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	local := opts.Environment == "development" || opts.Environment == "test" || opts.Environment == "qa" || opts.Environment == "local"
	origin, err := validateLocalImportOrigin(opts.LocalImportOrigin, local)
	if err != nil {
		return nil, err
	}
	store, err := newObjectStore(opts.MediaDirectory)
	if err != nil {
		return nil, err
	}
	s := &Service{db: db, store: store, logger: opts.Logger, enabled: opts.UploadsEnabled, localImportOrigin: origin, fetchClient: newFetchClient(origin),
		storageLimitBytes: opts.StorageLimitBytes, storageReserveBytes: opts.StorageReserveBytes, availableBytes: store.availableBytes}
	recoveryCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.resumePurges(recoveryCtx); err != nil {
		_ = s.Close()
		return nil, fmt.Errorf("resume permanent media deletion: %w", err)
	}
	if !s.enabled {
		return s, nil
	}
	s.ffmpeg, err = exec.LookPath("ffmpeg")
	if err == nil {
		s.ffprobe, err = exec.LookPath("ffprobe")
	}
	if err != nil {
		_ = store.root.Close()
		return nil, fmt.Errorf("FFmpeg and ffprobe are required for media ingestion: %w", err)
	}
	return s, nil
}

func (s *Service) Close() error {
	s.fetchClient.CloseIdleConnections()
	return s.store.root.Close()
}

func (s *Service) Save(ctx context.Context, owner string, input Input) (model.UploadResponse, error) {
	return s.saveRequest(ctx, owner, input, "")
}

// A retained receipt is returned before fetching or decoding, even if the source
// URL has changed or disappeared since the first successful request.
func (s *Service) SaveURL(ctx context.Context, owner, rawURL string, input Input) (model.UploadResponse, error) {
	if strings.TrimSpace(rawURL) == "" {
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
		if err != nil && state.outcome != commitUncertain && claim != nil {
			cleanupCtx, done := context.WithTimeout(context.Background(), 5*time.Second)
			defer done()
			if _, releaseErr := s.db.ExecContext(cleanupCtx, `DELETE FROM upload_idempotency WHERE owner_user_id=? AND id=? AND lease_token=? AND status='processing'`, owner, claim.id, claim.token); releaseErr != nil {
				s.logger.Error("upload receipt release failed", "error", releaseErr)
			}
		}
	}()
	// One bounded spool at a time per library, even through separate services or
	// processes. Always take media admission before the shared library lock.
	admission, err := medialock.Acquire(ctx, s.store.directory, true)
	if err != nil {
		return result, err
	}
	defer admission.Close()
	mediaLock, err := medialock.Acquire(ctx, s.store.libraryDirectory(), false)
	if err != nil {
		return result, err
	}
	defer mediaLock.Close()
	defer state.cleanup()
	tags, err := sanitizeTags(input.Tags)
	if err != nil {
		return result, err
	}
	// Temp originals live on the media filesystem. Reserve the worst-case spool,
	// its durable copy and poster before reading any upload or fetching a URL.
	if err := s.checkReserve(2*int64(contract.UploadMaxBytes) + maxPosterBytes + 1); err != nil {
		return result, err
	}
	if rawURL != "" {
		body, filename, mediaType, fetchErr := s.Fetch(ctx, rawURL)
		if fetchErr != nil {
			return result, fetchErr
		}
		defer body.Close()
		input.Reader, input.Filename, input.MIME = body, filename, mediaType
	}
	input.MIME = normalizeMIME(input.MIME)
	if !contract.IsAllowedMIME(input.MIME) {
		return result, invalid("Use JPEG, PNG, WebP, GIF, MP4, or WebM media")
	}
	directory, err := os.MkdirTemp(s.store.directory, ".ingest-")
	if err != nil {
		return result, err
	}
	defer os.RemoveAll(directory)
	original, err := spool(ctx, directory, input.Reader, input.MIME)
	if err != nil {
		return result, err
	}
	// An early short transaction avoids decoding an already retained original.
	// database.Open uses immediate writer transactions: no read-to-write upgrade.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	if err = fenceClaim(ctx, tx, owner, claim); err != nil {
		_ = tx.Rollback()
		return result, err
	}
	existing, err := duplicate(ctx, tx, owner, original.checksum)
	if err != nil {
		_ = tx.Rollback()
		return result, err
	}
	if existing != nil {
		result = *existing
		if err = completeClaim(ctx, tx, owner, claim, result); err != nil {
			_ = tx.Rollback()
			return result, err
		}
		if err = state.commit(tx); err != nil {
			return model.UploadResponse{}, saveCommitError()
		}
		return result, nil
	}
	if err = tx.Rollback(); err != nil {
		return result, err
	}

	// Network, FFmpeg, hashing, and durable filesystem writes never hold the
	// SQLite writer lock. The final transaction admits their full physical size.
	prepared, err := s.prepare(ctx, original)
	if err != nil {
		return result, err
	}
	incoming := original.size + int64(len(prepared.poster))
	if err := s.checkReserve(incoming); err != nil {
		return result, err
	}
	// Reject capacity before publishing any files. The final writer transaction
	// repeats admission alongside metadata, preserving instance-wide atomicity.
	tx, err = s.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	err = s.admitStorage(ctx, tx, incoming)
	_ = tx.Rollback()
	if err != nil {
		return result, err
	}
	assetID := model.NewID()
	filename := safeFilename(input.Filename, input.MIME)
	ownerHash := sha256.Sum256([]byte(owner))
	prefix := "uploads/" + hex.EncodeToString(ownerHash[:16]) + "/" + assetID
	originalObject, err := s.store.putFile(ctx, prefix+"/"+filename, original)
	state.track(originalObject)
	if err != nil {
		return result, err
	}
	posterObject, err := s.store.putBytes(ctx, prefix+"/poster/preview.jpg", prepared.poster, prepared.posterChecksum)
	state.track(posterObject)
	if err != nil {
		return result, err
	}
	if err := s.checkReserve(0); err != nil {
		return result, err
	}
	tx, err = s.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if err = fenceClaim(ctx, tx, owner, claim); err != nil {
		return result, err
	}
	existing, err = duplicate(ctx, tx, owner, original.checksum)
	if err != nil {
		return result, err
	}
	if existing != nil {
		result = *existing
		if err = completeClaim(ctx, tx, owner, claim, result); err != nil {
			return result, err
		}
		err = state.commit(tx)
		// The transaction never references this request's staged objects.
		state.outcome = uncommitted
		if err != nil {
			return model.UploadResponse{}, saveCommitError()
		}
		return result, nil
	}
	if err = s.admitStorage(ctx, tx, incoming); err != nil {
		return result, err
	}
	if err = admitTags(ctx, tx, owner, tags); err != nil {
		return result, err
	}
	blobURL, posterURL := "/media/"+assetID, "/media/"+assetID+"?thumbnail=1"
	var createdAt time.Time
	err = tx.QueryRowContext(ctx, `INSERT INTO assets
		(id,owner_user_id,blob_url,thumbnail_url,pathname,thumbnail_path,storage_size,storage_sha256,thumbnail_storage_size,thumbnail_storage_sha256,mime,width,height,size,checksum_sha256,favorite)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) RETURNING created_at`, assetID, owner, blobURL, posterURL, originalObject.key, posterObject.key, original.size, original.checksum, posterObject.size, prepared.posterChecksum, input.MIME, prepared.width, prepared.height, original.size, original.checksum).Scan(&createdAt)
	if err != nil {
		return result, err
	}
	if err = recordTags(ctx, tx, owner, assetID, tags); err != nil {
		return result, err
	}
	// The worker claims the model version. Saving remains durable if inference
	// is unavailable: no inference invocation can roll these bytes back.
	if _, err = tx.ExecContext(ctx, `INSERT INTO asset_embeddings (asset_id,owner_user_id) VALUES (?,?)`, assetID, owner); err != nil {
		return result, err
	}
	result = model.UploadResponse{Success: true, Asset: &model.UploadAsset{ID: assetID, BlobURL: blobURL, Pathname: originalObject.key, Filename: filename, MIMEType: input.MIME, Size: original.size, Checksum: original.checksum, CreatedAt: createdAt, NeedsEmbedding: true}, Message: "Upload successful"}
	if err = completeClaim(ctx, tx, owner, claim, result); err != nil {
		return result, err
	}
	if err = state.commit(tx); err != nil {
		return model.UploadResponse{}, saveCommitError()
	}
	return result, nil
}

func duplicate(ctx context.Context, tx *sql.Tx, owner, checksum string) (*model.UploadResponse, error) {
	var asset model.UploadAsset
	var deleted bool
	err := tx.QueryRowContext(ctx, `SELECT a.id,a.blob_url,a.pathname,a.mime,a.size,a.checksum_sha256,a.created_at,a.deleted_at IS NOT NULL,
		NOT EXISTS (SELECT 1 FROM asset_embeddings e WHERE e.asset_id=a.id AND e.owner_user_id=a.owner_user_id AND e.status='ready' AND e.image_embedding IS NOT NULL)
		FROM assets a WHERE a.owner_user_id=? AND a.checksum_sha256=?`, owner, checksum).Scan(&asset.ID, &asset.BlobURL, &asset.Pathname, &asset.MIMEType, &asset.Size, &asset.Checksum, &asset.CreatedAt, &deleted, &asset.NeedsEmbedding)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	asset.Filename = path.Base(asset.Pathname)
	if !deleted {
		if _, err := tx.ExecContext(ctx, `INSERT INTO asset_embeddings (asset_id,owner_user_id) VALUES (?,?) ON CONFLICT(asset_id) DO NOTHING`, asset.ID, owner); err != nil {
			return nil, err
		}
	}
	message := "This media already exists in your library"
	if deleted {
		message = "This media already exists in your trash; restore it to browse it"
	}
	return &model.UploadResponse{Success: true, Asset: &asset, Message: message, IsDuplicate: true}, nil
}

func admitTags(ctx context.Context, tx *sql.Tx, owner string, names []string) error {
	if len(names) == 0 {
		return nil
	}
	var existing int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM tags WHERE owner_user_id=?`, owner).Scan(&existing); err != nil {
		return err
	}
	for _, name := range names {
		var present bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM tags WHERE owner_user_id=? AND name=?)`, owner, name).Scan(&present); err != nil {
			return err
		}
		if !present {
			existing++
		}
	}
	if existing > contract.TagMaxPerUser {
		return invalid("The account tag limit has been reached")
	}
	return nil
}

func recordTags(ctx context.Context, tx *sql.Tx, owner, assetID string, names []string) error {
	for _, name := range names {
		if _, err := tx.ExecContext(ctx, `INSERT INTO tags (id,owner_user_id,name) VALUES (?,?,?) ON CONFLICT(owner_user_id,name) DO NOTHING`, model.NewID(), owner, name); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO asset_tags (asset_id,tag_id) SELECT a.id,t.id FROM assets a JOIN tags t ON t.owner_user_id=a.owner_user_id WHERE a.id=? AND a.owner_user_id=? AND t.name=? ON CONFLICT(asset_id,tag_id) DO NOTHING`, assetID, owner, name); err != nil {
			return err
		}
	}
	return nil
}

var idempotencyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

type uploadClaim struct{ id, token string }

func (s *Service) claim(ctx context.Context, owner, key string) (*uploadClaim, *model.UploadResponse, error) {
	var exists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=?)`, owner).Scan(&exists); err != nil {
		return nil, nil, err
	}
	if !exists {
		return nil, nil, &model.APIError{Status: 403, Code: "account_unavailable", Message: "An existing account is required"}
	}
	if key == "" {
		return nil, nil, nil
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM upload_idempotency WHERE owner_user_id=? AND ((status='completed' AND retained_until<CURRENT_TIMESTAMP) OR (status='processing' AND lease_expires_at<datetime('now','-10 minutes')))`, owner); err != nil {
		return nil, nil, err
	}
	claim := &uploadClaim{id: model.NewID(), token: model.NewID()}
	err := s.db.QueryRowContext(ctx, `INSERT INTO upload_idempotency (id,owner_user_id,key,status,lease_token,lease_expires_at,retained_until)
		VALUES (?,?,?,'processing',?,datetime('now','+2 minutes'),datetime('now','+7 days'))
		ON CONFLICT(owner_user_id,key) DO UPDATE SET status='processing',result=NULL,lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at,retained_until=excluded.retained_until,updated_at=CURRENT_TIMESTAMP
		WHERE (upload_idempotency.status='processing' AND upload_idempotency.lease_expires_at<CURRENT_TIMESTAMP) OR (upload_idempotency.status='completed' AND upload_idempotency.retained_until<CURRENT_TIMESTAMP)
		RETURNING id`, claim.id, owner, key, claim.token).Scan(&claim.id)
	if err == nil {
		return claim, nil, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, err
	}
	var status string
	var payload []byte
	if err := s.db.QueryRowContext(ctx, `SELECT status,result FROM upload_idempotency WHERE owner_user_id=? AND key=?`, owner, key).Scan(&status, &payload); err != nil {
		return nil, nil, err
	}
	if status != "completed" {
		return nil, nil, inProgress()
	}
	response, err := decodeReceipt(payload)
	if err != nil {
		return nil, nil, err
	}
	var purged bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM asset_purges WHERE owner_user_id=? AND asset_id=?)`, owner, response.Asset.ID).Scan(&purged); err != nil {
		return nil, nil, err
	}
	if purged {
		return nil, nil, &model.APIError{Status: http.StatusGone, Code: "asset_purged", Message: "The media saved by this request was permanently deleted; use a new idempotency key to save it again"}
	}
	return nil, &response, nil
}

func decodeReceipt(payload []byte) (model.UploadResponse, error) {
	var receipt model.UploadResponse
	if err := json.Unmarshal(payload, &receipt); err != nil {
		return receipt, errors.New("invalid durable upload receipt")
	}
	if !receipt.Success || receipt.Asset == nil || receipt.Asset.ID == "" {
		return receipt, errors.New("durable upload receipt has no successful asset")
	}
	return receipt, nil
}

func fenceClaim(ctx context.Context, tx *sql.Tx, owner string, claim *uploadClaim) error {
	if claim == nil {
		return nil
	}
	var id string
	err := tx.QueryRowContext(ctx, `SELECT id FROM upload_idempotency WHERE owner_user_id=? AND id=? AND lease_token=? AND status='processing' AND lease_expires_at>CURRENT_TIMESTAMP`, owner, claim.id, claim.token).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return inProgress()
	}
	return err
}

func completeClaim(ctx context.Context, tx *sql.Tx, owner string, claim *uploadClaim, result model.UploadResponse) error {
	if claim == nil {
		return nil
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}
	updated, err := tx.ExecContext(ctx, `UPDATE upload_idempotency SET status='completed',result=?,retained_until=datetime('now','+7 days'),updated_at=CURRENT_TIMESTAMP WHERE owner_user_id=? AND id=? AND lease_token=? AND status='processing' AND lease_expires_at>CURRENT_TIMESTAMP`, payload, owner, claim.id, claim.token)
	if err != nil {
		return err
	}
	count, err := updated.RowsAffected()
	if err == nil && count != 1 {
		return inProgress()
	}
	return err
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
func (s *stagedWrite) commit(tx *sql.Tx) error {
	// Never infer a rollback from a failed commit acknowledgement. Unreferenced
	// leftovers are preferable to deleting an original whose transaction won.
	s.outcome = commitUncertain
	err := tx.Commit()
	if err == nil {
		s.outcome = committed
	} else {
		s.logger.Error("upload transaction commit failed", "error", err)
	}
	return err
}
func (s *stagedWrite) cleanup() {
	if s.outcome != uncommitted {
		return
	}
	for _, object := range s.objects {
		if err := s.store.remove(object); err != nil {
			s.logger.Error("uncommitted media cleanup failed", "error", err)
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
func saveCommitError() error {
	return &model.APIError{Status: 503, Code: "server_error", Message: "The save acknowledgement was interrupted; retry with the same idempotency key", Retryable: true, RetryAfter: 2}
}
