package database

import (
	"context"
	"database/sql"
	"encoding/binary"
	"math"
	"path/filepath"
	"testing"
	"time"
)

func TestOpenPersistsDataAndEnforcesConnectionPolicy(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	db, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	created := time.Date(2026, 1, 2, 3, 4, 5, 123456789, time.UTC)
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,password_hash,created_at) VALUES ('owner','owner@example.invalid','hash',?1)`, created); err != nil {
		t.Fatal(err)
	}
	// Hold multiple connections simultaneously to verify that policy belongs to
	// the driver DSN rather than only the first connection used by migration.
	var connections []*sql.Conn
	for range 3 {
		conn, err := db.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		connections = append(connections, conn)
		var foreignKeys int
		var journal string
		if err := conn.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&foreignKeys); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&journal); err != nil {
			t.Fatal(err)
		}
		if foreignKeys != 1 || journal != "wal" {
			t.Fatalf("unsafe pooled connection: foreign_keys=%d journal=%s", foreignKeys, journal)
		}
	}
	for _, conn := range connections {
		_ = conn.Close()
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	var email string
	var timestamp time.Time
	if err := reopened.QueryRowContext(ctx, `SELECT email,created_at FROM users WHERE id = 'owner'`).Scan(&email, &timestamp); err != nil {
		t.Fatal(err)
	}
	if email != "owner@example.invalid" || !timestamp.Equal(created) || timestamp.Location() != time.UTC {
		t.Fatalf("restart lost account or UTC timestamp precision: %q %v", email, timestamp)
	}
	if _, err := reopened.ExecContext(ctx, `INSERT INTO users(id,email,password_hash) VALUES ('duplicate','OWNER@example.invalid','hash')`); err == nil {
		t.Fatal("case-variant duplicate account accepted")
	}
}

func TestSchemaRejectsCrossOwnerAssociationsAndMalformedReadyVectors(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, owner := range []string{"owner-a", "owner-b"} {
		if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,password_hash) VALUES (?1,?2,'hash')`, owner, owner+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256) VALUES ('asset','owner-a','/media/asset','asset.png','image/png',32,'checksum')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO tags(id,owner_user_id,name) VALUES ('foreign-tag','owner-b','reaction')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO asset_tags(asset_id,tag_id) VALUES ('asset','foreign-tag')`); err == nil {
		t.Fatal("cross-account tag association accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES ('asset','owner-b')`); err == nil {
		t.Fatal("cross-account embedding owner accepted")
	}
	if _, err := db.ExecContext(ctx, `UPDATE assets SET owner_user_id = 'owner-b' WHERE id = 'asset'`); err == nil {
		t.Fatal("asset could be transferred past owner fences")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id,owner_user_id,status,dim,model_version,image_embedding) VALUES ('asset','owner-a','ready',512,'model',zeroblob(16))`); err == nil {
		t.Fatal("malformed ready vector accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id,owner_user_id,status) VALUES ('asset','owner-a','processing')`); err == nil {
		t.Fatal("processing state without a recovery lease accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES ('asset','owner-a')`); err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE assets SET favorite = 1 WHERE id = 'asset'`); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	var favorite bool
	if err := db.QueryRowContext(ctx, `SELECT favorite FROM assets WHERE id = 'asset'`).Scan(&favorite); err != nil {
		t.Fatal(err)
	}
	if favorite {
		t.Fatal("rolled-back metadata mutation survived")
	}
}

func TestSQLiteVectorExtensionUsesCanonicalFloat32Cosine(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	left, right := make([]byte, 512*4), make([]byte, 512*4)
	binary.LittleEndian.PutUint32(left, math.Float32bits(1))
	binary.LittleEndian.PutUint32(right[4:], math.Float32bits(1))
	var identical, orthogonal float64
	if err := db.QueryRowContext(ctx, `SELECT vec_distance_cosine(?1,?1),vec_distance_cosine(?1,?2)`, left, right).Scan(&identical, &orthogonal); err != nil {
		t.Fatal(err)
	}
	if identical != 0 || orthogonal != 1 {
		t.Fatalf("canonical cosine geometry changed: identical=%g orthogonal=%g", identical, orthogonal)
	}
}

func TestInstanceStorageMigrationPreservesVersionOneLibrary(t *testing.T) {
	directory := t.TempDir()
	legacy, err := sql.Open("sqlite3", filepath.Join(directory, "library.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(initialSchema + `PRAGMA user_version=1;
		INSERT INTO users(id,email,password_hash) VALUES('owner','owner@example.invalid','retained-hash');
		INSERT INTO user_storage_quotas(user_id,limit_bytes) VALUES('owner',123);
		INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,storage_size,thumbnail_storage_size,checksum_sha256,deleted_at)
		VALUES('asset','owner','/media/asset','uploads/asset.gif','image/gif',20,20,10,'retained-checksum',CURRENT_TIMESTAMP);`); err != nil {
		legacy.Close()
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var version, quotaTables, bytes int
	var checksum string
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_storage_quotas'`).Scan(&quotaTables); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT checksum_sha256,storage_size+thumbnail_storage_size FROM assets WHERE owner_user_id='owner' AND id='asset' AND deleted_at IS NOT NULL`).Scan(&checksum, &bytes); err != nil {
		t.Fatal(err)
	}
	if version != 2 || quotaTables != 0 || checksum != "retained-checksum" || bytes != 30 {
		t.Fatalf("migration lost retained trash or left account quotas: version=%d quotaTables=%d checksum=%q bytes=%d", version, quotaTables, checksum, bytes)
	}
	if err := migrate(context.Background(), db); err != nil {
		t.Fatalf("reapplying the migrated library changed its schema: %v", err)
	}
}
