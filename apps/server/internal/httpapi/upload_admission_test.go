package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func TestUploadRoutesRetryAfterReplayAndBoundedHandlers(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "library")
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	owner := model.NewID()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash) VALUES(?,?,?)`, owner, owner+"@example.invalid", "test-password-hash"); err != nil {
		t.Fatal(err)
	}
	entered := make(chan struct{})
	var once sync.Once
	var hits atomic.Int32
	media := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		once.Do(func() { close(entered) })
		w.Header().Set("Content-Type", "image/png")
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		<-r.Context().Done()
	}))
	t.Cleanup(media.Close)
	capture, err := ingest.New(db, ingest.Options{
		MediaDirectory: filepath.Join(directory, "media"), Environment: "test", UploadsEnabled: true,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), LocalImportOrigin: media.URL,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = capture.Close() })
	var picture bytes.Buffer
	if err := png.Encode(&picture, image.NewRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatal(err)
	}
	saved, err := capture.Save(context.Background(), owner, ingest.Input{Reader: bytes.NewReader(picture.Bytes()), MIME: "image/png", Filename: "kept.png", IdempotencyKey: "route-replay"})
	if err != nil || saved.Asset == nil {
		t.Fatal(err)
	}

	var handlers atomic.Int32
	app := &Server{ingest: capture, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlers.Add(1)
		defer handlers.Add(-1)
		principal := model.Principal{UserID: owner}
		switch r.URL.Path {
		case "/api/upload/url":
			app.uploadURL(w, r, principal)
		case "/api/upload":
			app.upload(w, r, principal)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(api.Close)
	client := api.Client()
	client.Timeout = 5 * time.Second

	slowCtx, cancelSlow := context.WithCancel(context.Background())
	defer cancelSlow()
	slowDone := make(chan error, 1)
	go func() {
		request, err := http.NewRequestWithContext(slowCtx, http.MethodPost, api.URL+"/api/upload/url", bytes.NewReader([]byte(`{"url":"`+media.URL+`/slow.png"}`)))
		if err != nil {
			slowDone <- err
			return
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Idempotency-Key", "route-slow")
		response, err := client.Do(request)
		if err == nil {
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			err = errString(response.Status)
		}
		slowDone <- err
	}()
	select {
	case <-entered:
	case err := <-slowDone:
		t.Fatalf("slow upload finished early: %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("slow upload never fetched")
	}

	const burst = 16
	statuses := make(chan int, burst)
	for i := range burst {
		go func(i int) {
			request, err := http.NewRequest(http.MethodPost, api.URL+"/api/upload/url", bytes.NewReader([]byte(`{"url":"`+media.URL+`/slow.png"}`)))
			if err != nil {
				statuses <- 0
				return
			}
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Idempotency-Key", fmt.Sprintf("route-burst-%d", i))
			response, err := client.Do(request)
			if err != nil {
				statuses <- 0
				return
			}
			defer response.Body.Close()
			if response.StatusCode == http.StatusTooManyRequests && response.Header.Get("Retry-After") == "1" {
				var body struct {
					Code string `json:"code"`
				}
				_ = json.NewDecoder(response.Body).Decode(&body)
				if body.Code == "upload_busy" {
					statuses <- http.StatusTooManyRequests
					return
				}
			}
			statuses <- response.StatusCode
		}(i)
	}
	prompt := 0
	deadline := time.After(time.Second)
	openHandlers := 0
collect:
	for prompt < burst {
		select {
		case status := <-statuses:
			if status != http.StatusTooManyRequests {
				t.Fatalf("saturated URL upload status %d", status)
			}
			prompt++
			if prompt == burst-4 {
				openHandlers = int(handlers.Load())
			}
		case <-deadline:
			break collect
		}
	}
	if prompt < burst-4 || openHandlers > 8 || hits.Load() != 1 {
		t.Fatalf("URL handlers were not bounded: prompt=%d handlers=%d fetches=%d", prompt, openHandlers, hits.Load())
	}

	replayRequest, err := http.NewRequest(http.MethodPost, api.URL+"/api/upload/url", bytes.NewReader([]byte(`{"url":"http://127.0.0.1:1/unreachable"}`)))
	if err != nil {
		t.Fatal(err)
	}
	replayRequest.Header.Set("Content-Type", "application/json")
	replayRequest.Header.Set("Idempotency-Key", "route-replay")
	replayStarted := time.Now()
	replayResponse, err := client.Do(replayRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer replayResponse.Body.Close()
	var replay struct {
		Asset struct {
			ID string `json:"id"`
		} `json:"asset"`
	}
	if err := json.NewDecoder(replayResponse.Body).Decode(&replay); err != nil {
		t.Fatal(err)
	}
	if replayResponse.StatusCode != http.StatusCreated || replay.Asset.ID != saved.Asset.ID || time.Since(replayStarted) > 750*time.Millisecond {
		t.Fatalf("URL replay status=%d asset=%s elapsed=%s", replayResponse.StatusCode, replay.Asset.ID, time.Since(replayStarted))
	}

	principal := model.Principal{UserID: owner}
	uploadBody := &countReader{reader: bytes.NewReader([]byte("not-a-multipart-body"))}
	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/upload", uploadBody)
	uploadRequest.Header.Set("Content-Type", "multipart/form-data; boundary=bound")
	uploadRequest.Header.Set("Idempotency-Key", "route-replay")
	uploadResponse := httptest.NewRecorder()
	app.upload(uploadResponse, uploadRequest, principal)
	var uploadReplay struct {
		Asset struct {
			ID string `json:"id"`
		} `json:"asset"`
	}
	if err := json.Unmarshal(uploadResponse.Body.Bytes(), &uploadReplay); err != nil {
		t.Fatal(err)
	}
	if uploadResponse.Code != http.StatusCreated || uploadReplay.Asset.ID != saved.Asset.ID || uploadBody.reads.Load() != 0 {
		t.Fatalf("multipart replay status=%d asset=%s reads=%d", uploadResponse.Code, uploadReplay.Asset.ID, uploadBody.reads.Load())
	}

	busyBody := &countReader{reader: bytes.NewReader([]byte("not-a-multipart-body"))}
	busyRequest := httptest.NewRequest(http.MethodPost, "/api/upload", busyBody)
	busyRequest.Header.Set("Content-Type", "multipart/form-data; boundary=bound")
	busyRequest.Header.Set("Idempotency-Key", "route-new")
	busyResponse := httptest.NewRecorder()
	app.upload(busyResponse, busyRequest, principal)
	var busy struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(busyResponse.Body.Bytes(), &busy); err != nil {
		t.Fatal(err)
	}
	if busyResponse.Code != http.StatusTooManyRequests || busyResponse.Header().Get("Retry-After") != "1" || busy.Code != "upload_busy" || busyBody.reads.Load() != 0 {
		t.Fatalf("multipart overload status=%d retry=%q code=%s reads=%d", busyResponse.Code, busyResponse.Header().Get("Retry-After"), busy.Code, busyBody.reads.Load())
	}

	cancelSlow()
	if err := <-slowDone; err == nil {
		t.Fatal("canceled slow upload reported success")
	}
}

type errString string

func (e errString) Error() string { return string(e) }

type countReader struct {
	reader io.Reader
	reads  atomic.Int32
}

func (c *countReader) Read(value []byte) (int, error) {
	c.reads.Add(1)
	return c.reader.Read(value)
}
