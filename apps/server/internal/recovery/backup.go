package recovery

import (
	"context"
	"encoding/json"
	"io"
	"reflect"
	"time"

	"github.com/jackc/pgx/v5"
)

func normalizedOptions(options Options) (Options, error) {
	if options.Workers == 0 {
		options.Workers = 4
	}
	if options.MaxObjectBytes == 0 {
		options.MaxObjectBytes = 1 << 30
	}
	if options.ObjectTimeout == 0 {
		options.ObjectTimeout = 5 * time.Minute
	}
	if options.Workers < 1 || options.Workers > 16 || options.MaxObjectBytes < 1 || options.MaxObjectBytes > 1<<40 || options.ObjectTimeout < time.Second || options.ObjectTimeout > time.Hour {
		return options, failure("configuration", "workers must be 1..16, object bytes 1..1TiB, and object timeout 1s..1h")
	}
	return options, nil
}

// Backup freezes every database table and all asset source metadata under the
// same exported snapshot consumed by pg_dump. The source transaction ends before
// any media is fetched. Object checksums detect bytes changed after that point.
func Backup(ctx context.Context, options Options) (Manifest, error) {
	var manifest Manifest
	options, err := normalizedOptions(options)
	if err != nil {
		return manifest, err
	}
	database, err := parseDatabase(options.DatabaseURL)
	if err != nil {
		return manifest, err
	}
	dir, err := newDirectory(options.Directory)
	if err != nil {
		return manifest, err
	}
	defer dir.close()
	manifest, err = captureDatabase(ctx, database, dir)
	if err != nil {
		return manifest, err
	}
	return finishBackup(ctx, dir, options, manifest)
}

func captureDatabase(ctx context.Context, database *databaseConnection, dir *snapshotDirectory) (Manifest, error) {
	manifest := Manifest{Format: Format, Version: Version, State: "database-ready", CreatedAt: time.Now().UTC()}
	id, err := randomID()
	if err != nil {
		return manifest, err
	}
	manifest.ID = id
	conn, err := database.connect(ctx, true)
	if err != nil {
		return manifest, err
	}
	defer conn.Close(context.Background())
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return manifest, databaseError("database-snapshot", err)
	}
	defer tx.Rollback(context.Background())
	var snapshot string
	if err := tx.QueryRow(ctx, `SELECT pg_export_snapshot()`).Scan(&snapshot); err != nil {
		return manifest, databaseError("database-snapshot", err)
	}
	manifest.Source, err = database.identity(ctx, tx)
	if err != nil {
		return manifest, err
	}
	inventory, err := collectInventory(ctx, tx)
	if err != nil {
		return manifest, err
	}
	for _, required := range []string{"_prisma_migrations", "users", "user_identities", "assets", "asset_embeddings", "asset_storage_replicas"} {
		found := false
		for _, table := range inventory.Tables {
			if table.Schema == "public" && table.Name == required {
				found = true
				break
			}
		}
		if !found {
			return manifest, failure("database-snapshot", "source is not the complete migrated Sploot schema; required recovery tables are absent")
		}
	}
	manifest.Assets, manifest.Sources, manifest.AssetCount, manifest.ObjectCount, err = captureAssets(ctx, tx, dir)
	if err != nil {
		return manifest, err
	}
	manifest.Database, err = dir.writeFile("database.dump", func(w io.Writer) error {
		return database.command(ctx, "pg_dump", []string{"--format=custom", "--compress=6", "--no-password", "--lock-wait-timeout=10s", "--snapshot=" + snapshot}, nil, w, true)
	})
	if err != nil {
		return manifest, err
	}
	// Sequences are not MVCC. Refuse a snapshot whose sequence state moved
	// during pg_dump rather than claim inventory fidelity that we cannot prove.
	sequences, err := collectSequences(ctx, tx)
	if err != nil {
		return manifest, err
	}
	if !reflect.DeepEqual(sequences, inventory.Sequences) {
		return manifest, failure("database-snapshot", "sequence values changed during pg_dump; quiesce source writers and create a new snapshot")
	}
	manifest.Inventory, err = dir.writeJSON("inventory.json", inventory)
	if err != nil {
		return manifest, err
	}
	if err := tx.Commit(ctx); err != nil {
		return manifest, databaseError("database-snapshot", err)
	}
	if _, err := dir.writeJSON("manifest.json", manifest); err != nil {
		return manifest, err
	}
	return manifest, nil
}

// Resume does not use DATABASE_URL or contact the source database. A failed
// database phase has no durable manifest and must use a fresh destination.
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
	if err := verifyCore(dir, manifest); err != nil {
		return manifest, err
	}
	if manifest.State == "complete" {
		return manifest, verifyMedia(ctx, dir, manifest)
	}
	return finishBackup(ctx, dir, options, manifest)
}

func finishBackup(ctx context.Context, dir *snapshotDirectory, options Options, manifest Manifest) (Manifest, error) {
	if err := downloadObjects(ctx, dir, options); err != nil {
		return manifest, err
	}
	var count, bytes int64
	media, err := dir.writeFile("media.ndjson", func(w io.Writer) error {
		encoder := json.NewEncoder(w)
		return scanRecords[objectSource](dir, "sources.ndjson", func(source objectSource) error {
			if ctx.Err() != nil {
				return contextFailure(ctx, "media-finalize")
			}
			var receipt MediaEntry
			if err := dir.readJSON(source.Path+".receipt.json", &receipt); err != nil || !validReceipt(source, receipt) {
				return assetFailure("media-finalize", source.AssetID, "verified object receipt is missing or inconsistent")
			}
			if err := encoder.Encode(receipt); err != nil {
				return assetFailure("media-finalize", source.AssetID, "cannot persist media manifest")
			}
			count++
			bytes += receipt.Bytes
			return nil
		})
	})
	if err != nil {
		return manifest, err
	}
	if count != manifest.ObjectCount {
		return manifest, failure("media-finalize", "complete object count differs from snapshot")
	}
	manifest.Media = &media
	manifest.MediaBytes = bytes
	manifest.State = "complete"
	now := time.Now().UTC()
	manifest.CompletedAt = &now
	if err := verifyCore(dir, manifest); err != nil {
		return manifest, err
	}
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
		return manifest, failure("snapshot", "durable manifest is missing or invalid; incomplete database phases require a new destination")
	}
	if manifest.Format != Format || manifest.Version != Version || !validSnapshotID(manifest.ID) || manifest.Source.Name == "" || manifest.Source.ServerVersion < 100000 || !validSHA(manifest.Source.EndpointSHA256) || manifest.AssetCount < 0 || manifest.ObjectCount < manifest.AssetCount || manifest.ObjectCount > 2*manifest.AssetCount || manifest.Database.Path != "database.dump" || manifest.Inventory.Path != "inventory.json" || manifest.Assets.Path != "assets.ndjson" || manifest.Sources.Path != "sources.ndjson" {
		return manifest, failure("snapshot", "unsupported or inconsistent snapshot manifest")
	}
	if manifest.State != "database-ready" && manifest.State != "complete" {
		return manifest, failure("snapshot", "snapshot has no resumable database-ready fence")
	}
	if complete && manifest.State != "complete" {
		return manifest, failure("verify", "media snapshot is incomplete; run resume before verify or restore")
	}
	if manifest.State == "complete" && (manifest.Media == nil || manifest.Media.Path != "media.ndjson" || manifest.CompletedAt == nil || manifest.MediaBytes < 0) {
		return manifest, failure("snapshot", "complete snapshot is missing media integrity metadata")
	}
	return manifest, nil
}

func verifyCore(dir *snapshotDirectory, manifest Manifest) error {
	for _, artifact := range []Artifact{manifest.Database, manifest.Inventory, manifest.Assets, manifest.Sources} {
		if err := dir.verifyArtifact(artifact); err != nil {
			return failure("verify-database", "database archive or metadata failed byte/SHA-256 verification")
		}
	}
	return nil
}
