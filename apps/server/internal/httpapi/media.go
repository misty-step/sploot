package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type mediaSource struct {
	Body     io.ReadCloser
	File     *os.File
	Header   http.Header
	Status   int
	MIME     string
	Name     string
	Modified time.Time
}

func (s *Server) media(w http.ResponseWriter, r *http.Request, p model.Principal) {
	asset, err := s.library.Get(r.Context(), p.UserID, r.PathValue("id"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.serveMedia(w, r, asset)
}

func (s *Server) openMedia(ctx context.Context, asset model.Asset, thumbnail bool, rangeHeader string) (mediaSource, error) {
	rawURL := asset.BlobURL
	rendering := "original"
	mediaType := asset.MIME
	filename := asset.Filename
	if filename == "" {
		filename = path.Base(asset.Pathname)
	}
	if thumbnail && asset.ThumbnailURL != nil && *asset.ThumbnailURL != "" {
		rawURL = *asset.ThumbnailURL
		rendering = "thumbnail"
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return mediaSource{}, errors.New("invalid stored thumbnail URL")
		}
		mediaType = mime.TypeByExtension(path.Ext(parsed.Path))
		if mediaType == "" {
			mediaType = "image/jpeg"
		}
		filename = asset.ID + "-poster" + path.Ext(parsed.Path)
	}
	if s.restoredMedia != nil {
		file, entry, err := s.restoredMedia.Open(asset.ID, rendering)
		if err == nil {
			if entry.OwnerID != asset.OwnerID {
				file.Close()
				return mediaSource{}, errors.New("restored media ownership mismatch")
			}
			if entry.MIME != "" {
				mediaType = entry.MIME
			}
			return mediaSource{Body: file, File: file, Status: 200, MIME: mediaType, Name: filename, Modified: asset.CreatedAt}, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return mediaSource{}, err
		}
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return mediaSource{}, errors.New("invalid stored media URL")
	}
	if parsed.Hostname() == "sploot-qa-seed.public.blob.vercel-storage.com" {
		if s.localMedia == nil {
			return mediaSource{}, errors.New("local media backing is not configured")
		}
		key := strings.TrimPrefix(parsed.Path, "/")
		file, err := s.localMedia.Open(key)
		if err != nil {
			return mediaSource{}, fmt.Errorf("open owned media: %w", err)
		}
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			file.Close()
			return mediaSource{}, errors.New("stored media is not a regular file")
		}
		var header [512]byte
		n, readErr := file.ReadAt(header[:], 0)
		if readErr != nil && !errors.Is(readErr, io.EOF) {
			file.Close()
			return mediaSource{}, fmt.Errorf("read stored media header: %w", readErr)
		}
		mediaType = storedMediaMIME(http.DetectContentType(header[:n]), mediaType)
		return mediaSource{Body: file, File: file, Status: 200, MIME: mediaType, Name: filename, Modified: info.ModTime()}, nil
	}
	response, err := s.ingest.OpenRemote(ctx, rawURL, rangeHeader)
	if err != nil {
		return mediaSource{}, err
	}
	mediaType = storedMediaMIME(response.Header.Get("Content-Type"), mediaType)
	return mediaSource{Body: response.Body, Header: response.Header, Status: response.StatusCode, MIME: mediaType, Name: filename, Modified: asset.CreatedAt}, nil
}

func storedMediaMIME(value, fallback string) string {
	mediaType, _, err := mime.ParseMediaType(value)
	if err == nil && slices.Contains(contract.AllowedMIMETypes, mediaType) {
		return mediaType
	}
	return fallback
}

func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request, asset model.Asset) {
	source, err := s.openMedia(r.Context(), asset, r.URL.Query().Get("thumbnail") == "1", r.Header.Get("Range"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	defer source.Body.Close()
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", source.MIME)
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": source.Name}))
	}
	if source.File != nil {
		http.ServeContent(w, r, source.Name, source.Modified, source.File)
		return
	}
	for _, name := range []string{"Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
		if value := source.Header.Get(name); value != "" {
			w.Header().Set(name, value)
		}
	}
	w.WriteHeader(source.Status)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, source.Body); err != nil {
		s.logger.Warn("media stream interrupted", "operation", "media_delivery", "error", err)
	}
}

func (s *Server) Close() error {
	var result error
	if s.localMedia != nil {
		result = errors.Join(result, s.localMedia.Close())
	}
	if s.restoredMedia != nil {
		result = errors.Join(result, s.restoredMedia.Close())
	}
	return result
}
