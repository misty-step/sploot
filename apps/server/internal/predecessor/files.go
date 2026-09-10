package predecessor

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

const maxCaptureBytes = 256 << 20

func digest(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func validSHA(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && strings.ToLower(value) == value
}

func validPath(path string) bool {
	return path != "" && filepath.IsLocal(path) && filepath.ToSlash(filepath.Clean(path)) == path && !strings.ContainsAny(path, "\\\x00")
}

func privateDirectory(path string) (*os.Root, string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil || path == "" {
		return nil, "", errors.New("an explicit private directory is required")
	}
	// Open every component with O_NOFOLLOW, including ancestors. A path is
	// never permitted to use a symlink even when it would stay within the root.
	file, err := openAbsolute(absolute, true)
	if err != nil {
		return nil, "", errors.New("directory is missing or traverses a symlink")
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 || !owned(info) {
		return nil, "", errors.New("directory must be current-user-owned and mode0700")
	}
	root, err := os.OpenRoot(absolute)
	if err != nil {
		return nil, "", errors.New("cannot open private directory")
	}
	return root, absolute, nil
}

func owned(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && int(stat.Uid) == os.Geteuid()
}

func openAbsolute(path string, directory bool) (*os.File, error) {
	fd, err := unix.Open("/", unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	for i, part := range parts {
		if part == "" || part == "." || part == ".." {
			unix.Close(fd)
			return nil, errors.New("invalid absolute path")
		}
		flags := unix.O_RDONLY | unix.O_NOFOLLOW | unix.O_CLOEXEC | unix.O_NONBLOCK
		if i < len(parts)-1 || directory {
			flags |= unix.O_DIRECTORY
		}
		next, openErr := unix.Openat(fd, part, flags, 0)
		unix.Close(fd)
		if openErr != nil {
			return nil, openErr
		}
		fd = next
	}
	return os.NewFile(uintptr(fd), path), nil
}

func privateFile(root *os.Root, name string) (*os.File, error) {
	if !validPath(name) {
		return nil, errors.New("invalid relative artifact path")
	}
	file, err := openAbsolute(filepath.Join(root.Name(), name), false)
	if err != nil {
		return nil, errors.New("artifact is missing or traverses a symlink")
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0600 || !owned(info) {
		file.Close()
		return nil, errors.New("artifact must be a current-user-owned mode0600 regular file")
	}
	return file, nil
}

func newPrivateDirectory(path string) (*os.Root, string, error) {
	absolute, err := newOutputPath(path)
	if err != nil {
		return nil, "", err
	}
	if err := os.Mkdir(absolute, 0700); err != nil {
		return nil, "", errors.New("destination directory must not already exist")
	}
	parent, err := openAbsolute(filepath.Dir(absolute), true)
	if err != nil {
		return nil, "", errors.New("cannot open new directory parent")
	}
	err = parent.Sync()
	_ = parent.Close()
	if err != nil {
		return nil, "", errors.New("cannot persist new directory")
	}
	return privateDirectory(absolute)
}

func newOutputPath(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil || path == "" {
		return "", errors.New("an explicit new output path is required")
	}
	parent := filepath.Dir(absolute)
	file, err := openAbsolute(parent, true)
	if err != nil {
		return "", errors.New("output parent must exist without symlinks")
	}
	file.Close()
	for ancestor := parent; ; ancestor = filepath.Dir(ancestor) {
		if _, err := os.Lstat(filepath.Join(ancestor, ".git")); err == nil {
			return "", errors.New("private migration output must be outside repository trees")
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", errors.New("cannot establish repository boundary")
		}
		if ancestor == filepath.Dir(ancestor) {
			break
		}
	}
	if _, err := os.Lstat(absolute); !errors.Is(err, os.ErrNotExist) {
		return "", errors.New("output must not already exist")
	}
	return absolute, nil
}

func mkdirWithin(root *os.Root, path string) error {
	if path == "." {
		return nil
	}
	if !validPath(path) {
		return errors.New("invalid destination path")
	}
	current := ""
	for _, component := range strings.Split(path, "/") {
		current = filepath.Join(current, component)
		mkdirErr := root.Mkdir(current, 0700)
		if mkdirErr != nil && !errors.Is(mkdirErr, os.ErrExist) {
			return errors.New("cannot create private artifact directory")
		}
		info, err := root.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 || !owned(info) {
			return errors.New("unsafe artifact directory")
		}
		if mkdirErr == nil {
			if err := syncDirectory(root, filepath.Dir(current)); err != nil {
				return errors.New("cannot persist private directory entry")
			}
		}
	}
	return nil
}

func writePrivate(root *os.Root, path string, reader io.Reader) (int64, string, error) {
	if !validPath(path) {
		return 0, "", errors.New("invalid artifact path")
	}
	if err := mkdirWithin(root, filepath.Dir(path)); err != nil {
		return 0, "", err
	}
	file, err := root.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, "", errors.New("private artifact already exists or cannot be created")
	}
	defer file.Close()
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, hash), reader)
	if err == nil {
		err = file.Sync()
	}
	if err == nil {
		err = syncDirectory(root, filepath.Dir(path))
	}
	if err != nil {
		return 0, "", errors.New("cannot persist private artifact")
	}
	return n, hex.EncodeToString(hash.Sum(nil)), nil
}

func syncDirectory(root *os.Root, path string) error {
	file, err := root.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}

func readPrivate(root *os.Root, path string, limit int64) ([]byte, error) {
	file, err := privateFile(root, path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	value, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil || int64(len(value)) > limit {
		return nil, errors.New("private metadata is unreadable or exceeds its bound")
	}
	return value, nil
}

func copyObject(ctx context.Context, source, target *os.Root, sourcePath, targetPath string, size int64, sha string) error {
	file, err := privateFile(source, sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() != size {
		return errors.New("captured object size differs from its receipt")
	}
	n, sum, err := writePrivate(target, targetPath, io.LimitReader(contextReader{ctx, file}, size+1))
	if err != nil {
		return err
	}
	if n != size || sum != sha {
		return errors.New("captured object bytes differ from their receipt")
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func writeJSON(root *os.Root, path string, value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return errors.New("cannot encode private migration report")
	}
	_, _, err = writePrivate(root, path, bytes.NewReader(append(encoded, '\n')))
	return err
}

func reject(code string) error {
	return fmt.Errorf("predecessor import rejected: %s; inspect the private report when present", code)
}
