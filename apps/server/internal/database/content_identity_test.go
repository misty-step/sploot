package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestContentIdentityMigrationRetainsChildrenAndOwnerFences(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	legacy, err := sql.Open("sqlite3", filepath.Join(directory, "library.sqlite")+"?_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	_, err = legacy.Exec(initialSchema + instanceStorageSchema + predecessorActivationSchema + `
		PRAGMA user_version=3;
		INSERT INTO users(id,email,password_hash) VALUES('owner','owner@example.invalid','retained'),('other','other@example.invalid','retained-other');
		INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256,favorite,share_slug) VALUES('asset','owner','/media/asset','uploads/asset.png','image/png',123,'stored-sha',1,'old-share-slug');
		INSERT INTO tags(id,owner_user_id,name) VALUES('tag','owner','retained tag'),('other-tag','other','foreign tag');
		INSERT INTO asset_tags(asset_id,tag_id) VALUES('asset','tag');
		INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES('asset','owner');
		INSERT INTO auth_sessions(id,user_id,token_hash,kind,expires_at) VALUES('session','owner','retained-session','browser','2099-01-01');`)
	if err != nil {
		legacy.Close()
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var favorite bool
	var share, tag, embeddingOwner, password, session string
	err = db.QueryRow(`SELECT a.favorite,a.share_slug,t.name,e.owner_user_id,u.password_hash,s.token_hash
		FROM assets a JOIN asset_tags at ON at.asset_id=a.id JOIN tags t ON t.id=at.tag_id
		JOIN asset_embeddings e ON e.asset_id=a.id JOIN users u ON u.id=a.owner_user_id
		JOIN auth_sessions s ON s.user_id=u.id WHERE a.id='asset'`).Scan(&favorite, &share, &tag, &embeddingOwner, &password, &session)
	if err != nil || !favorite || share != "old-share-slug" || tag != "retained tag" || embeddingOwner != "owner" || password != "retained" || session != "retained-session" {
		t.Fatal("schema reconstruction lost retained library or credential state")
	}
	if _, err := db.Exec(`INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256) VALUES('second','owner','/media/second','uploads/second.png','image/png',123,'stored-sha')`); err != nil {
		t.Fatal("distinct equal-content identity could not be retained")
	}
	if _, err := db.Exec(`UPDATE assets SET owner_user_id='other' WHERE id='asset'`); err == nil {
		t.Fatal("asset ownership fence was lost")
	}
	if _, err := db.Exec(`INSERT INTO asset_tags(asset_id,tag_id) VALUES('asset','other-tag')`); err == nil {
		t.Fatal("tag ownership fence was lost")
	}
	if _, err := db.Exec(`INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES('second','other')`); err == nil {
		t.Fatal("embedding owner foreign key was lost")
	}
	if _, err := db.Exec(`DELETE FROM assets WHERE id='asset'`); err != nil {
		t.Fatal(err)
	}
	var children int
	if err := db.QueryRow(`SELECT (SELECT COUNT(*) FROM asset_tags WHERE asset_id='asset')+(SELECT COUNT(*) FROM asset_embeddings WHERE asset_id='asset')`).Scan(&children); err != nil || children != 0 {
		t.Fatal("foreign key actions were not restored after reconstruction")
	}
}
