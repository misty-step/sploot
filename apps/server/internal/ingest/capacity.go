package ingest

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/diskreserve"
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

// SaveStagingBytes is the worst-case save footprint on the media filesystem:
// the spooled original, its durable copy, the poster, and the scratch directory
// can exist together, each rounded to an allocation block.
func SaveStagingBytes(mediaDir string) (int64, error) {
	block, err := diskreserve.BlockSize(mediaDir)
	if err != nil {
		return 0, err
	}
	original, err := diskreserve.RoundUp(int64(contract.UploadMaxBytes), block)
	if err != nil {
		return 0, err
	}
	poster, err := diskreserve.RoundUp(maxPosterBytes, block)
	if err != nil {
		return 0, err
	}
	total, err := diskreserve.Add(original, original)
	if err != nil {
		return 0, err
	}
	total, err = diskreserve.Add(total, poster)
	if err != nil {
		return 0, err
	}
	return diskreserve.Add(total, block)
}

func (s *Service) admitDisk(ctx context.Context, bytes int64) (*diskreserve.Hold, error) {
	if s.ledger == nil {
		return nil, diskError(diskreserve.ErrSpaceUnknown)
	}
	hold, err := s.ledger.Reserve(ctx, s.store.directory, bytes)
	if err != nil {
		return nil, diskError(err)
	}
	return hold, nil
}

func (s *Service) tightenDisk(ctx context.Context, hold *diskreserve.Hold, original, poster int64) error {
	if original < 0 || poster < 0 {
		return diskError(diskreserve.ErrSpaceUnknown)
	}
	block, err := diskreserve.BlockSize(s.store.directory)
	if err != nil {
		return diskError(err)
	}
	originalAlloc, err := diskreserve.RoundUp(original, block)
	if err != nil {
		return diskError(err)
	}
	posterAlloc, err := diskreserve.RoundUp(poster, block)
	if err != nil {
		return diskError(err)
	}
	remaining, err := diskreserve.Add(originalAlloc, posterAlloc)
	if err != nil {
		return diskError(err)
	}
	return diskError(hold.Adjust(ctx, remaining))
}

func diskError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	if errors.Is(err, diskreserve.ErrInsufficientSpace) {
		return &model.APIError{Status: http.StatusInsufficientStorage, Code: "storage_reserve_exceeded", Message: "This instance needs more free disk space to safely save media; free disk space or ask the operator to adjust its reserve"}
	}
	if errors.Is(err, diskreserve.ErrSpaceUnknown) {
		return &model.APIError{Status: http.StatusServiceUnavailable, Code: "storage_unavailable", Message: "The available disk space could not be checked"}
	}
	return err
}

func (s *objectStore) availableBytes() (int64, error) {
	_, available, err := diskreserve.Stat(s.directory)
	if err != nil {
		return 0, err
	}
	return available, nil
}
