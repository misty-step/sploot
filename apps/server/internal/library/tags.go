package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

type TagDetail struct {
	model.Tag
	AssetCount int       `json:"assetCount"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// ColorSet distinguishes omitted color (keep it) from explicit null (clear it).
// JSON callers get this automatically through UnmarshalJSON.
type TagUpdate struct {
	Name     *string `json:"name,omitempty"`
	Color    *string `json:"color"`
	ColorSet bool    `json:"-"`
}

func (u *TagUpdate) UnmarshalJSON(body []byte) error {
	var raw struct {
		Name  json.RawMessage `json:"name"`
		Color json.RawMessage `json:"color"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}
	*u = TagUpdate{}
	if len(raw.Name) > 0 {
		if string(raw.Name) == "null" {
			return badRequest("Tag name must be a string")
		}
		if err := json.Unmarshal(raw.Name, &u.Name); err != nil {
			return err
		}
	}
	if len(raw.Color) > 0 {
		u.ColorSet = true
		if err := json.Unmarshal(raw.Color, &u.Color); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Tags(ctx context.Context, owner string) ([]model.Tag, error) {
	if err := s.ready(owner); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, color FROM tags WHERE owner_user_id = ?1 ORDER BY name, id`, owner)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	defer rows.Close()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.Color); err != nil {
			return nil, fmt.Errorf("scan tag: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read tags: %w", err)
	}
	return tags, nil
}

func (s *Service) TagDetails(ctx context.Context, owner string) ([]TagDetail, error) {
	if err := s.ready(owner); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT t.id, t.name, t.color, t.created_at, t.updated_at,
		(SELECT count(*) FROM asset_tags at JOIN assets a ON a.id = at.asset_id WHERE at.tag_id = t.id AND a.owner_user_id = t.owner_user_id)
		FROM tags t WHERE t.owner_user_id = ?1 ORDER BY t.name, t.id`, owner)
	if err != nil {
		return nil, fmt.Errorf("list tag metadata: %w", err)
	}
	defer rows.Close()
	tags := make([]TagDetail, 0)
	for rows.Next() {
		var tag TagDetail
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.Color, &tag.CreatedAt, &tag.UpdatedAt, &tag.AssetCount); err != nil {
			return nil, fmt.Errorf("scan tag metadata: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read tag metadata: %w", err)
	}
	return tags, nil
}

func (s *Service) CreateTag(ctx context.Context, owner, name string, color *string) (TagDetail, error) {
	var tag TagDetail
	normalized, err := normalizeTagName(name)
	if err != nil {
		return tag, err
	}
	if err := validateTagColor(color); err != nil {
		return tag, err
	}
	if color != nil && *color == "" {
		color = nil
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return tag, err
	}
	defer tx.Rollback()
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM tags WHERE owner_user_id = ?1 AND name = ?2)`, owner, normalized).Scan(&exists); err != nil {
		return tag, fmt.Errorf("check tag name: %w", err)
	}
	if exists {
		return tag, tagConflict()
	}
	if err := checkTagLimit(ctx, tx, owner); err != nil {
		return tag, err
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO tags (id, owner_user_id, name, color, updated_at) VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
		RETURNING id, name, color, created_at, updated_at`, model.NewID(), owner, normalized, color).Scan(&tag.ID, &tag.Name, &tag.Color, &tag.CreatedAt, &tag.UpdatedAt)
	if tagNameConflict(err) {
		return tag, tagConflict()
	}
	if err != nil {
		return tag, fmt.Errorf("create tag: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return tag, fmt.Errorf("commit tag creation: %w", err)
	}
	return tag, nil
}

func (s *Service) UpdateTag(ctx context.Context, owner, id string, update TagUpdate) (TagDetail, error) {
	var tag TagDetail
	if err := validateID(id); err != nil {
		return tag, err
	}
	if update.Name != nil {
		name, err := normalizeTagName(*update.Name)
		if err != nil {
			return tag, err
		}
		update.Name = &name
	}
	if update.ColorSet {
		if err := validateTagColor(update.Color); err != nil {
			return tag, err
		}
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return tag, err
	}
	defer tx.Rollback()
	err = tx.QueryRowContext(ctx, `UPDATE tags SET name = COALESCE(?3, name), color = CASE WHEN ?4 THEN ?5 ELSE color END, updated_at = CURRENT_TIMESTAMP
		WHERE owner_user_id = ?1 AND id = ?2 RETURNING id, name, color, created_at, updated_at`, owner, id, update.Name, update.ColorSet, update.Color).Scan(&tag.ID, &tag.Name, &tag.Color, &tag.CreatedAt, &tag.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return tag, tagNotFound()
	}
	if tagNameConflict(err) {
		return tag, tagConflict()
	}
	if err != nil {
		return tag, fmt.Errorf("update tag: %w", err)
	}
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM asset_tags at JOIN assets a ON a.id = at.asset_id WHERE at.tag_id = ?2 AND a.owner_user_id = ?1`, owner, id).Scan(&tag.AssetCount); err != nil {
		return tag, fmt.Errorf("count tagged assets: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return tag, fmt.Errorf("commit tag update: %w", err)
	}
	return tag, nil
}

func (s *Service) DeleteTag(ctx context.Context, owner, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	command, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE owner_user_id = ?1 AND id = ?2`, owner, id)
	if err != nil {
		return fmt.Errorf("delete tag: %w", err)
	}
	if count, err := command.RowsAffected(); err != nil || count == 0 {
		if err != nil {
			return err
		}
		return tagNotFound()
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tag deletion: %w", err)
	}
	return nil
}

func (s *Service) AssetTags(ctx context.Context, owner, id string) ([]model.Tag, error) {
	asset, err := s.Get(ctx, owner, id)
	if err != nil {
		return nil, err
	}
	return asset.Tags, nil
}

func (s *Service) AddTags(ctx context.Context, owner, id string, tagIDs, tagNames []string) ([]model.Tag, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	if err := validateTagIDs(tagIDs); err != nil {
		return nil, err
	}
	names, err := normalizeTagNames(tagNames, contract.TagMaxRequestItems)
	if err != nil {
		return nil, err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := lockLiveAsset(ctx, tx, owner, id); err != nil {
		return nil, err
	}
	added, err := addAssetTags(ctx, tx, owner, id, tagIDs, names)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit asset tags: %w", err)
	}
	return added, nil
}

func (s *Service) RemoveTags(ctx context.Context, owner, id string, tagIDs []string) error {
	if err := validateID(id); err != nil {
		return err
	}
	if len(tagIDs) == 0 {
		return badRequest("Tag IDs are required")
	}
	if err := validateTagIDs(tagIDs); err != nil {
		return err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := lockLiveAsset(ctx, tx, owner, id); err != nil {
		return err
	}
	ids, err := json.Marshal(tagIDs)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM asset_tags WHERE asset_id = ?2
		AND EXISTS (SELECT 1 FROM assets a WHERE a.id = ?2 AND a.owner_user_id = ?1)
		AND tag_id IN (SELECT t.id FROM tags t JOIN json_each(?3) j ON j.value = t.id WHERE t.owner_user_id = ?1)`, owner, id, string(ids)); err != nil {
		return fmt.Errorf("remove asset tags: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit asset tag removal: %w", err)
	}
	return nil
}

func lockLiveAsset(ctx context.Context, tx *sql.Tx, owner, id string) error {
	var found string
	err := tx.QueryRowContext(ctx, `SELECT id FROM assets WHERE owner_user_id = ?1 AND id = ?2 AND deleted_at IS NULL`, owner, id).Scan(&found)
	return assetError("lock tagged asset", err)
}

func addAssetTags(ctx context.Context, tx *sql.Tx, owner, assetID string, ids, names []string) ([]model.Tag, error) {
	var associationCount int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM asset_tags at JOIN assets a ON a.id = at.asset_id WHERE a.owner_user_id = ?1 AND a.id = ?2`, owner, assetID).Scan(&associationCount); err != nil {
		return nil, fmt.Errorf("count asset tags: %w", err)
	}
	added := make([]model.Tag, 0)
	attach := func(tag model.Tag) error {
		var exists bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM asset_tags at JOIN assets a ON a.id = at.asset_id WHERE a.owner_user_id = ?1 AND a.id = ?2 AND at.tag_id = ?3)`, owner, assetID, tag.ID).Scan(&exists); err != nil {
			return fmt.Errorf("check asset tag: %w", err)
		}
		if exists {
			return nil
		}
		if associationCount >= contract.TagMaxPerAsset {
			return tagLimit()
		}
		command, err := tx.ExecContext(ctx, `INSERT INTO asset_tags (asset_id, tag_id)
			SELECT a.id, t.id FROM assets a JOIN tags t ON t.owner_user_id = a.owner_user_id
			WHERE a.owner_user_id = ?1 AND a.id = ?2 AND a.deleted_at IS NULL AND t.id = ?3 ON CONFLICT DO NOTHING`, owner, assetID, tag.ID)
		if err != nil {
			return fmt.Errorf("attach asset tag: %w", err)
		}
		count, err := command.RowsAffected()
		if err != nil {
			return err
		}
		if count != 0 {
			associationCount++
			added = append(added, tag)
		}
		return nil
	}
	for _, id := range ids {
		var tag model.Tag
		err := tx.QueryRowContext(ctx, `SELECT id, name, color FROM tags WHERE owner_user_id = ?1 AND id = ?2`, owner, id).Scan(&tag.ID, &tag.Name, &tag.Color)
		// Existing API ignores unknown and foreign IDs alike; never expose or
		// associate someone else's tag even if the ID is valid.
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("read owned tag: %w", err)
		}
		if err := attach(tag); err != nil {
			return nil, err
		}
	}
	for _, name := range names {
		var tag model.Tag
		err := tx.QueryRowContext(ctx, `SELECT id, name, color FROM tags WHERE owner_user_id = ?1 AND name = ?2`, owner, name).Scan(&tag.ID, &tag.Name, &tag.Color)
		if errors.Is(err, sql.ErrNoRows) {
			if err := checkTagLimit(ctx, tx, owner); err != nil {
				return nil, err
			}
			err = tx.QueryRowContext(ctx, `INSERT INTO tags (id, owner_user_id, name, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
				ON CONFLICT (owner_user_id, name) DO UPDATE SET name = EXCLUDED.name
				RETURNING id, name, color`, model.NewID(), owner, name).Scan(&tag.ID, &tag.Name, &tag.Color)
		}
		if err != nil {
			return nil, fmt.Errorf("find or create asset tag: %w", err)
		}
		if err := attach(tag); err != nil {
			return nil, err
		}
	}
	return added, nil
}

func checkTagLimit(ctx context.Context, tx *sql.Tx, owner string) error {
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM tags WHERE owner_user_id = ?1`, owner).Scan(&count); err != nil {
		return fmt.Errorf("count owner tags: %w", err)
	}
	if count >= contract.TagMaxPerUser {
		return tagLimit()
	}
	return nil
}

func normalizeTagName(name string) (string, error) {
	name = trimClientWhitespace(name)
	if name == "" || !utf8.ValidString(name) || strings.ContainsRune(name, 0) || utf16Length(name) > contract.TagMaxNameLength {
		return "", badRequest("Tag name is invalid or too long")
	}
	// JavaScript toLowerCase uses full, context-sensitive Unicode casing;
	// simple rune casing would create new IDs for existing Greek/Turkish tags.
	name = cases.Lower(language.Und).String(name)
	if utf16Length(name) > contract.TagMaxNameLength {
		return "", badRequest("Tag name is too long after normalization")
	}
	return name, nil
}

func trimClientWhitespace(value string) string {
	// ECMAScript trim includes BOM but excludes Unicode NEXT LINE.
	return strings.TrimFunc(value, func(r rune) bool { return r == '\ufeff' || (r != '\u0085' && unicode.IsSpace(r)) })
}

func normalizeTagNames(names []string, limit int) ([]string, error) {
	if len(names) > limit {
		return nil, badRequest("Too many tag names")
	}
	unique := make(map[string]bool, len(names))
	normalized := make([]string, 0, len(names))
	for _, value := range names {
		name, err := normalizeTagName(value)
		if err != nil {
			return nil, err
		}
		if !unique[name] {
			unique[name] = true
			normalized = append(normalized, name)
		}
	}
	return normalized, nil
}

func validateTagIDs(ids []string) error {
	if len(ids) > contract.TagMaxRequestItems {
		return badRequest("Too many tag IDs")
	}
	for _, id := range ids {
		if err := validateID(id); err != nil {
			return err
		}
	}
	return nil
}

func validateTagColor(color *string) error {
	if color != nil && (!utf8.ValidString(*color) || strings.ContainsRune(*color, 0) || utf16Length(*color) > contract.TagMaxColorLength) {
		return badRequest("Tag color is invalid or too long")
	}
	return nil
}

func tagConflict() *model.APIError {
	return &model.APIError{Status: http.StatusConflict, Message: "Tag with this name already exists", Code: "tag_conflict"}
}
func tagLimit() *model.APIError { return badRequest("Tag limit reached") }
func tagNameConflict(err error) bool {
	return uniqueViolation(err)
}
