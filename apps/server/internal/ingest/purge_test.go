package ingest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func requirePurgeStatus(t *testing.T, err error, status int) {
	t.Helper()
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != status {
		t.Fatalf("status=%d required, got %v", status, err)
	}
}

func TestPurgeReclaimsOnlyOwnedTrashAndFencesReceiptsAndWorkers(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	ctx := context.Background()
	other := model.NewID()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash) VALUES(?,?,?)`, other, other+"@example.invalid", "hash"); err != nil {
		t.Fatal(err)
	}
	original := animatedFixture(t, 140)
	saved, err := s.Save(ctx, owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", IdempotencyKey: "permanent-capture", Tags: []string{"reaction"}})
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := s.Save(ctx, other, Input{Reader: bytes.NewReader(original), MIME: "image/gif"})
	if err != nil {
		t.Fatal(err)
	}
	id := saved.Asset.ID
	var posterPath string
	if err := db.QueryRow(`SELECT thumbnail_path FROM assets WHERE owner_user_id=? AND id=?`, owner, id).Scan(&posterPath); err != nil {
		t.Fatal(err)
	}
	requirePurgeStatus(t, s.Purge(ctx, other, id), 404)
	requirePurgeStatus(t, s.Purge(ctx, owner, model.NewID()), 404)
	requirePurgeStatus(t, s.Purge(ctx, owner, id), 409)
	if err := db.QueryRow(physicalUsageSQL).Scan(&s.storageLimitBytes); err != nil {
		t.Fatal(err)
	}
	lib := library.New(db, []byte(strings.Repeat("cursor-key-", 4)))
	if err := lib.Delete(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE asset_embeddings SET status='processing',processing_token='stale-worker',processing_until=datetime('now','+1 hour') WHERE asset_id=?`, id); err != nil {
		t.Fatal(err)
	}
	if err := s.Purge(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{saved.Asset.Pathname, posterPath} {
		if _, err := os.Stat(filepath.Join(directory, "media", key)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("purge retained physical media %s: %v", key, err)
		}
	}
	file, err := s.OpenMedia(ctx, other, foreign.Asset.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	retained, err := io.ReadAll(file)
	file.Close()
	if err != nil || !bytes.Equal(retained, original) {
		t.Fatal("purge changed another owner's original")
	}
	stats, err := lib.Stats(ctx, owner)
	if err != nil || stats.StorageBytes != 0 || stats.TrashCount != 0 {
		t.Fatalf("completed purge did not reclaim owned storage: %+v %v", stats, err)
	}
	var remaining int
	if err := db.QueryRow(`SELECT (SELECT count(*) FROM asset_embeddings WHERE asset_id=?)+(SELECT count(*) FROM asset_tags WHERE asset_id=?)`, id, id).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("purge retained indexing/tag associations: %d %v", remaining, err)
	}
	worker, err := db.Exec(`UPDATE asset_embeddings SET status='failed',processing_token=NULL,processing_until=NULL WHERE asset_id=? AND owner_user_id=? AND processing_token='stale-worker'`, id, owner)
	if err != nil {
		t.Fatal(err)
	}
	if count, err := worker.RowsAffected(); err != nil || count != 0 {
		t.Fatalf("in-flight worker resurrected purged indexing: %d %v", count, err)
	}
	_, err = lib.Restore(ctx, owner, id)
	requirePurgeStatus(t, err, 404)
	if err := s.Purge(ctx, owner, id); err != nil {
		t.Fatalf("completed purge was not idempotent: %v", err)
	}
	requirePurgeStatus(t, s.Purge(ctx, other, id), 404)
	_, err = s.Save(ctx, owner, Input{Reader: failedReader{}, MIME: "invalid", IdempotencyKey: "permanent-capture"})
	requirePurgeStatus(t, err, 410)
	resaved, err := s.Save(ctx, owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", IdempotencyKey: "new-capture"})
	if err != nil || resaved.Asset == nil || resaved.Asset.ID == id || resaved.IsDuplicate {
		t.Fatalf("explicit new capture could not reuse reclaimed content: %+v %v", resaved, err)
	}
}

func TestUncommittedPurgeCannotDeleteRestoredMedia(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	ctx := context.Background()
	original := animatedFixture(t, 80)
	saved, err := s.Save(ctx, owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif"})
	if err != nil {
		t.Fatal(err)
	}
	lib := library.New(db, []byte(strings.Repeat("cursor-key-", 4)))
	if err := lib.Delete(ctx, owner, saved.Asset.ID); err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := detachPurge(ctx, tx, owner, saved.Asset.ID); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	// A failed/unknown acknowledgement may have rolled back. No file operation
	// is allowed before re-reading a committed intent on the next startup.
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if _, err := lib.Restore(ctx, owner, saved.Asset.ID); err != nil {
		t.Fatal(err)
	}
	s.Close()
	db.Close()
	reopened, err := database.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	s = localIngestion(t, reopened, directory)
	file, err := s.OpenMedia(ctx, owner, saved.Asset.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	retained, err := io.ReadAll(file)
	file.Close()
	if err != nil || !bytes.Equal(retained, original) {
		t.Fatal("uncommitted purge or startup cleanup deleted restored media")
	}
	requirePurgeStatus(t, s.Purge(ctx, owner, saved.Asset.ID), 409)
}

func TestCommittedPurgeResumesAcrossPhysicalDeletionCrashBoundaries(t *testing.T) {
	for removedFiles, name := range []string{"after-intent-commit", "after-original-unlink", "after-both-unlinks"} {
		t.Run(name, func(t *testing.T) {
			db, owner, directory := ingestionDatabase(t)
			s := localIngestion(t, db, directory)
			ctx := context.Background()
			saved, err := s.Save(ctx, owner, Input{Reader: bytes.NewReader(animatedFixture(t, 170)), MIME: "image/gif", IdempotencyKey: "crashed-purge"})
			if err != nil {
				t.Fatal(err)
			}
			lib := library.New(db, []byte(strings.Repeat("cursor-key-", 4)))
			if err := lib.Delete(ctx, owner, saved.Asset.ID); err != nil {
				t.Fatal(err)
			}
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			intent, err := detachPurge(ctx, tx, owner, saved.Asset.ID)
			if err != nil {
				tx.Rollback()
				t.Fatal(err)
			}
			if err := tx.Commit(); err != nil {
				t.Fatal(err)
			}
			for _, object := range []storedObject{intent.original, intent.poster}[:removedFiles] {
				if err := s.store.root.Remove(object.key); err != nil {
					t.Fatal(err)
				}
			}
			stats, err := lib.Stats(ctx, owner)
			if err != nil || stats.StorageBytes != intent.original.size+intent.poster.size || stats.TrashStorageBytes != stats.StorageBytes {
				t.Fatalf("unfinished purge released its durable storage charge: %+v %v", stats, err)
			}
			_, err = lib.Restore(ctx, owner, saved.Asset.ID)
			requirePurgeStatus(t, err, 404)
			s.Close()
			db.Close()
			reopened, err := database.Open(ctx, directory)
			if err != nil {
				t.Fatal(err)
			}
			defer reopened.Close()
			s = localIngestion(t, reopened, directory)
			if count := retainedFiles(t, filepath.Join(directory, "media")); count != 0 {
				t.Fatalf("restart left %d permanently deleted files", count)
			}
			var used int64
			if err := reopened.QueryRow(physicalUsageSQL).Scan(&used); err != nil || used != 0 {
				t.Fatalf("restart did not release synced deletion capacity: %d %v", used, err)
			}
			if err := s.Purge(ctx, owner, saved.Asset.ID); err != nil {
				t.Fatal(err)
			}
			_, err = s.Save(ctx, owner, Input{Reader: failedReader{}, IdempotencyKey: "crashed-purge"})
			requirePurgeStatus(t, err, 410)
		})
	}
}

func TestRestoreRacingPurgeNeverReturnsMissingLiveMedia(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	ctx := context.Background()
	saved, err := s.Save(ctx, owner, Input{Reader: bytes.NewReader(animatedFixture(t, 70)), MIME: "image/gif"})
	if err != nil {
		t.Fatal(err)
	}
	lib := library.New(db, []byte(strings.Repeat("cursor-key-", 4)))
	if err := lib.Delete(ctx, owner, saved.Asset.ID); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	restored, purged := make(chan error, 1), make(chan error, 1)
	go func() { <-start; _, err := lib.Restore(ctx, owner, saved.Asset.ID); restored <- err }()
	go func() { <-start; purged <- s.Purge(ctx, owner, saved.Asset.ID) }()
	close(start)
	restoreErr, purgeErr := <-restored, <-purged
	if restoreErr == nil {
		requirePurgeStatus(t, purgeErr, 409)
		file, err := s.OpenMedia(ctx, owner, saved.Asset.ID, false)
		if err != nil {
			t.Fatalf("winning restore lost its original: %v", err)
		}
		file.Close()
	} else {
		requirePurgeStatus(t, restoreErr, 404)
		if purgeErr != nil || retainedFiles(t, filepath.Join(directory, "media")) != 0 {
			t.Fatalf("winning purge failed to reclaim media: %v", purgeErr)
		}
	}
}

func TestRejectedPurgeCommitNeverUnlinksRetainedMedia(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	ctx := context.Background()
	saved, err := s.Save(ctx, owner, Input{Reader: bytes.NewReader(animatedFixture(t, 60)), MIME: "image/gif"})
	if err != nil {
		t.Fatal(err)
	}
	lib := library.New(db, []byte(strings.Repeat("cursor-key-", 4)))
	if err := lib.Delete(ctx, owner, saved.Asset.ID); err != nil {
		t.Fatal(err)
	}
	// A deferred FK permits the detach statements but rejects COMMIT itself,
	// exercising the actual public purge path rather than a mocked SQL result.
	if _, err := db.Exec(`CREATE TABLE retained_reference(asset_id TEXT REFERENCES assets(id) DEFERRABLE INITIALLY DEFERRED);
		INSERT INTO retained_reference(asset_id) VALUES(?)`, saved.Asset.ID); err != nil {
		t.Fatal(err)
	}
	requirePurgeStatus(t, s.Purge(ctx, owner, saved.Asset.ID), 503)
	if count := retainedFiles(t, filepath.Join(directory, "media")); count != 2 {
		t.Fatalf("failed commit acknowledgement deleted retained original/poster: %d files", count)
	}
	var assets, intents int
	if err := db.QueryRow(`SELECT (SELECT count(*) FROM assets WHERE id=?),(SELECT count(*) FROM asset_purges WHERE asset_id=?)`, saved.Asset.ID, saved.Asset.ID).Scan(&assets, &intents); err != nil {
		t.Fatal(err)
	}
	if assets != 1 || intents != 0 {
		t.Fatalf("rejected detach was treated as a committed deletion: assets=%d intents=%d", assets, intents)
	}
	if _, err := db.Exec(`DROP TABLE retained_reference`); err != nil {
		t.Fatal(err)
	}
	if _, err := lib.Restore(ctx, owner, saved.Asset.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.resumePurges(ctx); err != nil {
		t.Fatal(err)
	}
	file, err := s.OpenMedia(ctx, owner, saved.Asset.ID, false)
	if err != nil {
		t.Fatalf("recovery removed a restored asset after commit rejection: %v", err)
	}
	file.Close()
}
