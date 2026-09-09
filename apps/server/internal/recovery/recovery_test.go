package recovery

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type recoveryFixture struct {
	db        *sql.DB
	directory string
	owner     string
	asset     string
	original  MediaEntry
	data      []byte
}

func newRecoveryFixture(t *testing.T) recoveryFixture {
	t.Helper()
	directory := filepath.Join(t.TempDir(), "live")
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	owner, asset := model.NewID(), model.NewID()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash) VALUES(?,?,?)`, owner, owner+"@example.invalid", "retained-password-hash"); err != nil {
		t.Fatal(err)
	}
	data := []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b")
	var poster bytes.Buffer
	if err := jpeg.Encode(&poster, image.NewRGBA(image.Rect(0, 0, 1, 1)), nil); err != nil {
		t.Fatal(err)
	}
	key := "uploads/" + digest([]byte(owner))[:32] + "/" + asset + "/original.gif"
	posterKey := filepath.ToSlash(filepath.Join(filepath.Dir(key), "poster", "preview.jpg"))
	for path, value := range map[string][]byte{key: data, posterKey: poster.Bytes()} {
		filename := filepath.Join(directory, "media", path)
		if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, value, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO assets(id,owner_user_id,blob_url,thumbnail_url,pathname,thumbnail_path,mime,size,checksum_sha256,storage_size,storage_sha256,thumbnail_storage_size,thumbnail_storage_sha256,favorite,deleted_at) VALUES(?,?,?,?,?,?,'image/gif',?,?,?,?,?,?,1,CURRENT_TIMESTAMP)`, asset, owner, "/media/"+asset, "/media/"+asset+"?thumbnail=1", key, posterKey, len(data), digest(data), len(data), digest(data), poster.Len(), digest(poster.Bytes())); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO asset_embeddings(asset_id,owner_user_id,status,processing_token,processing_until) VALUES(?,?,'processing','old-worker',datetime('now','+1 hour'))`, asset, owner); err != nil {
		t.Fatal(err)
	}
	receipt, err := json.Marshal(model.UploadResponse{Success: true, Asset: &model.UploadAsset{ID: asset, BlobURL: "/media/" + asset}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO upload_idempotency(id,owner_user_id,key,status,result,retained_until) VALUES(?,?,'retained-capture','completed',?,datetime('now','+7 days'))`, model.NewID(), owner, receipt); err != nil {
		t.Fatal(err)
	}
	return recoveryFixture{db: db, directory: directory, owner: owner, asset: asset, original: MediaEntry{AssetID: asset, OwnerID: owner, Rendition: "original", Path: "media/" + key, Bytes: int64(len(data)), SHA256: digest(data), MIME: "image/gif"}, data: data}
}

func TestBackupRestorePreservesLibraryAndInvalidatesCredentials(t *testing.T) {
	fixture := newRecoveryFixture(t)
	if _, err := fixture.db.Exec(`INSERT INTO users(id,email,password_hash) VALUES('other-owner','other@example.invalid','other-retained-hash')`); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture.directory, "signing.key"), bytes.Repeat([]byte{0x5a}, 32), 0600); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"browser", "device"} {
		if _, err := fixture.db.Exec(`INSERT INTO auth_sessions(id,user_id,token_hash,kind,expires_at) VALUES(?,?,?,?,datetime('now','+1 day'))`, model.NewID(), fixture.owner, kind+"-token-hash", kind); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := fixture.db.Exec(`INSERT INTO upload_tokens(id,user_id,name,token_hash,prefix) VALUES(?,?,'capture','saved-token-hash','splt_example')`, model.NewID(), fixture.owner); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(`INSERT INTO device_requests(device_code_hash,user_code,client_name,expires_at,approved_user_id) VALUES('device-hash','CODE1234','Browser',datetime('now','+10 minutes'),?)`, fixture.owner); err != nil {
		t.Fatal(err)
	}
	// A real uncommitted WAL writer must not enter the committed snapshot or
	// prevent the read-only online backup from progressing.
	uncommitted, err := fixture.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer uncommitted.Rollback()
	if _, err := uncommitted.Exec(`INSERT INTO users(id,email,password_hash) VALUES('uncommitted','uncommitted@example.invalid','hash')`); err != nil {
		t.Fatal(err)
	}
	parent := t.TempDir()
	snapshot := filepath.Join(parent, "snapshot")
	manifest, err := Backup(context.Background(), Options{DataDirectory: fixture.directory, Directory: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	uncommitted.Rollback()
	if manifest.AssetCount != 1 || manifest.ObjectCount != 2 {
		t.Fatalf("snapshot omitted retained original/poster: %+v", manifest)
	}
	var sessions int
	if err := fixture.db.QueryRow(`SELECT count(*) FROM auth_sessions`).Scan(&sessions); err != nil || sessions != 2 {
		t.Fatal("backup mutated live credentials")
	}
	target := filepath.Join(parent, "restored")
	options := RestoreOptions{Directory: snapshot, TargetDataDirectory: target}
	if _, err := Restore(context.Background(), options); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyRestore(context.Background(), options); err != nil {
		t.Fatal(err)
	}
	restored, err := openDirectory(target, false)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.close()
	db, err := openDatabase(context.Background(), restored, true)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var password, status string
	var favorite, deleted bool
	var accounts, receipts int
	if err := db.QueryRow(`SELECT password_hash FROM users WHERE id=?`, fixture.owner).Scan(&password); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT status FROM asset_embeddings WHERE asset_id=?`, fixture.asset).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT favorite,deleted_at IS NOT NULL FROM assets WHERE id=?`, fixture.asset).Scan(&favorite, &deleted); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM upload_idempotency WHERE status='completed')`).Scan(&accounts, &receipts); err != nil {
		t.Fatal(err)
	}
	if password != "retained-password-hash" || status != "pending" || !favorite || !deleted || accounts != 2 || receipts != 1 {
		t.Fatal("restore lost accounts, receipt, trash flags, or resumable indexing intent")
	}
	file, err := restored.open(fixture.original.Path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Seek(3, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	remaining, err := io.ReadAll(file)
	file.Close()
	if err != nil || !bytes.Equal(remaining, fixture.data[3:]) {
		t.Fatal("restored original bytes are not seekable and unchanged")
	}
	if _, err := os.Stat(filepath.Join(target, "signing.key")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("live signing secret was copied to the restore")
	}
	if _, err := os.Stat(filepath.Join(snapshot, "signing.key")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("live signing secret was copied to the snapshot")
	}
}

func TestResumeFreezesCatalogAndRepairsSameLengthCorruption(t *testing.T) {
	fixture := newRecoveryFixture(t)
	snapshot := filepath.Join(t.TempDir(), "snapshot")
	options := Options{DataDirectory: fixture.directory, Directory: snapshot, MaxObjectBytes: 1}
	if _, err := Backup(context.Background(), options); err == nil {
		t.Fatal("object byte limit was ignored")
	}
	if _, err := Verify(context.Background(), snapshot); err == nil {
		t.Fatal("incomplete snapshot was accepted")
	}
	if _, err := fixture.db.Exec(`UPDATE assets SET favorite=0 WHERE id=?`, fixture.asset); err != nil {
		t.Fatal(err)
	}
	options.MaxObjectBytes = 0
	if _, err := Resume(context.Background(), options); err != nil {
		t.Fatal(err)
	}
	originalSource := filepath.Join(fixture.directory, fixture.original.Path)
	if err := os.Remove(originalSource); err != nil {
		t.Fatal(err)
	}
	if _, err := Resume(context.Background(), options); err != nil {
		t.Fatalf("resume needlessly read verified source bytes: %v", err)
	}
	originalCopy := filepath.Join(snapshot, fixture.original.Path)
	corrupt := append([]byte(nil), fixture.data...)
	corrupt[len(corrupt)-1] ^= 1
	if err := os.WriteFile(originalCopy, corrupt, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(context.Background(), snapshot); err == nil {
		t.Fatal("same-length corruption escaped verification")
	}
	if err := os.WriteFile(originalSource, fixture.data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Resume(context.Background(), options); err != nil {
		t.Fatal(err)
	}
	dir, err := openDirectory(snapshot, false)
	if err != nil {
		t.Fatal(err)
	}
	defer dir.close()
	db, err := openDatabase(context.Background(), dir, true)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var favorite bool
	if err := db.QueryRow(`SELECT favorite FROM assets WHERE id=?`, fixture.asset).Scan(&favorite); err != nil || !favorite {
		t.Fatal("resume replaced frozen metadata with newer live state")
	}
	if err := os.WriteFile(originalCopy, corrupt, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(originalSource, corrupt, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Resume(context.Background(), options); err == nil {
		t.Fatal("changed source bytes replaced frozen original")
	}
}

func TestRestoreCannotOverwriteLiveOrExistingTarget(t *testing.T) {
	fixture := newRecoveryFixture(t)
	snapshot := filepath.Join(t.TempDir(), "snapshot")
	if _, err := Backup(context.Background(), Options{DataDirectory: fixture.directory, Directory: snapshot}); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(context.Background(), RestoreOptions{Directory: snapshot, TargetDataDirectory: fixture.directory}); err == nil {
		t.Fatal("restore accepted live data directory")
	}
	existing := t.TempDir()
	marker := filepath.Join(existing, "keep")
	if err := os.WriteFile(marker, []byte("operator data"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(context.Background(), RestoreOptions{Directory: snapshot, TargetDataDirectory: existing}); err == nil {
		t.Fatal("restore accepted nonempty target")
	}
	value, err := os.ReadFile(marker)
	if err != nil || string(value) != "operator data" {
		t.Fatal("existing target data changed")
	}
	link := filepath.Join(t.TempDir(), "target-link")
	if err := os.Symlink(existing, link); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(context.Background(), RestoreOptions{Directory: snapshot, TargetDataDirectory: link}); err == nil {
		t.Fatal("restore accepted symlink target")
	}
}

func TestNewDestinationRejectsRepositoryTrees(t *testing.T) {
	repository := t.TempDir()
	if err := os.WriteFile(filepath.Join(repository, ".git"), []byte("gitdir: elsewhere"), 0600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(repository, "private-snapshot")
	if dir, err := newDirectory(path); err == nil {
		dir.close()
		t.Fatal("snapshot accepted repository destination")
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("rejected repository destination was created")
	}
}
