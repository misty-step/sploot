package recovery

import (
	"context"
	"io"
	"time"

	"github.com/jackc/pgx/v5"
)

type restoreReceipt struct {
	Format     string           `json:"format"`
	Version    int              `json:"version"`
	SnapshotID string           `json:"snapshotId"`
	Target     DatabaseIdentity `json:"target"`
	Media      Artifact         `json:"media"`
	Objects    int64            `json:"objects"`
	Bytes      int64            `json:"bytes"`
	VerifiedAt time.Time        `json:"verifiedAt"`
}

// Restore never creates/drops a database, deletes existing objects, rewrites URLs,
// or uses --clean. The operator supplies a freshly created empty target database.
// PostgreSQL commits the archive in one transaction; media copies remain private
// and have no successful restore receipt until database and byte parity pass.
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
	if err := verifyCore(snapshot, manifest); err != nil {
		return manifest, err
	}
	if err := verifyMedia(ctx, snapshot, manifest); err != nil {
		return manifest, err
	}
	database, err := parseDatabase(options.TargetURL)
	if err != nil {
		return manifest, err
	}
	if err := database.constrainTarget(ctx, manifest.Source, options.AllowRemote); err != nil {
		return manifest, err
	}
	conn, err := database.connect(ctx, false)
	if err != nil {
		return manifest, err
	}
	defer conn.Close(context.Background())
	if err := ensureEmptyTarget(ctx, conn, manifest.Source); err != nil {
		return manifest, err
	}
	media, err := newDirectory(options.MediaDirectory)
	if err != nil {
		return manifest, err
	}
	defer media.close()
	if err := media.mkdir("media"); err != nil {
		return manifest, err
	}
	if err := copyMedia(ctx, snapshot, media, manifest); err != nil {
		return manifest, err
	}
	// Recheck after potentially long media copying, immediately before pg_restore.
	if err := ensureEmptyTarget(ctx, conn, manifest.Source); err != nil {
		return manifest, err
	}
	archive, err := snapshot.open("database.dump")
	if err != nil {
		return manifest, err
	}
	defer archive.Close()
	if err := database.command(ctx, "pg_restore", []string{"--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", "--no-password"}, archive, io.Discard, false); err != nil {
		return manifest, err
	}
	identity, err := verifyDatabase(ctx, database, conn, snapshot)
	if err != nil {
		return manifest, err
	}
	if err := verifyCopiedMedia(ctx, media, manifest); err != nil {
		return manifest, err
	}
	receipt := restoreReceipt{Format: "sploot-library-restore", Version: Version, SnapshotID: manifest.ID, Target: identity, Media: *manifest.Media, Objects: manifest.ObjectCount, Bytes: manifest.MediaBytes, VerifiedAt: time.Now().UTC()}
	if _, err := media.writeJSON("restore.json", receipt); err != nil {
		return manifest, err
	}
	return manifest, nil
}

// VerifyRestore rechecks the restored database and all local media read-only.
// It can recover proof after a prior restore committed but verification was
// interrupted: --restore does not retry against a now-populated database.
func VerifyRestore(ctx context.Context, options RestoreOptions) (Manifest, error) {
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
	if err := verifyCore(snapshot, manifest); err != nil {
		return manifest, err
	}
	if err := verifyMedia(ctx, snapshot, manifest); err != nil {
		return manifest, err
	}
	database, err := parseDatabase(options.TargetURL)
	if err != nil {
		return manifest, err
	}
	if err := database.constrainTarget(ctx, manifest.Source, options.AllowRemote); err != nil {
		return manifest, err
	}
	conn, err := database.connect(ctx, true)
	if err != nil {
		return manifest, err
	}
	defer conn.Close(context.Background())
	identity, err := verifyDatabase(ctx, database, conn, snapshot)
	if err != nil {
		return manifest, err
	}
	media, err := openDirectory(options.MediaDirectory, true)
	if err != nil {
		return manifest, err
	}
	defer media.close()
	if err := verifyCopiedMedia(ctx, media, manifest); err != nil {
		return manifest, err
	}
	// The verified receipt is local evidence, never a source/target DB write.
	receipt := restoreReceipt{Format: "sploot-library-restore", Version: Version, SnapshotID: manifest.ID, Target: identity, Media: *manifest.Media, Objects: manifest.ObjectCount, Bytes: manifest.MediaBytes, VerifiedAt: time.Now().UTC()}
	if _, err := media.writeJSON("restore.json", receipt); err != nil {
		return manifest, err
	}
	return manifest, nil
}

func verifyDatabase(ctx context.Context, database *databaseConnection, conn *pgx.Conn, snapshot *snapshotDirectory) (DatabaseIdentity, error) {
	var identity DatabaseIdentity
	var expected Inventory
	if err := snapshot.readJSON("inventory.json", &expected); err != nil {
		return identity, err
	}
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return identity, databaseError("restore-verify", err)
	}
	defer tx.Rollback(context.Background())
	actual, err := collectInventory(ctx, tx)
	if err != nil {
		return identity, err
	}
	if err := compareInventory(expected, actual); err != nil {
		return identity, err
	}
	identity, err = database.identity(ctx, tx)
	if err != nil {
		return identity, err
	}
	if err := tx.Commit(ctx); err != nil {
		return identity, databaseError("restore-verify", err)
	}
	return identity, nil
}

func copyMedia(ctx context.Context, source, target *snapshotDirectory, manifest Manifest) error {
	if err := scanRecords[MediaEntry](source, "media.ndjson", func(entry MediaEntry) error {
		if ctx.Err() != nil {
			return contextFailure(ctx, "restore-media")
		}
		if err := target.mkdir("media/" + digest([]byte(entry.AssetID))); err != nil {
			return assetFailure("restore-media", entry.AssetID, "cannot create isolated media directory")
		}
		file, err := source.open(entry.Path)
		if err != nil {
			return assetFailure("restore-media", entry.AssetID, "verified snapshot object is missing")
		}
		defer file.Close()
		artifact, err := target.writeFile(entry.Path, func(w io.Writer) error {
			if _, err := io.Copy(w, io.LimitReader(file, entry.Bytes+1)); err != nil {
				return assetFailure("restore-media", entry.AssetID, "cannot copy original bytes")
			}
			return nil
		})
		if err != nil {
			return err
		}
		if artifact.Bytes != entry.Bytes || artifact.SHA256 != entry.SHA256 {
			return assetFailure("restore-media", entry.AssetID, "copied media byte count/SHA-256 mismatch")
		}
		return nil
	}); err != nil {
		return err
	}
	file, err := source.open("media.ndjson")
	if err != nil {
		return err
	}
	defer file.Close()
	artifact, err := target.writeFile("media.ndjson", func(w io.Writer) error { _, err := io.Copy(w, file); return err })
	if err != nil {
		return failure("restore-media", "cannot copy media manifest")
	}
	if artifact != *manifest.Media {
		return failure("restore-media", "copied media manifest SHA-256 mismatch")
	}
	return nil
}

func verifyCopiedMedia(ctx context.Context, media *snapshotDirectory, manifest Manifest) error {
	if err := media.verifyArtifact(*manifest.Media); err != nil {
		return failure("restore-verify", "restored media manifest SHA-256 mismatch")
	}
	var count, bytes int64
	if err := scanRecords[MediaEntry](media, "media.ndjson", func(entry MediaEntry) error {
		if ctx.Err() != nil {
			return contextFailure(ctx, "restore-verify")
		}
		if entry.Path != mediaPath(entry.AssetID, entry.Rendition) || entry.Rendition != "original" && entry.Rendition != "thumbnail" {
			return assetFailure("restore-verify", entry.AssetID, "unsafe restored media path")
		}
		if err := media.verifyArtifact(Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256}); err != nil {
			return assetFailure("restore-verify", entry.AssetID, "restored object byte count/SHA-256 mismatch")
		}
		count++
		bytes += entry.Bytes
		return nil
	}); err != nil {
		return err
	}
	if count != manifest.ObjectCount || bytes != manifest.MediaBytes {
		return failure("restore-verify", "restored media coverage differs from snapshot")
	}
	return nil
}
