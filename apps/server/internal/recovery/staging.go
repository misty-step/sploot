package recovery

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/misty-step/sploot/apps/server/internal/diskreserve"
)

// StagingBytes is a conservative peak for the scheduled backup pipeline:
// the portable snapshot, the tar of that snapshot, and the age ciphertext of
// that tar exist together until the plaintext tar is removed. The pipeline is
// unchanged; this only bounds it. The result is rounded to the target
// filesystem's blocks and includes tar headers, long-name records, and a
// fixed age overhead. It does not include export scratch or the reservation
// ledger, which are separate claims on the same free space.
func StagingBytes(dataDir, targetDir string) (int64, error) {
	block, err := diskreserve.BlockSize(targetDir)
	if err != nil {
		return 0, err
	}
	dbLogical, err := databaseStagingBound(dataDir)
	if err != nil {
		return 0, err
	}
	mediaRounded, mediaTarBodies, mediaFiles, mediaDirs, err := mediaStaging(filepath.Join(dataDir, "media"), block)
	if err != nil {
		return 0, err
	}
	ndjson := mediaFiles * 4096
	if ndjson < 4096 {
		ndjson = 4096
	}
	const manifest = 8192
	const ageOverhead = 64 << 10
	dirs := mediaDirs + 2 // snapshot root plus the media root
	dbAlloc, err := diskreserve.RoundUp(dbLogical, block)
	if err != nil {
		return 0, err
	}
	ndjsonAlloc, err := diskreserve.RoundUp(ndjson, block)
	if err != nil {
		return 0, err
	}
	manifestAlloc, err := diskreserve.RoundUp(manifest, block)
	if err != nil {
		return 0, err
	}
	lockAlloc, err := diskreserve.RoundUp(block, block)
	if err != nil {
		return 0, err
	}
	dirAlloc, err := scale(dirs, block)
	if err != nil {
		return 0, err
	}
	snapshot, err := diskreserve.Add(dbAlloc, mediaRounded)
	if err != nil {
		return 0, err
	}
	for _, part := range []int64{ndjsonAlloc, manifestAlloc, lockAlloc, dirAlloc, block} {
		snapshot, err = diskreserve.Add(snapshot, part)
		if err != nil {
			return 0, err
		}
	}
	tarLogical, err := tarBound(dbLogical, ndjson, manifest, mediaFiles, mediaTarBodies, dirs)
	if err != nil {
		return 0, err
	}
	tarAlloc, err := diskreserve.RoundUp(tarLogical, block)
	if err != nil {
		return 0, err
	}
	ageLogical, err := diskreserve.Add(tarLogical, ageOverhead)
	if err != nil {
		return 0, err
	}
	ageAlloc, err := diskreserve.RoundUp(ageLogical, block)
	if err != nil {
		return 0, err
	}
	peak, err := diskreserve.Add(snapshot, tarAlloc)
	if err != nil {
		return 0, err
	}
	return diskreserve.Add(peak, ageAlloc)
}

func databaseStagingBound(dataDir string) (int64, error) {
	var sum int64
	for _, name := range []string{"library.sqlite", "library.sqlite-wal", "library.sqlite-shm", "library.sqlite-journal"} {
		info, err := os.Lstat(filepath.Join(dataDir, name))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return 0, err
		}
		if !info.Mode().IsRegular() {
			continue
		}
		sum, err = diskreserve.Add(sum, info.Size())
		if err != nil {
			return 0, err
		}
	}
	// The portable copy merges the WAL and then VACUUMs. Live file sizes are
	// the ceiling for that rewrite, plus a quarter and 1 MiB for page slack.
	slop := sum/4 + 1<<20
	return diskreserve.Add(sum, slop)
}

func mediaStaging(root string, block int64) (rounded, tarBodies, files, dirs int64, err error) {
	info, statErr := os.Lstat(root)
	if errors.Is(statErr, os.ErrNotExist) {
		return 0, 0, 0, 0, nil
	}
	if statErr != nil || !info.IsDir() {
		return 0, 0, 0, 0, statErr
	}
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			if path != root {
				dirs++
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		alloc, err := diskreserve.RoundUp(info.Size(), block)
		if err != nil {
			return err
		}
		rounded, err = diskreserve.Add(rounded, alloc)
		if err != nil {
			return err
		}
		body, err := diskreserve.RoundUp(info.Size(), 512)
		if err != nil {
			return err
		}
		tarBodies, err = diskreserve.Add(tarBodies, body)
		if err != nil {
			return err
		}
		files++
		return nil
	})
	return rounded, tarBodies, files, dirs, err
}

func tarBound(dbLogical, ndjson, manifest, mediaFiles, mediaTarBodies, dirs int64) (int64, error) {
	// Two 512-byte end blocks. Each member also gets a ustar header and a GNU
	// long-name block so paths longer than 100 bytes cannot slip under the bound.
	const header = 512 + 1024
	members, err := diskreserve.Add(mediaFiles, dirs)
	if err != nil {
		return 0, err
	}
	// database, media list, manifest, and the snapshot lock
	members, err = diskreserve.Add(members, 4)
	if err != nil {
		return 0, err
	}
	headers, err := scale(members, header)
	if err != nil {
		return 0, err
	}
	total, err := diskreserve.Add(int64(1024), headers)
	if err != nil {
		return 0, err
	}
	for _, body := range []int64{dbLogical, ndjson, manifest} {
		padded, err := diskreserve.RoundUp(body, 512)
		if err != nil {
			return 0, err
		}
		total, err = diskreserve.Add(total, padded)
		if err != nil {
			return 0, err
		}
	}
	return diskreserve.Add(total, mediaTarBodies)
}

func scale(count, size int64) (int64, error) {
	value, err := diskreserve.Mul(count, size)
	if err != nil {
		return 0, diskreserve.ErrSpaceUnknown
	}
	return value, nil
}
