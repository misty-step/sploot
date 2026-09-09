package recovery

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

const maxMetadataBytes = 32 << 20
const maxRecordBytes = 8 << 20

type snapshotDirectory struct {
	root *os.Root
	path string
	lock *os.File
}

func newDirectory(path string) (*snapshotDirectory, error) {
	absolute, err := filepath.Abs(path)
	if err != nil || path == "" {
		return nil, failure("destination", "an explicit new directory is required")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(absolute))
	if err != nil {
		return nil, failure("destination", "parent directory must already exist")
	}
	absolute = filepath.Join(parent, filepath.Base(absolute))
	for ancestor := parent; ; ancestor = filepath.Dir(ancestor) {
		if _, err := os.Lstat(filepath.Join(ancestor, ".git")); err == nil {
			return nil, failure("destination", "snapshots and restored media must be outside repository trees")
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, failure("destination", "cannot establish repository boundary")
		}
		if ancestor == filepath.Dir(ancestor) {
			break
		}
	}
	if err := os.Mkdir(absolute, 0700); err != nil {
		return nil, failure("destination", "directory must be new; existing or inaccessible destinations are rejected")
	}
	parentDirectory, err := os.Open(parent)
	if err != nil {
		return nil, failure("destination", "cannot open parent directory for durability")
	}
	err = parentDirectory.Sync()
	_ = parentDirectory.Close()
	if err != nil {
		return nil, failure("destination", "cannot persist new destination directory")
	}
	return openDirectory(absolute, true)
}

func openDirectory(path string, lock bool) (*snapshotDirectory, error) {
	absolute, err := filepath.Abs(path)
	if err != nil || path == "" {
		return nil, failure("snapshot", "an explicit directory is required")
	}
	path = absolute
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return nil, failure("snapshot", "directory must be a real mode0700 directory owned by this user")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(stat.Uid) != os.Geteuid() {
		return nil, failure("snapshot", "directory is not owned by this user")
	}
	path, err = filepath.EvalSymlinks(path)
	if err != nil {
		return nil, failure("snapshot", "cannot resolve private directory")
	}
	root, err := os.OpenRoot(path)
	if err != nil {
		return nil, failure("snapshot", "cannot open private directory")
	}
	dir := &snapshotDirectory{root: root, path: path}
	if lock {
		if info, err := root.Lstat(".lock"); err == nil && (!info.Mode().IsRegular() || info.Mode().Perm() != 0600) {
			root.Close()
			return nil, failure("snapshot", "invalid snapshot lock")
		}
		file, err := root.OpenFile(".lock", os.O_CREATE|os.O_RDWR, 0600)
		if err != nil {
			root.Close()
			return nil, failure("snapshot", "cannot open snapshot lock")
		}
		if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
			file.Close()
			root.Close()
			return nil, failure("snapshot", "another operation owns this directory")
		}
		dir.lock = file
	}
	return dir, nil
}

func (d *snapshotDirectory) close() {
	if d.lock != nil {
		_ = syscall.Flock(int(d.lock.Fd()), syscall.LOCK_UN)
		_ = d.lock.Close()
	}
	_ = d.root.Close()
}

func randomID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", failure("snapshot", "cannot generate snapshot identity")
	}
	return hex.EncodeToString(value[:]), nil
}

func validRelative(path string) bool {
	return path != "" && filepath.IsLocal(path) && filepath.ToSlash(filepath.Clean(path)) == path && !strings.Contains(path, "\\")
}

func (d *snapshotDirectory) open(path string) (*os.File, error) {
	if !validRelative(path) {
		return nil, failure("snapshot", "invalid artifact path")
	}
	// Reject symlinks in every component, even those remaining within the root.
	current := ""
	components := strings.Split(path, "/")
	for i, component := range components {
		current = filepath.Join(current, component)
		info, err := d.root.Lstat(current)
		if err != nil {
			return nil, failure("snapshot", "artifact is missing or unreadable")
		}
		if i == len(components)-1 {
			if !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
				return nil, failure("snapshot", "artifact must be a private regular file")
			}
		} else if !info.IsDir() || info.Mode().Perm() != 0700 {
			return nil, failure("snapshot", "artifact directory is unsafe")
		}
	}
	file, err := d.root.Open(path)
	if err != nil {
		return nil, failure("snapshot", "cannot open artifact")
	}
	return file, nil
}

func (d *snapshotDirectory) mkdir(path string) error {
	if !validRelative(path) {
		return failure("snapshot", "invalid directory path")
	}
	if err := d.root.Mkdir(path, 0700); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return failure("snapshot", "cannot create media directory")
		}
		info, err := d.root.Lstat(path)
		if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
			return failure("snapshot", "unsafe media directory")
		}
	}
	return nil
}

// writeFile atomically replaces only this snapshot's artifacts; it never follows
// an existing destination symlink and fsyncs both bytes and the containing directory.
func (d *snapshotDirectory) writeFile(path string, generate func(io.Writer) error) (Artifact, error) {
	if !validRelative(path) {
		return Artifact{}, failure("snapshot", "invalid artifact path")
	}
	id, err := randomID()
	if err != nil {
		return Artifact{}, err
	}
	temporary := path + ".partial-" + id
	file, err := d.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return Artifact{}, failure("snapshot", "cannot create artifact; check private directory access and free space")
	}
	defer func() { _ = file.Close(); _ = d.root.Remove(temporary) }()
	hash := sha256.New()
	counter := &countWriter{writer: io.MultiWriter(file, hash)}
	if err := generate(counter); err != nil {
		return Artifact{}, err
	}
	if err := file.Sync(); err != nil {
		return Artifact{}, failure("snapshot", "cannot persist artifact; check free space")
	}
	if err := file.Close(); err != nil {
		return Artifact{}, failure("snapshot", "cannot close artifact")
	}
	if info, err := d.root.Lstat(path); err == nil && (!info.Mode().IsRegular() || info.Mode().Perm() != 0600) {
		return Artifact{}, failure("snapshot", "refusing unsafe existing artifact")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return Artifact{}, failure("snapshot", "cannot inspect artifact destination")
	}
	if err := d.root.Rename(temporary, path); err != nil {
		return Artifact{}, failure("snapshot", "cannot finalize artifact")
	}
	parent, err := d.root.Open(filepath.Dir(path))
	if err != nil {
		return Artifact{}, failure("snapshot", "cannot open artifact directory for durability")
	}
	err = parent.Sync()
	_ = parent.Close()
	if err != nil {
		return Artifact{}, failure("snapshot", "cannot persist artifact directory")
	}
	return Artifact{Path: path, Bytes: counter.bytes, SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}

type countWriter struct {
	writer io.Writer
	bytes  int64
}

func (w *countWriter) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	w.bytes += int64(n)
	return n, err
}

func (d *snapshotDirectory) writeJSON(path string, value any) (Artifact, error) {
	return d.writeFile(path, func(w io.Writer) error {
		if err := json.NewEncoder(w).Encode(value); err != nil {
			return failure("snapshot", "cannot encode metadata")
		}
		return nil
	})
}

func (d *snapshotDirectory) readJSON(path string, value any) error {
	file, err := d.open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() > maxMetadataBytes {
		return failure("snapshot", "metadata exceeds bounded size")
	}
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return failure("snapshot", "invalid metadata JSON")
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return failure("snapshot", "unexpected trailing metadata")
	}
	return nil
}

func (d *snapshotDirectory) hashFile(ctx context.Context, path string) (Artifact, error) {
	file, err := d.open(path)
	if err != nil {
		return Artifact{}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() > 1<<40 {
		return Artifact{}, failure("verify", "artifact exceeds supported size")
	}
	hash := sha256.New()
	bytes, err := io.Copy(hash, io.LimitReader(recoveryReader{ctx, file}, info.Size()+1))
	if err != nil || bytes != info.Size() {
		return Artifact{}, failure("verify", "cannot read complete unchanged artifact")
	}
	return Artifact{Path: path, Bytes: bytes, SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}

func (d *snapshotDirectory) verifyArtifact(ctx context.Context, expected Artifact) error {
	if expected.Bytes < 0 || expected.Bytes > 1<<40 || !validSHA(expected.SHA256) {
		return failure("verify", "invalid artifact checksum metadata")
	}
	file, err := d.open(expected.Path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() != expected.Bytes {
		return failure("verify", "artifact size differs from its frozen receipt")
	}
	hash := sha256.New()
	count, err := io.Copy(hash, io.LimitReader(recoveryReader{ctx, file}, expected.Bytes+1))
	if err != nil || count != expected.Bytes || hex.EncodeToString(hash.Sum(nil)) != expected.SHA256 {
		return failure("verify", "artifact size or SHA-256 mismatch")
	}
	return nil
}

func validSHA(value string) bool {
	if len(value) != 64 || strings.ToLower(value) != value {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func validSnapshotID(value string) bool {
	if len(value) != 32 || strings.ToLower(value) != value {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func scanRecords[T any](d *snapshotDirectory, path string, visit func(T) error) error {
	file, err := d.open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64<<10), maxRecordBytes)
	for scanner.Scan() {
		var value T
		if err := json.Unmarshal(scanner.Bytes(), &value); err != nil {
			return failure("snapshot", "invalid inventory record")
		}
		if err := visit(value); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return failure("snapshot", "cannot read bounded inventory record")
	}
	return nil
}
