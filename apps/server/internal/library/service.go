package library

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"strings"
	"unicode/utf8"

	"github.com/mattn/go-sqlite3"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type Service struct {
	db           *sql.DB
	cursorSecret []byte
}

func New(db *sql.DB, cursorSecret []byte) *Service {
	return &Service{db: db, cursorSecret: append([]byte(nil), cursorSecret...)}
}

// AssetUpdate preserves the atomic favorite + tag-name PATCH. A nil Tags
// pointer leaves associations unchanged; an empty slice clears them.
type AssetUpdate struct {
	Favorite *bool     `json:"favorite"`
	Tags     *[]string `json:"tags"`
}

const assetColumns = `a.id, a.owner_user_id, a.blob_url, a.thumbnail_url,
	a.pathname, a.mime, a.size, a.width, a.height, a.checksum_sha256,
	a.favorite, a.created_at, a.updated_at, a.deleted_at, a.share_slug,
	COALESCE((SELECT e.status FROM asset_embeddings e WHERE e.asset_id = a.id AND e.owner_user_id = a.owner_user_id), 'pending'),
	COALESCE((SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
		FROM (SELECT t.id, t.name, t.color FROM asset_tags at JOIN tags t ON t.id = at.tag_id
		WHERE at.asset_id = a.id AND t.owner_user_id = a.owner_user_id ORDER BY t.name, t.id) t), '[]')`

func scanAsset(row interface{ Scan(...any) error }, extra ...any) (model.Asset, error) {
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
	if s.db == nil {
		return &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Code: "library_unavailable", Retryable: true}
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

func (s *Service) beginOwner(ctx context.Context, owner string) (*sql.Tx, error) {
	if err := s.ready(owner); err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin library mutation: %w", err)
	}
	var id string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id = ?1`, owner).Scan(&id)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &model.APIError{Status: http.StatusForbidden, Message: "Account not found", Code: "account_not_found"}
		}
		return nil, fmt.Errorf("check library account: %w", err)
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
	asset, err := scanAsset(s.db.QueryRowContext(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.owner_user_id = ?1 AND a.id = ?2 AND a.deleted_at IS NULL`, owner, id))
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
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE assets SET favorite = COALESCE(?3, favorite), updated_at = CURRENT_TIMESTAMP
		WHERE owner_user_id = ?1 AND id = ?2 AND deleted_at IS NULL`, owner, id, update.Favorite)
	if err != nil {
		return model.Asset{}, fmt.Errorf("update asset: %w", err)
	}
	if count, err := result.RowsAffected(); err != nil || count == 0 {
		if err != nil {
			return model.Asset{}, err
		}
		return model.Asset{}, assetNotFound()
	}
	if update.Tags != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM asset_tags WHERE asset_id = ?2 AND EXISTS (SELECT 1 FROM assets WHERE id = ?2 AND owner_user_id = ?1)`, owner, id); err != nil {
			return model.Asset{}, fmt.Errorf("replace asset tags: %w", err)
		}
		if _, err := addAssetTags(ctx, tx, owner, id, nil, names); err != nil {
			return model.Asset{}, err
		}
	}
	asset, err := scanAsset(tx.QueryRowContext(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.owner_user_id = ?1 AND a.id = ?2 AND a.deleted_at IS NULL`, owner, id))
	if err != nil {
		return model.Asset{}, assetError("read updated asset", err)
	}
	if err := tx.Commit(); err != nil {
		return model.Asset{}, fmt.Errorf("commit asset update: %w", err)
	}
	return asset, nil
}

// Delete retains bytes, embeddings, tags, and storage consumption. Sharing is
// revoked on deletion so restoring an asset cannot silently republish it.
func (s *Service) Delete(ctx context.Context, owner, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE assets SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), share_slug = NULL, updated_at = CURRENT_TIMESTAMP
		WHERE owner_user_id = ?1 AND id = ?2`, owner, id)
	if err != nil {
		return fmt.Errorf("soft-delete asset: %w", err)
	}
	if count, err := result.RowsAffected(); err != nil || count == 0 {
		if err != nil {
			return err
		}
		return assetNotFound()
	}
	return tx.Commit()
}

func (s *Service) Restore(ctx context.Context, owner, id string) (model.Asset, error) {
	if err := validateID(id); err != nil {
		return model.Asset{}, err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return model.Asset{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE assets SET share_slug = CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE share_slug END, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?1 AND id = ?2`, owner, id); err != nil {
		return model.Asset{}, fmt.Errorf("restore asset: %w", err)
	}
	asset, err := scanAsset(tx.QueryRowContext(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.owner_user_id = ?1 AND a.id = ?2 AND a.deleted_at IS NULL`, owner, id))
	if err != nil {
		return model.Asset{}, assetError("read restored asset", err)
	}
	if err := tx.Commit(); err != nil {
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
	defer tx.Rollback()
	var existing *string
	err = tx.QueryRowContext(ctx, `SELECT share_slug FROM assets WHERE owner_user_id = ?1 AND id = ?2 AND deleted_at IS NULL`, owner, id).Scan(&existing)
	if err != nil {
		return "", assetError("get share slug", err)
	}
	if existing != nil {
		return *existing, nil
	}
	for range 3 {
		var random [24]byte
		if _, err := rand.Read(random[:]); err != nil {
			return "", fmt.Errorf("generate share slug: %w", err)
		}
		slug := base64.RawURLEncoding.EncodeToString(random[:])
		_, err := tx.ExecContext(ctx, `UPDATE assets SET share_slug = ?3, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?1 AND id = ?2 AND deleted_at IS NULL`, owner, id, slug)
		if err != nil {
			// SQLite ABORT rolls back the statement, not the transaction.
			if uniqueViolation(err) {
				continue
			}
			return "", fmt.Errorf("create share slug: %w", err)
		}
		if err := tx.Commit(); err != nil {
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
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE assets SET share_slug = NULL, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?1 AND id = ?2`, owner, id)
	if err != nil {
		return fmt.Errorf("revoke asset sharing: %w", err)
	}
	if count, err := result.RowsAffected(); err != nil || count == 0 {
		if err != nil {
			return err
		}
		return assetNotFound()
	}
	return tx.Commit()
}

// Shared exposes media only while its share capability remains live.
func (s *Service) Shared(ctx context.Context, slug string) (model.Asset, error) {
	if s.db == nil {
		return model.Asset{}, &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Retryable: true}
	}
	if len(slug) < 10 || len(slug) > 128 || strings.Trim(slug, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") != "" {
		return model.Asset{}, assetNotFound()
	}
	asset, err := scanAsset(s.db.QueryRowContext(ctx, `SELECT `+assetColumns+` FROM assets a WHERE a.share_slug = ?1 AND a.deleted_at IS NULL`, slug))
	if err != nil {
		return model.Asset{}, assetError("get shared asset", err)
	}
	asset.Tags, asset.Favorite, asset.Checksum, asset.EmbeddingStatus = []model.Tag{}, false, "", ""
	return asset, nil
}

// SharedSlugByID resolves previously published /m/{id} links only while the
// original explicitly published capability is still live.
func (s *Service) SharedSlugByID(ctx context.Context, id string) (string, error) {
	if s.db == nil {
		return "", &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Retryable: true}
	}
	if validateID(id) != nil {
		return "", assetNotFound()
	}
	var slug string
	err := s.db.QueryRowContext(ctx, `SELECT share_slug FROM assets WHERE id = ?1 AND share_slug IS NOT NULL AND deleted_at IS NULL`, id).Scan(&slug)
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
	if errors.Is(err, sql.ErrNoRows) {
		return assetNotFound()
	}
	return fmt.Errorf("%s: %w", operation, err)
}
func uniqueViolation(err error) bool {
	var databaseError sqlite3.Error
	return errors.As(err, &databaseError) && databaseError.ExtendedCode == sqlite3.ErrConstraintUnique
}
