package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/config"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/embedding"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
	"github.com/misty-step/sploot/apps/server/internal/observability"
	"github.com/misty-step/sploot/apps/server/internal/recovery"
	"github.com/misty-step/sploot/apps/server/internal/web"
)

type Server struct {
	config        config.Config
	pool          *pgxpool.Pool
	auth          *auth.Service
	library       *library.Service
	ingest        *ingest.Service
	embedding     *embedding.Service
	web           *web.Renderer
	logger        *slog.Logger
	readiness     *readiness
	localMedia    *os.Root
	restoredMedia *recovery.MediaDirectory
	exportSlot    chan struct{}
	handler       http.Handler
}

func New(cfg config.Config, pool *pgxpool.Pool, logger *slog.Logger) (*Server, error) {
	authentication, err := auth.New(pool, auth.Options{
		ClerkSecretKey: cfg.ClerkSecretKey, ClerkPublishableKey: cfg.ClerkPublishableKey,
		BaseURL: cfg.BaseURL, Environment: cfg.Environment,
		QALocalSecret: cfg.QALocalSecret, QALocalUserID: cfg.QALocalUserID,
		AuthorizedParties: cfg.ClerkAuthorizedParties,
	})
	if err != nil {
		return nil, fmt.Errorf("authentication configuration: %w", err)
	}
	capture, err := ingest.New(pool, ingest.Options{
		BlobToken: cfg.BlobToken, MediaDirectory: cfg.MediaDirectory, Environment: cfg.Environment,
		UploadsEnabled: cfg.UploadsEnabled, Logger: logger,
	})
	if err != nil {
		return nil, fmt.Errorf("capture configuration: %w", err)
	}
	index, err := embedding.New(pool, embedding.Options{
		ReplicateToken: cfg.ReplicateToken, MediaDirectory: cfg.MediaDirectory, Environment: cfg.Environment,
		CursorSecret: cfg.CursorSecret, Enabled: cfg.EmbeddingsEnabled, Logger: logger,
		GlobalDailyAttempts: cfg.EmbeddingDailyBudget, CostAdmissionHalted: cfg.CostAdmissionHalted,
	})
	if err != nil {
		return nil, fmt.Errorf("indexing configuration: %w", err)
	}
	renderer, err := web.New()
	if err != nil {
		return nil, fmt.Errorf("load interface: %w", err)
	}
	s := &Server{config: cfg, pool: pool, auth: authentication, library: library.New(pool, cfg.CursorSecret), ingest: capture, embedding: index, web: renderer, logger: logger, readiness: newReadiness(pool, cfg.StripeBootstrapRequired)}
	s.exportSlot = make(chan struct{}, 1)
	if cfg.MediaDirectory != "" {
		s.localMedia, err = os.OpenRoot(cfg.MediaDirectory)
		if err != nil {
			return nil, fmt.Errorf("open local media directory: %w", err)
		}
	}
	if cfg.RestoredLibraryDirectory != "" {
		s.restoredMedia, err = recovery.OpenMediaDirectory(cfg.RestoredLibraryDirectory)
		if err != nil {
			s.Close()
			return nil, fmt.Errorf("open restored library: %w", err)
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.home)
	mux.HandleFunc("GET /sign-in", s.signIn)
	mux.HandleFunc("GET /qa-auth/login", s.qaLogin)
	mux.HandleFunc("GET /app", s.appPage)
	mux.HandleFunc("GET /app/feed", s.feedPage)
	mux.HandleFunc("GET /app/search", s.searchPage)
	mux.HandleFunc("GET /app/settings", s.settingsPage)
	mux.HandleFunc("GET /s/{slug}", s.publicShare)
	mux.HandleFunc("GET /m/{id}", s.publicShareByID)
	mux.HandleFunc("GET /manifest.json", s.manifest)
	mux.HandleFunc("GET /share-target", s.shareTarget)
	mux.HandleFunc("POST /share-target", s.shareTarget)
	mux.HandleFunc("GET /sw.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Service-Worker-Allowed", "/")
		r.URL.Path = "/static/sw.js"
		renderer.Static().ServeHTTP(w, r)
	})
	mux.Handle("/static/", renderer.Static())
	mux.HandleFunc("GET /media/{id}", s.secured(false, s.media))
	mux.HandleFunc("GET /api/health/live", func(w http.ResponseWriter, r *http.Request) {
		s.json(w, 200, map[string]any{"status": "alive", "service": "sploot-web", "commit": cfg.Revision})
	})
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/health/services", s.healthServices)
	mux.HandleFunc("GET /api/health/enrollment", func(w http.ResponseWriter, r *http.Request) {
		s.json(w, 200, map[string]string{"status": "paused", "mode": "closed", "configuration": "valid"})
	})
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, r *http.Request) {
		s.json(w, 200, map[string]string{"version": "0.1.0", "commit": cfg.Revision, "runtime": "go"})
	})
	mux.HandleFunc("GET /api/assets", s.secured(false, s.listAssets))
	mux.HandleFunc("GET /api/assets/{id}", s.secured(false, s.getAsset))
	mux.HandleFunc("PATCH /api/assets/{id}", s.secured(false, s.updateAsset))
	mux.HandleFunc("DELETE /api/assets/{id}", s.secured(false, s.deleteAsset))
	mux.HandleFunc("POST /api/assets/{id}/restore", s.secured(false, s.restoreAsset))
	mux.HandleFunc("POST /api/assets/{id}/share", s.secured(false, s.createShare))
	mux.HandleFunc("DELETE /api/assets/{id}/share", s.secured(false, s.revokeShare))
	mux.HandleFunc("POST /api/assets/{id}/generate-embedding", s.secured(false, s.retryEmbedding))
	mux.HandleFunc("GET /api/assets/{id}/embedding-status", s.secured(false, s.embeddingStatus))
	mux.HandleFunc("POST /api/search", s.secured(true, s.searchAPI))
	mux.HandleFunc("POST /api/upload", s.secured(true, s.upload))
	mux.HandleFunc("POST /api/upload/url", s.secured(true, s.uploadURL))
	mux.HandleFunc("POST /api/upload/check", s.secured(false, s.checkUpload))
	mux.HandleFunc("GET /api/upload-tokens", s.secured(false, s.listTokens))
	mux.HandleFunc("POST /api/upload-tokens", s.secured(false, s.createToken))
	mux.HandleFunc("DELETE /api/upload-tokens/{id}", s.secured(false, s.revokeToken))
	mux.HandleFunc("GET /api/tags", s.secured(false, s.listTags))
	mux.HandleFunc("POST /api/tags", s.secured(false, s.createTag))
	mux.HandleFunc("PATCH /api/tags/{id}", s.secured(false, s.updateTag))
	mux.HandleFunc("DELETE /api/tags/{id}", s.secured(false, s.deleteTag))
	mux.HandleFunc("GET /api/assets/{id}/tags", s.secured(false, s.assetTags))
	mux.HandleFunc("POST /api/assets/{id}/tags", s.secured(false, s.assetTags))
	mux.HandleFunc("DELETE /api/assets/{id}/tags", s.secured(false, s.assetTags))
	mux.HandleFunc("GET /api/stats", s.secured(false, s.stats))
	mux.HandleFunc("GET /api/library/export", s.secured(false, s.exportLibrary))
	mux.HandleFunc("POST /api/telemetry", s.secured(false, s.telemetry))
	mux.HandleFunc("/", s.notFound)
	s.handler = s.boundary(mux)
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }
func (s *Server) RunIndexing(ctx context.Context) error            { return s.embedding.Run(ctx) }

func (s *Server) secured(allowToken bool, handler func(http.ResponseWriter, *http.Request, model.Principal)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, err := s.auth.Resolve(r, allowToken)
		if err != nil {
			s.failure(w, r, err)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && strings.TrimSpace(r.Header.Get("Authorization")) == "" {
			if r.Header.Get("Origin") != s.config.BaseURL {
				s.failure(w, r, &model.APIError{Status: 403, Message: "Request origin does not match this application"})
				return
			}
		}
		w.Header().Set("Cache-Control", "private, no-store")
		handler(w, r, principal)
	}
}

func (s *Server) boundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if cause := recover(); cause != nil {
				if cause == http.ErrAbortHandler {
					panic(cause)
				}
				err := fmt.Errorf("request panic: %v", cause)
				s.logger.Error("request panicked", "operation", r.Pattern, "error", err)
				observability.Capture(err, r.Pattern)
				s.json(w, 500, map[string]string{"error": "The operation could not be completed. Try again.", "code": "server_error"})
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'")
		w.Header().Set("X-Request-ID", model.NewID())
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Add("Vary", "Origin")
			if s.auth.AllowedOrigin(origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Expose-Headers", "Retry-After, X-Request-ID")
			}
		}
		if r.Method == http.MethodOptions {
			if !s.auth.AllowedOrigin(origin) {
				s.json(w, 403, map[string]string{"error": "Origin not allowed"})
				return
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) json(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		s.logger.Warn("response interrupted", "operation", "encode_json")
	}
}

func (s *Server) failure(w http.ResponseWriter, r *http.Request, err error) {
	var known *model.APIError
	if errors.As(err, &known) {
		if known.Code == "quota_exceeded" && known.Action == nil {
			known.Action = &model.ErrorAction{Type: "manage_storage", Label: "Manage storage", Href: "/app/settings"}
		}
		if known.RetryAfter > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(known.RetryAfter))
		}
		s.json(w, known.Status, known)
		return
	}
	if errors.Is(err, context.DeadlineExceeded) {
		s.json(w, 504, map[string]string{"error": "The operation timed out. Try again."})
		return
	}
	if errors.Is(err, context.Canceled) {
		s.json(w, 408, map[string]string{"error": "The request was interrupted."})
		return
	}
	s.logger.Error("request failed", "operation", r.Pattern, "error", err)
	observability.Capture(err, r.Pattern)
	s.json(w, 500, map[string]string{"error": "The operation could not be completed. Try again.", "code": "server_error"})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		return &model.APIError{Status: 400, Message: "Invalid JSON request"}
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return &model.APIError{Status: 400, Message: "Expected one JSON request"}
	}
	return nil
}

func listOptions(values url.Values) (model.ListOptions, error) {
	options := model.ListOptions{Limit: 30, Sort: "createdAt", Direction: "desc", Seed: values.Get("seed"), Cursor: values.Get("cursor"), TagID: values.Get("tagId")}
	for _, field := range []struct {
		name   string
		target *int
	}{{"limit", &options.Limit}, {"offset", &options.Offset}} {
		if raw := values.Get(field.name); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil {
				return options, &model.APIError{Status: 400, Message: "Invalid " + field.name}
			}
			*field.target = value
		}
	}
	if raw := values.Get("sortBy"); raw != "" {
		options.Sort = raw
	}
	if raw := values.Get("sortOrder"); raw != "" {
		options.Direction = raw
	}
	if raw := values.Get("favorite"); raw != "" {
		favorite, err := strconv.ParseBool(raw)
		if err != nil {
			return options, &model.APIError{Status: 400, Message: "Invalid favorite filter"}
		}
		options.Favorite = &favorite
		options.FavoriteOnly = favorite
	}
	if values.Get("favoriteOnly") == "true" {
		options.FavoriteOnly = true
	}
	if values.Get("deleted") == "true" {
		options.Deleted = true
	}
	return options, nil
}

func (s *Server) searchAPI(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	request := model.SearchRequest{Limit: 30}
	if err := decodeJSON(w, r, &request); err != nil {
		s.failure(w, r, err)
		return
	}
	response, err := s.embedding.Search(r.Context(), principal.UserID, request)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, response)
}

func (s *Server) upload(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(time.Duration(contract.UploadTimeoutMS) * time.Millisecond))
	r.Body = http.MaxBytesReader(w, r.Body, int64(contract.UploadMaxBytes)+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var oversized *http.MaxBytesError
		status := 400
		if errors.As(err, &oversized) {
			status = 413
		}
		s.failure(w, r, &model.APIError{Status: status, Message: "Upload must be a bounded multipart file", Code: "invalid_upload"})
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		s.failure(w, r, &model.APIError{Status: 400, Message: "Choose a file to save", Code: "invalid_upload"})
		return
	}
	defer file.Close()
	var tags []string
	if raw := r.FormValue("tags"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &tags); err != nil {
			s.failure(w, r, &model.APIError{Status: 400, Message: "Tags must be an array of names"})
			return
		}
	}
	response, err := s.ingest.Save(r.Context(), principal.UserID, ingest.Input{Filename: header.Filename, MIME: header.Header.Get("Content-Type"), Reader: file, IdempotencyKey: r.Header.Get("Idempotency-Key"), Tags: tags})
	if err != nil {
		s.failure(w, r, err)
		return
	}
	status := http.StatusCreated
	if response.IsDuplicate {
		status = http.StatusConflict
	}
	s.json(w, status, response)
}

func (s *Server) uploadURL(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	var request struct {
		URL  string   `json:"url"`
		Tags []string `json:"tags"`
	}
	if err := decodeJSON(w, r, &request); err != nil {
		s.failure(w, r, err)
		return
	}
	response, err := s.ingest.SaveURL(r.Context(), principal.UserID, request.URL, ingest.Input{IdempotencyKey: r.Header.Get("Idempotency-Key"), Tags: request.Tags})
	if err != nil {
		s.failure(w, r, err)
		return
	}
	status := http.StatusCreated
	if response.IsDuplicate {
		status = http.StatusConflict
	}
	s.json(w, status, response)
}
