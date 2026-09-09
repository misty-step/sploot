package recovery

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/medialock"
)

func recoveryIngestion(t *testing.T, fixture recoveryFixture) *ingest.Service {
	t.Helper()
	service, err := ingest.New(fixture.db, ingest.Options{MediaDirectory: filepath.Join(fixture.directory, "media"), Environment: "test"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	return service
}

func TestFrozenBackupCannotPublishMissingPurgedMediaOnResume(t *testing.T) {
	fixture := newRecoveryFixture(t)
	service := recoveryIngestion(t, fixture)
	options := Options{DataDirectory: fixture.directory, Directory: filepath.Join(t.TempDir(), "interrupted"), MaxObjectBytes: 1}
	if _, err := Backup(context.Background(), options); err == nil {
		t.Fatal("backup did not stop before copying its bounded media")
	}
	if err := service.Purge(context.Background(), fixture.owner, fixture.asset); err != nil {
		t.Fatal(err)
	}
	options.MaxObjectBytes = 0
	if _, err := Resume(context.Background(), options); err == nil {
		t.Fatal("resume published a frozen asset whose uncopied original was purged")
	}
	if _, err := Verify(context.Background(), options.Directory); err == nil {
		t.Fatal("interrupted backup with permanently absent bytes was accepted")
	}
	options.Directory = filepath.Join(t.TempDir(), "fresh")
	manifest, err := Backup(context.Background(), options)
	if err != nil || manifest.AssetCount != 0 || manifest.ObjectCount != 0 {
		t.Fatalf("fresh backup retained a permanently purged asset: %+v %v", manifest, err)
	}
}

func TestCompletedBackupRetainsVerifiedBytesAfterSourcePurge(t *testing.T) {
	fixture := newRecoveryFixture(t)
	service := recoveryIngestion(t, fixture)
	options := Options{DataDirectory: fixture.directory, Directory: filepath.Join(t.TempDir(), "complete")}
	if _, err := Backup(context.Background(), options); err != nil {
		t.Fatal(err)
	}
	if err := service.Purge(context.Background(), fixture.owner, fixture.asset); err != nil {
		t.Fatal(err)
	}
	if _, err := Resume(context.Background(), options); err != nil {
		t.Fatalf("verified historical snapshot needlessly required purged source bytes: %v", err)
	}
	restored := RestoreOptions{Directory: options.Directory, TargetDataDirectory: filepath.Join(t.TempDir(), "restored")}
	if _, err := Restore(context.Background(), restored); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyRestore(context.Background(), restored); err != nil {
		t.Fatal(err)
	}
}

func TestFilesystemLocksFencePurgeAndSnapshotPublication(t *testing.T) {
	fixture := newRecoveryFixture(t)
	service := recoveryIngestion(t, fixture)
	ctx := context.Background()
	// The shared lock held throughout backup/resume keeps a frozen original
	// alive even after its metadata has been copied to an isolated database.
	reader, err := medialock.Acquire(ctx, fixture.directory, false)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	deadline, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	err = service.Purge(deadline, fixture.owner, fixture.asset)
	cancel()
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("purge did not wait for an active snapshot reader: %v", err)
	}
	if _, err := os.Stat(filepath.Join(fixture.directory, fixture.original.Path)); err != nil {
		t.Fatalf("purge unlinked media protected by a snapshot: %v", err)
	}
	reader.Close()
	writer, err := medialock.Acquire(ctx, fixture.directory, true)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()
	options := Options{DataDirectory: fixture.directory, Directory: filepath.Join(t.TempDir(), "snapshot")}
	deadline, cancel = context.WithTimeout(ctx, 100*time.Millisecond)
	_, err = Backup(deadline, options)
	cancel()
	if err == nil {
		t.Fatal("backup published while permanent deletion held the source lock")
	}
	writer.Close()
	manifest, err := Backup(ctx, options)
	if err != nil || manifest.AssetCount != 1 || manifest.ObjectCount != 2 {
		t.Fatalf("snapshot lost media while waiting for deletion coordination: %+v %v", manifest, err)
	}
}

func TestBackupExcludesPendingPurgeBytesWithoutChangingLiveIntent(t *testing.T) {
	fixture := newRecoveryFixture(t)
	// Model interruption after a durable detach, before either physical unlink.
	if _, err := fixture.db.Exec(`BEGIN IMMEDIATE;
		INSERT INTO asset_purges(asset_id,owner_user_id,pathname,thumbnail_path,storage_size,thumbnail_storage_size)
		SELECT id,owner_user_id,pathname,thumbnail_path,storage_size,thumbnail_storage_size FROM assets;
		DELETE FROM assets;
		COMMIT;`); err != nil {
		t.Fatal(err)
	}
	options := Options{DataDirectory: fixture.directory, Directory: filepath.Join(t.TempDir(), "snapshot")}
	manifest, err := Backup(context.Background(), options)
	if err != nil || manifest.AssetCount != 0 || manifest.MediaBytes != 0 {
		t.Fatalf("backup copied already-purged media: %+v %v", manifest, err)
	}
	var livePending int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM asset_purges WHERE completed_at IS NULL AND storage_size>0`).Scan(&livePending); err != nil || livePending != 1 {
		t.Fatalf("backup mutated live deletion state: %d %v", livePending, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.directory, fixture.original.Path)); err != nil {
		t.Fatalf("backup removed live pending cleanup bytes: %v", err)
	}
	snapshot, err := openDirectory(options.Directory, false)
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.close()
	db, err := openDatabase(context.Background(), snapshot, true)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var pending, tombstones int
	if err := db.QueryRow(`SELECT count(*) FILTER (WHERE completed_at IS NULL),count(*) FILTER (WHERE completed_at IS NOT NULL AND pathname IS NULL AND storage_size=0 AND thumbnail_storage_size=0) FROM asset_purges`).Scan(&pending, &tombstones); err != nil || pending != 0 || tombstones != 1 {
		t.Fatalf("portable snapshot retained missing-media cleanup charges or lost receipt fences: pending=%d tombstones=%d %v", pending, tombstones, err)
	}
}
