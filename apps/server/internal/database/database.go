// Package database owns the local library schema and SQLite connection policy.
package database

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"

	vec "github.com/asg017/sqlite-vec-go-bindings/cgo"
	_ "github.com/mattn/go-sqlite3"
)

//go:embed migrations/001_library.sql
var initialSchema string

//go:embed migrations/002_instance_storage.sql
var instanceStorageSchema string

var registerVector sync.Once

// Open migrates library.sqlite in a private persistent directory. Every pooled
// connection enforces foreign keys, uses WAL and waits for short writer work.
// Transactions start IMMEDIATE: a read-then-write capacity/lease decision cannot
// race another writer or fail while upgrading a stale read snapshot. Never hold
// a transaction across inference, media decoding or network access. Long-lived
// read snapshots use a dedicated sql.Conn with explicit BEGIN DEFERRED instead.
func Open(ctx context.Context, dataDir string) (*sql.DB, error) {
	if dataDir == "" {
		return nil, fmt.Errorf("library data directory is required")
	}
	directory, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, fmt.Errorf("resolve library directory: %w", err)
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, fmt.Errorf("create library directory: %w", err)
	}
	filename := filepath.Join(directory, "library.sqlite")
	// Create the file privately before SQLite creates its WAL companions.
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("open library file: %w", err)
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	if err := os.Chmod(filename, 0600); err != nil {
		return nil, fmt.Errorf("protect library file: %w", err)
	}
	registerVector.Do(vec.Auto)
	uri := url.URL{Scheme: "file", Path: filename}
	options := url.Values{
		"_foreign_keys": {"on"}, "_journal_mode": {"WAL"},
		"_synchronous": {"FULL"}, "_busy_timeout": {"5000"},
		"_txlock": {"immediate"}, "_loc": {"UTC"},
	}
	uri.RawQuery = options.Encode()
	db, err := sql.Open("sqlite3", uri.String())
	if err != nil {
		return nil, fmt.Errorf("open SQLite: %w", err)
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(8)
	closeError := func(err error) (*sql.DB, error) {
		_ = db.Close()
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		return closeError(fmt.Errorf("connect SQLite: %w", err))
	}
	var vectorVersion string
	if err := db.QueryRowContext(ctx, `SELECT vec_version()`).Scan(&vectorVersion); err != nil {
		return closeError(fmt.Errorf("initialize sqlite-vec: %w", err))
	}
	if err := migrate(ctx, db); err != nil {
		return closeError(err)
	}
	return db, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin library migration: %w", err)
	}
	defer tx.Rollback()
	var version int
	if err := tx.QueryRowContext(ctx, `PRAGMA user_version`).Scan(&version); err != nil {
		return fmt.Errorf("read library schema version: %w", err)
	}
	if version > 2 {
		return fmt.Errorf("library schema version %d is newer than this server supports (2); use a newer server", version)
	}
	if version == 0 {
		if _, err := tx.ExecContext(ctx, initialSchema); err != nil {
			return fmt.Errorf("apply library migration 001_library: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `PRAGMA user_version = 1`); err != nil {
			return fmt.Errorf("record library migration: %w", err)
		}
	}
	if version < 2 {
		if _, err := tx.ExecContext(ctx, instanceStorageSchema); err != nil {
			return fmt.Errorf("apply library migration 002_instance_storage: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `PRAGMA user_version = 2`); err != nil {
			return fmt.Errorf("record library migration 002_instance_storage: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit library migration: %w", err)
	}
	return nil
}
