package library

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

type Statistics struct {
	AssetCount         int        `json:"assetCount"`
	FavoriteCount      int        `json:"favoriteCount"`
	TrashCount         int        `json:"trashCount"`
	StorageBytes       int64      `json:"storageBytes"`
	ActiveStorageBytes int64      `json:"activeStorageBytes"`
	TrashStorageBytes  int64      `json:"trashStorageBytes"`
	LastUploadAt       *time.Time `json:"lastUploadAt"`
}

// Originals and posters are immutable physical files. Trash retains both files
// and continues to consume storage; unfinished purges remain charged until synced.
const statisticsSQL = `SELECT
	COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL),
	COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL AND a.favorite),
	COUNT(a.id) FILTER (WHERE a.deleted_at IS NOT NULL),
	COALESCE(SUM(COALESCE(a.storage_size, a.size) + COALESCE(a.thumbnail_storage_size, 0)) FILTER (WHERE a.deleted_at IS NULL), 0),
	COALESCE(SUM(COALESCE(a.storage_size, a.size) + COALESCE(a.thumbnail_storage_size, 0)) FILTER (WHERE a.deleted_at IS NOT NULL), 0)
		+ (SELECT COALESCE(SUM(p.storage_size + p.thumbnail_storage_size), 0) FROM asset_purges p WHERE p.owner_user_id = u.id AND p.completed_at IS NULL)
	FROM users u LEFT JOIN assets a ON a.owner_user_id = u.id WHERE u.id = ?1 GROUP BY u.id`

func (s *Service) Stats(ctx context.Context, owner string) (Statistics, error) {
	var stats Statistics
	if err := s.ready(owner); err != nil {
		return stats, err
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return stats, fmt.Errorf("begin library statistics: %w", err)
	}
	defer tx.Rollback()
	err = tx.QueryRowContext(ctx, statisticsSQL, owner).Scan(&stats.AssetCount, &stats.FavoriteCount, &stats.TrashCount,
		&stats.ActiveStorageBytes, &stats.TrashStorageBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return stats, &model.APIError{Status: http.StatusForbidden, Code: "account_not_found", Message: "Account not found"}
	}
	if err != nil {
		return stats, fmt.Errorf("read library statistics: %w", err)
	}
	// Select the declared DATETIME column, not MAX(created_at), so SQLite's
	// driver retains the time.Time type instead of returning untyped SQL text.
	err = tx.QueryRowContext(ctx, `SELECT created_at FROM assets WHERE owner_user_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1`, owner).Scan(&stats.LastUploadAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return stats, fmt.Errorf("read latest upload: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return stats, err
	}
	stats.StorageBytes = stats.ActiveStorageBytes + stats.TrashStorageBytes
	return stats, nil
}
