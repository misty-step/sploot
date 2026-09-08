package library

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type Service struct {
	pool         *pgxpool.Pool
	cursorSecret []byte
}

func New(pool *pgxpool.Pool, cursorSecret []byte) *Service {
	return &Service{pool: pool, cursorSecret: append([]byte(nil), cursorSecret...)}
}

// AssetUpdate preserves the existing atomic favorite + tag-name PATCH. A nil
// Tags pointer leaves associations unchanged; a pointer to an empty slice clears them.
type AssetUpdate struct {
	Favorite *bool     `json:"favorite"`
	Tags     *[]string `json:"tags"`
}

const assetColumns = `a.id, a.owner_user_id, a.blob_url, a.thumbnail_url,
	a.pathname, a.mime, a.size::bigint, a.width, a.height, a.checksum_sha256,
	a.favorite, a."createdAt", a."updatedAt", a.deleted_at, a.share_slug,
	COALESCE((SELECT e.status FROM asset_embeddings e WHERE e.asset_id = a.id), 'pending'),
	COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name, t.id)
		FROM asset_tags at JOIN tags t ON t.id = at.tag_id
		WHERE at.asset_id = a.id AND t.owner_user_id = a.owner_user_id), '[]'::jsonb)`

func scanAsset(row pgx.Row, extra ...any) (model.Asset, error) {
	var asset model.Asset
	var tags []byte
	dest := []any{&asset.ID, &asset.OwnerID, &asset.BlobURL, &asset.ThumbnailURL,
		&asset.Pathname, &asset.MIME, &asset.Size, &asset.Width, &asset.Height, &asset.Checksum,
		&asset.Favorite, &asset.CreatedAt, &asset.UpdatedAt, &asset.DeletedAt, &asset.ShareSlug,
		&asset.EmbeddingStatus, &tags}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return asset, err
	}
	if err := json.Unmarshal(tags, &asset.Tags); err != nil {
		return asset, fmt.Errorf("decode asset tags: %w", err)
	}
	if asset.Tags == nil {
		asset.Tags = []model.Tag{}
	}
	asset.Filename = path.Base(asset.Pathname)
	return asset, nil
}

func (s *Service) ready(owner string) error {
	if owner == "" {
		return &model.APIError{Status: http.StatusUnauthorized, Message: "Unauthorized", Code: "unauthorized"}
	}
	if s.pool == nil {
		return &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Code: "enrollment_unavailable", Retryable: true}
	}
	return nil
}

func validateID(id string) error {
	if id == "" || !utf8.ValidString(id) || utf16Length(id) > contract.AssetIDMaxLength || strings.ContainsRune(id, 0) {
		return badRequest("Invalid asset or tag id")
	}
	return nil
}

func utf16Length(value string) int {
	count := 0
	for _, r := range value {
		count++
		if r > 0xffff {
			count++
		}
	}
	return count
}

func (s *Service) beginOwner(ctx context.Context, owner string) (pgx.Tx, error) {
	if err := s.ready(owner); err != nil {
		return nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin library mutation: %w", err)
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('sploot:enrollment:user:' || $1))`, owner); err != nil {
		_ = tx.Rollback(ctx)
		return nil, fmt.Errorf("lock library owner: %w", err)
	}
	var id string
	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE id = $1 FOR KEY SHARE`, owner).Scan(&id)
	if err != nil {
		_ = tx.Rollback(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &model.APIError{Status: http.StatusForbidden, Message: "This account is not enrolled", Code: "enrollment_closed"}
		}
		return nil, fmt.Errorf("check library enrollment: %w", err)
	}
	return tx, nil
}

func (s *Service) Get(ctx context.Context, owner, id string) (model.Asset, error) {
	if err := s.ready(owner); err != nil {
		return model.Asset{}, err
	}
	if err := validateID(id); err != nil {
		return model.Asset{}, err
	}
	asset, err := scanAsset(s.pool.QueryRow(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.owner_user_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`, owner, id))
	return asset, assetError("get asset", err)
}

func (s *Service) UpdateFavorite(ctx context.Context, owner, id string, favorite bool) (model.Asset, error) {
	return s.Update(ctx, owner, id, AssetUpdate{Favorite: &favorite})
}

func (s *Service) Update(ctx context.Context, owner, id string, update AssetUpdate) (model.Asset, error) {
	if err := validateID(id); err != nil {
		return model.Asset{}, err
	}
	var names []string
	if update.Tags != nil {
		var err error
		names, err = normalizeTagNames(*update.Tags, contract.TagMaxPerAsset)
		if err != nil {
			return model.Asset{}, err
		}
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return model.Asset{}, err
	}
	defer tx.Rollback(ctx)
	command, err := tx.Exec(ctx, `UPDATE assets SET favorite = COALESCE($3, favorite), "updatedAt" = CURRENT_TIMESTAMP
		WHERE owner_user_id = $1 AND id = $2 AND deleted_at IS NULL`, owner, id, update.Favorite)
	if err != nil {
		return model.Asset{}, fmt.Errorf("update asset: %w", err)
	}
	if command.RowsAffected() == 0 {
		return model.Asset{}, assetNotFound()
	}
	if update.Tags != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM asset_tags at USING assets a WHERE at.asset_id = a.id AND a.owner_user_id = $1 AND a.id = $2`, owner, id); err != nil {
			return model.Asset{}, fmt.Errorf("replace asset tags: %w", err)
		}
		if _, err := addAssetTags(ctx, tx, owner, id, nil, names); err != nil {
			return model.Asset{}, err
		}
	}
	asset, err := scanAsset(tx.QueryRow(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.owner_user_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`, owner, id))
	if err != nil {
		return model.Asset{}, assetError("read updated asset", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Asset{}, fmt.Errorf("commit asset update: %w", err)
	}
	return asset, nil
}

// Delete retains bytes, embeddings, tags, and quota consumption. Sharing is
// revoked on deletion so a later restore cannot silently republish an asset.
func (s *Service) Delete(ctx context.Context, owner, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	command, err := tx.Exec(ctx, `UPDATE assets SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), share_slug = NULL, "updatedAt" = CURRENT_TIMESTAMP
		WHERE owner_user_id = $1 AND id = $2`, owner, id)
	if err != nil {
		return fmt.Errorf("soft-delete asset: %w", err)
	}
	if command.RowsAffected() == 0 {
		return assetNotFound()
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit asset deletion: %w", err)
	}
	return nil
}

func (s *Service) Restore(ctx context.Context, owner, id string) (model.Asset, error) {
	if err := validateID(id); err != nil {
		return model.Asset{}, err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return model.Asset{}, err
	}
	defer tx.Rollback(ctx)
	var cleanup bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM storage_cleanup_outbox o WHERE o.asset_id = a.id AND o.action = 'permanent-delete')
		FROM assets a WHERE a.owner_user_id = $1 AND a.id = $2 FOR UPDATE OF a`, owner, id).Scan(&cleanup)
	if err != nil {
		return model.Asset{}, assetError("lock restored asset", err)
	}
	if cleanup {
		return model.Asset{}, &model.APIError{Status: http.StatusConflict, Code: "asset_cleanup_pending", Message: "This asset has been scheduled for permanent deletion and cannot be restored"}
	}
	if _, err := tx.Exec(ctx, `UPDATE assets SET share_slug = CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE share_slug END, deleted_at = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE owner_user_id = $1 AND id = $2`, owner, id); err != nil {
		return model.Asset{}, fmt.Errorf("restore asset: %w", err)
	}
	asset, err := scanAsset(tx.QueryRow(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.owner_user_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`, owner, id))
	if err != nil {
		return model.Asset{}, assetError("read restored asset", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Asset{}, fmt.Errorf("commit asset restoration: %w", err)
	}
	return asset, nil
}

func (s *Service) Share(ctx context.Context, owner, id string) (string, error) {
	if err := validateID(id); err != nil {
		return "", err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var existing *string
	err = tx.QueryRow(ctx, `SELECT share_slug FROM assets WHERE owner_user_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`, owner, id).Scan(&existing)
	if err != nil {
		return "", assetError("get share slug", err)
	}
	if existing != nil {
		return *existing, nil
	}
	// A savepoint keeps a collision from aborting the enclosing transaction.
	for range 3 {
		var random [8]byte
		if _, err := rand.Read(random[:]); err != nil {
			return "", fmt.Errorf("generate share slug: %w", err)
		}
		slug := base64.RawURLEncoding.EncodeToString(random[:])[:10]
		nested, err := tx.Begin(ctx)
		if err != nil {
			return "", fmt.Errorf("begin share allocation: %w", err)
		}
		_, err = nested.Exec(ctx, `UPDATE assets SET share_slug = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE owner_user_id = $1 AND id = $2 AND deleted_at IS NULL`, owner, id, slug)
		if err != nil {
			_ = nested.Rollback(ctx)
			if constraintViolation(err, "23505", "assets_share_slug_key") {
				continue
			}
			return "", fmt.Errorf("create share slug: %w", err)
		}
		if err := nested.Commit(ctx); err != nil {
			return "", fmt.Errorf("commit share allocation: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return "", fmt.Errorf("commit asset sharing: %w", err)
		}
		return slug, nil
	}
	return "", &model.APIError{Status: http.StatusServiceUnavailable, Code: "share_slug_collision", Message: "Could not allocate a share link; please retry", Retryable: true}
}

func (s *Service) RevokeShare(ctx context.Context, owner, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	command, err := tx.Exec(ctx, `UPDATE assets SET share_slug = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE owner_user_id = $1 AND id = $2`, owner, id)
	if err != nil {
		return fmt.Errorf("revoke asset sharing: %w", err)
	}
	if command.RowsAffected() == 0 {
		return assetNotFound()
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit sharing revocation: %w", err)
	}
	return nil
}

// Shared exposes media only while its share capability remains live.
// Deleted and revoked links have the same 404 result.
func (s *Service) Shared(ctx context.Context, slug string) (model.Asset, error) {
	if s.pool == nil {
		return model.Asset{}, &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Retryable: true}
	}
	if len(slug) < 10 || len(slug) > 128 || strings.Trim(slug, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") != "" {
		return model.Asset{}, assetNotFound()
	}
	asset, err := scanAsset(s.pool.QueryRow(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.share_slug = $1 AND a.deleted_at IS NULL`, slug))
	if err != nil {
		return model.Asset{}, assetError("get shared asset", err)
	}
	// Tags and favorite state belong to the private library, not the public
	// media capability. Keep original media URLs and basic media metadata.
	asset.Tags, asset.Favorite, asset.Checksum, asset.EmbeddingStatus = []model.Tag{}, false, "", ""
	return asset, nil
}

// SharedSlugByID preserves previously published /m/{id} links without granting
// an asset ID access to a private, deleted, or revoked meme.
func (s *Service) SharedSlugByID(ctx context.Context, id string) (string, error) {
	if s.pool == nil {
		return "", &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Retryable: true}
	}
	if validateID(id) != nil {
		return "", assetNotFound()
	}
	var slug string
	err := s.pool.QueryRow(ctx, `SELECT share_slug FROM assets WHERE id=$1 AND share_slug IS NOT NULL AND deleted_at IS NULL`, id).Scan(&slug)
	return slug, assetError("resolve shared asset identifier", err)
}

func assetNotFound() *model.APIError {
	return &model.APIError{Status: http.StatusNotFound, Message: "Asset not found", Code: "asset_not_found"}
}
func tagNotFound() *model.APIError {
	return &model.APIError{Status: http.StatusNotFound, Message: "Tag not found", Code: "tag_not_found"}
}
func badRequest(message string) *model.APIError {
	return &model.APIError{Status: http.StatusBadRequest, Message: message, Code: "invalid_request"}
}
func assetError(operation string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return assetNotFound()
	}
	return fmt.Errorf("%s: %w", operation, err)
}
func constraintViolation(err error, code, constraint string) bool {
	var databaseError *pgconn.PgError
	return errors.As(err, &databaseError) && databaseError.Code == code && databaseError.ConstraintName == constraint
}
