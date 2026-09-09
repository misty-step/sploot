package httpapi

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
)

func (s *Server) manifest(w http.ResponseWriter, r *http.Request) {
	s.json(w, 200, map[string]any{
		"id": "/", "name": "Sploot", "short_name": "Sploot", "start_url": "/app", "scope": "/", "display": "standalone",
		"description": "Your memes, ready to find and share.", "background_color": "#e9f3ff", "theme_color": "#e9f3ff",
		"icons":        []map[string]string{{"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"}},
		"share_target": map[string]any{"action": "/share-target", "method": "POST", "enctype": "multipart/form-data", "params": map[string]any{"title": "title", "text": "text", "url": "url", "files": []map[string]any{{"name": "images", "accept": contract.AllowedMIMETypes}}}},
	})
}

// Only body reads consume the network deadline. An exceeded deadline cannot be
// extended, so processing an earlier part must not leave one armed.
var shareReadWindow = 20 * time.Second

type shareBody struct {
	io.ReadCloser
	controller *http.ResponseController
}

func (b *shareBody) Read(value []byte) (int, error) {
	if err := b.controller.SetReadDeadline(time.Now().Add(shareReadWindow)); err != nil {
		return 0, err
	}
	n, err := b.ReadCloser.Read(value)
	_ = b.controller.SetReadDeadline(time.Time{})
	return n, err
}

// Native share-sheet navigations do not always have an Origin. Cross-site web
// forms are refused; the browser-owned navigation still requires a real session.
func (s *Server) shareTarget(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		http.Redirect(w, r, "/app", http.StatusSeeOther)
		return
	}
	if origin := r.Header.Get("Origin"); (origin != "" && origin != "null" && origin != s.config.BaseURL) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		s.json(w, 403, map[string]string{"error": "Share from your device or this application"})
		return
	}
	principal, ok := s.pagePrincipal(w, r)
	if !ok {
		return
	}
	select {
	case s.uploadSlot <- struct{}{}:
		defer func() { <-s.uploadSlot }()
	default:
		w.Header().Set("Retry-After", "1")
		s.json(w, http.StatusTooManyRequests, map[string]string{"error": "Another upload is being received. Retry shortly."})
		return
	}
	r.Body = http.MaxBytesReader(w, &shareBody{ReadCloser: r.Body, controller: http.NewResponseController(w)}, 250<<20)
	reader, err := r.MultipartReader()
	if err != nil {
		s.json(w, http.StatusBadRequest, map[string]string{"error": "The shared files must be a multipart form."})
		return
	}
	saved, duplicates, failed, files := 0, 0, 0, 0
	var sourceURL, sharedText string
	for parts := 0; ; parts++ {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil || parts >= 1000 {
			if part != nil {
				_ = part.Close()
			}
			if saved+duplicates+failed == 0 {
				status := http.StatusBadRequest
				var oversized *http.MaxBytesError
				if errors.As(err, &oversized) {
					status = http.StatusRequestEntityTooLarge
				}
				s.json(w, status, map[string]string{"error": "The shared files could not be received. Share fewer or smaller files."})
				return
			}
			failed++
			break
		}
		if part.FormName() == "images" && part.FileName() != "" {
			files++
			if files > 100 {
				failed++
				_ = part.Close()
				continue
			}
			// Ingestion admits disk space before reading each file; no batch
			// is spooled into the process-wide temporary directory.
			result, saveErr := s.ingest.Save(r.Context(), principal.UserID, ingest.Input{Filename: part.FileName(), MIME: part.Header.Get("Content-Type"), Reader: part})
			_ = part.Close()
			if saveErr != nil {
				failed++
			} else if result.IsDuplicate {
				duplicates++
			} else {
				saved++
			}
			continue
		}
		if part.FileName() == "" {
			value, readErr := io.ReadAll(io.LimitReader(part, (64<<10)+1))
			if readErr != nil || len(value) > 64<<10 {
				failed++
				_ = part.Close()
				break
			}
			switch part.FormName() {
			case "url":
				sourceURL = string(value)
			case "text":
				sharedText = string(value)
			}
		}
		_ = part.Close()
	}
	if files == 0 && failed == 0 {
		source := sourceURL
		if source == "" {
			source = sharedText
		}
		if source != "" {
			result, err := s.ingest.SaveURL(r.Context(), principal.UserID, source, ingest.Input{})
			if err != nil {
				failed++
			} else if result.IsDuplicate {
				duplicates++
			} else {
				saved++
			}
		}
	}
	counts := url.Values{"shared": {strconv.Itoa(saved)}, "duplicates": {strconv.Itoa(duplicates)}, "failed": {strconv.Itoa(failed)}}
	http.Redirect(w, r, "/app?"+counts.Encode(), http.StatusSeeOther)
}
