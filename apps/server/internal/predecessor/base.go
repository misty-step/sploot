package predecessor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
)

func requireOfflineDatabase(base *os.Root) error {
	for _, name := range []string{"library.sqlite-wal", "library.sqlite-shm", "library.sqlite-journal"} {
		if _, err := base.Lstat(name); !errors.Is(err, os.ErrNotExist) {
			return reject("base_must_be_offline_without_sqlite_sidecars")
		}
	}
	file, err := privateFile(base, "library.sqlite")
	if err != nil {
		return reject("base_database")
	}
	return file.Close()
}

func requireOfflineBase(base *os.Root) error {
	if err := requireOfflineDatabase(base); err != nil {
		return err
	}
	key, err := readPrivate(base, "signing.key", 32)
	if err != nil || len(key) != 32 {
		return reject("base_signing_key")
	}
	return nil
}

// copyBase never opens source SQLite, including in read-only SQLite mode (which
// could create WAL shared-memory sidecars). All authority is copied byte-for-byte.
func copyBase(ctx context.Context, source, target *os.Root) error {
	if err := requireOfflineBase(source); err != nil {
		return err
	}
	if err := walkBase(ctx, source, target, "."); err != nil {
		return err
	}
	return requireOfflineBase(source)
}

func walkBase(ctx context.Context, source, target *os.Root, directory string) error {
	file, err := source.Open(directory)
	if err != nil {
		return reject("base_directory")
	}
	entries, err := file.ReadDir(-1)
	file.Close()
	if err != nil {
		return reject("base_directory")
	}
	for _, entry := range entries {
		name := filepath.Join(directory, entry.Name())
		info, err := source.Lstat(name)
		if err != nil || !owned(info) {
			return reject("base_file_owner")
		}
		if info.IsDir() {
			if info.Mode().Perm() != 0700 {
				return reject("base_directory_permissions")
			}
			if err := mkdirWithin(target, name); err != nil {
				return err
			}
			if err := walkBase(ctx, source, target, name); err != nil {
				return err
			}
			continue
		}
		if !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
			return reject("base_file_type_or_permissions")
		}
		input, err := privateFile(source, name)
		if err != nil {
			return err
		}
		written, checksum, err := writePrivate(target, name, contextReader{ctx, input})
		input.Close()
		if err != nil || written != info.Size() {
			return reject("base_copy")
		}
		input, err = privateFile(source, name)
		if err != nil {
			return err
		}
		verified, err := hashReader(contextReader{ctx, input})
		input.Close()
		if err != nil || verified != checksum {
			return reject("base_changed_during_copy")
		}
	}
	return syncDirectory(target, directory)
}

func hashReader(reader io.Reader) (string, error) {
	hash := sha256.New()
	if _, err := io.Copy(hash, reader); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
