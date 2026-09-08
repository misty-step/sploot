package library

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const cursorLifetime = 24 * time.Hour
const maxShuffleSeed int64 = 1000000
const maxShuffleKey int64 = 9223372036854775807

type listContext struct {
	Owner     string `json:"owner"`
	Sort      string `json:"sort"`
	Direction string `json:"direction"`
	Seed      string `json:"seed"`
	Favorite  *bool  `json:"favorite"`
	TagID     string `json:"tagId"`
	Deleted   bool   `json:"deleted"`
	Limit     int    `json:"limit"`
}

type listCursor struct {
	Version    int       `json:"v"`
	Context    string    `json:"context"`
	Snapshot   time.Time `json:"snapshot"`
	AfterID    string    `json:"id"`
	AfterValue string    `json:"value"`
	Head       bool      `json:"head"`
	Offset     int       `json:"offset"`
}

type listRecord struct {
	asset model.Asset
	value string
	head  bool
}

func normalizeList(owner string, options model.ListOptions) (listContext, error) {
	context := listContext{Owner: owner, Sort: options.Sort, Direction: options.Direction, Seed: options.Seed, Favorite: options.Favorite, TagID: options.TagID, Deleted: options.Deleted, Limit: options.Limit}
	if context.Limit == 0 {
		context.Limit = 50
	}
	if context.Limit < 1 || context.Limit > 100 {
		return context, badRequest("Invalid limit parameter; expected an integer from 1 to 100")
	}
	if options.Offset < 0 {
		return context, badRequest("Invalid offset parameter; expected a non-negative integer")
	}
	if options.Cursor != "" && options.Offset != 0 {
		return context, badRequest("Cursor and offset cannot be combined")
	}
	if context.Sort == "" {
		context.Sort = "createdAt"
	}
	switch context.Sort {
	case "createdAt", "updatedAt", "size", "pathname", "shuffle":
	default:
		return context, badRequest("Invalid sortBy parameter; expected createdAt, updatedAt, size, pathname, or shuffle")
	}
	if context.Direction == "" {
		context.Direction = "desc"
	}
	if context.Direction != "asc" && context.Direction != "desc" {
		return context, badRequest("Invalid sortOrder parameter; expected asc or desc")
	}
	if options.FavoriteOnly {
		if context.Favorite != nil && !*context.Favorite {
			return context, badRequest("Conflicting favorite filters")
		}
		favorite := true
		context.Favorite = &favorite
	}
	if context.TagID != "" {
		if err := validateID(context.TagID); err != nil {
			return context, err
		}
	}
	if context.Sort == "shuffle" {
		seed, err := strconv.ParseInt(context.Seed, 10, 64)
		if err != nil || strings.Trim(context.Seed, "0123456789") != "" || seed < 0 || seed > maxShuffleSeed {
			return context, badRequest("shuffleSeed is required and must be an integer from 0 to 1000000")
		}
		context.Seed = strconv.FormatInt(seed, 10)
		context.Direction = "asc" // Existing shuffle contract always walks the persisted key ring forward.
	} else if context.Seed != "" {
		return context, badRequest("shuffleSeed is only supported with sortBy=shuffle")
	}
	return context, nil
}

func (s *Service) List(ctx context.Context, owner string, options model.ListOptions) (model.AssetPage, error) {
	page := model.AssetPage{Assets: []model.Asset{}}
	if err := s.ready(owner); err != nil {
		return page, err
	}
	binding, err := normalizeList(owner, options)
	if err != nil {
		return page, err
	}
	if len(s.cursorSecret) < 32 {
		return page, &model.APIError{Status: http.StatusServiceUnavailable, Code: "cursor_configuration", Message: "Library pagination is not configured"}
	}
	cursor := listCursor{Version: 1, Context: listContextHash(binding), Snapshot: time.Now().UTC(), Offset: options.Offset}
	if options.Cursor != "" {
		cursor, err = s.decodeCursor(options.Cursor, binding, time.Now())
		if err != nil {
			return page, err
		}
	}
	page.Limit, page.Offset = binding.Limit, cursor.Offset
	// Count and all ring segments see the same database snapshot. Keyset
	// cursors then survive deletions before the boundary without offset skips.
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return page, fmt.Errorf("begin library page: %w", err)
	}
	defer tx.Rollback(ctx)
	where, args := listFilter(binding, cursor.Snapshot)
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM assets a WHERE `+where, args...).Scan(&page.Total); err != nil {
		return page, fmt.Errorf("count library assets: %w", err)
	}
	var records []listRecord
	if binding.Sort == "shuffle" {
		records, err = shuffledRecords(ctx, tx, binding, cursor, where, args)
	} else {
		records, err = sortedRecords(ctx, tx, binding, cursor, where, args)
	}
	if err != nil {
		return page, err
	}
	if err := tx.Commit(ctx); err != nil {
		return page, fmt.Errorf("finish library page: %w", err)
	}
	page.HasMore = len(records) > binding.Limit
	if page.HasMore {
		records = records[:binding.Limit]
	}
	page.Assets = make([]model.Asset, len(records))
	for i, record := range records {
		page.Assets[i] = record.asset
	}
	if page.HasMore {
		last := records[len(records)-1]
		cursor.AfterID, cursor.AfterValue, cursor.Head = last.asset.ID, last.value, last.head
		cursor.Offset += len(records)
		page.NextCursor, err = s.encodeCursor(cursor)
		if err != nil {
			return page, fmt.Errorf("encode library cursor: %w", err)
		}
	}
	return page, nil
}

func listFilter(binding listContext, snapshot time.Time) (string, []any) {
	args := []any{binding.Owner, snapshot}
	where := `a.owner_user_id = $1 AND a."createdAt" <= $2`
	if binding.Deleted {
		where += ` AND a.deleted_at IS NOT NULL`
	} else {
		where += ` AND a.deleted_at IS NULL`
	}
	if binding.Favorite != nil {
		args = append(args, *binding.Favorite)
		where += fmt.Sprintf(` AND a.favorite = $%d`, len(args))
	}
	if binding.TagID != "" {
		args = append(args, binding.TagID)
		where += fmt.Sprintf(` AND EXISTS(SELECT 1 FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = a.id AND t.owner_user_id = a.owner_user_id AND t.id = $%d)`, len(args))
	}
	return where, args
}

func sortedRecords(ctx context.Context, tx pgx.Tx, binding listContext, cursor listCursor, where string, args []any) ([]listRecord, error) {
	column, valueType := `a."createdAt"`, "timestamp"
	switch binding.Sort {
	case "updatedAt":
		column = `a."updatedAt"`
	case "size":
		column, valueType = "a.size", "integer"
	case "pathname":
		column, valueType = "a.pathname", "text"
	}
	direction, comparison := "DESC", "<"
	if binding.Direction == "asc" {
		direction, comparison = "ASC", ">"
	}
	offset := cursor.Offset
	if cursor.AfterID != "" {
		args = append(args, cursor.AfterValue, cursor.AfterID)
		where += fmt.Sprintf(` AND (%s, a.id) %s ($%d::text::%s, $%d::text)`, column, comparison, len(args)-1, valueType, len(args))
		offset = 0
	}
	args = append(args, binding.Limit+1, offset)
	query := `SELECT ` + assetColumns + `, ` + column + `::text FROM assets a WHERE ` + where +
		fmt.Sprintf(` ORDER BY %s %s, a.id %s LIMIT $%d OFFSET $%d`, column, direction, direction, len(args)-1, len(args))
	return readRecords(ctx, tx, query, args, false)
}

func shuffledRecords(ctx context.Context, tx pgx.Tx, binding listContext, cursor listCursor, where string, args []any) ([]listRecord, error) {
	seed, _ := strconv.ParseInt(binding.Seed, 10, 64)
	// Equivalent to seed * MaxInt64 / 1e6, without overflowing BIGINT.
	pivot := (maxShuffleKey/maxShuffleSeed)*seed + ((maxShuffleKey%maxShuffleSeed)*seed)/maxShuffleSeed
	head, offset := cursor.Head, cursor.Offset
	if cursor.AfterID != "" {
		offset = 0
	}
	if cursor.AfterID == "" && offset > 0 {
		countArgs := append(append([]any(nil), args...), pivot)
		var tailCount int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM assets a WHERE `+where+fmt.Sprintf(` AND a.shuffle_key >= $%d`, len(countArgs)), countArgs...).Scan(&tailCount); err != nil {
			return nil, fmt.Errorf("count shuffled tail: %w", err)
		}
		if offset >= tailCount {
			head, offset = true, offset-tailCount
		}
	}
	var records []listRecord
	for {
		segmentArgs := append(append([]any(nil), args...), pivot)
		comparison := ">="
		if head {
			comparison = "<"
		}
		segmentWhere := where + fmt.Sprintf(` AND a.shuffle_key %s $%d`, comparison, len(segmentArgs))
		if cursor.AfterID != "" && head == cursor.Head {
			key, err := strconv.ParseInt(cursor.AfterValue, 10, 64)
			if err != nil {
				return nil, invalidCursor()
			}
			segmentArgs = append(segmentArgs, key, cursor.AfterID)
			segmentWhere += fmt.Sprintf(` AND (a.shuffle_key, a.id) > ($%d, $%d)`, len(segmentArgs)-1, len(segmentArgs))
		}
		remaining := binding.Limit + 1 - len(records)
		segmentArgs = append(segmentArgs, remaining, offset)
		query := `SELECT ` + assetColumns + `, a.shuffle_key::text FROM assets a WHERE ` + segmentWhere +
			fmt.Sprintf(` ORDER BY a.shuffle_key ASC, a.id ASC LIMIT $%d OFFSET $%d`, len(segmentArgs)-1, len(segmentArgs))
		segment, err := readRecords(ctx, tx, query, segmentArgs, head)
		if err != nil {
			return nil, err
		}
		records = append(records, segment...)
		if head || len(segment) == remaining {
			return records, nil
		}
		head, offset = true, 0
	}
}

func readRecords(ctx context.Context, tx pgx.Tx, query string, args []any, head bool) ([]listRecord, error) {
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query library assets: %w", err)
	}
	defer rows.Close()
	records := make([]listRecord, 0)
	for rows.Next() {
		var value string
		asset, err := scanAsset(rows, &value)
		if err != nil {
			return nil, fmt.Errorf("scan library asset: %w", err)
		}
		records = append(records, listRecord{asset: asset, value: value, head: head})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read library page: %w", err)
	}
	return records, nil
}

func listContextHash(binding listContext) string {
	body, _ := json.Marshal(binding)
	hash := sha256.Sum256(body)
	return base64.RawURLEncoding.EncodeToString(hash[:])
}

func (s *Service) encodeCursor(cursor listCursor) (string, error) {
	body, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(body)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(s.cursorSignature(encoded)), nil
}

func (s *Service) decodeCursor(token string, binding listContext, now time.Time) (listCursor, error) {
	var cursor listCursor
	if len(token) > 8192 || len(s.cursorSecret) < 32 {
		return cursor, invalidCursor()
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return cursor, invalidCursor()
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, s.cursorSignature(parts[0])) {
		return cursor, invalidCursor()
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(body, &cursor) != nil {
		return cursor, invalidCursor()
	}
	if cursor.Version != 1 || cursor.Context != listContextHash(binding) || cursor.AfterID == "" || cursor.Offset < 0 || cursor.Snapshot.IsZero() || cursor.Snapshot.After(now.Add(5*time.Second)) || !now.Before(cursor.Snapshot.Add(cursorLifetime)) {
		return cursor, invalidCursor()
	}
	if err := validateID(cursor.AfterID); err != nil {
		return cursor, invalidCursor()
	}
	return cursor, nil
}

func (s *Service) cursorSignature(encoded string) []byte {
	mac := hmac.New(sha256.New, s.cursorSecret)
	mac.Write([]byte("sploot:library-cursor:v1:"))
	mac.Write([]byte(encoded))
	return mac.Sum(nil)
}

func invalidCursor() *model.APIError {
	return &model.APIError{Status: http.StatusBadRequest, Code: "invalid_cursor", Message: "Invalid or expired cursor for this library view"}
}
