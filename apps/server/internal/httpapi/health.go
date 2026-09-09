package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
)

type readinessResult struct {
	Database  bool
	Schema    bool
	LatencyMS int64
}

func (s *Server) probe(ctx context.Context) readinessResult {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	started := time.Now()
	var version string
	var tables int
	err := s.db.QueryRowContext(ctx, `SELECT vec_version(),
		(SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN
		('users','assets','tags','asset_tags','asset_embeddings','query_embeddings',
		'upload_idempotency','asset_purges','upload_tokens','auth_sessions','device_requests','request_limits'))`).Scan(&version, &tables)
	return readinessResult{Database: err == nil, Schema: err == nil && version != "" && tables == 12, LatencyMS: time.Since(started).Milliseconds()}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	result := s.probe(r.Context())
	status, state, database := http.StatusOK, "ok", "up"
	if !result.Database || !result.Schema {
		status, state, database = http.StatusServiceUnavailable, "degraded", "down"
	}
	search := s.embedding.ModelStatus()
	if status == http.StatusOK && (search == "loading" || search == "unavailable") {
		state = "degraded"
	}
	s.json(w, status, map[string]any{
		"status": state, "timestamp": time.Now().UTC(), "commit": s.config.Revision,
		"runtime": "go", "database": "sqlite", "storage": "filesystem",
		"libraryReady": result.Database && result.Schema, "searchReady": search == "ready",
		"dependencies": map[string]string{"database": database, "search": search},
		"diagnostics":  map[string]any{"database_connection_test": result.Database, "schema_ready": result.Schema, "connection_latency_ms": result.LatencyMS},
	})
}

func (s *Server) healthServices(w http.ResponseWriter, r *http.Request) {
	result := s.probe(r.Context())
	search := s.embedding.ModelStatus()
	servicesReady := result.Database && result.Schema && (search == "ready" || search == "disabled")
	status, state := http.StatusOK, "ok"
	if !servicesReady {
		status, state = http.StatusServiceUnavailable, "degraded"
	}
	s.json(w, status, map[string]any{
		"status":                state,
		"allServicesConfigured": servicesReady,
		"libraryReady":          result.Database && result.Schema,
		"searchReady":           search == "ready",
		"services": map[string]any{
			"database":   map[string]any{"type": "sqlite", "healthy": result.Database && result.Schema},
			"accounts":   map[string]any{"type": "local", "registrationOpen": s.config.RegistrationOpen},
			"media":      map[string]string{"type": "filesystem"},
			"embeddings": map[string]any{"type": "local", "enabled": s.config.EmbeddingsEnabled, "state": search, "healthy": search == "ready", "model": contract.EmbeddingVersion, "dimensions": contract.EmbeddingDimension},
			"sentry":     map[string]bool{"configured": s.config.SentryDSN != "", "required": false},
		},
	})
}
