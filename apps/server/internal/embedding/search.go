package embedding

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/jackc/pgx/v5"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

// The field names and v4 envelope intentionally accept existing signed cursors.
// A distance remains Postgres' raw float8 text, not 1 minus a public score.
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
func digest(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}
func queryCacheKey(query string) string {
	return "txt:v2:" + digest(contract.EmbeddingModel) + ":" + digest(normalizeQuery(query))
}

func (s *Service) Search(ctx context.Context, owner string, request model.SearchRequest) (model.SearchResponse, error) {
	started := time.Now()
	if owner == "" {
		return model.SearchResponse{}, apiError(401, "Authentication required", "unauthorized", 0)
	}
	context, err := validateSearch(request)
	if err != nil {
		return model.SearchResponse{}, err
	}
	var cursor *searchCursor
	if request.Cursor != "" {
		if request.Offset > 0 {
			return model.SearchResponse{}, apiError(400, "Search cursor cannot be combined with offset", "invalid_search_cursor", 0)
		}
		cursor, err = s.decodeCursor(request.Cursor, owner, context)
		if err != nil {
			return model.SearchResponse{}, err
		}
	}
	// Query vectors are global immutable model outputs, not user result sets.
	// Enrollment still must exist even on a cache hit; no implicit creation.
	var enrolled bool
	if err = s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id=$1)`, owner).Scan(&enrolled); err != nil {
		return model.SearchResponse{}, err
	}
	if !enrolled {
		return model.SearchResponse{}, apiError(403, "Account is not enrolled", "enrollment_denied", 0)
	}
	vector, err := s.queryVector(ctx, owner, request.Query)
	if err != nil {
		return model.SearchResponse{}, publicError(err)
	}
	response, err := s.searchVector(ctx, owner, vector, context, request.Offset, cursor)
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
	if query == "" || length > 500 {
		return searchContext{}, apiError(400, "Search query must contain 1 to 500 characters", "invalid_search_query", 0)
	}
	limit := request.Limit
	if limit < 1 || limit > searchMaxLimit {
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
		if value == "" {
			return searchContext{}, apiError(400, "Invalid tag filter", "invalid_search_tag", 0)
		}
		tag = &value
	}
	return searchContext{Query: query, EmbeddingModel: contract.EmbeddingModel, Threshold: threshold, Sort: "relevance", Direction: "desc", FavoriteOnly: request.FavoriteOnly, TagID: tag, Limit: limit}, nil
}

func (s *Service) queryVector(ctx context.Context, owner, query string) ([]float64, error) {
	key := queryCacheKey(query)
	var data []byte
	err := s.pool.QueryRow(ctx, `SELECT embedding FROM text_embedding_cache WHERE key=$1 AND model=$2 AND expires_at>CURRENT_TIMESTAMP`, key, contract.EmbeddingModel).Scan(&data)
	if err == nil {
		vector, decodeErr := decodeVector(data)
		if decodeErr == nil {
			return vector, nil
		}
		// A corrupt cached vector is not a real cache hit. Never feed it into
		// pgvector or turn it into a synthetic fallback for missing credentials.
		s.opts.Logger.Error("embedding-query.invalid-cache-vector", "key", key)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	vector, err := s.generate(ctx, owner, "embedding_query", "text", query, nil)
	if err != nil {
		return nil, err
	}
	data, err = json.Marshal(vector)
	if err != nil {
		return nil, err
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO text_embedding_cache (key,model,embedding,expires_at) VALUES ($1,$2,$3::jsonb,CURRENT_TIMESTAMP+$4::interval)
		ON CONFLICT (key) DO UPDATE SET model=EXCLUDED.model,embedding=EXCLUDED.embedding,expires_at=EXCLUDED.expires_at`, key, contract.EmbeddingModel, string(data), durationInterval(queryCacheTTL))
	if err != nil {
		s.opts.Logger.Error("embedding-query.cache-write-failed", "error", err)
	}
	if err == nil {
		if _, pruneErr := s.pool.Exec(ctx, `DELETE FROM text_embedding_cache WHERE expires_at<=CURRENT_TIMESTAMP`); pruneErr != nil {
			s.opts.Logger.Error("embedding-query.cache-prune-failed", "error", pruneErr)
		}
	}
	return vector, nil
}

func (s *Service) encodeCursor(cursor searchCursor) (string, error) {
	cursor.Version = 4
	payload, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, s.opts.CursorSecret)
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
	mac.Write([]byte(parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return nil, invalid
	}
	data, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, invalid
	}
	var cursor searchCursor
	if json.Unmarshal(data, &cursor) != nil || cursor.Version != 4 || cursor.UserID != owner || cursor.Order != "relevance" || cursor.ID == "" || len(cursor.ID) > 200 || !distancePattern.MatchString(cursor.RawDistance) {
		return nil, invalid
	}
	distance, err := strconv.ParseFloat(cursor.RawDistance, 64)
	if err != nil || math.IsNaN(distance) || math.IsInf(distance, 0) {
		return nil, invalid
	}
	if !sameContext(cursor.Context, expected) {
		return nil, apiError(400, "Search cursor does not match search context", "invalid_search_cursor_context", 0)
	}
	return &cursor, nil
}

// Personal libraries use an exact owner-scoped scan, rather than repeatedly
// widening an approximate cross-library candidate pool. One materialization
// computes distance once per eligible owned vector; total and page share the
// same snapshot. No saved search/result cache can hide a newly indexed asset.
func (s *Service) searchVector(ctx context.Context, owner string, vector []float64, context searchContext, offset int, cursor *searchCursor) (model.SearchResponse, error) {
	if err := validateVector(vector); err != nil {
		return model.SearchResponse{}, err
	}
	var afterDistance, afterID *string
	if cursor != nil {
		afterDistance = &cursor.RawDistance
		afterID = &cursor.ID
	}
	rows, err := s.pool.Query(ctx, `WITH eligible AS MATERIALIZED (
		SELECT a.id,e.image_embedding <=> $2::vector AS distance
		FROM asset_embeddings e JOIN assets a ON a.id=e.asset_id
		WHERE e.owner_user_id=$1 AND e.asset_deleted_at IS NULL AND e.status='ready'
		AND e.image_embedding IS NOT NULL AND e.dim=$3 AND e.model_name=$4 AND e.model_version=$5
		AND a.owner_user_id=$1 AND a.deleted_at IS NULL AND (NOT $6 OR a.favorite)
		AND ($7::text IS NULL OR EXISTS (SELECT 1 FROM asset_tags at JOIN tags t ON t.id=at.tag_id
			WHERE at.asset_id=a.id AND t.id=$7 AND t.owner_user_id=$1))
	), matched AS MATERIALIZED (SELECT * FROM eligible WHERE 1-distance >= $8),
	page AS (SELECT * FROM matched WHERE $9::double precision IS NULL OR (distance,id)>($9::double precision,$10::text)
		ORDER BY distance,id LIMIT $11 OFFSET $12),
	total AS (SELECT count(*) AS count FROM matched)
	SELECT total.count,a.id,a.owner_user_id,a.blob_url,a.thumbnail_url,a.pathname,a.mime,a.size,a.width,a.height,a.checksum_sha256,a.favorite,
		a."createdAt",a."updatedAt",a.share_slug,1-page.distance,page.distance::text,
		COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color) ORDER BY t.name,t.id)
			FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id AND t.owner_user_id=$1),'[]'::jsonb)
	FROM total LEFT JOIN page ON true LEFT JOIN assets a ON a.id=page.id AND a.owner_user_id=$1 AND a.deleted_at IS NULL
	ORDER BY page.distance,page.id`, owner, vectorSQL(vector), contract.EmbeddingDimension, contract.EmbeddingModel, contract.EmbeddingVersion, context.FavoriteOnly, context.TagID, context.Threshold, afterDistance, afterID, context.Limit+1, offset)
	if err != nil {
		return model.SearchResponse{}, err
	}
	defer rows.Close()
	response := model.SearchResponse{Results: make([]model.Asset, 0, context.Limit), Limit: context.Limit, Threshold: context.Threshold}
	var lastDistance string
	for rows.Next() {
		var asset model.Asset
		var id, assetOwner, blobURL, pathname, mime, checksum, rawDistance *string
		var size *int64
		var favorite *bool
		var created, updated *time.Time
		var similarity *float64
		var tags []byte
		if err = rows.Scan(&response.Total, &id, &assetOwner, &blobURL, &asset.ThumbnailURL, &pathname, &mime, &size, &asset.Width, &asset.Height, &checksum, &favorite,
			&created, &updated, &asset.ShareSlug, &similarity, &rawDistance, &tags); err != nil {
			return model.SearchResponse{}, err
		}
		if id == nil {
			continue
		}
		if len(response.Results) == context.Limit {
			response.HasMore = true
			continue
		}
		asset.ID = *id
		asset.OwnerID = *assetOwner
		asset.BlobURL = *blobURL
		asset.Pathname = *pathname
		asset.Filename = path.Base(*pathname)
		asset.MIME = *mime
		asset.Size = *size
		asset.Checksum = *checksum
		asset.Favorite = *favorite
		asset.CreatedAt = *created
		asset.UpdatedAt = *updated
		asset.Similarity = *similarity
		asset.Relevance = math.Round(*similarity * 100)
		asset.EmbeddingStatus = "ready"
		if err = json.Unmarshal(tags, &asset.Tags); err != nil {
			return model.SearchResponse{}, err
		}
		response.Results = append(response.Results, asset)
		lastDistance = *rawDistance
	}
	if err = rows.Err(); err != nil {
		return model.SearchResponse{}, err
	}
	if response.HasMore {
		last := response.Results[len(response.Results)-1]
		response.NextCursor, err = s.encodeCursor(searchCursor{UserID: owner, Order: "relevance", ID: last.ID, RawDistance: lastDistance, Context: context})
		if err != nil {
			return model.SearchResponse{}, err
		}
	}
	return response, nil
}
