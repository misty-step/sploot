package recovery

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

func canonicalDirectory(path string) (string, error) {
	if path == "" {
		return "", failure("configuration", "an explicit data directory is required")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", failure("configuration", "cannot resolve data directory")
	}
	info, err := os.Lstat(absolute)
	if err != nil || !info.IsDir() {
		return "", failure("configuration", "data directory must be a real existing directory")
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", failure("configuration", "cannot resolve data directory")
	}
	return canonical, nil
}

func openDatabase(ctx context.Context, dir *snapshotDirectory, readOnly bool) (*sql.DB, error) {
	file, err := dir.open("library.sqlite")
	if err != nil {
		return nil, err
	}
	file.Close()
	mode := "rw"
	if readOnly {
		mode = "ro"
	}
	uri := url.URL{Scheme: "file", Path: filepath.Join(dir.path, "library.sqlite")}
	uri.RawQuery = url.Values{"mode": {mode}, "_busy_timeout": {"5000"}, "_foreign_keys": {"on"}, "_loc": {"UTC"}, "_synchronous": {"FULL"}}.Encode()
	db, err := sql.Open("sqlite3", uri.String())
	if err != nil {
		return nil, failure("database", "cannot open SQLite library")
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, failure("database", "cannot read SQLite library")
	}
	return db, nil
}
