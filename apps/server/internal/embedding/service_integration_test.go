package embedding

import (
	"context"
	"database/sql"
	"errors"
	"image"
	"image/png"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

// Fixture projections make exact cosine ordering deterministic. The image
// boundary still opens/decodes the real private file; production has no fixture
// engine and model quality is exercised by the separate real-model smoke run.
type fixtureEngine struct{ textError error }

func (e *fixtureEngine) Text(context.Context, string) ([]float32, error) {
	if e.textError != nil {
		return nil, e.textError
	}
	return testVector(0), nil
}
func (e *fixtureEngine) Image(_ context.Context, path string) ([]float32, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if _, err := png.Decode(file); err != nil {
		return nil, err
	}
	return testVector(0), nil
}

func embeddingDatabase(t *testing.T) (*Service, string, *fixtureEngine) {
	t.Helper()
	directory := t.TempDir()
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	media := filepath.Join(directory, "media")
	if err := os.Mkdir(media, 0700); err != nil {
		t.Fatal(err)
	}
	for _, owner := range []string{"owner-a", "owner-b"} {
		execTestSQL(t, db, `INSERT INTO users(id,email,password_hash) VALUES (?1,?2,'test-only-hash')`, owner, owner+"@example.invalid")
	}
	engine := &fixtureEngine{}
	service, err := New(db, Options{Engine: engine, Enabled: true, MediaDirectory: media, CursorSecret: []byte(strings.Repeat("s", 32)), Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	return service, directory, engine
}

func execTestSQL(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), query, args...); err != nil {
		t.Fatal(err)
	}
}

func insertTestAsset(t *testing.T, service *Service, owner, suffix string) string {
	t.Helper()
	id := owner + "-" + suffix
	filename := id + ".png"
	file, err := os.Create(filepath.Join(service.opts.MediaDirectory, filename))
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	execTestSQL(t, service.db, `INSERT INTO assets(id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256) VALUES (?1,?2,?3,?4,'image/png',32,?5)`, id, owner, "/media/"+id, filename, id)
	return id
}

func insertTestReady(t *testing.T, service *Service, owner, asset string, vector []float32, version string) {
	t.Helper()
	data, err := encodeVector(vector)
	if err != nil {
		t.Fatal(err)
	}
	execTestSQL(t, service.db, `INSERT INTO asset_embeddings(asset_id,owner_user_id,model_name,model_version,dim,status,image_embedding) VALUES (?1,?2,?3,?4,?5,'ready',?6)`, asset, owner, modelName, version, inference.Dimension, data)
}

func TestSQLiteSearchFreshIndexOwnerModelFiltersAndCursor(t *testing.T) {
	service, _, _ := embeddingDatabase(t)
	ctx := context.Background()
	foreign := insertTestAsset(t, service, "owner-b", "foreign")
	insertTestReady(t, service, "owner-b", foreign, testVector(0), inference.ModelVersion)
	request := model.SearchRequest{Query: "fixture retrieval", Limit: 1}
	before, err := service.Search(ctx, "owner-a", request)
	if err != nil || before.Total != 0 || len(before.Results) != 0 {
		t.Fatalf("another owner's vector leaked: %+v %v", before, err)
	}
	asset := insertTestAsset(t, service, "owner-a", "fresh")
	execTestSQL(t, service.db, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES (?1,'owner-a')`, asset)
	job, err := service.claimNext(ctx)
	if err != nil || job == nil || job.id != asset {
		t.Fatalf("fresh pending capture not claimable: %+v %v", job, err)
	}
	service.index(ctx, *job)
	after, err := service.Search(ctx, "owner-a", request)
	if err != nil || after.Total != 1 || len(after.Results) != 1 || after.Results[0].ID != asset || after.Results[0].Similarity != 1 || after.Results[0].Relevance != 100 {
		t.Fatalf("new index hidden by cached query or invalid score: %+v %v", after, err)
	}
	second := insertTestAsset(t, service, "owner-a", "second")
	insertTestReady(t, service, "owner-a", second, testVector(0), inference.ModelVersion)
	distractor := insertTestAsset(t, service, "owner-a", "distractor")
	insertTestReady(t, service, "owner-a", distractor, testVector(1), inference.ModelVersion)
	stale := insertTestAsset(t, service, "owner-a", "old-model")
	insertTestReady(t, service, "owner-a", stale, testVector(0), "old-model-version")
	page, err := service.Search(ctx, "owner-a", request)
	if err != nil || page.Total != 2 || !page.HasMore || len(page.Results) != 1 || page.NextCursor == "" {
		t.Fatalf("first cursor page eligibility: %+v %v", page, err)
	}
	next := request
	next.Cursor = page.NextCursor
	last, err := service.Search(ctx, "owner-a", next)
	if err != nil || last.Total != 2 || last.HasMore || len(last.Results) != 1 || last.Results[0].ID == page.Results[0].ID {
		t.Fatalf("tied-distance boundary repeated or skipped: %+v %v", last, err)
	}
	if _, err := service.Search(ctx, "owner-b", next); err == nil {
		t.Fatal("cross-owner cursor accepted")
	}
	next.Limit = 2
	if _, err := service.Search(ctx, "owner-a", next); err == nil {
		t.Fatal("page-size context bypassed")
	}
	favorites := request
	favorites.FavoriteOnly = true
	page, err = service.Search(ctx, "owner-a", favorites)
	if err != nil || page.Total != 0 {
		t.Fatalf("non-favorite matched: %+v %v", page, err)
	}
	execTestSQL(t, service.db, `UPDATE assets SET favorite = 1 WHERE id = ?1 AND owner_user_id = 'owner-a'`, asset)
	execTestSQL(t, service.db, `INSERT INTO tags(id,owner_user_id,name) VALUES ('owned-tag','owner-a','retrieval')`)
	execTestSQL(t, service.db, `INSERT INTO asset_tags(asset_id,tag_id) VALUES (?1,'owned-tag')`, asset)
	tag := "owned-tag"
	favorites.TagID = &tag
	page, err = service.Search(ctx, "owner-a", favorites)
	if err != nil || page.Total != 1 || len(page.Results) != 1 || page.Results[0].ID != asset || len(page.Results[0].Tags) != 1 {
		t.Fatalf("live tag/favorite changes hidden: %+v %v", page, err)
	}
	execTestSQL(t, service.db, `UPDATE assets SET deleted_at = CURRENT_TIMESTAMP WHERE owner_user_id = 'owner-a' AND id IN (?1,?2)`, asset, second)
	page, err = service.Search(ctx, "owner-a", request)
	if err != nil || page.Total != 0 || len(page.Results) != 0 {
		t.Fatalf("trash, stale model or below-threshold results leaked: %+v %v", page, err)
	}
}

func TestSQLiteQueryCacheNeverCrossesOwnerModelOrAvailability(t *testing.T) {
	service, _, engine := embeddingDatabase(t)
	ctx := context.Background()
	request := model.SearchRequest{Query: "cached query", Limit: 1}
	if _, err := service.Search(ctx, "owner-a", request); err != nil {
		t.Fatal(err)
	}
	engine.textError = errors.New("model fixture unavailable")
	if _, err := service.Search(ctx, "owner-b", request); err == nil {
		t.Fatal("another owner's query cache masked failed inference")
	}
	execTestSQL(t, service.db, `UPDATE query_embeddings SET model_version = 'old-model' WHERE user_id = 'owner-a'`)
	if _, err := service.Search(ctx, "owner-a", request); err == nil {
		t.Fatal("stale-model query cache masked failed inference")
	}
	engine.textError = nil
	if _, err := service.Search(ctx, "owner-a", request); err != nil {
		t.Fatal(err)
	}
	disabled, err := New(service.db, Options{CursorSecret: service.opts.CursorSecret})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := disabled.Search(ctx, "owner-a", request); err == nil {
		t.Fatal("cache bypassed disabled inference")
	}
	execTestSQL(t, service.db, `UPDATE query_embeddings SET embedding = zeroblob(2048) WHERE user_id = 'owner-a'`)
	engine.textError = errors.New("model fixture unavailable")
	if _, err := service.Search(ctx, "owner-a", request); err == nil {
		t.Fatal("corrupt zero vector became a synthetic fallback")
	}
}

func TestSQLiteInterruptedClaimsRecoverWithoutStaleCompletionOrInfiniteRetry(t *testing.T) {
	service, directory, _ := embeddingDatabase(t)
	ctx := context.Background()
	asset := insertTestAsset(t, service, "owner-a", "interrupted")
	execTestSQL(t, service.db, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES (?1,'owner-a')`, asset)
	stale, err := service.claimNext(ctx)
	if err != nil || stale == nil {
		t.Fatalf("claim: %+v %v", stale, err)
	}
	execTestSQL(t, service.db, `UPDATE asset_embeddings SET processing_until = ?1 WHERE asset_id = ?2`, time.Now().UTC().Add(-time.Second), asset)
	if err := service.db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	service, err = New(db, service.opts)
	if err != nil {
		t.Fatal(err)
	}
	current, err := service.claimNext(ctx)
	if err != nil || current == nil || current.id != asset || current.token == stale.token || current.attempts != 2 {
		t.Fatalf("restart did not recover bounded claim: %+v %v", current, err)
	}
	if applied, err := service.complete(ctx, *stale, testVector(0)); err != nil || applied {
		t.Fatalf("stale completion overwrote reclaimed claim: %v %v", applied, err)
	}
	if err := service.fail(ctx, *stale, errors.New("late failure")); err != nil {
		t.Fatal(err)
	}
	state, err := service.Status(ctx, "owner-a", asset)
	if err != nil || state.Status != "processing" || state.AttemptCount != 2 {
		t.Fatalf("stale failure damaged current claim: %+v %v", state, err)
	}
	if err := service.fail(ctx, *current, errors.New("inference failed")); err != nil {
		t.Fatal(err)
	}
	if applied, err := service.complete(ctx, *current, testVector(0)); err != nil || applied {
		t.Fatalf("settled failure resurrected by completion: %v %v", applied, err)
	}
	if job, err := service.claimNext(ctx); err != nil || job != nil {
		t.Fatalf("automatic retry bypassed backoff: %+v %v", job, err)
	}
	if err := service.Retry(ctx, "owner-b", asset); err == nil {
		t.Fatal("foreign owner retried asset")
	}
	if err := service.Retry(ctx, "owner-a", asset); err == nil {
		t.Fatal("manual retry bypassed scheduled backoff")
	}
	execTestSQL(t, db, `UPDATE asset_embeddings SET next_attempt_at = ?1 WHERE asset_id = ?2`, time.Now().UTC().Add(-time.Second), asset)
	last, err := service.claimNext(ctx)
	if err != nil || last == nil || last.attempts != maxAttempts {
		t.Fatalf("final attempt not claimable: %+v %v", last, err)
	}
	if err := service.fail(ctx, *last, errors.New("inference failed")); err != nil {
		t.Fatal(err)
	}
	state, err = service.Status(ctx, "owner-a", asset)
	if err != nil || state.Status != "failed" || state.AttemptCount != maxAttempts || state.TerminalAt == nil || state.NextAttemptAt != nil {
		t.Fatalf("automatic retry did not terminate: %+v %v", state, err)
	}
	if job, err := service.claimNext(ctx); err != nil || job != nil {
		t.Fatalf("terminal failure resubmitted: %+v %v", job, err)
	}
	if err := service.Retry(ctx, "owner-a", asset); err != nil {
		t.Fatal(err)
	}
	revived, err := service.claimNext(ctx)
	if err != nil || revived == nil || revived.attempts != 1 {
		t.Fatalf("explicit retry failed to rearm bounded cycle: %+v %v", revived, err)
	}
	if applied, err := service.complete(ctx, *revived, testVector(0)); err != nil || !applied {
		t.Fatalf("current claim not completed: %v %v", applied, err)
	}
	finalAsset := insertTestAsset(t, service, "owner-a", "final-interrupted")
	execTestSQL(t, db, `INSERT INTO asset_embeddings(asset_id,owner_user_id,status,processing_token,processing_until,attempts) VALUES (?1,'owner-a','processing','dead-final-worker',?2,?3)`, finalAsset, time.Now().UTC().Add(-time.Second), maxAttempts)
	if job, err := service.claimNext(ctx); err != nil || job != nil {
		t.Fatalf("final abandoned attempt replenished its budget: %+v %v", job, err)
	}
	state, err = service.Status(ctx, "owner-a", finalAsset)
	if err != nil || state.Status != "failed" || state.AttemptCount != maxAttempts {
		t.Fatalf("final abandoned attempt not terminal: %+v %v", state, err)
	}
}

func TestSQLiteConcurrentExecutorsClaimDistinctAssets(t *testing.T) {
	service, _, _ := embeddingDatabase(t)
	ctx := context.Background()
	for _, suffix := range []string{"one", "two"} {
		id := insertTestAsset(t, service, "owner-a", suffix)
		execTestSQL(t, service.db, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES (?1,'owner-a')`, id)
	}
	type result struct {
		job *claim
		err error
	}
	results := make(chan result, 2)
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() { defer group.Done(); job, err := service.claimNext(ctx); results <- result{job, err} }()
	}
	group.Wait()
	first, second := <-results, <-results
	if first.err != nil || second.err != nil || first.job == nil || second.job == nil || first.job.id == second.job.id {
		t.Fatalf("concurrent claims overlapped: %+v %+v", first, second)
	}
	if job, err := service.claimNext(ctx); err != nil || job != nil {
		t.Fatalf("live leased work reclaimed: %+v %v", job, err)
	}
	execTestSQL(t, service.db, `UPDATE assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?1`, first.job.id)
	if applied, err := service.complete(ctx, *first.job, testVector(0)); err != nil || applied {
		t.Fatalf("deleted media acquired a ready vector: %v %v", applied, err)
	}
}

func TestSQLiteExecutorRecoversMissingIntentsAndChangedModel(t *testing.T) {
	service, _, _ := embeddingDatabase(t)
	missing := insertTestAsset(t, service, "owner-a", "missing-intent")
	stale := insertTestAsset(t, service, "owner-a", "previous-model")
	insertTestReady(t, service, "owner-a", stale, testVector(1), "previous-model")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	done := make(chan error, 1)
	go func() { done <- service.Run(ctx) }()
	defer func() {
		cancel()
		select {
		case err := <-done:
			if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
				t.Errorf("executor shutdown: %v", err)
			}
		case <-time.After(time.Second):
			t.Error("executor did not release its lifecycle after cancellation")
		}
	}()
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		page, err := service.Search(ctx, "owner-a", model.SearchRequest{Query: "new model query", Limit: 10})
		if err == nil && page.Total == 2 {
			found := map[string]bool{}
			for _, asset := range page.Results {
				found[asset.ID] = true
			}
			if !found[missing] || !found[stale] {
				t.Fatalf("recovered indexing lost an owned asset: %+v", page)
			}
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("new and re-indexed media never became searchable: %+v %v", page, err)
		case <-ticker.C:
		}
	}
}

func TestSQLiteRestoredTrashBecomesSearchableAfterModelReconciliation(t *testing.T) {
	service, _, _ := embeddingDatabase(t)
	ctx := context.Background()
	ownedLibrary := library.New(service.db, service.opts.CursorSecret)
	stale := insertTestAsset(t, service, "owner-a", "trashed-previous-model")
	missing := insertTestAsset(t, service, "owner-a", "trashed-missing-intent")
	insertTestReady(t, service, "owner-a", stale, testVector(1), "previous-model")
	for _, id := range []string{stale, missing} {
		if err := ownedLibrary.Delete(ctx, "owner-a", id); err != nil {
			t.Fatal(err)
		}
	}
	// Startup reconciliation happens while both assets are still in trash.
	if err := service.prepareQueue(ctx); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{stale, missing} {
		if _, err := ownedLibrary.Restore(ctx, "owner-a", id); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		job, err := service.claimNext(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if job == nil {
			break
		}
		service.index(ctx, *job)
	}
	page, err := service.Search(ctx, "owner-a", model.SearchRequest{Query: "restored media", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 {
		t.Fatalf("restored media must become searchable without a manual retry or another restart: %+v", page)
	}
	found := map[string]bool{}
	for _, asset := range page.Results {
		found[asset.ID] = true
	}
	if !found[stale] || !found[missing] {
		t.Fatalf("restored search omitted retained media: %+v", page)
	}
}

func TestSQLiteModelInitializationTransitionsPreservePendingWork(t *testing.T) {
	original, _, engine := embeddingDatabase(t)
	ctx := context.Background()
	request := model.SearchRequest{Query: "existing cached query", Limit: 10}
	if _, err := original.Search(ctx, "owner-a", request); err != nil {
		t.Fatal(err)
	}
	asset := insertTestAsset(t, original, "owner-a", "waiting-for-model")
	execTestSQL(t, original.db, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES (?1,'owner-a')`, asset)
	opts := original.opts
	opts.Engine = nil
	service, err := New(original.db, opts)
	if err != nil {
		t.Fatal(err)
	}
	assertUnavailable := func(state, code string, retryable bool) {
		t.Helper()
		if status := service.ModelStatus(); status != state {
			t.Fatalf("model status = %s, want %s", status, state)
		}
		for _, err := range []error{
			func() error { _, err := service.Search(ctx, "owner-a", request); return err }(),
			service.Run(ctx),
			service.Retry(ctx, "owner-a", asset),
		} {
			var api *model.APIError
			if !errors.As(err, &api) || api.Status != 503 || api.Code != code || api.Retryable != retryable {
				t.Fatalf("%s allowed unavailable inference or advertised a false retry: %v", state, err)
			}
		}
		status, err := service.Status(ctx, "owner-a", asset)
		if err != nil || status.Status != "pending" || status.AttemptCount != 0 {
			t.Fatalf("model preparation consumed saved work: %+v %v", status, err)
		}
	}
	assertUnavailable("loading", "embedding_loading", true)
	service.MarkUnavailable()
	assertUnavailable("unavailable", "embedding_unavailable", false)
	if err := service.SetEngine(nil); err == nil {
		t.Fatal("nil engine activated search")
	}
	if err := service.SetEngine(engine); err != nil {
		t.Fatal(err)
	}
	if service.ModelStatus() != "ready" {
		t.Fatal("real engine activation did not enable inference")
	}
	if err := service.SetEngine(&fixtureEngine{textError: errors.New("replacement must not be installed")}); err == nil {
		t.Fatal("engine replacement bypassed native lifetime ownership")
	}
	workerCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	done := make(chan error, 1)
	go func() { done <- service.Run(workerCtx) }()
	defer func() {
		cancel()
		if err := <-done; err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("executor shutdown: %v", err)
		}
	}()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		status, err := service.Status(workerCtx, "owner-a", asset)
		if err == nil && status.Status == "ready" {
			break
		}
		select {
		case <-workerCtx.Done():
			t.Fatalf("activation did not resume pending work: %+v %v", status, err)
		case <-ticker.C:
		}
	}
	request.Query = "query after activation"
	page, err := service.Search(workerCtx, "owner-a", request)
	if err != nil || page.Total != 1 || len(page.Results) != 1 || page.Results[0].ID != asset {
		t.Fatalf("activated native engine did not make retained work searchable: %+v %v", page, err)
	}
	disabled, err := New(service.db, Options{CursorSecret: service.opts.CursorSecret})
	if err != nil {
		t.Fatal(err)
	}
	if err := disabled.SetEngine(engine); err == nil {
		t.Fatal("configuration-disabled service was activated")
	}
	disabled.MarkUnavailable()
	if disabled.ModelStatus() != "disabled" {
		t.Fatal("preparation failure changed disabled configuration")
	}
	if _, err := disabled.Search(ctx, "owner-a", request); err == nil {
		t.Fatal("cached native output bypassed disabled configuration")
	}
}

type gatedEngine struct {
	fixtureEngine
	entered chan string
	proceed chan struct{}
}

func (e *gatedEngine) await(ctx context.Context, kind string) error {
	select {
	case e.entered <- kind:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-e.proceed:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (e *gatedEngine) Text(ctx context.Context, query string) ([]float32, error) {
	if err := e.await(ctx, "text"); err != nil {
		return nil, err
	}
	return e.fixtureEngine.Text(ctx, query)
}

func (e *gatedEngine) Image(ctx context.Context, path string) ([]float32, error) {
	if err := e.await(ctx, "image"); err != nil {
		return nil, err
	}
	return e.fixtureEngine.Image(ctx, path)
}

func TestSQLiteQueuedSearchRunsBeforeNextIndexClaim(t *testing.T) {
	original, _, _ := embeddingDatabase(t)
	engine := &gatedEngine{entered: make(chan string, 3), proceed: make(chan struct{})}
	opts := original.opts
	opts.Engine = engine
	service, err := New(original.db, opts)
	if err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"first", "second"} {
		insertTestAsset(t, service, "owner-a", suffix)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	done := make(chan error, 1)
	go func() { done <- service.Run(ctx) }()
	defer func() {
		cancel()
		if err := <-done; err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("executor shutdown: %v", err)
		}
	}()
	nextExecution := func() string {
		t.Helper()
		select {
		case kind := <-engine.entered:
			return kind
		case <-ctx.Done():
			t.Fatal("native execution never started")
			return ""
		}
	}
	proceed := func() {
		t.Helper()
		select {
		case engine.proceed <- struct{}{}:
		case <-ctx.Done():
			t.Fatal("native execution did not reach its barrier")
		}
	}
	if kind := nextExecution(); kind != "image" {
		t.Fatalf("initial backlog did not start: %s", kind)
	}
	searchDone := make(chan error, 1)
	go func() {
		_, err := service.Search(ctx, "owner-a", model.SearchRequest{Query: "interactive query", Limit: 10})
		searchDone <- err
	}()
	defer func() {
		cancel()
		if searchDone != nil {
			<-searchDone
		}
	}()
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		service.compute.mu.Lock()
		queued := service.compute.queryCount > 0
		service.compute.mu.Unlock()
		if queued {
			break
		}
		select {
		case err := <-searchDone:
			searchDone = nil
			t.Fatalf("interactive query was rejected instead of queued: %v", err)
		case <-ctx.Done():
			t.Fatal("interactive query never entered admission")
		case <-ticker.C:
		}
	}
	proceed()
	if kind := nextExecution(); kind != "text" {
		t.Fatalf("backlog overtook an already queued query: %s", kind)
	}
	proceed()
	if err := <-searchDone; err != nil {
		searchDone = nil
		t.Fatalf("admitted query failed: %v", err)
	}
	searchDone = nil
	if kind := nextExecution(); kind != "image" {
		t.Fatalf("indexing did not resume after interactive work: %s", kind)
	}
}
