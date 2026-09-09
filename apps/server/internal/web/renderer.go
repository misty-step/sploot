package web

import (
	"crypto/sha256"
	"embed"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"strings"
	texttemplate "text/template"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

//go:embed templates/*.html templates/*.shortcut static
var content embed.FS

// PageData contains only server-authorized state. A nil Principal denotes a
// public page; browser storage is never an authentication authority.
type PageData struct {
	Title             string
	BaseURL           string
	RegistrationOpen  bool
	AccountEmail      string
	Principal         *model.Principal
	Assets            []model.Asset
	Asset             *model.Asset
	Query             string
	FavoriteOnly      bool
	Seed              string
	NextCursor        string
	HasMore           bool
	Total             int
	Error             string
	ReturnURL         string
	DeviceCode        string
	ShareSlug         string
	UploadsEnabled    bool
	StorageLimitBytes int64
	ModelStatus       string
	Page              string
}

type Renderer struct {
	templates *template.Template
	shortcut  *texttemplate.Template
	static    http.Handler
}

type mediaCard struct {
	Asset    model.Asset
	Public   bool
	Source   string
	Poster   string
	Download string
}

func New() (*Renderer, error) {
	functions := template.FuncMap{
		"card":             card,
		"video":            func(mime string) bool { return strings.HasPrefix(mime, "video/") },
		"gif":              func(mime string) bool { return mime == "image/gif" },
		"bytes":            formatBytes,
		"date":             func(t time.Time) string { return t.Format("2 Jan 2006") },
		"isoDate":          func(t time.Time) string { return t.Format(time.RFC3339) },
		"browseURL":        browseURL,
		"nextURL":          nextURL,
		"uploadAccept":     func() string { return strings.Join(contract.AllowedMIMETypes, ",") },
		"uploadMaxBytes":   func() int64 { return int64(contract.UploadMaxBytes) },
		"uploadTimeout":    func() int64 { return int64(contract.UploadTimeoutMS) },
		"tagMaxNameLength": func() int { return contract.TagMaxNameLength },
	}
	templates, err := template.New("sploot").Funcs(functions).ParseFS(content, "templates/*.html")
	if err != nil {
		return nil, fmt.Errorf("parse web templates: %w", err)
	}
	shortcut, err := texttemplate.New("save-to-sploot.unsigned.shortcut").ParseFS(content, "templates/*.shortcut")
	if err != nil {
		return nil, fmt.Errorf("parse Shortcut source: %w", err)
	}
	static, err := fs.Sub(content, "static")
	if err != nil {
		return nil, fmt.Errorf("open embedded web assets: %w", err)
	}
	files := http.FileServer(http.FS(static))
	handler := http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		info, err := fs.Stat(static, name)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "public, no-cache")
		files.ServeHTTP(w, r)
	}))
	return &Renderer{templates: templates, shortcut: shortcut, static: handler}, nil
}

func (r *Renderer) Render(w io.Writer, name string, data PageData) error {
	switch name {
	case "app", "search", "settings", "connect", "share", "sign-in", "sign-up", "not-found":
		data.Page = name
	case "feed":
		data.Page = "app"
	case "results":
		data.Page = "search"
	default:
		return fmt.Errorf("unknown web template %q", name)
	}
	if data.Title == "" {
		data.Title = "Sploot"
	}
	if data.ReturnURL == "" {
		data.ReturnURL = "/app"
	}
	return r.templates.ExecuteTemplate(w, name, data)
}

// Static serves the complete /static/ prefix; callers should not strip it again.
func (r *Renderer) Static() http.Handler { return r.static }

// RenderShortcut configures the unsigned source for exactly one Sploot instance.
func (r *Renderer) RenderShortcut(w io.Writer, baseURL string) error {
	instance := sha256.Sum256([]byte(baseURL))
	return r.shortcut.Execute(w, struct{ BaseURL, TokenFile string }{
		BaseURL:   template.HTMLEscapeString(baseURL),
		TokenFile: fmt.Sprintf("sploot-%x-upload-token.txt", instance[:8]),
	})
}

func card(asset model.Asset, page PageData) mediaCard {
	result := mediaCard{Asset: asset, Public: page.Page == "share"}
	result.Source = "/media/" + url.PathEscape(asset.ID)
	if result.Public {
		slug := page.ShareSlug
		if slug == "" && asset.ShareSlug != nil {
			slug = *asset.ShareSlug
		}
		result.Source = "/s/" + url.PathEscape(slug) + "?media=1"
	}
	separator := "?"
	if strings.Contains(result.Source, "?") {
		separator = "&"
	}
	result.Download = result.Source + separator + "download=1"
	if asset.ThumbnailURL != nil && *asset.ThumbnailURL != "" {
		result.Poster = result.Source + separator + "thumbnail=1"
	}
	return result
}

func browseURL(data PageData, favorite bool) string {
	values := url.Values{}
	if data.Seed != "" {
		values.Set("seed", data.Seed)
	}
	if favorite {
		values.Set("favorite", "true")
	}
	if len(values) == 0 {
		return "/app"
	}
	return "/app?" + values.Encode()
}

func nextURL(data PageData, fragment bool) string {
	values := url.Values{"cursor": {data.NextCursor}}
	if data.FavoriteOnly {
		values.Set("favorite", "true")
	}
	path := "/app"
	if data.Page == "search" {
		path = "/app/search"
		values.Set("q", data.Query)
		if fragment {
			values.Set("fragment", "1")
		}
	} else {
		values.Set("seed", data.Seed)
		if fragment {
			path = "/app/feed"
		}
	}
	return path + "?" + values.Encode()
}

func formatBytes(size int64) string {
	if size < 1000 {
		return fmt.Sprintf("%d B", size)
	}
	amount := float64(size)
	units := [...]string{"kB", "MB", "GB", "TB"}
	for _, unit := range units {
		amount /= 1000
		if amount < 1000 || unit == "TB" {
			return fmt.Sprintf("%.1f %s", amount, unit)
		}
	}
	return ""
}
