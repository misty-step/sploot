package embedding

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type searchContext struct {
	Query          string  `json:"query"`
	EmbeddingModel string  `json:"embeddingModel"`
	Threshold      float64 `json:"threshold"`
	Sort           string  `json:"sort"`
	Direction      string  `json:"direction"`
	FavoriteOnly   bool    `json:"favoriteOnly"`
	TagID          *string `json:"tagId"`
	Limit          int     `json:"limit"`
}

type searchCursor struct {
	Version     int           `json:"version"`
	UserID      string        `json:"userId"`
	Order       string        `json:"order"`
	ID          string        `json:"id"`
	RawDistance string        `json:"rawDistance"`
	Context     searchContext `json:"context"`
}

var searchWhitespace = regexp.MustCompile(`[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+`)
var distancePattern = regexp.MustCompile(`^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$`)

func normalizeQuery(query string) string {
	return strings.Trim(searchWhitespace.ReplaceAllString(strings.ToLower(query), " "), " ")
}

func (s *Service) Search(ctx context.Context, owner string, request model.SearchRequest) (model.SearchResponse, error) {
	started := time.Now()
	if owner == "" {
		return model.SearchResponse{}, apiError(401, "Authentication required", "unauthorized", 0)
	}
	binding, err := validateSearch(request)
	if err != nil {
		return model.SearchResponse{}, err
	}
	if err := s.available(); err != nil {
		return model.SearchResponse{}, err
	}
	var cursor *searchCursor
	if request.Cursor != "" {
		if request.Offset > 0 {
			return model.SearchResponse{}, apiError(400, "Search cursor cannot be combined with offset", "invalid_search_cursor", 0)
		}
		cursor, err = s.decodeCursor(request.Cursor, owner, binding)
		if err != nil {
			return model.SearchResponse{}, err
		}
	}
	var enrolled bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = ?1)`, owner).Scan(&enrolled); err != nil {
		return model.SearchResponse{}, err
	}
	if !enrolled {
		return model.SearchResponse{}, apiError(403, "Account not found", "account_not_found", 0)
	}
	vector, err := s.queryVector(ctx, owner, binding.Query)
	if err != nil {
		return model.SearchResponse{}, err
	}
	response, err := s.searchVector(ctx, owner, vector, binding, request.Offset, cursor)
	if err != nil {
		return model.SearchResponse{}, err
	}
	response.Query = request.Query
	response.ProcessingTime = time.Since(started).Milliseconds()
	return response, nil
}

func validateSearch(request model.SearchRequest) (searchContext, error) {
	query := normalizeQuery(request.Query)
	length := 0
	for _, r := range request.Query {
		length += utf16.RuneLen(r)
	}
	if query == "" || length > 500 || !utf8.ValidString(request.Query) || strings.ContainsRune(query, 0) {
		return searchContext{}, apiError(400, "Search query must contain 1 to 500 characters", "invalid_search_query", 0)
	}
	if request.Limit < 1 || request.Limit > searchMaxLimit {
		return searchContext{}, apiError(400, "Search limit must be between 1 and 100", "invalid_search_limit", 0)
	}
	if request.Offset < 0 || request.Offset > 500 {
		return searchContext{}, apiError(400, "Search offset must be between 0 and 500; use a cursor for later pages", "invalid_search_offset", 0)
	}
	threshold := searchDefaultThreshold
	if request.Threshold != nil {
		threshold = *request.Threshold
	}
	if math.IsNaN(threshold) || math.IsInf(threshold, 0) || threshold < 0 || threshold > 1 {
		return searchContext{}, apiError(400, "Search threshold must be between 0 and 1", "invalid_search_threshold", 0)
	}
	var tag *string
	if request.TagID != nil {
		value := strings.TrimSpace(*request.TagID)
		if value == "" || len(value) > 200 || strings.ContainsRune(value, 0) || !utf8.ValidString(value) {
			return searchContext{}, apiError(400, "Invalid tag filter", "invalid_search_tag", 0)
		}
		tag = &value
	}
	return searchContext{Query: query, EmbeddingModel: modelName + "@" + inference.ModelVersion, Threshold: threshold, Sort: "relevance", Direction: "desc", FavoriteOnly: request.FavoriteOnly, TagID: tag, Limit: request.Limit}, nil
}

func (s *Service) queryVector(ctx context.Context, owner, query string) ([]float32, error) {
	// A cached model output cannot mask disabled, loading or failed inference.
	if err := s.available(); err != nil {
		return nil, err
	}
	query = normalizeQuery(query)
	vector, err := s.cachedQueryVector(ctx, owner, query)
	if err != nil || vector != nil {
		return vector, err
	}
	waitCtx, stopWaiting := context.WithTimeout(ctx, interactiveWaitTimeout)
	err = s.compute.acquire(waitCtx, true)
	stopWaiting()
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, admissionBusy()
		}
		return nil, err
	}
	defer s.compute.release()
	engine, err := s.currentEngine()
	if err != nil {
		return nil, err
	}
	// A preceding waiter may have filled this owner's cache while we queued.
	vector, err = s.cachedQueryVector(ctx, owner, query)
	if err != nil || vector != nil {
		return vector, err
	}
	computeCtx, cancel := context.WithTimeout(ctx, inferenceTimeout)
	vector, err = engine.Text(computeCtx, query)
	cancel()
	var data []byte
	if err == nil {
		data, err = encodeVector(vector)
	}
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		s.opts.Logger.Error("search.inference_failed", "error", err)
		return nil, apiError(503, "Local inference could not encode this query", "embedding_inference_failed", 2)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	_, err = tx.ExecContext(ctx, `INSERT INTO query_embeddings(user_id, query, model_version, embedding, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
		ON CONFLICT(user_id, query, model_version) DO UPDATE SET embedding = excluded.embedding, created_at = excluded.created_at`, owner, query, inference.ModelVersion, data, now)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM query_embeddings WHERE user_id = ?1 AND
		(created_at <= ?2 OR model_version != ?3 OR (query, model_version) NOT IN
		(SELECT query, model_version FROM query_embeddings WHERE user_id = ?1 ORDER BY created_at DESC, query LIMIT ?4))`, owner, now.Add(-queryCacheTTL), inference.ModelVersion, queryCacheEntries)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return vector, nil
}

func (s *Service) cachedQueryVector(ctx context.Context, owner, query string) ([]float32, error) {
	var data []byte
	err := s.db.QueryRowContext(ctx, `SELECT embedding FROM query_embeddings WHERE user_id = ?1 AND query = ?2 AND model_version = ?3 AND created_at > ?4`, owner, query, inference.ModelVersion, time.Now().UTC().Add(-queryCacheTTL)).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	vector, err := decodeVector(data)
	if err != nil {
		s.opts.Logger.Warn("search.invalid_cached_vector", "owner_id", owner)
		return nil, nil
	}
	return vector, nil
}

func (s *Service) encodeCursor(cursor searchCursor) (string, error) {
	cursor.Version = 5
	payload, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, s.opts.CursorSecret)
	mac.Write([]byte("sploot:local-search:v5:"))
	mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func sameContext(left, right searchContext) bool {
	if left.Query != right.Query || left.EmbeddingModel != right.EmbeddingModel || left.Threshold != right.Threshold || left.Sort != right.Sort || left.Direction != right.Direction || left.FavoriteOnly != right.FavoriteOnly || left.Limit != right.Limit {
		return false
	}
	if left.TagID == nil || right.TagID == nil {
		return left.TagID == nil && right.TagID == nil
	}
	return *left.TagID == *right.TagID
}

func (s *Service) decodeCursor(value, owner string, expected searchContext) (*searchCursor, error) {
	invalid := apiError(400, "Invalid search cursor", "invalid_search_cursor", 0)
	if len(value) > cursorMaxLength {
		return nil, invalid
	}
	parts := strings.Split(value, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, invalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, invalid
	}
	mac := hmac.New(sha256.New, s.opts.CursorSecret)
	mac.Write([]byte("sploot:local-search:v5:"))
	mac.Write([]byte(parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return nil, invalid
	}
	data, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, invalid
	}
	var cursor searchCursor
	if json.Unmarshal(data, &cursor) != nil || cursor.Version != 5 || cursor.UserID != owner || cursor.Order != "relevance" || cursor.ID == "" || len(cursor.ID) > 200 || !distancePattern.MatchString(cursor.RawDistance) {
		return nil, invalid
	}
	distance, err := strconv.ParseFloat(cursor.RawDistance, 64)
	if err != nil || math.IsNaN(distance) || math.IsInf(distance, 0) || distance < -0.00001 || distance > 2.00001 {
		return nil, invalid
	}
	if !sameContext(cursor.Context, expected) {
		return nil, apiError(400, "Search cursor does not match search context", "invalid_search_cursor_context", 0)
	}
	return &cursor, nil
}

// Exact owner-scoped cosine retrieval computes each eligible distance once.
// Count and page use one SQLite snapshot; only query vectors are cached, never
// results, so newly indexed captures and favorite/tag/trash edits appear at once.
func (s *Service) searchVector(ctx context.Context, owner string, vector []float32, binding searchContext, offset int, cursor *searchCursor) (model.SearchResponse, error) {
	data, err := encodeVector(vector)
	if err != nil {
		return model.SearchResponse{}, err
	}
	var afterDistance *float64
	var afterID *string
	if cursor != nil {
		distance, err := strconv.ParseFloat(cursor.RawDistance, 64)
		if err != nil {
			return model.SearchResponse{}, err
		}
		afterDistance, afterID = &distance, &cursor.ID
	}
	rows, err := s.db.QueryContext(ctx, `WITH eligible AS MATERIALIZED (
		SELECT a.id, vec_distance_cosine(e.image_embedding, ?2) AS distance
		FROM asset_embeddings e JOIN assets a ON a.id = e.asset_id AND a.owner_user_id = e.owner_user_id
		WHERE e.owner_user_id = ?1 AND e.status = 'ready' AND e.dim = ?3 AND e.model_name = ?4 AND e.model_version = ?5
		AND a.owner_user_id = ?1 AND a.deleted_at IS NULL AND (NOT ?6 OR a.favorite)
		AND (?7 IS NULL OR EXISTS (SELECT 1 FROM asset_tags at JOIN tags t ON t.id = at.tag_id
			WHERE at.asset_id = a.id AND t.id = ?7 AND t.owner_user_id = ?1))
	), matched AS MATERIALIZED (SELECT * FROM eligible WHERE 1 - distance >= ?8),
	page AS (SELECT * FROM matched WHERE ?9 IS NULL OR (distance, id) > (?9, ?10)
		ORDER BY distance, id LIMIT ?11 OFFSET ?12),
	total AS (SELECT count(*) AS count FROM matched)
	SELECT total.count, a.id, a.owner_user_id, a.blob_url, a.thumbnail_url, a.pathname, a.mime, a.size, a.width, a.height, a.checksum_sha256, a.favorite,
		a.created_at, a.updated_at, a.share_slug, page.distance,
		COALESCE((SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
			FROM (SELECT t.id, t.name, t.color FROM asset_tags at JOIN tags t ON t.id = at.tag_id
			WHERE at.asset_id = a.id AND t.owner_user_id = ?1 ORDER BY t.name, t.id) t), '[]')
	FROM total LEFT JOIN page ON true LEFT JOIN assets a ON a.id = page.id AND a.owner_user_id = ?1 AND a.deleted_at IS NULL
	ORDER BY page.distance, page.id`, owner, data, inference.Dimension, modelName, inference.ModelVersion, binding.FavoriteOnly, binding.TagID, binding.Threshold, afterDistance, afterID, binding.Limit+1, offset)
	if err != nil {
		return model.SearchResponse{}, err
	}
	defer rows.Close()
	response := model.SearchResponse{Results: make([]model.Asset, 0, binding.Limit), Limit: binding.Limit, Threshold: binding.Threshold}
	var lastDistance float64
	for rows.Next() {
		var asset model.Asset
		var id, assetOwner, blobURL, pathname, mime, checksum *string
		var size *int64
		var favorite *bool
		var created, updated *time.Time
		var distance *float64
		var tags []byte
		if err := rows.Scan(&response.Total, &id, &assetOwner, &blobURL, &asset.ThumbnailURL, &pathname, &mime, &size, &asset.Width, &asset.Height, &checksum, &favorite,
			&created, &updated, &asset.ShareSlug, &distance, &tags); err != nil {
			return model.SearchResponse{}, err
		}
		if id == nil {
			continue
		}
		if len(response.Results) == binding.Limit {
			response.HasMore = true
			continue
		}
		asset.ID, asset.OwnerID, asset.BlobURL, asset.Pathname = *id, *assetOwner, *blobURL, *pathname
		asset.Filename, asset.MIME, asset.Size, asset.Checksum = path.Base(*pathname), *mime, *size, *checksum
		asset.Favorite, asset.CreatedAt, asset.UpdatedAt = *favorite, *created, *updated
		asset.Similarity = min(1, max(0, 1-*distance))
		asset.Relevance, asset.EmbeddingStatus = math.Round(asset.Similarity*100), "ready"
		if err := json.Unmarshal(tags, &asset.Tags); err != nil {
			return model.SearchResponse{}, err
		}
		response.Results = append(response.Results, asset)
		lastDistance = *distance
	}
	if err := rows.Err(); err != nil {
		return model.SearchResponse{}, err
	}
	if response.HasMore {
		last := response.Results[len(response.Results)-1]
		response.NextCursor, err = s.encodeCursor(searchCursor{UserID: owner, Order: "relevance", ID: last.ID, RawDistance: strconv.FormatFloat(lastDistance, 'g', -1, 64), Context: binding})
		if err != nil {
			return model.SearchResponse{}, err
		}
	}
	return response, nil
}
