package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const localMediaHost = "sploot-qa-seed.public.blob.vercel-storage.com"
const blobEndpoint = "https://vercel.com/api/blob"

// API version and headers match the installed @vercel/blob 1.1.1 protocol.
// Local storage intentionally uses the same replica identity and URL shape;
// its reserved host is served only by the authenticated nonproduction runtime.
type objectStore struct {
	token       string
	storeID     string
	directory   string
	fingerprint string
	client      *http.Client
}

type storedObject struct {
	key      string
	url      string
	mime     string
	size     int64
	checksum string
}

func newObjectStore(token, directory string) (*objectStore, error) {
	s := &objectStore{token: token, directory: directory}
	identity := "vercel:" + localMediaHost
	if directory != "" {
		absolute, err := filepath.Abs(directory)
		if err != nil {
			return nil, err
		}
		if err = os.MkdirAll(absolute, 0700); err != nil {
			return nil, err
		}
		info, err := os.Stat(absolute)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() || info.Mode().Perm()&0022 != 0 {
			return nil, errors.New("local media root must be a directory writable only by its owner")
		}
		s.directory = absolute
	} else {
		parts := strings.Split(token, "_")
		if len(parts) < 5 || !strings.HasPrefix(token, "vercel_blob_rw_") || !storeIDPattern.MatchString(parts[3]) || strings.ContainsAny(token, "\r\n\t ") {
			return nil, errors.New("BLOB_READ_WRITE_TOKEN is required for production Blob storage")
		}
		s.storeID = parts[3]
		identity = "vercel:" + parts[3] + ":" + blobEndpoint + ":api-11"
	}
	hash := sha256.Sum256([]byte(identity))
	s.fingerprint = hex.EncodeToString(hash[:])
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	s.client = &http.Client{Transport: transport, Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return s, nil
}

var storeIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]+$`)
var deliveryHostPattern = regexp.MustCompile(`^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$`)

func (s *objectStore) putFile(ctx context.Context, key string, media mediaFile) (storedObject, error) {
	file, err := os.Open(media.path)
	if err != nil {
		return storedObject{}, err
	}
	defer file.Close()
	return s.put(ctx, key, file, media.size, media.mime, media.checksum)
}
func (s *objectStore) putBytes(ctx context.Context, key string, value []byte, mime, checksum string) (storedObject, error) {
	return s.put(ctx, key, bytes.NewReader(value), int64(len(value)), mime, checksum)
}
func (s *objectStore) put(ctx context.Context, key string, body io.Reader, size int64, mime, checksum string) (storedObject, error) {
	object := storedObject{key: key, mime: mime, size: size, checksum: checksum}
	if s.directory != "" {
		object.url = "https://" + localMediaHost + "/" + key
		root, err := os.OpenRoot(s.directory)
		if err != nil {
			return storedObject{}, err
		}
		defer root.Close()
		if err = root.MkdirAll(path.Dir(key), 0700); err != nil {
			return storedObject{}, err
		}
		file, err := root.OpenFile(key, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return storedObject{}, err
		}
		written, copyErr := io.Copy(file, contextReader{ctx, body})
		if copyErr == nil && written != size {
			copyErr = errors.New("local media length differs from the original")
		}
		if copyErr == nil {
			copyErr = file.Sync()
		}
		closeErr := file.Close()
		if copyErr != nil {
			return object, copyErr
		}
		if closeErr != nil {
			return object, closeErr
		}
		// Persist directory entries before PostgreSQL can own the object.
		for directory := path.Dir(key); ; directory = path.Dir(directory) {
			dir, err := root.Open(directory)
			if err != nil {
				return object, err
			}
			err = dir.Sync()
			_ = dir.Close()
			if err != nil {
				return object, err
			}
			if directory == "." {
				break
			}
		}
		return object, nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, blobEndpoint+"/?"+url.Values{"pathname": {key}}.Encode(), body)
	if err != nil {
		return storedObject{}, err
	}
	request.ContentLength = size
	s.headers(request)
	request.Header.Set("Content-Type", mime)
	request.Header.Set("X-Content-Type", mime)
	request.Header.Set("X-Content-Length", strconv.FormatInt(size, 10))
	request.Header.Set("X-Add-Random-Suffix", "0")
	request.Header.Set("X-Allow-Overwrite", "0")
	request.Header.Set("X-Cache-Control-Max-Age", "31536000")
	response, err := s.client.Do(request)
	if err != nil {
		return object, fmt.Errorf("Blob upload failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if response.StatusCode >= 500 {
			return object, fmt.Errorf("Blob upload outcome unknown after HTTP %d", response.StatusCode)
		}
		// A definite provider rejection does not make this key ours to delete.
		return storedObject{}, fmt.Errorf("Blob upload rejected with HTTP %d", response.StatusCode)
	}
	var receipt struct {
		URL         string `json:"url"`
		Pathname    string `json:"pathname"`
		ContentType string `json:"contentType"`
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&receipt); err != nil {
		return object, fmt.Errorf("invalid Blob upload receipt: %w", err)
	}
	delivery, err := url.Parse(receipt.URL)
	if err != nil || delivery.Scheme != "https" || !deliveryHostPattern.MatchString(delivery.Host) || delivery.User != nil || delivery.RawQuery != "" || delivery.Fragment != "" || strings.TrimPrefix(delivery.Path, "/") != key || receipt.Pathname != key || normalizeMIME(receipt.ContentType) != mime {
		return object, errors.New("Blob upload receipt differs from the original object")
	}
	object.url = receipt.URL
	return object, nil
}

func (s *objectStore) headers(request *http.Request) {
	request.Header.Set("Authorization", "Bearer "+s.token)
	request.Header.Set("X-API-Version", "11")
	request.Header.Set("X-API-Blob-Request-ID", s.storeID+":"+strconv.FormatInt(time.Now().UnixMilli(), 10)+":"+model.NewID())
	request.Header.Set("X-API-Blob-Request-Attempt", "0")
}

func (s *objectStore) delete(ctx context.Context, object storedObject) error {
	if s.directory != "" {
		root, err := os.OpenRoot(s.directory)
		if err != nil {
			return err
		}
		defer root.Close()
		err = root.Remove(object.key)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	// Pathname deletion is part of the Blob SDK protocol and also cleans an
	// upload whose successful response was lost before its URL was received.
	payload, err := json.Marshal(struct {
		URLs []string `json:"urls"`
	}{URLs: []string{object.key}})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, blobEndpoint+"/delete", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	s.headers(request)
	request.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return fmt.Errorf("Blob cleanup failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Blob cleanup rejected with HTTP %d", response.StatusCode)
	}
	return nil
}
