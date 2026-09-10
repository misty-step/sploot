package recovery

import (
	"context"
	"encoding/json"
	"io"
	"path/filepath"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/medialock"
)

func normalizedOptions(options Options) (Options, error) {
	if options.MaxObjectBytes == 0 {
		options.MaxObjectBytes = int64(contract.UploadMaxBytes) + 2*1024*1024
	}
	if options.ObjectTimeout == 0 {
		options.ObjectTimeout = 5 * time.Minute
	}
	if options.MaxObjectBytes < 1 || options.MaxObjectBytes > 1<<40 || options.ObjectTimeout < time.Second || options.ObjectTimeout > time.Hour {
		return options, failure("configuration", "object bytes must be 1..1TiB and timeout 1s..1h")
	}
	canonical, err := canonicalDirectory(options.DataDirectory)
	if err != nil {
		return options, err
	}
	options.DataDirectory = canonical
	return options, nil
}

func Backup(ctx context.Context, options Options) (Manifest, error) {
	var manifest Manifest
	options, err := normalizedOptions(options)
	if err != nil {
		return manifest, err
	}
	source, err := openDirectory(options.DataDirectory, false)
	if err != nil {
		return manifest, err
	}
	defer source.close()
	// Hold the source lock from the SQLite snapshot through verified media
	// publication. Saves may proceed; no permanent deletion may unlink originals.
	lock, err := medialock.Acquire(ctx, options.DataDirectory, false)
	if err != nil {
		return manifest, failure("backup", "cannot acquire the source media lock")
	}
	defer lock.Close()
	dir, err := newDirectory(options.Directory)
	if err != nil {
		return manifest, err
	}
	defer dir.close()
	if err := snapshotDatabase(ctx, source, dir); err != nil {
		return manifest, err
	}
	id, err := randomID()
	if err != nil {
		return manifest, err
	}
	database, err := dir.hashFile(ctx, "library.sqlite")
	if err != nil {
		return manifest, err
	}
	manifest = Manifest{Format: Format, Version: Version, ID: id, Phase: "database-ready", SourceID: digest([]byte(options.DataDirectory)), CreatedAt: time.Now().UTC(), Database: database, Credentials: credentialPolicy}
	if _, err := dir.writeJSON("manifest.json", manifest); err != nil {
		return manifest, err
	}
	return finishBackup(ctx, source, dir, options, manifest)
}

// Resume verifies the frozen database first, then repairs only missing or
// corrupt media. It never recaptures newer metadata from the live database.
func Resume(ctx context.Context, options Options) (Manifest, error) {
	var manifest Manifest
	options, err := normalizedOptions(options)
	if err != nil {
		return manifest, err
	}
	dir, err := openDirectory(options.Directory, true)
	if err != nil {
		return manifest, err
	}
	defer dir.close()
	manifest, err = readManifest(dir, false)
	if err != nil {
		return manifest, err
	}
	if manifest.SourceID != digest([]byte(options.DataDirectory)) {
		return manifest, failure("resume", "source data directory differs from the frozen snapshot")
	}
	if err := verifyCore(ctx, dir, manifest); err != nil {
		return manifest, err
	}
	source, err := openDirectory(options.DataDirectory, false)
	if err != nil {
		return manifest, err
	}
	defer source.close()
	lock, err := medialock.Acquire(ctx, options.DataDirectory, false)
	if err != nil {
		return manifest, failure("resume", "cannot acquire the source media lock")
	}
	defer lock.Close()
	return finishBackup(ctx, source, dir, options, manifest)
}

func finishBackup(ctx context.Context, source, dir *snapshotDirectory, options Options, manifest Manifest) (Manifest, error) {
	db, err := openDatabase(ctx, dir, true)
	if err != nil {
		return manifest, err
	}
	defer db.Close()
	buffer := make([]byte, 64<<10)
	media, err := dir.writeFile("media.ndjson", func(writer io.Writer) error {
		encoder := json.NewEncoder(writer)
		var err error
		manifest.AssetCount, manifest.ObjectCount, manifest.MediaBytes, err = walkMedia(ctx, db, func(entry MediaEntry) error {
			if err := copyMediaObject(ctx, source, dir, entry, options, buffer); err != nil {
				return err
			}
			return encoder.Encode(entry)
		})
		return err
	})
	if err != nil {
		return manifest, err
	}
	manifest.Media = &media
	manifest.Phase = "complete"
	now := time.Now().UTC()
	manifest.CompletedAt = &now
	if err := verifyMedia(ctx, dir, manifest); err != nil {
		return manifest, err
	}
	if _, err := dir.writeJSON("manifest.json", manifest); err != nil {
		return manifest, err
	}
	return manifest, nil
}

func readManifest(dir *snapshotDirectory, complete bool) (Manifest, error) {
	var manifest Manifest
	if err := dir.readJSON("manifest.json", &manifest); err != nil {
		return manifest, err
	}
	if manifest.Format != Format || manifest.Version != Version || !validSnapshotID(manifest.ID) || !validSHA(manifest.SourceID) || manifest.CreatedAt.IsZero() || manifest.Database.Path != "library.sqlite" || manifest.Database.Bytes <= 0 || !validSHA(manifest.Database.SHA256) || manifest.Credentials == "" || manifest.Phase != "database-ready" && manifest.Phase != "complete" || manifest.AssetCount < 0 || manifest.ObjectCount < 0 || manifest.MediaBytes < 0 {
		return manifest, failure("snapshot", "invalid or unsupported portable snapshot manifest")
	}
	if manifest.Phase == "complete" && (manifest.CompletedAt == nil || manifest.Media == nil || manifest.Media.Path != "media.ndjson") || complete && manifest.Phase != "complete" {
		return manifest, failure("snapshot", "snapshot is incomplete; resume it before restore")
	}
	return manifest, nil
}

func verifyCore(ctx context.Context, dir *snapshotDirectory, manifest Manifest) error {
	if err := dir.verifyArtifact(ctx, manifest.Database); err != nil {
		return failure("verify-database", "portable database byte count or SHA-256 differs")
	}
	// A portable snapshot cannot depend on sidecars accidentally left alongside
	// the database. Only a standalone sealed database can be verified or restored.
	for _, name := range []string{"library.sqlite-wal", "library.sqlite-journal"} {
		if info, err := dir.root.Lstat(name); err == nil && info.Size() > 0 {
			return failure("verify-database", "portable database has an unexpected live journal")
		}
	}
	db, err := openDatabase(ctx, dir, true)
	if err != nil {
		return err
	}
	defer db.Close()
	return verifyDatabase(ctx, db)
}

func separateTarget(sourceID, snapshotPath, targetPath string) error {
	if digest([]byte(targetPath)) == sourceID {
		return failure("restore", "target is the original live data directory")
	}
	relative, err := filepath.Rel(snapshotPath, targetPath)
	if err != nil || relative == "." || filepath.IsLocal(relative) {
		return failure("restore", "target must be separate from the snapshot directory")
	}
	return nil
}
