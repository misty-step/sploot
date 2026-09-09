package inference

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

//go:embed bundle.json CLIP-LICENSE.txt PILLOW-LICENSE.txt
var bundleFiles embed.FS

type artifact struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	Member string `json:"member"`
}

type runtimeBundle struct {
	Archive artifact   `json:"archive"`
	Library string     `json:"library"`
	Files   []artifact `json:"files"`
}

type bundleManifest struct {
	ModelVersion   string                   `json:"modelVersion"`
	Dimension      int                      `json:"dimension"`
	RuntimeVersion string                   `json:"runtimeVersion"`
	Artifacts      []artifact               `json:"artifacts"`
	Platforms      map[string]runtimeBundle `json:"platforms"`
}

type preparedBundle struct {
	directory      string
	library        string
	runtimeVersion string
}

// Prepare provisions the immutable, checksum-verified bundle without loading
// native code. New calls the same preparation automatically. Directory is a
// cache root, never a library/data directory; the returned path includes the
// immutable model identity. After a successful preparation startup is offline.
func Prepare(ctx context.Context, opts Options) (string, error) {
	bundle, err := prepare(ctx, opts)
	if err != nil {
		return "", err
	}
	return bundle.directory, nil
}

func prepare(ctx context.Context, opts Options) (preparedBundle, error) {
	var result preparedBundle
	data, err := bundleFiles.ReadFile("bundle.json")
	if err != nil {
		return result, err
	}
	var manifest bundleManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return result, fmt.Errorf("decode embedded inference manifest: %w", err)
	}
	if manifest.ModelVersion != ModelVersion || manifest.Dimension != Dimension {
		return result, fmt.Errorf("inference implementation does not match its embedded bundle manifest")
	}
	platform := runtime.GOOS + "/" + runtime.GOARCH
	native, ok := manifest.Platforms[platform]
	if !ok {
		return result, fmt.Errorf("local CLIP runtime does not support %s; use glibc Linux or macOS on amd64/arm64", platform)
	}
	root := opts.Directory
	if root == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return result, fmt.Errorf("locate model cache: set a model directory explicitly: %w", err)
		}
		root = filepath.Join(cache, "sploot", "models")
	}
	root, err = filepath.Abs(root)
	if err != nil {
		return result, fmt.Errorf("resolve model directory: %w", err)
	}
	result = preparedBundle{directory: filepath.Join(root, ModelVersion), runtimeVersion: manifest.RuntimeVersion}
	result.library = filepath.Join(result.directory, filepath.FromSlash(native.Library))
	if err := os.MkdirAll(result.directory, 0o700); err != nil {
		return result, fmt.Errorf("create model cache %s (check directory permissions and disk space): %w", result.directory, err)
	}
	lock, err := acquireInstallLock(ctx, result.directory)
	if err != nil {
		return result, err
	}
	defer lock.Close() // The kernel releases the flock on normal exit or a crash.
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	client := &http.Client{
		Timeout: 20 * time.Minute,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if req.URL.Scheme != "https" || len(via) >= 10 {
				return fmt.Errorf("artifact redirects must stay on HTTPS and use at most 10 hops")
			}
			return nil
		},
	}
	for _, item := range manifest.Artifacts {
		if err := ensureDownload(ctx, client, logger, result.directory, item); err != nil {
			return result, err
		}
	}
	ready := true
	for _, item := range native.Files {
		valid, err := verifiedFile(ctx, filepath.Join(result.directory, filepath.FromSlash(item.Name)), item)
		if err != nil {
			return result, err
		}
		ready = ready && valid
	}
	if !ready {
		if err := ensureDownload(ctx, client, logger, result.directory, native.Archive); err != nil {
			return result, err
		}
		if err := extractRuntime(ctx, result.directory, native); err != nil {
			return result, fmt.Errorf("install ONNX Runtime: %w", err)
		}
	}
	for _, name := range []string{"bundle.json", "CLIP-LICENSE.txt", "PILLOW-LICENSE.txt"} {
		content, err := bundleFiles.ReadFile(name)
		if err != nil {
			return result, err
		}
		digest := sha256.Sum256(content)
		item := artifact{Name: name, Size: int64(len(content)), SHA256: hex.EncodeToString(digest[:])}
		path := filepath.Join(result.directory, name)
		valid, err := verifiedFile(ctx, path, item)
		if err != nil {
			return result, err
		}
		if !valid {
			if err := installFile(ctx, path, item, bytes.NewReader(content)); err != nil {
				return result, err
			}
		}
	}
	return result, ctx.Err()
}

func acquireInstallLock(ctx context.Context, directory string) (*os.File, error) {
	file, err := os.OpenFile(filepath.Join(directory, ".install.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open model installation lock: %w", err)
	}
	for {
		if err := ctx.Err(); err != nil {
			file.Close()
			return nil, err
		}
		err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			return file, nil
		}
		if !errors.Is(err, syscall.EWOULDBLOCK) && !errors.Is(err, syscall.EAGAIN) {
			file.Close()
			return nil, fmt.Errorf("lock model installation: %w", err)
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			file.Close()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func verifiedFile(ctx context.Context, path string, item artifact) (bool, error) {
	stat, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("inspect model artifact %s: %w", path, err)
	}
	if !stat.Mode().IsRegular() {
		return false, fmt.Errorf("model artifact %s must be a regular file, not a directory or symlink", path)
	}
	if stat.Size() != item.Size {
		return false, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return false, fmt.Errorf("read model artifact %s: %w", path, err)
	}
	defer file.Close()
	digest := sha256.New()
	count, err := io.Copy(digest, &contextReader{ctx: ctx, reader: io.LimitReader(file, item.Size+1)})
	if err != nil {
		return false, fmt.Errorf("verify model artifact %s: %w", path, err)
	}
	return count == item.Size && hex.EncodeToString(digest.Sum(nil)) == item.SHA256, nil
}

func ensureDownload(ctx context.Context, client *http.Client, logger *slog.Logger, directory string, item artifact) error {
	path := filepath.Join(directory, filepath.FromSlash(item.Name))
	valid, err := verifiedFile(ctx, path, item)
	if err != nil || valid {
		return err
	}
	logger.Info("preparing local inference artifact", "artifact", item.Name, "bytes", item.Size, "url", item.URL)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, item.URL, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "Sploot-local-inference/1")
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("download %s: %w; allow network access to %s and retry startup (verified files are kept)", item.Name, err, item.URL)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s from %s: HTTP %d; check network access and retry startup", item.Name, item.URL, response.StatusCode)
	}
	if err := installFile(ctx, path, item, response.Body); err != nil {
		return fmt.Errorf("prepare %s (check network integrity, disk space, and cache permissions): %w", item.Name, err)
	}
	logger.Info("verified local inference artifact", "artifact", item.Name, "sha256", item.SHA256, "bytes", item.Size)
	return nil
}

// Unverified bytes are never renamed to a loadable path. Both downloads and
// archive members use the same bounded, hashed, fsynced atomic installation.
func installFile(ctx context.Context, path string, item artifact, source io.Reader) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".artifact-partial-")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	digest := sha256.New()
	count, err := io.Copy(io.MultiWriter(file, digest), &contextReader{ctx: ctx, reader: io.LimitReader(source, item.Size+1)})
	if err != nil {
		return err
	}
	actual := hex.EncodeToString(digest.Sum(nil))
	if count != item.Size || actual != item.SHA256 {
		return fmt.Errorf("artifact integrity failure for %s: got %d bytes SHA256 %s, expected %d bytes SHA256 %s; refusing installation", item.Name, count, actual, item.Size, item.SHA256)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func extractRuntime(ctx context.Context, directory string, bundle runtimeBundle) error {
	file, err := os.Open(filepath.Join(directory, bundle.Archive.Name))
	if err != nil {
		return err
	}
	defer file.Close()
	compressed, err := gzip.NewReader(&contextReader{ctx: ctx, reader: file})
	if err != nil {
		return err
	}
	defer compressed.Close()
	archive := tar.NewReader(compressed)
	remaining := make(map[string]artifact, len(bundle.Files))
	for _, item := range bundle.Files {
		remaining[item.Member] = item
	}
	for len(remaining) != 0 {
		header, err := archive.Next()
		if err != nil {
			return fmt.Errorf("read runtime archive (missing %d required files): %w", len(remaining), err)
		}
		item, required := remaining[header.Name]
		if !required {
			continue
		}
		if header.Typeflag != tar.TypeReg || header.Size != item.Size {
			return fmt.Errorf("unexpected runtime archive member %s", header.Name)
		}
		if err := installFile(ctx, filepath.Join(directory, filepath.FromSlash(item.Name)), item, archive); err != nil {
			return err
		}
		delete(remaining, header.Name)
	}
	return nil
}
