// Package diskreserve admits save, export, and backup staging against one
// filesystem reservation ledger. Callers estimate the bytes they are about to
// write, on the filesystem that will receive them, and hold that claim until
// the write finishes or the process exits.
//
// The ledger is a private directory of flock-owned records. Admission is
// serialized by a gate lock. A record counts only while another open file
// description holds its lock, so cancellation releases it by closing that file
// and process death releases it when the kernel drops the lock. The next
// admission unlinks the stale record. Unrelated software writing to the same
// host is outside this contract: free space is sampled, not reserved in the
// filesystem itself.
package diskreserve

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const DirectoryName = ".disk-reserve"

var (
	// ErrInsufficientSpace means the write would leave less than the operating
	// reserve after every live Sploot reservation on that filesystem.
	ErrInsufficientSpace = errors.New("disk reserve would be exceeded")
	// ErrSpaceUnknown means free space or the ledger could not be inspected.
	// Callers fail closed instead of treating the disk as empty or infinite.
	ErrSpaceUnknown = errors.New("disk space is not available")
)

// Probe reports the filesystem identity and free bytes of a directory.
// Tests inject a probe so admission can be refused without filling a disk.
type Probe func(target string) (device uint64, available int64, err error)

// Ledger is the cross-process reservation directory shared by every Sploot
// consumer on this host. The reserve function is read at admission time.
type Ledger struct {
	dir     string
	holds   string
	gate    string
	reserve func() int64
	mu      sync.Mutex
	probe   Probe
	peak    map[uint64]int64
}

// Open creates or reopens a mode-0700 ledger. A nil probe uses Stat.
// reserve is called on every admission and must return a nonnegative byte count.
func Open(directory string, reserve func() int64, probe Probe) (*Ledger, error) {
	if directory == "" || reserve == nil {
		return nil, ErrSpaceUnknown
	}
	if reserve() < 0 {
		return nil, ErrSpaceUnknown
	}
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return nil, ErrSpaceUnknown
	}
	if err := os.MkdirAll(absolute, 0700); err != nil {
		return nil, ErrSpaceUnknown
	}
	if err := os.Chmod(absolute, 0700); err != nil {
		return nil, ErrSpaceUnknown
	}
	holds := filepath.Join(absolute, "holds")
	if err := os.MkdirAll(holds, 0700); err != nil {
		return nil, ErrSpaceUnknown
	}
	if err := os.Chmod(holds, 0700); err != nil {
		return nil, ErrSpaceUnknown
	}
	if err := requirePrivateDir(absolute); err != nil || requirePrivateDir(holds) != nil {
		return nil, ErrSpaceUnknown
	}
	gate := filepath.Join(absolute, "gate")
	file, err := os.OpenFile(gate, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, ErrSpaceUnknown
	}
	if err := file.Close(); err != nil {
		return nil, ErrSpaceUnknown
	}
	if err := os.Chmod(gate, 0600); err != nil {
		return nil, ErrSpaceUnknown
	}
	return &Ledger{dir: absolute, holds: holds, gate: gate, reserve: reserve, probe: probe, peak: map[uint64]int64{}}, nil
}

// SetProbe replaces the free-space probe. A nil probe restores Stat.
// It exists so tests can inject low space without touching the host disk.
func (l *Ledger) SetProbe(probe Probe) {
	l.mu.Lock()
	l.probe = probe
	l.mu.Unlock()
}

// SetReserve replaces the operating reserve consulted by later admissions.
func (l *Ledger) SetReserve(bytes int64) error {
	if bytes < 0 {
		return ErrSpaceUnknown
	}
	l.mu.Lock()
	l.reserve = func() int64 { return bytes }
	l.mu.Unlock()
	return nil
}

// PeakHeld is the largest overlapping reservation total this process has
// observed for device. It is the admission high-water mark, not a second source
// of free-space truth.
func (l *Ledger) PeakHeld(device uint64) int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.peak[device]
}

func (l *Ledger) notePeak(device uint64, total int64) {
	l.mu.Lock()
	if total > l.peak[device] {
		l.peak[device] = total
	}
	l.mu.Unlock()
}

func (l *Ledger) currentProbe() Probe {
	l.mu.Lock()
	probe := l.probe
	l.mu.Unlock()
	if probe == nil {
		return Stat
	}
	return probe
}

func (l *Ledger) operatingReserve() (int64, error) {
	l.mu.Lock()
	reserve := l.reserve
	l.mu.Unlock()
	if reserve == nil {
		return 0, ErrSpaceUnknown
	}
	value := reserve()
	if value < 0 {
		return 0, ErrSpaceUnknown
	}
	return value, nil
}

// Hold is one admitted write. Release returns its bytes to later admissions.
// Release is safe on a nil hold and after an earlier release.
type Hold struct {
	ledger *Ledger
	file   *os.File
	path   string
	name   string
	target string
	device uint64
	bytes  int64
}

// Reserve claims bytes of upcoming writes on the filesystem containing target.
// It does not create the payload file. On success the caller must Release,
// including when the request context is later canceled.
func (l *Ledger) Reserve(ctx context.Context, target string, bytes int64) (*Hold, error) {
	if l == nil || target == "" || bytes < 0 {
		return nil, ErrSpaceUnknown
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	reserve, device, available, held, release, err := l.begin(ctx, target, "")
	if err != nil {
		return nil, err
	}
	defer release()
	if !fits(available, held, bytes, reserve) {
		return nil, ErrInsufficientSpace
	}
	hold, err := l.create(target, device, bytes)
	if err != nil {
		return nil, err
	}
	if total, addErr := Add(held, bytes); addErr == nil {
		l.notePeak(device, total)
	}
	return hold, nil
}

// Adjust changes the remaining unwritten bytes of an existing hold and
// rechecks that filesystem before the gate is released. Shrinking frees
// capacity for other consumers. The previous claim stays in force when the
// new size does not fit.
func (h *Hold) Adjust(ctx context.Context, bytes int64) error {
	if h == nil || h.file == nil || h.ledger == nil || h.target == "" || bytes < 0 {
		return ErrSpaceUnknown
	}
	reserve, device, available, held, release, err := h.ledger.begin(ctx, h.target, h.name)
	if err != nil {
		return err
	}
	defer release()
	if device != h.device {
		return ErrSpaceUnknown
	}
	if !fits(available, held, bytes, reserve) {
		return ErrInsufficientSpace
	}
	payload := encodeRecord(h.device, bytes)
	if _, err := h.file.Seek(0, io.SeekStart); err != nil {
		return ErrSpaceUnknown
	}
	if _, err := h.file.Write(payload); err != nil {
		return ErrSpaceUnknown
	}
	if err := h.file.Truncate(int64(len(payload))); err != nil {
		return ErrSpaceUnknown
	}
	if err := h.file.Sync(); err != nil {
		return ErrSpaceUnknown
	}
	h.bytes = bytes
	if total, addErr := Add(held, bytes); addErr == nil {
		h.ledger.notePeak(device, total)
	}
	return nil
}

// begin holds the admission gate and samples free space. release unlocks it.
// exclude is the caller's own record, which is not part of the competing total.
func (l *Ledger) begin(ctx context.Context, target, exclude string) (reserve int64, device uint64, available, held int64, release func(), err error) {
	noop := func() {}
	if err = ctx.Err(); err != nil {
		return 0, 0, 0, 0, noop, err
	}
	reserve, err = l.operatingReserve()
	if err != nil {
		return 0, 0, 0, 0, noop, err
	}
	gate, err := l.lockGate(ctx)
	if err != nil {
		return 0, 0, 0, 0, noop, err
	}
	release = func() {
		_ = syscall.Flock(int(gate.Fd()), syscall.LOCK_UN)
		_ = gate.Close()
	}
	if err = ctx.Err(); err != nil {
		release()
		return 0, 0, 0, 0, noop, err
	}
	info, statErr := os.Stat(target)
	if statErr != nil || !info.IsDir() {
		release()
		return 0, 0, 0, 0, noop, ErrSpaceUnknown
	}
	device, available, err = l.currentProbe()(target)
	if err != nil {
		release()
		return 0, 0, 0, 0, noop, ErrSpaceUnknown
	}
	held, err = l.held(device, exclude)
	if err != nil {
		release()
		return 0, 0, 0, 0, noop, err
	}
	l.notePeak(device, held)
	return reserve, device, available, held, release, nil
}

// Release drops the claim. A process that dies instead of calling Release
// leaves an unlocked record, which the next admission deletes.
func (h *Hold) Release() {
	if h == nil || h.file == nil {
		return
	}
	_ = os.Remove(h.path)
	_ = syscall.Flock(int(h.file.Fd()), syscall.LOCK_UN)
	_ = h.file.Close()
	h.file = nil
}

func (l *Ledger) create(target string, device uint64, bytes int64) (*Hold, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return nil, ErrSpaceUnknown
	}
	name := hex.EncodeToString(random[:])
	path := filepath.Join(l.holds, name)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return nil, ErrSpaceUnknown
	}
	hold := &Hold{ledger: l, file: file, path: path, name: name, target: target, device: device, bytes: bytes}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		hold.Release()
		return nil, ErrSpaceUnknown
	}
	payload := encodeRecord(device, bytes)
	if _, err := file.Write(payload); err != nil {
		hold.Release()
		return nil, ErrSpaceUnknown
	}
	if err := file.Sync(); err != nil {
		hold.Release()
		return nil, ErrSpaceUnknown
	}
	return hold, nil
}

func (l *Ledger) held(device uint64, exclude string) (int64, error) {
	entries, err := os.ReadDir(l.holds)
	if err != nil {
		return 0, ErrSpaceUnknown
	}
	var sum int64
	for _, entry := range entries {
		name := entry.Name()
		if name == exclude {
			continue
		}
		if !validHoldName(name) {
			return 0, ErrSpaceUnknown
		}
		n, err := l.inspect(filepath.Join(l.holds, name), device)
		if err != nil {
			return 0, err
		}
		sum, err = Add(sum, n)
		if err != nil {
			return 0, ErrInsufficientSpace
		}
	}
	return sum, nil
}

func (l *Ledger) inspect(path string, device uint64) (int64, error) {
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, ErrSpaceUnknown
	}
	defer file.Close()
	lockErr := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if lockErr == nil {
		_ = os.Remove(path)
		_ = syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
		return 0, nil
	}
	if !errors.Is(lockErr, syscall.EWOULDBLOCK) && !errors.Is(lockErr, syscall.EAGAIN) {
		return 0, ErrSpaceUnknown
	}
	recordDevice, bytes, err := parseRecord(readLimited(file))
	if err != nil {
		return 0, ErrSpaceUnknown
	}
	if recordDevice != device {
		return 0, nil
	}
	return bytes, nil
}

func (l *Ledger) lockGate(ctx context.Context) (*os.File, error) {
	file, err := os.OpenFile(l.gate, os.O_RDWR, 0)
	if err != nil {
		return nil, ErrSpaceUnknown
	}
	fd := int(file.Fd())
	for {
		if err := ctx.Err(); err != nil {
			_ = file.Close()
			return nil, err
		}
		err = syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			if err := ctx.Err(); err != nil {
				_ = syscall.Flock(fd, syscall.LOCK_UN)
				_ = file.Close()
				return nil, err
			}
			return file, nil
		}
		if !errors.Is(err, syscall.EWOULDBLOCK) && !errors.Is(err, syscall.EAGAIN) && !errors.Is(err, syscall.EINTR) {
			_ = file.Close()
			return nil, ErrSpaceUnknown
		}
		timer := time.NewTimer(20 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			_ = file.Close()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func encodeRecord(device uint64, bytes int64) []byte {
	return []byte(fmt.Sprintf("v1\ndevice=%d\nbytes=%d\n", device, bytes))
}

func parseRecord(data []byte) (uint64, int64, error) {
	fields := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
	if len(fields) != 3 || fields[0] != "v1" || !strings.HasPrefix(fields[1], "device=") || !strings.HasPrefix(fields[2], "bytes=") {
		return 0, 0, ErrSpaceUnknown
	}
	device, err := strconv.ParseUint(strings.TrimPrefix(fields[1], "device="), 10, 64)
	if err != nil {
		return 0, 0, ErrSpaceUnknown
	}
	bytes, err := strconv.ParseInt(strings.TrimPrefix(fields[2], "bytes="), 10, 64)
	if err != nil || bytes < 0 {
		return 0, 0, ErrSpaceUnknown
	}
	return device, bytes, nil
}

func readLimited(file *os.File) []byte {
	_, _ = file.Seek(0, io.SeekStart)
	data, err := io.ReadAll(io.LimitReader(file, 256))
	if err != nil {
		return nil
	}
	return data
}

func validHoldName(name string) bool {
	if len(name) != 32 {
		return false
	}
	for _, r := range name {
		if r < '0' || (r > '9' && r < 'a') || r > 'f' {
			return false
		}
	}
	return true
}

func fits(available, held, incoming, reserve int64) bool {
	if available < 0 || held < 0 || incoming < 0 || reserve < 0 {
		return false
	}
	used, err := Add(held, incoming)
	if err != nil {
		return false
	}
	need, err := Add(used, reserve)
	if err != nil {
		return false
	}
	return available >= need
}

// Mul returns a*b or an error when the product would overflow or either side is negative.
func Mul(a, b int64) (int64, error) {
	if a < 0 || b < 0 {
		return 0, errors.New("byte count overflow")
	}
	if a == 0 || b == 0 {
		return 0, nil
	}
	if a > math.MaxInt64/b {
		return 0, errors.New("byte count overflow")
	}
	return a * b, nil
}

// Add returns a+b or an error when the sum would overflow or either side is negative.
func Add(a, b int64) (int64, error) {
	if a < 0 || b < 0 || a > math.MaxInt64-b {
		return 0, errors.New("byte count overflow")
	}
	return a + b, nil
}

// RoundUp rounds n up to a multiple of block. A zero length stays zero.
func RoundUp(n, block int64) (int64, error) {
	if n < 0 || block <= 0 {
		return 0, ErrSpaceUnknown
	}
	if n == 0 {
		return 0, nil
	}
	if n > math.MaxInt64-(block-1) {
		return 0, ErrSpaceUnknown
	}
	return ((n + block - 1) / block) * block, nil
}

// Stat reports the filesystem device and available bytes of a directory.
func Stat(target string) (uint64, int64, error) {
	device, available, _, err := statfs(target)
	return device, available, err
}

// Device is the filesystem identity Stat uses for target.
func Device(target string) (uint64, error) {
	device, _, _, err := statfs(target)
	return device, err
}

// BlockSize is the allocation unit of the filesystem containing target.
func BlockSize(target string) (int64, error) {
	_, _, block, err := statfs(target)
	return block, err
}

func statfs(target string) (uint64, int64, int64, error) {
	file, err := os.Open(target)
	if err != nil {
		return 0, 0, 0, ErrSpaceUnknown
	}
	defer file.Close()
	var stat syscall.Stat_t
	if err := syscall.Fstat(int(file.Fd()), &stat); err != nil {
		return 0, 0, 0, ErrSpaceUnknown
	}
	var fs syscall.Statfs_t
	if err := syscall.Fstatfs(int(file.Fd()), &fs); err != nil {
		return 0, 0, 0, ErrSpaceUnknown
	}
	if fs.Bsize <= 0 {
		return 0, 0, 0, ErrSpaceUnknown
	}
	if uint64(fs.Bavail) > uint64(math.MaxInt64)/uint64(fs.Bsize) {
		return uint64(stat.Dev), math.MaxInt64, fs.Bsize, nil
	}
	return uint64(stat.Dev), int64(fs.Bavail) * int64(fs.Bsize), fs.Bsize, nil
}

func requirePrivateDir(path string) error {
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return ErrSpaceUnknown
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(stat.Uid) != os.Geteuid() {
		return ErrSpaceUnknown
	}
	return nil
}
