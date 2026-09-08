package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

// This test exercises the migrated tables and triggers, not a substitute SQL
// schema. The opt-in requires an EMPTY, disposable loopback DATABASE_URL. Main's
// integration gate owns migration and execution; it must report absent DB proof.
func TestPostgresEmbeddingInvariants(t *testing.T) {
	if os.Getenv("SPLOOT_EMBEDDING_DB_TESTS") != "1" {
		t.Skip("DB path unverified: set SPLOOT_EMBEDDING_DB_TESTS=1 with empty migrated loopback DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	configuration, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil || os.Getenv("DATABASE_URL") == "" {
		t.Fatal("DATABASE_URL must point to an empty disposable migrated database")
	}
	host := configuration.ConnConfig.Host
	if host != "localhost" && (net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback()) {
		t.Fatal("embedding DB regressions refuse a non-loopback database")
	}
	configuration.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	pool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var occupied bool
	err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM assets)
		OR EXISTS(SELECT 1 FROM embedding_rate_buckets) OR EXISTS(SELECT 1 FROM embedding_rate_leases)
		OR EXISTS(SELECT 1 FROM cost_admission_counters) OR EXISTS(SELECT 1 FROM embedding_provider_circuits)`).Scan(&occupied)
	if err != nil {
		t.Fatal(err)
	}
	if occupied {
		t.Fatal("embedding DB regressions require an empty, exclusively owned database; refusing to modify existing state")
	}
	owners := []string{"embedding-test-owner-a", "embedding-test-owner-b", "embedding-test-owner-budget", "embedding-test-owner-worker"}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		for _, query := range []string{`DELETE FROM embedding_rate_leases`, `DELETE FROM embedding_rate_buckets`, `DELETE FROM cost_admission_counters`, `DELETE FROM embedding_provider_circuits`} {
			if _, err := pool.Exec(cleanup, query); err != nil {
				t.Errorf("cleaning owned admission fixtures: %v", err)
			}
		}
		if _, err := pool.Exec(cleanup, `DELETE FROM users WHERE id=ANY($1::text[])`, owners); err != nil {
			t.Errorf("cleaning owned accounts: %v", err)
		}
		if _, err := pool.Exec(cleanup, `DELETE FROM text_embedding_cache WHERE key=ANY($1::text[])`, []string{queryCacheKey("fixture retrieval"), queryCacheKey("provider query"), queryCacheKey("final permitted query"), queryCacheKey("denied novel query"), queryCacheKey("last account query")}); err != nil {
			t.Errorf("cleaning owned query fixtures: %v", err)
		}
	}()
	for _, owner := range owners {
		execTestSQL(t, ctx, pool, `INSERT INTO users(id,email,"updatedAt") VALUES($1,$2,CURRENT_TIMESTAMP)`, owner, owner+"@example.invalid")
	}

	var providerPosts atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/predictions" {
			t.Errorf("unexpected provider operation %s %s", r.Method, r.URL.Path)
		}
		providerPosts.Add(1)
		json.NewEncoder(w).Encode(map[string]any{"id": "fixture-prediction", "status": "succeeded", "output": map[string]any{"embedding": testVector(0)}})
	}))
	defer provider.Close()
	mediaDirectory := t.TempDir()
	service, err := New(pool, Options{ReplicateToken: "test-provider-token", Enabled: true, MediaDirectory: mediaDirectory, Environment: "test", CursorSecret: []byte("postgres-context-regression-secret"), Logger: slog.New(slog.NewTextHandler(os.Stdout, nil))})
	if err != nil {
		t.Fatal(err)
	}
	service.http = providerTestClient(t, provider.URL)
	cachedOnly, err := New(pool, Options{CursorSecret: service.opts.CursorSecret, Logger: service.opts.Logger})
	if err != nil {
		t.Fatal(err)
	}
	cacheData, _ := json.Marshal(testVector(0))
	execTestSQL(t, ctx, pool, `INSERT INTO text_embedding_cache(key,model,embedding,expires_at) VALUES($1,$2,$3::jsonb,CURRENT_TIMESTAMP+INTERVAL '1 day')`, queryCacheKey("fixture retrieval"), contract.EmbeddingModel, string(cacheData))
	request := model.SearchRequest{Query: "fixture retrieval", Limit: 1}

	t.Run("fresh-save-owner-and-filter-visibility", func(t *testing.T) {
		other := insertTestAsset(t, ctx, pool, owners[1], "other-owner")
		insertTestReady(t, ctx, pool, other, testVector(0), contract.EmbeddingModel)
		before, err := cachedOnly.Search(ctx, owners[0], request)
		if err != nil || before.Total != 0 || len(before.Results) != 0 {
			t.Fatalf("another owner's vector leaked: %+v %v", before, err)
		}
		capture, err := ingest.New(pool, ingest.Options{MediaDirectory: mediaDirectory, Environment: "test", UploadsEnabled: true, Logger: service.opts.Logger})
		if err != nil {
			t.Fatal(err)
		}
		var original bytes.Buffer
		if err := png.Encode(&original, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
			t.Fatal(err)
		}
		saved, err := capture.Save(ctx, owners[0], ingest.Input{Filename: "fresh-save.png", MIME: "image/png", Reader: bytes.NewReader(original.Bytes()), IdempotencyKey: model.NewID()})
		if err != nil || saved.Asset == nil {
			t.Fatalf("fresh capture failed: %+v %v", saved, err)
		}
		asset := saved.Asset.ID
		job, err := service.claimNext(ctx)
		if err != nil || job == nil || job.id != asset {
			t.Fatalf("fresh pending save not immediately discovered: %+v %v", job, err)
		}
		if delay := service.index(ctx, *job); delay != 0 {
			t.Fatalf("new save deferred unexpectedly: %s", delay)
		}
		after, err := cachedOnly.Search(ctx, owners[0], request)
		if err != nil || after.Total != 1 || len(after.Results) != 1 || after.Results[0].ID != asset {
			t.Fatalf("freshly indexed save invisible to identical cached query: %+v %v", after, err)
		}
		if after.Results[0].Similarity != 1 || after.Results[0].Relevance != 100 {
			t.Fatalf("public similarity/relevance units changed: %+v", after.Results[0])
		}
		favorites := request
		favorites.FavoriteOnly = true
		page, err := cachedOnly.Search(ctx, owners[0], favorites)
		if err != nil || page.Total != 0 {
			t.Fatalf("non-favorite matched favorites filter: %+v %v", page, err)
		}
		execTestSQL(t, ctx, pool, `UPDATE assets SET favorite=true WHERE id=$1`, asset)
		page, err = cachedOnly.Search(ctx, owners[0], favorites)
		if err != nil || len(page.Results) != 1 || page.Results[0].ID != asset {
			t.Fatalf("favorite change hidden by stale search results: %+v %v", page, err)
		}
		tag := "embedding-test-tag"
		execTestSQL(t, ctx, pool, `INSERT INTO tags(id,owner_user_id,name,"updatedAt") VALUES($1,$2,'retrieval',CURRENT_TIMESTAMP)`, tag, owners[0])
		execTestSQL(t, ctx, pool, `INSERT INTO asset_tags(asset_id,tag_id) VALUES($1,$2)`, asset, tag)
		favorites.TagID = &tag
		page, err = cachedOnly.Search(ctx, owners[0], favorites)
		if err != nil || page.Total != 1 || len(page.Results) != 1 {
			t.Fatalf("owned tag+favorite filter failed: %+v %v", page, err)
		}
		second := insertTestAsset(t, ctx, pool, owners[0], "second-match")
		insertTestReady(t, ctx, pool, second, testVector(0), contract.EmbeddingModel)
		distractor := insertTestAsset(t, ctx, pool, owners[0], "below-threshold")
		insertTestReady(t, ctx, pool, distractor, testVector(1), contract.EmbeddingModel)
		wrongModel := insertTestAsset(t, ctx, pool, owners[0], "different-model")
		insertTestReady(t, ctx, pool, wrongModel, testVector(0), "another-model")
		page, err = cachedOnly.Search(ctx, owners[0], request)
		if err != nil || page.Total != 2 || !page.HasMore || len(page.Results) != 1 || page.NextCursor == "" {
			t.Fatalf("first cursor page violated eligibility: %+v %v", page, err)
		}
		next := request
		next.Cursor = page.NextCursor
		last, err := cachedOnly.Search(ctx, owners[0], next)
		if err != nil || last.Total != 2 || last.HasMore || len(last.Results) != 1 || last.Results[0].ID == page.Results[0].ID {
			t.Fatalf("tied-distance cursor repeated or omitted a match: %+v %v", last, err)
		}
		if _, err = cachedOnly.Search(ctx, owners[1], next); err == nil {
			t.Fatal("cross-owner cursor reached search")
		}
		next.Limit = 2
		if _, err = cachedOnly.Search(ctx, owners[0], next); err == nil {
			t.Fatal("page-size cursor context bypassed")
		}
		execTestSQL(t, ctx, pool, `UPDATE assets SET deleted_at=CURRENT_TIMESTAMP WHERE id=ANY($1::text[])`, []string{asset, second})
		page, err = cachedOnly.Search(ctx, owners[0], request)
		if err != nil || page.Total != 0 || len(page.Results) != 0 {
			t.Fatalf("deleted or below-threshold vectors padded results: %+v %v", page, err)
		}
		if _, err = cachedOnly.Search(ctx, owners[0], model.SearchRequest{Query: "novel uncached query", Limit: 1}); err == nil {
			t.Fatal("novel query fabricated an embedding without credentials")
		}
	})
	if t.Failed() {
		return
	}

	t.Run("failed-and-reclaimed-worker-completion", func(t *testing.T) {
		asset := insertTestAsset(t, ctx, pool, owners[3], "abandoned-attempt")
		stale := claim{id: asset, owner: owners[3], token: "dead-worker-token"}
		execTestSQL(t, ctx, pool, `INSERT INTO asset_embeddings(asset_id,model_name,model_version,dim,status,processing_claim_token,attempt_count,"updatedAt")
			VALUES($1,'pending','pending',0,'processing',$2,1,CURRENT_TIMESTAMP-INTERVAL '11 minutes')`, asset, stale.token)
		current, err := service.claimNext(ctx)
		if err != nil || current == nil || current.id != asset || current.token == stale.token {
			t.Fatalf("crashed claim not reclaimed: %+v %v", current, err)
		}
		reservation, err := service.reserve(ctx, current.owner, "embedding_index", current)
		if err != nil {
			t.Fatal(err)
		}
		service.release(reservation)
		if applied, err := service.complete(ctx, stale, testVector(0)); err != nil || applied {
			t.Fatalf("old worker overwrote reclaimed claim: %v %v", applied, err)
		}
		if err := service.fail(ctx, stale, &providerError{reason: "provider_unavailable", retryAfter: 30}); err != nil {
			t.Fatal(err)
		}
		state, err := service.Status(ctx, current.owner, asset)
		if err != nil || state.Status != "processing" || state.AttemptCount != 2 {
			t.Fatalf("stale failure damaged current generation: %+v %v", state, err)
		}
		if err = service.fail(ctx, *current, &providerError{reason: "provider_unavailable", retryAfter: 30}); err != nil {
			t.Fatal(err)
		}
		if applied, err := service.complete(ctx, *current, testVector(0)); err != nil || applied {
			t.Fatalf("completion resurrected a settled failure: %v %v", applied, err)
		}
		state, err = service.Status(ctx, current.owner, asset)
		if err != nil || state.Status != "pending" || state.AttemptCount != 2 || state.NextAttemptAt == nil {
			t.Fatalf("failed paid attempt not retained: %+v %v", state, err)
		}
		execTestSQL(t, ctx, pool, `UPDATE asset_embeddings SET next_attempt_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE asset_id=$1`, asset)
		newest, err := service.claimNext(ctx)
		if err != nil || newest == nil {
			t.Fatalf("bounded retry not discoverable: %v", err)
		}
		reservation, err = service.reserve(ctx, newest.owner, "embedding_index", newest)
		if err != nil {
			t.Fatal(err)
		}
		service.release(reservation)
		if err = service.fail(ctx, *newest, &providerError{reason: "provider_unavailable", retryAfter: 30}); err != nil {
			t.Fatal(err)
		}
		state, err = service.Status(ctx, newest.owner, asset)
		if err != nil || state.Status != "failed" || state.AttemptCount != maxAttempts || state.TerminalAt == nil || state.NextAttemptAt != nil {
			t.Fatalf("third failure not terminal: %+v %v", state, err)
		}
		if err = service.Retry(ctx, owners[1], asset); err == nil {
			t.Fatal("another owner revived terminal asset")
		}
		if err = service.Retry(ctx, newest.owner, asset); err == nil {
			t.Fatal("terminal quarantine bypassed")
		}
		execTestSQL(t, ctx, pool, `UPDATE asset_embeddings SET terminal_at=CURRENT_TIMESTAMP-INTERVAL '16 minutes' WHERE asset_id=$1`, asset)
		if err = service.Retry(ctx, newest.owner, asset); err != nil {
			t.Fatal(err)
		}
		state, err = service.Status(ctx, newest.owner, asset)
		if err != nil || state.ReviveCount != 1 || state.AttemptCount != 0 || state.TerminalAt != nil {
			t.Fatalf("database revival trigger was not preserved: %+v %v", state, err)
		}
		revived, err := service.claimNext(ctx)
		if err != nil || revived == nil {
			t.Fatalf("revived asset not claimable: %v", err)
		}
		if err = service.fail(ctx, *revived, apiError(422, "Invalid media", "embedding_media_invalid", 0)); err != nil {
			t.Fatal(err)
		}
		execTestSQL(t, ctx, pool, `UPDATE asset_embeddings SET terminal_at=CURRENT_TIMESTAMP-INTERVAL '16 minutes' WHERE asset_id=$1`, asset)
		if err = service.Retry(ctx, newest.owner, asset); err == nil {
			t.Fatal("second lifetime revival accepted")
		}

		finalAsset := insertTestAsset(t, ctx, pool, owners[3], "crashed-final-attempt")
		execTestSQL(t, ctx, pool, `INSERT INTO asset_embeddings(asset_id,model_name,model_version,dim,status,processing_claim_token,attempt_count,"updatedAt")
			VALUES($1,'pending','pending',0,'processing','dead-final-worker',3,CURRENT_TIMESTAMP-INTERVAL '11 minutes')`, finalAsset)
		before := providerPosts.Load()
		if job, err := service.claimNext(ctx); err != nil || job != nil {
			t.Fatalf("final crashed attempt reclaimed paid capacity: %+v %v", job, err)
		}
		state, err = service.Status(ctx, owners[3], finalAsset)
		if err != nil || state.TerminalAt == nil || state.AttemptCount != 3 || providerPosts.Load() != before {
			t.Fatalf("claim death replenished attempt budget: %+v %v", state, err)
		}
	})
	if t.Failed() {
		return
	}

	t.Run("account-cost-budget-does-not-open-global-circuit", func(t *testing.T) {
		execTestSQL(t, ctx, pool, `INSERT INTO cost_admission_counters(key,count,expires_at,updated_at)
			VALUES('cost:embedding_query:acct:'||$1||':daily:'||to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD'),$2,CURRENT_TIMESTAMP+INTERVAL '26 hours',CURRENT_TIMESTAMP)`,
			owners[1], contract.EmbeddingUserDailyAttempts-1)
		before := providerPosts.Load()
		if _, err := service.Search(ctx, owners[1], model.SearchRequest{Query: "last account query", Limit: 1}); err != nil {
			t.Fatalf("last account attempt denied: %v", err)
		}
		_, err := service.Search(ctx, owners[1], model.SearchRequest{Query: "account denied query", Limit: 1})
		var denied *model.APIError
		if !errors.As(err, &denied) || denied.Code != "user_daily_budget" || providerPosts.Load() != before+1 {
			t.Fatalf("account spend ceiling failed before provider: %v", err)
		}
		var open bool
		if err := pool.QueryRow(ctx, `SELECT open_until IS NOT NULL AND open_until>CURRENT_TIMESTAMP FROM embedding_provider_circuits WHERE key=$1`, providerCircuitKey).Scan(&open); err != nil || open {
			t.Fatalf("one account's budget blocked every owner: %v", err)
		}
	})
	if t.Failed() {
		return
	}

	t.Run("provider-budget-boundary-and-cache", func(t *testing.T) {
		// Expired process leases must recover concurrency without refunds of
		// already spent attempts or any in-memory limiter authority.
		execTestSQL(t, ctx, pool, `INSERT INTO embedding_rate_leases(id,user_id,expires_at) VALUES('expired-owner-lease',$1,CURRENT_TIMESTAMP-INTERVAL '1 second')`, owners[2])
		before := providerPosts.Load()
		if _, err := service.Search(ctx, owners[2], model.SearchRequest{Query: "provider query", Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if providerPosts.Load() != before+1 {
			t.Fatal("novel query did not submit one provider prediction")
		}
		if _, err := cachedOnly.Search(ctx, owners[2], model.SearchRequest{Query: "PROVIDER  QUERY", Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if providerPosts.Load() != before+1 {
			t.Fatal("Postgres-cached query consumed provider capacity")
		}
		execTestSQL(t, ctx, pool, `UPDATE embedding_rate_buckets SET count=$1 WHERE key='embedding:daily:'||to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD')`, contract.EmbeddingGlobalDailyAttempts-1)
		if _, err := service.Search(ctx, owners[2], model.SearchRequest{Query: "final permitted query", Limit: 1}); err != nil {
			t.Fatalf("last allowed attempt was denied: %v", err)
		}
		_, err := service.Search(ctx, owners[2], model.SearchRequest{Query: "denied novel query", Limit: 1})
		var public *model.APIError
		if !errors.As(err, &public) || public.Code != "daily_budget" {
			t.Fatalf("attempt beyond daily ceiling not denied by budget: %v", err)
		}
		if providerPosts.Load() != before+2 {
			t.Fatal("budget denial submitted a billable provider request")
		}
		if _, err := cachedOnly.Search(ctx, owners[2], model.SearchRequest{Query: "provider query", Limit: 1}); err != nil {
			t.Fatalf("global circuit blocked a committed cache hit: %v", err)
		}
		var count int
		if err := pool.QueryRow(ctx, `SELECT count FROM embedding_rate_buckets WHERE key='embedding:daily:'||to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD')`).Scan(&count); err != nil || count != contract.EmbeddingGlobalDailyAttempts {
			t.Fatalf("daily reservation exceeded or lost ceiling: %d %v", count, err)
		}
		if _, err := pool.Exec(ctx, `UPDATE embedding_rate_buckets SET count=count+1 WHERE key='embedding:daily:'||to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD')`); err == nil {
			t.Fatal("database attempt ceiling constraint absent")
		}
	})
}

func execTestSQL(t *testing.T, ctx context.Context, pool *pgxpool.Pool, query string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(ctx, query, args...); err != nil {
		t.Fatal(err)
	}
}

func insertTestAsset(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner, suffix string) string {
	t.Helper()
	id := "embedding-test-" + suffix
	execTestSQL(t, ctx, pool, `INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256,"updatedAt")
		VALUES($1,$2,$3,$4,'image/png',32,$5,CURRENT_TIMESTAMP)`, id, owner, "https://embedding-test.public.blob.vercel-storage.com/"+id+".png", id+".png", digest(id))
	return id
}

func insertTestReady(t *testing.T, ctx context.Context, pool *pgxpool.Pool, asset string, vector []float64, embeddingModel string) {
	t.Helper()
	execTestSQL(t, ctx, pool, `INSERT INTO asset_embeddings(asset_id,model_name,model_version,dim,status,image_embedding,"completedAt","updatedAt")
		VALUES($1,$2,$2,$3,'ready',$4::vector,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, asset, embeddingModel, contract.EmbeddingDimension, vectorSQL(vector))
}

func TestAttemptOptionsCannotRaisePolicy(t *testing.T) {
	for _, test := range []struct {
		name string
		opts Options
	}{
		{"global-day", Options{GlobalDailyAttempts: contract.EmbeddingGlobalDailyAttempts + 1}},
		{"global-month", Options{GlobalMonthlyAttempts: contract.EmbeddingGlobalMonthlyAttempts + 1}},
		{"user-day", Options{UserDailyAttempts: contract.EmbeddingUserDailyAttempts + 1}},
		{"user-month", Options{UserMonthlyAttempts: contract.EmbeddingUserMonthlyAttempts + 1}},
	} {
		t.Run(test.name, func(t *testing.T) {
			test.opts.CursorSecret = []byte("policy-boundary-test-secret")
			if _, err := New(&pgxpool.Pool{}, test.opts); err == nil {
				t.Fatal(fmt.Sprintf("%s policy was raised without authority", test.name))
			}
		})
	}
}
