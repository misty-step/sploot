package ingest

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/misty-step/sploot/apps/server/internal/medialock"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type purgeIntent struct {
	assetID, owner   string
	original, poster storedObject
	completed        bool
}

// Purge irrevocably detaches an already-trashed owned asset, then reclaims its
// files. A failed commit acknowledgement never permits an unlink: a retry first
// reads the durable intent. Retained tombstones make retries and save receipts
// unambiguous even after successful physical cleanup.
func (s *Service) Purge(ctx context.Context, owner, assetID string) error {
	if owner == "" {
		return &model.APIError{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "Authentication is required"}
	}
	admission, err := medialock.Acquire(ctx, s.store.directory, true)
	if err != nil {
		return err
	}
	defer admission.Close()
	lock, err := medialock.Acquire(ctx, s.store.libraryDirectory(), true)
	if err != nil {
		return err
	}
	defer lock.Close()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	intent, err := detachPurge(ctx, tx, owner, assetID)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		s.logger.Error("permanent deletion commit acknowledgement failed", "error", err)
		return purgeIncomplete()
	}
	if err := s.finishPurge(ctx, intent); err != nil {
		s.logger.Error("permanent media deletion remains pending", "error", err)
		return purgeIncomplete()
	}
	return nil
}

func detachPurge(ctx context.Context, tx *sql.Tx, owner, assetID string) (purgeIntent, error) {
	intent := purgeIntent{assetID: assetID, owner: owner}
	var original, poster sql.NullString
	err := tx.QueryRowContext(ctx, `SELECT pathname,thumbnail_path,storage_size,thumbnail_storage_size,completed_at IS NOT NULL
		FROM asset_purges WHERE owner_user_id=? AND asset_id=?`, owner, assetID).Scan(&original, &poster, &intent.original.size, &intent.poster.size, &intent.completed)
	if err == nil {
		intent.original.key, intent.poster.key = original.String, poster.String
		return intent, validatePurge(intent)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return intent, err
	}
	var deleted bool
	err = tx.QueryRowContext(ctx, `SELECT pathname,thumbnail_path,COALESCE(storage_size,size),COALESCE(thumbnail_storage_size,0),deleted_at IS NOT NULL
		FROM assets WHERE owner_user_id=? AND id=?`, owner, assetID).Scan(&intent.original.key, &poster, &intent.original.size, &intent.poster.size, &deleted)
	if errors.Is(err, sql.ErrNoRows) {
		return intent, &model.APIError{Status: http.StatusNotFound, Code: "asset_not_found", Message: "Asset not found"}
	}
	if err != nil {
		return intent, err
	}
	if !deleted {
		return intent, &model.APIError{Status: http.StatusConflict, Code: "asset_not_trashed", Message: "Move the asset to trash before permanently deleting it"}
	}
	intent.poster.key = poster.String
	if err := validatePurge(intent); err != nil {
		return intent, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO asset_purges(asset_id,owner_user_id,pathname,thumbnail_path,storage_size,thumbnail_storage_size)
		VALUES(?,?,?,?,?,?)`, assetID, owner, intent.original.key, poster, intent.original.size, intent.poster.size); err != nil {
		return intent, err
	}
	// Immediate transactions serialize this with restore. Cascading embeddings
	// also fence an in-flight worker: its old processing-token update finds no row.
	result, err := tx.ExecContext(ctx, `DELETE FROM assets WHERE owner_user_id=? AND id=? AND deleted_at IS NOT NULL`, owner, assetID)
	if err != nil {
		return intent, err
	}
	if count, err := result.RowsAffected(); err != nil || count != 1 {
		return intent, errors.New("permanent deletion lost its trashed asset fence")
	}
	return intent, nil
}

func validatePurge(intent purgeIntent) error {
	if intent.completed {
		return nil
	}
	ownerHash := sha256.Sum256([]byte(intent.owner))
	prefix := "uploads/" + hex.EncodeToString(ownerHash[:16]) + "/" + intent.assetID + "/"
	if intent.owner == "" || intent.assetID == "" || !validMediaPath(intent.original.key) || !strings.HasPrefix(intent.original.key, prefix) || intent.original.size < 0 {
		return errors.New("permanent deletion has an invalid owned original path")
	}
	if intent.poster.size < 0 ||
		intent.poster.key == "" && intent.poster.size != 0 ||
		intent.poster.key != "" && (!validMediaPath(intent.poster.key) || !strings.HasPrefix(intent.poster.key, prefix) || intent.poster.key == intent.original.key) {
		return errors.New("permanent deletion has an invalid owned poster path")
	}
	return nil
}

func (s *Service) finishPurge(ctx context.Context, intent purgeIntent) error {
	if err := validatePurge(intent); err != nil || intent.completed {
		return err
	}
	var referenced bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM assets WHERE pathname IN (?,?) OR thumbnail_path IN (?,?))`,
		intent.original.key, intent.poster.key, intent.original.key, intent.poster.key).Scan(&referenced); err != nil {
		return err
	}
	if referenced {
		return errors.New("permanent deletion refuses a file still referenced by an asset")
	}
	for _, object := range []storedObject{intent.original, intent.poster} {
		if object.key == "" {
			continue
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := s.store.removePurged(object.key); err != nil {
			return err
		}
	}
	// A failure here retains the intent and its charge; retrying missing files is
	// safe. Never release the capacity before both directory syncs have succeeded.
	_, err := s.db.ExecContext(ctx, `UPDATE asset_purges SET pathname=NULL,thumbnail_path=NULL,storage_size=0,thumbnail_storage_size=0,completed_at=CURRENT_TIMESTAMP
		WHERE owner_user_id=? AND asset_id=? AND completed_at IS NULL`, intent.owner, intent.assetID)
	return err
}

func (s *objectStore) removePurged(key string) error {
	current := ""
	components := strings.Split(key, "/")
	for index, component := range components {
		parent := current
		current = filepath.Join(current, component)
		info, err := s.root.Lstat(current)
		if errors.Is(err, os.ErrNotExist) {
			if parent == "" {
				parent = "."
			}
			return s.syncDirectory(parent)
		}
		if err != nil {
			return err
		}
		if index < len(components)-1 {
			if !info.IsDir() || info.Mode().Perm() != 0700 {
				return errors.New("permanent deletion refuses an unsafe media directory")
			}
		} else if !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
			return errors.New("permanent deletion refuses an unsafe media file")
		}
	}
	return s.remove(storedObject{key: key})
}

// resumePurges runs before this ingestion service accepts requests. The same
// locks cover crashed-spool cleanup; no other process can have a live spool.
func (s *Service) resumePurges(ctx context.Context) error {
	admission, err := medialock.Acquire(ctx, s.store.directory, true)
	if err != nil {
		return err
	}
	defer admission.Close()
	lock, err := medialock.Acquire(ctx, s.store.libraryDirectory(), true)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err := s.store.cleanTemporary(); err != nil {
		return err
	}
	for {
		rows, err := s.db.QueryContext(ctx, `SELECT asset_id,owner_user_id,pathname,thumbnail_path,storage_size,thumbnail_storage_size FROM asset_purges WHERE completed_at IS NULL LIMIT 64`)
		if err != nil {
			return err
		}
		var intents []purgeIntent
		for rows.Next() {
			var intent purgeIntent
			var poster sql.NullString
			if err := rows.Scan(&intent.assetID, &intent.owner, &intent.original.key, &poster, &intent.original.size, &intent.poster.size); err != nil {
				rows.Close()
				return err
			}
			intent.poster.key = poster.String
			intents = append(intents, intent)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if len(intents) == 0 {
			return nil
		}
		for _, intent := range intents {
			if err := s.finishPurge(ctx, intent); err != nil {
				return fmt.Errorf("finish retained purge: %w", err)
			}
		}
	}
}

func (s *objectStore) cleanTemporary() error {
	directory, err := s.root.Open(".")
	if err != nil {
		return err
	}
	defer directory.Close()
	for {
		entries, err := directory.ReadDir(64)
		if err != nil && !errors.Is(err, io.EOF) {
			return err
		}
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".ingest-") {
				if !entry.IsDir() {
					return errors.New("abandoned ingestion spool is not a private directory")
				}
				if err := s.root.RemoveAll(entry.Name()); err != nil {
					return err
				}
			}
		}
		if errors.Is(err, io.EOF) {
			return s.syncDirectory(".")
		}
	}
}

func purgeIncomplete() *model.APIError {
	return &model.APIError{Status: http.StatusServiceUnavailable, Code: "purge_incomplete", Message: "Permanent deletion was interrupted; retry this deletion to finish reclaiming its media", Retryable: true}
}
