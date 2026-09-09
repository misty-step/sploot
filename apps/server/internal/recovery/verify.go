package recovery

import (
	"bufio"
	"context"
	"encoding/json"
)

// Verify reads the portable database and every referenced byte without touching
// the live library. The inventory must exactly match that database, not merely
// claim internally consistent object totals.
func Verify(ctx context.Context, directory string) (Manifest, error) {
	var manifest Manifest
	dir, err := openDirectory(directory, true)
	if err != nil {
		return manifest, err
	}
	defer dir.close()
	manifest, err = readManifest(dir, true)
	if err != nil {
		return manifest, err
	}
	if err := verifyCore(ctx, dir, manifest); err != nil {
		return manifest, err
	}
	return manifest, verifyMedia(ctx, dir, manifest)
}

func verifyMedia(ctx context.Context, dir *snapshotDirectory, manifest Manifest) error {
	if manifest.Media == nil {
		return failure("verify-media", "media inventory is absent")
	}
	if err := dir.verifyArtifact(ctx, *manifest.Media); err != nil {
		return failure("verify-media", "media inventory size or SHA-256 differs")
	}
	file, err := dir.open("media.ndjson")
	if err != nil {
		return err
	}
	defer file.Close()
	scanner := bufio.NewScanner(recoveryReader{ctx, file})
	scanner.Buffer(make([]byte, 64<<10), maxRecordBytes)
	db, err := openDatabase(ctx, dir, true)
	if err != nil {
		return err
	}
	defer db.Close()
	assets, objects, total, err := walkMedia(ctx, db, func(expected MediaEntry) error {
		if !scanner.Scan() {
			return failure("verify-media", "media inventory ended before the database catalog")
		}
		var entry MediaEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil || entry != expected {
			return assetFailure("verify-media", expected.AssetID, "media inventory differs from the frozen database")
		}
		if err := dir.verifyArtifact(ctx, Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256}); err != nil {
			return assetFailure("verify-media", entry.AssetID, "media byte count or SHA-256 differs")
		}
		return contextFailure(ctx, "verify-media")
	})
	if err != nil {
		return err
	}
	if scanner.Scan() || scanner.Err() != nil || assets != manifest.AssetCount || objects != manifest.ObjectCount || total != manifest.MediaBytes {
		return failure("verify-media", "media coverage or byte totals differ from the snapshot")
	}
	return nil
}
