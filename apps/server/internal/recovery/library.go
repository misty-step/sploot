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
	if err := rejectLiveJournal(dir, "verify-library", "offline library has a live journal"); err != nil {
		return err
	}
	db, err := openDatabase(ctx, dir, true)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := verifySQLite(ctx, db, "verify-library"); err != nil {
		return err
	}
	_, _, _, err = walkMedia(ctx, db, func(entry MediaEntry) error {
		return dir.verifyArtifact(ctx, Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256})
	})
	return err
}
