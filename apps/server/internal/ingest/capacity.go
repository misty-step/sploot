package ingest

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/http"
	"syscall"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

// Trash is still physical storage. Pending deletion keeps its full charge until
// both unlinks and directory syncs are acknowledged; interrupted cleanup never
// grants capacity for bytes that might still be present.
const physicalUsageSQL = `SELECT
	(SELECT COALESCE(SUM(COALESCE(storage_size,size)+COALESCE(thumbnail_storage_size,0)),0) FROM assets)
	+ (SELECT COALESCE(SUM(storage_size+thumbnail_storage_size),0) FROM asset_purges WHERE completed_at IS NULL)`

func (s *Service) admitStorage(ctx context.Context, tx *sql.Tx, incoming int64) error {
	if incoming <= 0 {
		return errors.New("storage admission requires a positive byte count")
	}
	if s.storageLimitBytes == 0 {
		return nil
	}
	var used int64
	if err := tx.QueryRowContext(ctx, physicalUsageSQL).Scan(&used); err != nil {
		return err
	}
	if used > s.storageLimitBytes || incoming > s.storageLimitBytes-used {
		// No per-owner quota and no other owner's usage is exposed in errors.
		return &model.APIError{Status: http.StatusInsufficientStorage, Code: "storage_limit_exceeded", Message: "This instance's storage limit would be exceeded; permanently delete unwanted trash or ask the operator to raise the limit"}
	}
	return nil
}

func (s *Service) checkReserve(incoming int64) error {
	available, err := s.availableBytes()
	if err != nil {
		return &model.APIError{Status: http.StatusServiceUnavailable, Code: "storage_unavailable", Message: "The available disk space could not be checked"}
	}
	if incoming < 0 || available < incoming || available-incoming < s.storageReserveBytes {
		return &model.APIError{Status: http.StatusInsufficientStorage, Code: "storage_reserve_exceeded", Message: "This instance needs more free disk space to safely save media; free disk space or ask the operator to adjust its reserve"}
	}
	return nil
}

func (s *objectStore) availableBytes() (int64, error) {
	file, err := s.root.Open(".")
	if err != nil {
		return 0, err
	}
	defer file.Close()
	var stat syscall.Statfs_t
	if err := syscall.Fstatfs(int(file.Fd()), &stat); err != nil {
		return 0, err
	}
	if stat.Bsize <= 0 {
		return 0, errors.New("invalid media filesystem block size")
	}
	if uint64(stat.Bavail) > uint64(math.MaxInt64)/uint64(stat.Bsize) {
		return math.MaxInt64, nil
	}
	return int64(stat.Bavail) * int64(stat.Bsize), nil
}
