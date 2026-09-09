package recovery

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"os"
	"time"

	"github.com/mattn/go-sqlite3"
)

// The online backup API copies a consistent committed database, including WAL
// state, while yielding between page batches. It never copies a live SQLite file
// or holds a writer transaction during media work.
func snapshotDatabase(ctx context.Context, source, target *snapshotDirectory) error {
	sourceDB, err := openDatabase(ctx, source, true)
	if err != nil {
		return err
	}
	defer sourceDB.Close()
	if _, err := target.writeFile("library.sqlite", func(io.Writer) error { return nil }); err != nil {
		return err
	}
	targetDB, err := openDatabase(ctx, target, false)
	if err != nil {
		return err
	}
	defer targetDB.Close()
	src, err := sourceDB.Conn(ctx)
	if err != nil {
		return failure("database", "cannot acquire source snapshot")
	}
	defer src.Close()
	dst, err := targetDB.Conn(ctx)
	if err != nil {
		return failure("database", "cannot acquire destination snapshot")
	}
	err = src.Raw(func(sourceConnection any) error {
		return dst.Raw(func(targetConnection any) error {
			sourceSQLite, sourceOK := sourceConnection.(*sqlite3.SQLiteConn)
			targetSQLite, targetOK := targetConnection.(*sqlite3.SQLiteConn)
			if !sourceOK || !targetOK {
				return errors.New("SQLite driver required")
			}
			backup, err := targetSQLite.Backup("main", sourceSQLite, "main")
			if err != nil {
				return err
			}
			for {
				if err := ctx.Err(); err != nil {
					_ = backup.Finish()
					return err
				}
				done, err := backup.Step(256)
				if err != nil {
					_ = backup.Finish()
					return err
				}
				if done {
					return backup.Finish()
				}
				select {
				case <-ctx.Done():
					_ = backup.Finish()
					return ctx.Err()
				case <-time.After(5 * time.Millisecond):
				}
			}
		})
	})
	dst.Close()
	if err != nil {
		return failure("database", "SQLite online snapshot failed or was interrupted")
	}
	// Only the isolated copy is mutated. VACUUM eliminates deleted credential
	// hashes from free pages; DELETE journal mode leaves a self-contained file.
	if err := sanitizeDatabase(ctx, targetDB); err != nil {
		return err
	}
	if err := targetDB.Close(); err != nil {
		return failure("database", "cannot close portable snapshot")
	}
	file, err := target.root.OpenFile("library.sqlite", os.O_RDWR, 0600)
	if err != nil {
		return failure("database", "cannot persist portable snapshot")
	}
	err = file.Sync()
	file.Close()
	if err != nil {
		return failure("database", "cannot persist portable snapshot")
	}
	return syncSnapshotDirectory(target, ".")
}

func sanitizeDatabase(ctx context.Context, db *sql.DB) error {
	// Pending purges have already permanently detached their assets. Their
	// unreferenced files are intentionally absent from a portable snapshot;
	// retain only completed tombstones so restored capacity matches its bytes.
	var hasPurges bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_purges')`).Scan(&hasPurges); err != nil {
		return failure("database", "cannot inspect permanent deletion state")
	}
	purgeSQL := ""
	if hasPurges {
		purgeSQL = `UPDATE asset_purges SET pathname=NULL,thumbnail_path=NULL,storage_size=0,thumbnail_storage_size=0,completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP);`
	}
	if _, err := db.ExecContext(ctx, `PRAGMA secure_delete=ON;
		BEGIN IMMEDIATE;
		DELETE FROM auth_sessions;
		DELETE FROM device_requests;
		DELETE FROM upload_tokens;
		DELETE FROM auth_attempts;
		DELETE FROM upload_idempotency WHERE status='processing';
		UPDATE asset_embeddings SET status='pending',processing_token=NULL,processing_until=NULL,next_attempt_at=CURRENT_TIMESTAMP WHERE status='processing';
		`+purgeSQL+`
		COMMIT;
		VACUUM;`); err != nil {
		_, _ = db.ExecContext(context.Background(), "ROLLBACK")
		return failure("database", "cannot sanitize credentials and interrupted leases in portable snapshot")
	}
	var mode string
	if err := db.QueryRowContext(ctx, "PRAGMA journal_mode=DELETE").Scan(&mode); err != nil || mode != "delete" {
		return failure("database", "cannot seal portable SQLite database without a WAL")
	}
	return verifyDatabase(ctx, db)
}

func verifyDatabase(ctx context.Context, db *sql.DB) error {
	var integrity string
	if err := db.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		return failure("verify-database", "SQLite integrity check failed")
	}
	rows, err := db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return failure("verify-database", "cannot check foreign keys")
	}
	invalid := rows.Next()
	rows.Close()
	if invalid || rows.Err() != nil {
		return failure("verify-database", "foreign key integrity failed")
	}
	var credentials int64
	if err := db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM auth_sessions)+(SELECT count(*) FROM device_requests)+(SELECT count(*) FROM upload_tokens)+(SELECT count(*) FROM auth_attempts)`).Scan(&credentials); err != nil || credentials != 0 {
		return failure("verify-database", "portable snapshot contains session or device credentials")
	}
	return nil
}

func syncSnapshotDirectory(dir *snapshotDirectory, path string) error {
	file, err := dir.root.Open(path)
	if err != nil {
		return failure("snapshot", "cannot open directory for durability")
	}
	defer file.Close()
	if err := file.Sync(); err != nil {
		return failure("snapshot", "cannot persist directory")
	}
	return nil
}
