package library

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type QuotaSnapshot struct {
	model.Quota
	ActiveBytes int64 `json:"activeBytes"`
	TrashBytes  int64 `json:"trashBytes"`
}

type Statistics struct {
	AssetCount            int           `json:"assetCount"`
	FavoriteCount         int           `json:"favoriteCount"`
	TrashCount            int           `json:"trashCount"`
	StorageBytes          int64         `json:"storageBytes"`
	StorageLimitBytes     int64         `json:"storageLimitBytes"`
	StorageRemainingBytes int64         `json:"storageRemainingBytes"`
	StorageUsagePercent   float64       `json:"storageUsagePercent"`
	LastUploadAt          *time.Time    `json:"lastUploadAt"`
	Quota                 QuotaSnapshot `json:"quota"`
}

// Same physical ledger authority as the retained Prisma asset-storage-meter:
// each rendition sums all active replicas; only a missing rendition measurement
// falls back to the legacy asset size. Trash still occupies physical storage.
const statisticsSQL = `SELECT
	usage.asset_count, usage.favorite_count, usage.trash_count, usage.last_upload_at,
	usage.active_bytes, usage.trash_bytes, COALESCE(q.limit_bytes, 1073741824),
	COALESCE((SELECT SUM(bytes) FROM storage_quota_reservations WHERE owner_user_id = u.id AND expires_at > CURRENT_TIMESTAMP), 0)::bigint
	FROM users u LEFT JOIN user_storage_quotas q ON q.user_id = u.id
	CROSS JOIN LATERAL (
		SELECT COUNT(*) FILTER (WHERE a.deleted_at IS NULL) AS asset_count,
			COUNT(*) FILTER (WHERE a.deleted_at IS NULL AND a.favorite) AS favorite_count,
			COUNT(*) FILTER (WHERE a.deleted_at IS NOT NULL) AS trash_count,
			MAX(a."createdAt") FILTER (WHERE a.deleted_at IS NULL) AS last_upload_at,
			COALESCE(SUM(COALESCE(r.original_bytes, a.storage_size, a.size) + COALESCE(r.thumbnail_bytes, a.thumbnail_storage_size, 0)) FILTER (WHERE a.deleted_at IS NULL), 0)::bigint AS active_bytes,
			COALESCE(SUM(COALESCE(r.original_bytes, a.storage_size, a.size) + COALESCE(r.thumbnail_bytes, a.thumbnail_storage_size, 0)) FILTER (WHERE a.deleted_at IS NOT NULL), 0)::bigint AS trash_bytes
		FROM assets a LEFT JOIN LATERAL (
			SELECT SUM(size) FILTER (WHERE rendition = 'original') AS original_bytes,
				SUM(size) FILTER (WHERE rendition = 'thumbnail') AS thumbnail_bytes
			FROM asset_storage_replicas WHERE asset_id = a.id AND active
		) r ON true WHERE a.owner_user_id = u.id
	) usage WHERE u.id = $1`

func (s *Service) Stats(ctx context.Context, owner string) (Statistics, error) {
	var stats Statistics
	if err := s.ready(owner); err != nil {
		return stats, err
	}
	err := s.pool.QueryRow(ctx, statisticsSQL, owner).Scan(&stats.AssetCount, &stats.FavoriteCount, &stats.TrashCount, &stats.LastUploadAt,
		&stats.Quota.ActiveBytes, &stats.Quota.TrashBytes, &stats.Quota.LimitBytes, &stats.Quota.ReservedBytes)
	if errors.Is(err, pgx.ErrNoRows) {
		return stats, &model.APIError{Status: http.StatusForbidden, Code: "enrollment_closed", Message: "This account is not enrolled"}
	}
	if err != nil {
		return stats, fmt.Errorf("read library statistics: %w", err)
	}
	stats.Quota.UsedBytes = stats.Quota.ActiveBytes + stats.Quota.TrashBytes
	stats.Quota.RemainingBytes = max(0, stats.Quota.LimitBytes-stats.Quota.UsedBytes-stats.Quota.ReservedBytes)
	stats.StorageBytes, stats.StorageLimitBytes, stats.StorageRemainingBytes = stats.Quota.UsedBytes, stats.Quota.LimitBytes, stats.Quota.RemainingBytes
	if stats.StorageLimitBytes > 0 {
		stats.StorageUsagePercent = min(100, math.Round(float64(stats.StorageBytes)/float64(stats.StorageLimitBytes)*1000)/10)
	}
	return stats, nil
}

func (s *Service) Quota(ctx context.Context, owner string) (QuotaSnapshot, error) {
	stats, err := s.Stats(ctx, owner)
	return stats.Quota, err
}
