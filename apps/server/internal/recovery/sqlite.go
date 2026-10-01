package recovery

import (
	"context"
	"database/sql"
)

// SQLite WAL/rollback companions mean the file is still live or was copied
// mid-write. Recovery treats a nonempty sidecar as that live journal. Empty
// leftovers are ignored. Predecessor import rejects any sidecar, including
// shared-memory files; that offline-clone contract stays there.
var sqliteJournalSidecars = []string{"library.sqlite-wal", "library.sqlite-journal"}

func rejectLiveJournal(dir *snapshotDirectory, phase, reason string) error {
	for _, name := range sqliteJournalSidecars {
		if info, err := dir.root.Lstat(name); err == nil && info.Size() > 0 {
			return failure(phase, reason)
		}
	}
	return nil
}

// verifySQLite is the sealed-library structure check: integrity_check is ok
// and foreign_key_check is empty. Portable snapshots still inspect credentials
// after this; an offline live library must keep its password hashes.
func verifySQLite(ctx context.Context, db *sql.DB, phase string) error {
	var integrity string
	if err := db.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		return failure(phase, "SQLite integrity check failed")
	}
	rows, err := db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return failure(phase, "cannot check owner references")
	}
	defer rows.Close()
	if rows.Next() || rows.Err() != nil {
		return failure(phase, "foreign key check failed")
	}
	return nil
}
