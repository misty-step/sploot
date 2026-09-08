package recovery

import (
	"os"
)

type mediaKey struct{ assetID, rendition string }

// MediaDirectory is a read-only verified index, separate from ingestion storage.
// The caller must authorize owner access before Open. No database URL is changed.
type MediaDirectory struct {
	directory *snapshotDirectory
	entries   map[mediaKey]MediaEntry
}

// OpenMediaDirectory accepts either a complete backup or a verified restore
// media directory. It checks the media manifest and every byte once at startup.
func OpenMediaDirectory(directory string) (*MediaDirectory, error) {
	dir, err := openDirectory(directory, false)
	if err != nil {
		return nil, err
	}
	reader := &MediaDirectory{directory: dir, entries: make(map[mediaKey]MediaEntry)}
	var media Artifact
	var expectedObjects, expectedBytes int64
	if _, err := dir.root.Lstat("restore.json"); err == nil {
		var receipt restoreReceipt
		if err := dir.readJSON("restore.json", &receipt); err != nil {
			dir.close()
			return nil, err
		}
		if receipt.Format != "sploot-library-restore" || receipt.Version != Version || receipt.VerifiedAt.IsZero() || !validSnapshotID(receipt.SnapshotID) || receipt.Media.Path != "media.ndjson" || receipt.Objects < 0 || receipt.Bytes < 0 {
			dir.close()
			return nil, failure("local-media", "invalid verified restore receipt")
		}
		media, expectedObjects, expectedBytes = receipt.Media, receipt.Objects, receipt.Bytes
	} else {
		manifest, err := readManifest(dir, true)
		if err != nil {
			dir.close()
			return nil, err
		}
		media, expectedObjects, expectedBytes = *manifest.Media, manifest.ObjectCount, manifest.MediaBytes
	}
	if err := dir.verifyArtifact(media); err != nil {
		dir.close()
		return nil, failure("local-media", "media manifest size or SHA-256 mismatch")
	}
	var bytes int64
	err = scanRecords[MediaEntry](dir, "media.ndjson", func(entry MediaEntry) error {
		if entry.AssetID == "" || entry.OwnerID == "" || entry.Rendition != "original" && entry.Rendition != "thumbnail" || entry.Path != mediaPath(entry.AssetID, entry.Rendition) || entry.MIME == "" {
			return assetFailure("local-media", entry.AssetID, "invalid media inventory identity or path")
		}
		key := mediaKey{entry.AssetID, entry.Rendition}
		if _, exists := reader.entries[key]; exists {
			return assetFailure("local-media", entry.AssetID, "duplicate media inventory entry")
		}
		if err := dir.verifyArtifact(Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256}); err != nil {
			return assetFailure("local-media", entry.AssetID, "local media byte count/SHA-256 mismatch")
		}
		reader.entries[key] = entry
		bytes += entry.Bytes
		return nil
	})
	if err != nil {
		dir.close()
		return nil, err
	}
	if int64(len(reader.entries)) != expectedObjects || bytes != expectedBytes {
		dir.close()
		return nil, failure("local-media", "local media coverage differs from verified manifest")
	}
	return reader, nil
}

// Open returns a seekable file for http.ServeContent and its verified metadata.
// The directory is immutable application input; use a new directory per restore.
func (d *MediaDirectory) Open(assetID, rendition string) (*os.File, MediaEntry, error) {
	entry, exists := d.entries[mediaKey{assetID, rendition}]
	if !exists {
		return nil, MediaEntry{}, os.ErrNotExist
	}
	file, err := d.directory.open(entry.Path)
	if err != nil {
		return nil, entry, assetFailure("local-media", assetID, "verified local media is no longer readable")
	}
	info, err := file.Stat()
	if err != nil || info.Size() != entry.Bytes {
		file.Close()
		return nil, entry, assetFailure("local-media", assetID, "verified local media size changed")
	}
	return file, entry, nil
}

func (d *MediaDirectory) Close() error { return d.directory.root.Close() }
