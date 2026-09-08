package recovery

import (
	"bufio"
	"context"
	"encoding/json"
)

// Verify checks the entire database archive, every frozen metadata artifact,
// exact media coverage, and every original/thumbnail byte. It never connects to a
// database. Use VerifyRestore for restored database and media parity too.
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
	if err := verifyCore(dir, manifest); err != nil {
		return manifest, err
	}
	return manifest, verifyMedia(ctx, dir, manifest)
}

func verifyMedia(ctx context.Context, dir *snapshotDirectory, manifest Manifest) error {
	if manifest.Media == nil {
		return failure("verify-media", "media inventory is absent")
	}
	if err := dir.verifyArtifact(*manifest.Media); err != nil {
		return failure("verify-media", "media manifest byte count or SHA-256 differs")
	}
	file, err := dir.open("media.ndjson")
	if err != nil {
		return err
	}
	defer file.Close()
	mediaScanner := bufio.NewScanner(file)
	mediaScanner.Buffer(make([]byte, 64<<10), maxRecordBytes)
	var count, bytes, assets int64
	var previousID, previousRendition string
	err = scanRecords[objectSource](dir, "sources.ndjson", func(source objectSource) error {
		if ctx.Err() != nil {
			return contextFailure(ctx, "verify-media")
		}
		if err := validateSource(source); err != nil {
			return err
		}
		if source.AssetID == previousID {
			if previousRendition != "original" || source.Rendition != "thumbnail" {
				return assetFailure("verify-media", source.AssetID, "duplicate or out-of-order media inventory")
			}
		} else {
			if source.AssetID < previousID || source.Rendition != "original" {
				return assetFailure("verify-media", source.AssetID, "missing original or unsorted media inventory")
			}
			assets++
		}
		previousID, previousRendition = source.AssetID, source.Rendition
		var entry MediaEntry
		if !mediaScanner.Scan() || json.Unmarshal(mediaScanner.Bytes(), &entry) != nil || !validReceipt(source, entry) {
			return assetFailure("verify-media", source.AssetID, "media inventory does not match frozen source metadata")
		}
		if err := dir.verifyArtifact(Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256}); err != nil {
			return assetFailure("verify-media", source.AssetID, "original or thumbnail byte count/SHA-256 mismatch")
		}
		count++
		bytes += entry.Bytes
		return nil
	})
	if err != nil {
		return err
	}
	if mediaScanner.Scan() || mediaScanner.Err() != nil {
		return failure("verify-media", "extra or unreadable media inventory records")
	}
	if count != manifest.ObjectCount || assets != manifest.AssetCount || bytes != manifest.MediaBytes {
		return failure("verify-media", "media coverage or byte totals differ from the snapshot")
	}
	var assetCount int64
	var lastAsset string
	if err := scanRecords[assetInventory](dir, "assets.ndjson", func(asset assetInventory) error {
		if asset.ID == "" || asset.ID <= lastAsset || asset.OwnerID == "" || !validSHA(asset.SHA256) {
			return assetFailure("verify-assets", asset.ID, "invalid asset ownership or inventory order")
		}
		lastAsset = asset.ID
		assetCount++
		return nil
	}); err != nil {
		return err
	}
	if assetCount != manifest.AssetCount {
		return failure("verify-assets", "asset ownership inventory count differs from snapshot")
	}
	return nil
}
