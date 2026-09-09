package httpapi

import (
	"context"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

type mediaSource struct {
	Body     io.ReadCloser
	File     *os.File
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

func (s *Server) openMedia(ctx context.Context, asset model.Asset, thumbnail bool) (mediaSource, error) {
	file, err := s.ingest.OpenMedia(ctx, asset.OwnerID, asset.ID, thumbnail)
	if err != nil {
		return mediaSource{}, err
	}
	filename, mediaType := asset.Filename, asset.MIME
	if filename == "" {
		filename = path.Base(asset.Pathname)
	}
	if thumbnail {
		filename, mediaType = asset.ID+"-poster.jpg", "image/jpeg"
	}
	return mediaSource{Body: file, File: file, MIME: mediaType, Name: filename, Modified: asset.CreatedAt}, nil
}

func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request, asset model.Asset) {
	source, err := s.openMedia(r.Context(), asset, r.URL.Query().Get("thumbnail") == "1")
	if err != nil {
		s.failure(w, r, err)
		return
	}
	defer source.Body.Close()
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", source.MIME)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": source.Name}))
	}
	// Seekable immutable originals support HEAD, If-Modified-Since, single and
	// multipart ranges, and 416 responses without buffering video in memory.
	http.ServeContent(w, r, source.Name, source.Modified, source.File)
}

func (s *Server) Close() error { return s.ingest.Close() }
