package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/contract"
)

type readinessResult struct {
	Database  bool
	Schema    bool
	LatencyMS int64
}
type readinessFlight struct {
	done   chan struct{}
	result readinessResult
}
type readiness struct {
	pool      *pgxpool.Pool
	bootstrap bool
	mu        sync.Mutex
	flight    *readinessFlight
}

func newReadiness(pool *pgxpool.Pool, bootstrap bool) *readiness {
	return &readiness{pool: pool, bootstrap: bootstrap}
}

func (p *readiness) probe(ctx context.Context) readinessResult {
	p.mu.Lock()
	flight := p.flight
	if flight == nil {
		flight = &readinessFlight{done: make(chan struct{})}
		p.flight = flight
		go func() {
			deadline, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			started := time.Now()
			var schema bool
			err := p.pool.QueryRow(deadline, readinessSQL, fmt.Sprintf("%%count <= %d%%", contract.EmbeddingGlobalDailyAttempts), fmt.Sprintf("%%count <= %d%%", contract.EmbeddingGlobalMonthlyAttempts)).Scan(&schema)
			result := readinessResult{Database: err == nil, Schema: err == nil && schema, LatencyMS: time.Since(started).Milliseconds()}
			if result.Schema && p.bootstrap {
				var ready bool
				err = p.pool.QueryRow(deadline, `SELECT phase='ready' AND version=(SELECT rpad(split_part(migration_name,'_',1),14,'0') FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1) FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=TRUE`).Scan(&ready)
				result.Schema = err == nil && ready
			}
			p.mu.Lock()
			flight.result = result
			p.flight = nil
			close(flight.done)
			p.mu.Unlock()
		}()
	}
	p.mu.Unlock()
	select {
	case <-flight.done:
		return flight.result
	case <-ctx.Done():
		return readinessResult{}
	}
}

const readinessSQL = `SELECT
 EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')
 AND NOT EXISTS (
  SELECT 1 FROM (VALUES ('embedding_rate_buckets'),('embedding_rate_leases'),('embedding_provider_circuits'),('cost_admission_counters'),('upload_idempotency'),('assets'),('asset_embeddings')) required(name)
  WHERE to_regclass('public.'||required.name) IS NULL
 )
 AND NOT EXISTS (
  SELECT 1 FROM (VALUES
    ('embedding_provider_circuits','generation'),('embedding_provider_circuits','probe_until'),('embedding_provider_circuits','probe_generation'),('embedding_provider_circuits','probe_lease_token'),
    ('asset_embeddings','attempt_count'),('asset_embeddings','next_attempt_at'),('asset_embeddings','terminal_at'),('asset_embeddings','processing_claim_token'),('asset_embeddings','revive_count')
  ) required(table_name,column_name)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=required.table_name AND c.column_name=required.column_name)
 )
 AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.embedding_rate_buckets') AND c.conname='embedding_attempt_count_ceiling' AND c.convalidated AND pg_get_constraintdef(c.oid) LIKE $1 AND pg_get_constraintdef(c.oid) LIKE $2)
 AND NOT EXISTS (
  SELECT 1 FROM (VALUES ('asset_embeddings_processing_claim_token_state'),('asset_embeddings_revive_count_bounded')) required(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.asset_embeddings') AND c.conname=required.name AND c.convalidated)
 )
 AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.asset_embeddings') AND tgname='asset_embeddings_revival_budget' AND NOT tgisinternal AND tgenabled<>'D')
 AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.asset_embeddings_pending_next_attempt_idx') AND indisvalid)
 AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.embedding_provider_circuits_open_until_idx') AND indisvalid)
 AND NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)`

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	result := s.readiness.probe(r.Context())
	status, state, database, limiter := 200, "ok", "up", "up"
	if !result.Database {
		status = 503
		state = "degraded"
		database = "down"
	}
	if !result.Schema {
		status = 503
		state = "degraded"
		limiter = "down"
	}
	s.json(w, status, map[string]any{
		"status": state, "timestamp": time.Now().UTC(), "commit": s.config.Revision,
		"dependencies": map[string]string{"database": database, "embedding_limiter": limiter, "share_slug_cache": "local"},
		"diagnostics":  map[string]any{"database_connection_test": result.Database, "embedding_limiter_schema": result.Schema, "database_url_configured": true, "connection_latency_ms": result.LatencyMS},
	})
}

func (s *Server) healthServices(w http.ResponseWriter, r *http.Request) {
	result := s.readiness.probe(r.Context())
	configured := s.config.ClerkSecretKey != "" && s.config.BlobToken != "" && s.config.ReplicateToken != ""
	status := 200
	state := "ok"
	if !result.Database || !result.Schema || !configured {
		status = 503
		state = "degraded"
	}
	s.json(w, status, map[string]any{"status": state, "allServicesConfigured": configured, "services": map[string]any{
		"database":    map[string]any{"configured": true, "healthy": result.Database && result.Schema},
		"clerk":       map[string]bool{"configured": s.config.ClerkSecretKey != ""},
		"blobStorage": map[string]bool{"configured": s.config.BlobToken != "" || s.config.MediaDirectory != ""},
		"embeddings":  map[string]bool{"configured": s.config.ReplicateToken != "", "enabled": s.config.EmbeddingsEnabled},
		"sentry":      map[string]bool{"configured": s.config.SentryDSN != ""},
	}})
}
