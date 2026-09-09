package recovery

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"
)

type restoreReceipt struct {
	Format      string    `json:"format"`
	Version     int       `json:"version"`
	SnapshotID  string    `json:"snapshotId"`
	Database    Artifact  `json:"database"`
	Objects     int64     `json:"objects"`
	Bytes       int64     `json:"bytes"`
	VerifiedAt  time.Time `json:"verifiedAt"`
	Credentials string    `json:"credentials"`
}

// Restore stages a complete verified library beside an explicitly separate,
// absent or empty target and atomically publishes that directory. It never
// overwrites an existing library, even if one appears during the copy.
func Restore(ctx context.Context, options RestoreOptions) (Manifest, error) {
	var manifest Manifest
	snapshot, err := openDirectory(options.Directory, true)
	if err != nil {
		return manifest, err
	}
	defer snapshot.close()
	manifest, err = readManifest(snapshot, true)
	if err != nil {
		return manifest, err
	}
	if err := verifyCore(ctx, snapshot, manifest); err != nil {
		return manifest, err
	}
	if err := verifyMedia(ctx, snapshot, manifest); err != nil {
		return manifest, err
	}
	targetPath, err := restoreTarget(options.TargetDataDirectory)
	if err != nil {
		return manifest, err
	}
	if err := separateTarget(manifest.SourceID, snapshot.path, targetPath); err != nil {
		return manifest, err
	}
	id, err := randomID()
	if err != nil {
		return manifest, err
	}
	stagingPath := filepath.Join(filepath.Dir(targetPath), ".sploot-restore-"+id)
	target, err := newDirectory(stagingPath)
	if err != nil {
		return manifest, err
	}
	defer target.close()
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(stagingPath)
		}
	}()
	buffer := make([]byte, 64<<10)
	copyOptions := Options{MaxObjectBytes: 1 << 40, ObjectTimeout: 5 * time.Minute}
	if err := scanRecords[MediaEntry](snapshot, "media.ndjson", func(entry MediaEntry) error {
		return copyMediaObject(ctx, snapshot, target, entry, copyOptions, buffer)
	}); err != nil {
		return manifest, err
	}
	if err := copyArtifact(ctx, snapshot, target, manifest.Database, buffer); err != nil {
		return manifest, err
	}
	if err := copyArtifact(ctx, snapshot, target, *manifest.Media, buffer); err != nil {
		return manifest, err
	}
	if err := verifyCore(ctx, target, manifest); err != nil {
		return manifest, err
	}
	if err := verifyMedia(ctx, target, manifest); err != nil {
		return manifest, err
	}
	receipt := restoreReceipt{Format: "sploot-library-restore", Version: Version, SnapshotID: manifest.ID, Database: manifest.Database, Objects: manifest.ObjectCount, Bytes: manifest.MediaBytes, VerifiedAt: time.Now().UTC(), Credentials: credentialPolicy}
	if _, err := target.writeJSON("restore.json", receipt); err != nil {
		return manifest, err
	}
	// An empty library still requires a private media directory at first start.
	if err := target.mkdir("media"); err != nil {
		return manifest, err
	}
	if err := syncSnapshotDirectory(target, "."); err != nil {
		return manifest, err
	}
	if err := contextFailure(ctx, "restore"); err != nil {
		return manifest, err
	}
	if err := os.Rename(stagingPath, targetPath); err != nil {
		return manifest, failure("restore", "target changed or is no longer empty; nothing was overwritten")
	}
	published = true
	parent, err := os.Open(filepath.Dir(targetPath))
	if err != nil {
		return manifest, failure("restore", "restored directory published but parent durability was not confirmed")
	}
	err = parent.Sync()
	parent.Close()
	if err != nil {
		return manifest, failure("restore", "restored directory published but parent durability was not confirmed")
	}
	return manifest, nil
}

func restoreTarget(path string) (string, error) {
	if path == "" {
		return "", failure("restore", "an explicit separate target data directory is required")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", failure("restore", "cannot resolve target directory")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(absolute))
	if err != nil {
		return "", failure("restore", "target parent must already exist")
	}
	absolute = filepath.Join(parent, filepath.Base(absolute))
	info, err := os.Lstat(absolute)
	if errors.Is(err, os.ErrNotExist) {
		return absolute, nil
	}
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return "", failure("restore", "target must be absent or a real empty mode0700 directory")
	}
	dir, err := openDirectory(absolute, false)
	if err != nil {
		return "", err
	}
	defer dir.close()
	file, err := dir.root.Open(".")
	if err != nil {
		return "", failure("restore", "cannot inspect target directory")
	}
	defer file.Close()
	entries, err := file.ReadDir(1)
	if len(entries) != 0 || err != io.EOF {
		return "", failure("restore", "target directory is not empty; restore never overwrites a library")
	}
	return absolute, nil
}

func copyArtifact(ctx context.Context, source, target *snapshotDirectory, expected Artifact, buffer []byte) error {
	file, err := source.open(expected.Path)
	if err != nil {
		return err
	}
	defer file.Close()
	actual, err := target.writeFile(expected.Path, func(writer io.Writer) error {
		_, err := io.CopyBuffer(writer, io.LimitReader(recoveryReader{ctx, file}, expected.Bytes+1), buffer)
		return err
	})
	if err != nil {
		return err
	}
	if actual != expected {
		return failure("restore", "snapshot artifact changed while copying")
	}
	return nil
}

// VerifyRestore checks byte-for-byte parity before the restored instance starts.
// Once it accepts new writes its database is intentionally no longer a snapshot.
func VerifyRestore(ctx context.Context, options RestoreOptions) (Manifest, error) {
	manifest, err := Verify(ctx, options.Directory)
	if err != nil {
		return manifest, err
	}
	path, err := canonicalDirectory(options.TargetDataDirectory)
	if err != nil {
		return manifest, err
	}
	snapshotPath, err := canonicalDirectory(options.Directory)
	if err != nil {
		return manifest, err
	}
	if err := separateTarget(manifest.SourceID, snapshotPath, path); err != nil {
		return manifest, err
	}
	target, err := openDirectory(path, true)
	if err != nil {
		return manifest, err
	}
	defer target.close()
	if err := verifyCore(ctx, target, manifest); err != nil {
		return manifest, err
	}
	if err := verifyMedia(ctx, target, manifest); err != nil {
		return manifest, err
	}
	var receipt restoreReceipt
	if err := target.readJSON("restore.json", &receipt); err != nil {
		return manifest, err
	}
	if receipt.Format != "sploot-library-restore" || receipt.Version != Version || receipt.SnapshotID != manifest.ID || receipt.Database != manifest.Database || receipt.Objects != manifest.ObjectCount || receipt.Bytes != manifest.MediaBytes || receipt.VerifiedAt.IsZero() || receipt.Credentials != credentialPolicy {
		return manifest, failure("verify-restore", "restore receipt differs from the verified snapshot")
	}
	return manifest, nil
}
