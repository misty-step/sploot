// Package medialock coordinates immutable media deletion with live snapshots.
// Directory-inode locks work across processes without replaceable lock files.
package medialock

import (
	"context"
	"errors"
	"fmt"
	"os"
	"syscall"
	"time"
)

// Acquire locks an existing private directory until the returned file closes.
// Backups share the library-directory lock; purge takes it exclusively. Saves
// and purge also serialize on the media directory before taking the library lock,
// bounding temporary disk consumption across service instances and processes.
func Acquire(ctx context.Context, directory string, exclusive bool) (*os.File, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	fd, err := syscall.Open(directory, syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, fmt.Errorf("open media coordination directory: %w", err)
	}
	file := os.NewFile(uintptr(fd), directory)
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !info.IsDir() || info.Mode().Perm() != 0700 || !ok || int(stat.Uid) != os.Geteuid() {
		file.Close()
		return nil, errors.New("media coordination requires an owned mode0700 directory")
	}
	mode := syscall.LOCK_SH
	if exclusive {
		mode = syscall.LOCK_EX
	}
	for {
		err = syscall.Flock(fd, mode|syscall.LOCK_NB)
		if err == nil {
			if err := ctx.Err(); err != nil {
				file.Close()
				return nil, err
			}
			return file, nil
		}
		if !errors.Is(err, syscall.EWOULDBLOCK) && !errors.Is(err, syscall.EINTR) {
			file.Close()
			return nil, fmt.Errorf("lock private media: %w", err)
		}
		timer := time.NewTimer(20 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			file.Close()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}
