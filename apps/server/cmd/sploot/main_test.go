package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/config"
	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/httpapi"
	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type startupFixture struct {
	app      *httpapi.Server
	db       *sql.DB
	listener net.Listener
	config   config.Config
	logger   *slog.Logger
	session  auth.Session
	client   *http.Client
	original []byte
	assetID  string
}

func newStartupFixture(t *testing.T, enabled bool) *startupFixture {
	t.Helper()
	directory := filepath.Join(t.TempDir(), "library")
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	cfg := config.Config{
		Address: listener.Addr().String(), BaseURL: "http://" + listener.Addr().String(),
		DataDirectory: directory, MediaDirectory: filepath.Join(directory, "media"),
		ModelDirectory: filepath.Join(directory, "models"), Environment: "test", Revision: "startup-test",
		CursorSecret: []byte(strings.Repeat("s", 32)), EmbeddingsEnabled: enabled, RegistrationOpen: true,
	}
	authentication, err := auth.New(db, auth.Options{BaseURL: cfg.BaseURL, RegistrationOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	register := httptest.NewRequest(http.MethodPost, cfg.BaseURL+"/api/auth/register", nil)
	register.Header.Set("Origin", cfg.BaseURL)
	register.RemoteAddr = "127.0.0.1:12345"
	session, err := authentication.Register(register, "startup@example.invalid", "correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	var original bytes.Buffer
	if err := png.Encode(&original, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	capture, err := ingest.New(db, ingest.Options{MediaDirectory: cfg.MediaDirectory, Environment: "test", UploadsEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	defer capture.Close()
	retained, err := capture.Save(context.Background(), session.User.ID, ingest.Input{Reader: bytes.NewReader(original.Bytes()), MIME: "image/png", Filename: "retained.png"})
	if err != nil || retained.Asset == nil {
		t.Fatalf("save retained startup fixture: %v", err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := httpapi.New(cfg, db, logger, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	client := &http.Client{Timeout: 5 * time.Second}
	t.Cleanup(client.CloseIdleConnections)
	return &startupFixture{app: app, db: db, listener: listener, config: cfg, logger: logger, session: session, client: client, original: original.Bytes(), assetID: retained.Asset.ID}
}

type runningStartup struct {
	cancel context.CancelFunc
	done   chan error
	joined bool
}

func (f *startupFixture) start(t *testing.T, prepare func(context.Context) (nativeEngine, error)) *runningStartup {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	running := &runningStartup{cancel: cancel, done: make(chan error, 1)}
	go func() { running.done <- serve(ctx, f.listener, f.app, f.config, f.logger, prepare) }()
	t.Cleanup(func() {
		cancel()
		running.join(t)
	})
	return running
}

func (r *runningStartup) join(t *testing.T) {
	t.Helper()
	if r.joined {
		return
	}
	select {
	case err := <-r.done:
		r.joined = true
		if err != nil {
			t.Errorf("startup lifecycle shutdown: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("startup lifecycle did not join its owned work")
	}
}

func (f *startupFixture) request(t *testing.T, method, path, body string) *http.Request {
	t.Helper()
	request, err := http.NewRequest(method, f.config.BaseURL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: f.session.Token})
	request.Header.Set("Origin", f.config.BaseURL)
	request.Header.Set("Content-Type", "application/json")
	return request
}

func (f *startupFixture) read(t *testing.T, method, path, body string) (int, []byte) {
	t.Helper()
	response, err := f.client.Do(f.request(t, method, path, body))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, data
}

func (f *startupFixture) assertRetainedLibrary(t *testing.T) {
	t.Helper()
	status, data := f.read(t, http.MethodGet, "/api/assets/"+f.assetID, "")
	var response struct {
		Asset model.Asset `json:"asset"`
	}
	if err := json.Unmarshal(data, &response); err != nil || status != http.StatusOK || response.Asset.ID != f.assetID {
		t.Fatalf("saved library unavailable during model preparation: status=%d body=%s error=%v", status, data, err)
	}
	status, data = f.read(t, http.MethodGet, "/media/"+f.assetID, "")
	if status != http.StatusOK || !bytes.Equal(data, f.original) {
		t.Fatalf("retained private original changed or became unavailable: status=%d", status)
	}
}

func (f *startupFixture) awaitModelState(t *testing.T, expected string) {
	t.Helper()
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		status, data := f.read(t, http.MethodGet, "/api/health", "")
		var health struct {
			Dependencies struct {
				Search string `json:"search"`
			} `json:"dependencies"`
		}
		if err := json.Unmarshal(data, &health); err != nil || status != http.StatusOK {
			t.Fatalf("library health failed during model initialization: status=%d body=%s error=%v", status, data, err)
		}
		if health.Dependencies.Search == expected {
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf("model never reached %s: %s", expected, data)
		case <-ticker.C:
		}
	}
}

func awaitStartupSignal(t *testing.T, signal <-chan struct{}) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(5 * time.Second):
		t.Fatal("startup did not reach its lifecycle barrier")
	}
}

func TestServePreparationFailureKeepsSavedLibraryAvailable(t *testing.T) {
	fixture := newStartupFixture(t, true)
	started, fail := make(chan struct{}), make(chan struct{})
	var attempts atomic.Int32
	running := fixture.start(t, func(ctx context.Context) (nativeEngine, error) {
		attempts.Add(1)
		close(started)
		select {
		case <-fail:
			return nil, errors.New("fixture model artifact is corrupt; repair and restart")
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	})
	awaitStartupSignal(t, started)
	fixture.awaitModelState(t, "loading")
	fixture.assertRetainedLibrary(t)
	status, data := fixture.read(t, http.MethodPost, "/api/search", `{"query":"retained media","limit":10}`)
	var failure struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(data, &failure); err != nil || status != 503 || failure.Code != "embedding_loading" {
		t.Fatalf("loading search advertised success: status=%d body=%s error=%v", status, data, err)
	}
	close(fail)
	fixture.awaitModelState(t, "unavailable")
	fixture.assertRetainedLibrary(t)
	status, data = fixture.read(t, http.MethodPost, "/api/search", `{"query":"retained media","limit":10}`)
	if err := json.Unmarshal(data, &failure); err != nil || status != 503 || failure.Code != "embedding_unavailable" {
		t.Fatalf("failed preparation returned fake search or success: status=%d body=%s error=%v", status, data, err)
	}
	var state string
	var count int
	if err := fixture.db.QueryRow(`SELECT status,attempts FROM asset_embeddings WHERE asset_id=?1`, fixture.assetID).Scan(&state, &count); err != nil || state != "pending" || count != 0 {
		t.Fatalf("failed initialization consumed durable indexing work: %s %d %v", state, count, err)
	}
	if attempts.Load() != 1 {
		t.Fatal("failed initialization started an unsolicited retry")
	}
	running.cancel()
	running.join(t)
}

type lifetimeEngine struct {
	closed       atomic.Bool
	images       atomic.Int32
	textEntered  chan struct{}
	textCanceled chan struct{}
	releaseText  chan struct{}
}

func (e *lifetimeEngine) Text(ctx context.Context, _ string) ([]float32, error) {
	close(e.textEntered)
	<-ctx.Done()
	close(e.textCanceled)
	// Match the native binding: cancellation cannot interrupt session.Run.
	<-e.releaseText
	return nil, ctx.Err()
}

func (e *lifetimeEngine) Image(context.Context, string) ([]float32, error) {
	e.images.Add(1)
	vector := make([]float32, inference.Dimension)
	vector[0] = 1
	return vector, nil
}

func (e *lifetimeEngine) Close() error {
	e.closed.Store(true)
	return nil
}

func TestServeShutdownJoinsModelPreparationBeforeNativeClose(t *testing.T) {
	fixture := newStartupFixture(t, true)
	started, canceled, finish := make(chan struct{}), make(chan struct{}), make(chan struct{})
	engine := &lifetimeEngine{}
	running := fixture.start(t, func(ctx context.Context) (nativeEngine, error) {
		close(started)
		<-ctx.Done()
		close(canceled)
		<-finish
		return engine, nil
	})
	defer close(finish)
	awaitStartupSignal(t, started)
	fixture.assertRetainedLibrary(t)
	running.cancel()
	awaitStartupSignal(t, canceled)
	select {
	case err := <-running.done:
		running.joined = true
		t.Fatalf("shutdown abandoned model preparation: %v", err)
	default:
	}
	if engine.closed.Load() {
		t.Fatal("native engine closed while preparation still owned it")
	}
	// Deferred release runs before the registered lifecycle cleanup joins.
	t.Cleanup(func() {
		running.join(t)
		if !engine.closed.Load() || engine.images.Load() != 0 {
			t.Fatal("canceled preparation activated indexing or leaked native sessions")
		}
	})
}

func TestServeShutdownJoinsActiveQueryBeforeNativeClose(t *testing.T) {
	fixture := newStartupFixture(t, true)
	engine := &lifetimeEngine{textEntered: make(chan struct{}), textCanceled: make(chan struct{}), releaseText: make(chan struct{})}
	running := fixture.start(t, func(context.Context) (nativeEngine, error) { return engine, nil })
	defer close(engine.releaseText)
	fixture.awaitModelState(t, "ready")
	fixture.assertRetainedLibrary(t)
	request := fixture.request(t, http.MethodPost, "/api/search", `{"query":"active native query","limit":10}`)
	responseDone := make(chan struct{})
	go func() {
		defer close(responseDone)
		response, err := fixture.client.Do(request)
		if err == nil {
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
		}
	}()
	awaitStartupSignal(t, engine.textEntered)
	running.cancel()
	awaitStartupSignal(t, engine.textCanceled)
	select {
	case err := <-running.done:
		running.joined = true
		t.Fatalf("shutdown abandoned an active native query: %v", err)
	default:
	}
	if engine.closed.Load() {
		t.Fatal("native sessions closed before the active query returned")
	}
	t.Cleanup(func() {
		awaitStartupSignal(t, responseDone)
		running.join(t)
		if !engine.closed.Load() {
			t.Fatal("joined query left native sessions open")
		}
	})
}

func TestServeDisabledInferenceNeverStartsPreparation(t *testing.T) {
	fixture := newStartupFixture(t, false)
	var preparations atomic.Int32
	running := fixture.start(t, func(context.Context) (nativeEngine, error) {
		preparations.Add(1)
		return nil, errors.New("disabled inference must not prepare")
	})
	fixture.awaitModelState(t, "disabled")
	fixture.assertRetainedLibrary(t)
	running.cancel()
	running.join(t)
	if preparations.Load() != 0 {
		t.Fatal("disabled runtime prepared a model")
	}
}
