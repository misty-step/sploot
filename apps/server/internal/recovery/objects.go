package recovery

import (
	"context"
	"io"
	"path/filepath"
	"strings"
)

func ensureParents(dir *snapshotDirectory, path string) error {
	current := ""
	for _, component := range strings.Split(filepath.Dir(path), "/") {
		current = filepath.Join(current, component)
		if err := dir.mkdir(current); err != nil {
			return err
		}
		if err := syncSnapshotDirectory(dir, filepath.Dir(current)); err != nil {
			return err
		}
	}
	return nil
}

// Verified completed copies can be reused even if source bytes are temporarily
// unavailable. Same-length corruption is never accepted merely by a receipt.
func copyMediaObject(ctx context.Context, source, target *snapshotDirectory, entry MediaEntry, options Options, buffer []byte) error {
	if err := validateMedia(entry); err != nil {
		return err
	}
	if entry.Bytes > options.MaxObjectBytes {
		return assetFailure("media", entry.AssetID, "object exceeds configured byte bound")
	}
	ctx, cancel := context.WithTimeout(ctx, options.ObjectTimeout)
	defer cancel()
	expected := Artifact{Path: entry.Path, Bytes: entry.Bytes, SHA256: entry.SHA256}
	if err := target.verifyArtifact(ctx, expected); err == nil {
		return contextFailure(ctx, "media")
	}
	file, err := source.open(entry.Path)
	if err != nil {
		return assetFailure("media", entry.AssetID, "retained source file is missing or unsafe")
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() != entry.Bytes {
		return assetFailure("media", entry.AssetID, "source byte count differs from frozen receipt")
	}
	if err := ensureParents(target, entry.Path); err != nil {
		return err
	}
	actual, err := target.writeFile(entry.Path, func(writer io.Writer) error {
		n, err := io.CopyBuffer(writer, io.LimitReader(recoveryReader{ctx, file}, entry.Bytes+1), buffer)
		if err != nil || n != entry.Bytes {
			return assetFailure("media", entry.AssetID, "source copy was truncated or interrupted")
		}
		return nil
	})
	if err != nil {
		return err
	}
	if actual != expected {
		return assetFailure("media", entry.AssetID, "source SHA-256 differs from frozen receipt")
	}
	return contextFailure(ctx, "media")
}

type recoveryReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r recoveryReader) Read(value []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(value)
}
