package recovery

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func testSnapshotDir(t *testing.T) *snapshotDirectory {
	t.Helper()
	path := filepath.Join(t.TempDir(), "library")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	dir, err := openDirectory(path, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(dir.close)
	return dir
}

func TestRejectLiveJournalIgnoresEmptySidecars(t *testing.T) {
	dir := testSnapshotDir(t)
	for _, name := range sqliteJournalSidecars {
		if err := os.WriteFile(filepath.Join(dir.path, name), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := rejectLiveJournal(dir, "verify-library", "offline library has a live journal"); err != nil {
		t.Fatal(err)
	}
}

func TestRejectLiveJournalStopsOnNonemptyWal(t *testing.T) {
	dir := testSnapshotDir(t)
	if err := os.WriteFile(filepath.Join(dir.path, "library.sqlite-wal"), []byte("live-wal"), 0600); err != nil {
		t.Fatal(err)
	}
	err := rejectLiveJournal(dir, "verify-library", "offline library has a live journal")
	var phase *PhaseError
	if !errors.As(err, &phase) || phase.Phase != "verify-library" || phase.Reason != "offline library has a live journal" {
		t.Fatalf("got %v", err)
	}
}

func TestVerifySQLiteAcceptsMigratedLibrary(t *testing.T) {
	db, err := database.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := verifySQLite(context.Background(), db, "verify-library"); err != nil {
		t.Fatal(err)
	}
}

func TestVerifySQLiteRejectsBrokenOwnerReferences(t *testing.T) {
	db, err := database.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.ExecContext(context.Background(), `PRAGMA foreign_keys=OFF`); err != nil {
		t.Fatal(err)
	}
	_, err = conn.ExecContext(context.Background(), `INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256)
		VALUES(?,?,?,?,?,?,?)`, model.NewID(), "missing-owner", "/media/x", "x.gif", "image/gif", 1, "aa")
	conn.Close()
	if err != nil {
		t.Fatal(err)
	}
	for _, phase := range []string{"verify-library", "verify-database"} {
		err := verifySQLite(context.Background(), db, phase)
		var failed *PhaseError
		if !errors.As(err, &failed) || failed.Phase != phase || failed.Reason != "foreign key check failed" {
			t.Fatalf("%s: got %v", phase, err)
		}
	}
}

func TestVerifyLibraryRejectsLiveJournal(t *testing.T) {
	fixture := newRecoveryFixture(t)
	if err := os.WriteFile(filepath.Join(fixture.directory, "library.sqlite-wal"), []byte("live-wal"), 0600); err != nil {
		t.Fatal(err)
	}
	err := VerifyLibrary(context.Background(), fixture.directory)
	var phase *PhaseError
	if !errors.As(err, &phase) || phase.Phase != "verify-library" || phase.Reason != "offline library has a live journal" {
		t.Fatalf("got %v", err)
	}
}

func TestVerifyRejectsPortableLiveJournal(t *testing.T) {
	fixture := newRecoveryFixture(t)
	snapshot := filepath.Join(t.TempDir(), "snapshot")
	if _, err := Backup(context.Background(), Options{DataDirectory: fixture.directory, Directory: snapshot}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(snapshot, "library.sqlite-wal"), []byte("live-wal"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := Verify(context.Background(), snapshot)
	var phase *PhaseError
	if !errors.As(err, &phase) || phase.Phase != "verify-database" || phase.Reason != "portable database has an unexpected live journal" {
		t.Fatalf("got %v", err)
	}
}
