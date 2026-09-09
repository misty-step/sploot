package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/medialock"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type objectStore struct {
	root      *os.Root
	directory string
}
type storedObject struct {
	key      string
	size     int64
	checksum string
}

func newObjectStore(directory string) (*objectStore, error) {
	if directory == "" {
		return nil, errors.New("a persistent private media directory is required")
	}
	directory, err := filepath.Abs(directory)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	info, err := os.Lstat(directory)
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return nil, errors.New("media directory must be a real mode0700 directory")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(stat.Uid) != os.Geteuid() {
		return nil, errors.New("media directory must belong to the current user")
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, err
	}
	return &objectStore{root: root, directory: directory}, nil
}

func (s *objectStore) libraryDirectory() string { return filepath.Dir(s.directory) }

func validMediaPath(key string) bool {
	return key != "" && filepath.IsLocal(key) && filepath.ToSlash(filepath.Clean(key)) == key && !strings.Contains(key, "\\") && strings.HasPrefix(key, "uploads/")
}

func (s *objectStore) mkdir(key string) error {
	current := ""
	for _, component := range strings.Split(filepath.Dir(key), "/") {
		current = filepath.Join(current, component)
		err := s.root.Mkdir(current, 0700)
		if err != nil && !errors.Is(err, os.ErrExist) {
			return err
		}
		info, err := s.root.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
			return errors.New("unsafe private media directory")
		}
		if err := s.syncDirectory(filepath.Dir(current)); err != nil {
			return err
		}
	}
	return nil
}
func (s *objectStore) syncDirectory(key string) error {
	file, err := s.root.Open(key)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}

func (s *objectStore) putFile(ctx context.Context, key string, media mediaFile) (storedObject, error) {
	file, err := os.Open(media.path)
	if err != nil {
		return storedObject{}, err
	}
	defer file.Close()
	return s.put(ctx, key, file, media.size, media.checksum)
}
func (s *objectStore) putBytes(ctx context.Context, key string, value []byte, checksum string) (storedObject, error) {
	return s.put(ctx, key, bytes.NewReader(value), int64(len(value)), checksum)
}
func (s *objectStore) put(ctx context.Context, key string, body io.Reader, size int64, checksum string) (storedObject, error) {
	if !validMediaPath(key) || size <= 0 || size > int64(contract.UploadMaxBytes)+maxPosterBytes {
		return storedObject{}, errors.New("invalid private media object")
	}
	if err := s.mkdir(key); err != nil {
		return storedObject{}, err
	}
	temporary := key + ".partial-" + model.NewID()
	file, err := s.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return storedObject{}, err
	}
	defer func() { _ = file.Close(); _ = s.root.Remove(temporary) }()
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(contextReader{ctx, body}, size+1))
	if err != nil {
		return storedObject{}, err
	}
	if n != size || hex.EncodeToString(hash.Sum(nil)) != checksum {
		return storedObject{}, errors.New("media bytes changed before durable storage")
	}
	if err := file.Sync(); err != nil {
		return storedObject{}, err
	}
	if err := file.Close(); err != nil {
		return storedObject{}, err
	}
	// A hard link publishes complete synced bytes atomically and, unlike rename,
	// cannot overwrite an existing original. Both names are confined by os.Root.
	if err := s.root.Link(temporary, key); err != nil {
		return storedObject{}, err
	}
	object := storedObject{key: key, size: size, checksum: checksum}
	if err := s.root.Remove(temporary); err != nil {
		return object, err
	}
	return object, s.syncDirectory(filepath.Dir(key))
}

func (s *objectStore) remove(object storedObject) error {
	if !validMediaPath(object.key) {
		return errors.New("invalid uncommitted media path")
	}
	if err := s.root.Remove(object.key); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return s.syncDirectory(filepath.Dir(object.key))
}

// OpenMedia always fences metadata by owner, including for authorized public
// shares and full-library exports. Caller decides whether trash is accessible.
// Neither the API URL nor a caller-supplied pathname can select a private file.
func (s *Service) OpenMedia(ctx context.Context, owner, assetID string, thumbnail bool) (*os.File, error) {
	lock, err := medialock.Acquire(ctx, s.store.libraryDirectory(), false)
	if err != nil {
		return nil, err
	}
	defer lock.Close()
	var key string
	var expected int64
	byteLimit := int64(contract.UploadMaxBytes)
	query := `SELECT pathname,storage_size FROM assets WHERE id=? AND owner_user_id=?`
	if thumbnail {
		byteLimit = maxPosterBytes
		query = `SELECT thumbnail_path,thumbnail_storage_size FROM assets WHERE id=? AND owner_user_id=? AND thumbnail_path IS NOT NULL`
	}
	if err := s.db.QueryRowContext(ctx, query, assetID, owner).Scan(&key, &expected); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &model.APIError{Status: 404, Message: "Media not found"}
		}
		return nil, err
	}
	if !validMediaPath(key) || expected <= 0 || expected > byteLimit {
		return nil, errors.New("invalid stored media metadata")
	}
	current := ""
	parts := strings.Split(key, "/")
	for index, component := range parts {
		current = filepath.Join(current, component)
		info, err := s.store.root.Lstat(current)
		if err != nil {
			return nil, fmt.Errorf("open retained media: %w", err)
		}
		if index < len(parts)-1 {
			if !info.IsDir() || info.Mode().Perm() != 0700 {
				return nil, errors.New("unsafe stored media directory")
			}
		} else if !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
			return nil, errors.New("stored media must be a private regular file")
		}
	}
	ownerHash := sha256.Sum256([]byte(owner))
	prefix := "uploads/" + hex.EncodeToString(ownerHash[:16]) + "/" + assetID + "/"
	if !strings.HasPrefix(key, prefix) {
		return nil, errors.New("stored media path does not belong to the asset owner")
	}
	file, err := s.store.root.Open(key)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != expected {
		_ = file.Close()
		return nil, errors.New("stored media size differs from its receipt")
	}
	return file, nil
}
