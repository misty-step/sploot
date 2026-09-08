package httpapi

import (
	"errors"
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
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(20 * time.Second))
	r.Body = http.MaxBytesReader(w, r.Body, 250<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		status := 400
		var oversized *http.MaxBytesError
		if errors.As(err, &oversized) {
			status = 413
		}
		s.json(w, status, map[string]string{"error": "The shared files could not be received. Share fewer or smaller files."})
		return
	}
	defer r.MultipartForm.RemoveAll()
	files := r.MultipartForm.File["images"]
	if len(files) > 100 {
		s.json(w, 413, map[string]string{"error": "Share at most 100 files at once"})
		return
	}
	saved, duplicates, failed := 0, 0, 0
	for _, header := range files {
		file, err := header.Open()
		if err != nil {
			failed++
			continue
		}
		result, err := s.ingest.Save(r.Context(), principal.UserID, ingest.Input{Filename: header.Filename, MIME: header.Header.Get("Content-Type"), Reader: file})
		file.Close()
		if err != nil {
			failed++
		} else if result.IsDuplicate {
			duplicates++
		} else {
			saved++
		}
	}
	if len(files) == 0 {
		source := r.FormValue("url")
		if source == "" {
			source = r.FormValue("text")
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
