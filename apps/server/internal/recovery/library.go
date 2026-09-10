package recovery

import "context"

// VerifyLibrary checks an offline native library's owner-fenced receipts and
// actual media without sanitizing credentials or modifying its database. This
// is not a live snapshot primitive; use Backup for a running library.
func VerifyLibrary(ctx context.Context, directory string) error {
	dir, err := openDirectory(directory, false)
	if err != nil {
		return err
	}
	defer dir.close()
	for _, name := range []string{"library.sqlite-wal", "library.sqlite-journal"} {
		if info, err := dir.root.Lstat(name); err == nil && info.Size() > 0 {
			return failure("verify-library", "offline library has a live journal")
		}
	}
	db, err := openDatabase(ctx, dir, true)
	if err != nil {
		return err
	}
	defer db.Close()
	var integrity string
	if err := db.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		return failure("verify-library", "SQLite integrity check failed")
	}
	rows, err := db.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return failure("verify-library", "cannot check owner references")
	}
	invalid := rows.Next()
	rows.Close()
	if invalid || rows.Err() != nil {
		return failure("verify-library", "foreign key check failed")
	}
	_, _, _, err = walkMedia(ctx, db, func(entry MediaEntry) error {
		return dir.verifyArtifact(ctx, Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256})
	})
	return err
}
