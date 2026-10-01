package ingest

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

type hangMedia struct {
	URL     string
	entered chan struct{}
	hits    atomic.Int32
	server  *httptest.Server
}

func newHangMedia(t *testing.T) *hangMedia {
	t.Helper()
	media := &hangMedia{entered: make(chan struct{})}
	var once sync.Once
	media.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		media.hits.Add(1)
		once.Do(func() { close(media.entered) })
		w.Header().Set("Content-Type", "image/png")
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		<-r.Context().Done()
	}))
	t.Cleanup(media.server.Close)
	media.URL = media.server.URL
	return media
}

func originIngestion(t *testing.T, db *sql.DB, directory, origin string) *Service {
	t.Helper()
	s, err := New(db, Options{
		MediaDirectory: filepath.Join(directory, "media"), Environment: "test", UploadsEnabled: true,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), LocalImportOrigin: origin,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func insertOwner(t *testing.T, db *sql.DB) string {
	t.Helper()
	owner := model.NewID()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash) VALUES(?,?,?)`, owner, owner+"@example.invalid", "test-password-hash"); err != nil {
		t.Fatal(err)
	}
	return owner
}

func processingClaims(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM upload_idempotency WHERE status='processing'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func openDescriptors(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		t.Fatal(err)
	}
	return len(entries)
}

func waitForQueue(t *testing.T, s *Service, n int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		s.admission.mu.Lock()
		count := s.admission.count
		active := s.admission.active
		s.admission.mu.Unlock()
		if active && count >= n {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	s.admission.mu.Lock()
	count := s.admission.count
	s.admission.mu.Unlock()
	t.Fatalf("save queue reached %d, want %d", count, n)
}

func waitForFetch(t *testing.T, media *hangMedia, done <-chan error) {
	t.Helper()
	select {
	case <-media.entered:
	case err := <-done:
		t.Fatalf("slow URL finished before the fetch: %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("slow URL never reached the test server")
	}
}

func TestSlowURLCannotGrowHandlersDescriptorsOrClaims(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	media := newHangMedia(t)
	s := originIngestion(t, db, directory, media.URL)
	activeCtx, cancelActive := context.WithCancel(context.Background())
	defer cancelActive()
	activeDone := make(chan error, 1)
	go func() {
		_, err := s.SaveURL(activeCtx, owner, media.URL+"/slow.png", Input{IdempotencyKey: "slow-active"})
		activeDone <- err
	}()
	waitForFetch(t, media, activeDone)
	if claims := processingClaims(t, db); claims != 1 {
		t.Fatalf("active URL created %d processing claims", claims)
	}
	baseline := openDescriptors(t)

	const owners = 8
	const each = 4
	ids := make([]string, owners)
	for i := range ids {
		ids[i] = insertOwner(t, db)
	}
	const burst = owners * each
	var inFlight atomic.Int32
	type outcome struct {
		err     error
		elapsed time.Duration
	}
	results := make(chan outcome, burst)
	cancels := make([]context.CancelFunc, burst)
	for i := range burst {
		reqCtx, cancel := context.WithCancel(context.Background())
		cancels[i] = cancel
		go func(i int) {
			inFlight.Add(1)
			defer inFlight.Add(-1)
			started := time.Now()
			_, err := s.SaveURL(reqCtx, ids[i%owners], media.URL+"/slow.png", Input{IdempotencyKey: fmt.Sprintf("slow-%d", i)})
			results <- outcome{err, time.Since(started)}
		}(i)
	}

	prompt, queued := 0, 0
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
collect:
	for prompt+queued < burst {
		select {
		case result := <-results:
			if !busyError(result.err) {
				t.Fatalf("saturated URL save returned %v", result.err)
			}
			if result.elapsed < 750*time.Millisecond {
				prompt++
			} else {
				queued++
			}
		case <-deadline.C:
			break collect
		}
	}
	waiting := int(inFlight.Load())
	if prompt < burst-ingestQueueLimit || waiting > ingestQueueLimit {
		t.Fatalf("slow URL did not bound handlers: prompt=%d waiting=%d claims=%d fetches=%d", prompt, waiting, processingClaims(t, db), media.hits.Load())
	}
	if claims := processingClaims(t, db); claims != 1 || media.hits.Load() != 1 {
		t.Fatalf("waiting URL saves created claims or fetches: claims=%d fetches=%d", claims, media.hits.Load())
	}
	if delta := openDescriptors(t) - baseline; delta >= burst {
		t.Fatalf("waiting URL saves opened %d descriptors for %d requests", delta, burst)
	}
	sameKey, sameCancel := context.WithTimeout(context.Background(), time.Second)
	defer sameCancel()
	started := time.Now()
	_, err := s.SaveURL(sameKey, owner, media.URL+"/slow.png", Input{IdempotencyKey: "slow-active"})
	var api *model.APIError
	if !errors.As(err, &api) || api.Status != http.StatusConflict || api.Code != "UPLOAD_IN_PROGRESS" || time.Since(started) > 750*time.Millisecond {
		t.Fatalf("live claim did not replay as in-progress without waiting: %v elapsed=%s", err, time.Since(started))
	}
	if processingClaims(t, db) != 1 {
		t.Fatal("in-progress replay created another claim")
	}

	cancelActive()
	for _, cancel := range cancels {
		cancel()
	}
	if err := <-activeDone; err == nil {
		t.Fatal("canceled slow URL reported success")
	}
	for prompt+queued < burst {
		result := <-results
		if result.err == nil {
			t.Fatal("queued slow URL completed")
		}
		prompt++
	}
	if processingClaims(t, db) != 0 {
		t.Fatal("canceled URL left a processing claim")
	}
}

func TestAnotherOwnerProceedsDuringSlowURL(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	other := insertOwner(t, db)
	media := newHangMedia(t)
	s := originIngestion(t, db, directory, media.URL)
	activeCtx, cancelActive := context.WithCancel(context.Background())
	defer cancelActive()
	activeDone := make(chan error, 1)
	go func() {
		_, err := s.SaveURL(activeCtx, owner, media.URL+"/slow.png", Input{IdempotencyKey: "owner-a-slow"})
		activeDone <- err
	}()
	waitForFetch(t, media, activeDone)

	original := pngFixture(t)
	order := make(chan string, 2)
	firstDone := make(chan error, 1)
	go func() {
		_, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/png", Filename: "a.png", IdempotencyKey: "owner-a-bytes"})
		if err == nil {
			order <- "owner-a"
		}
		firstDone <- err
	}()
	waitForQueue(t, s, 1)
	secondDone := make(chan error, 1)
	go func() {
		_, err := s.Save(context.Background(), other, Input{Reader: bytes.NewReader(original), MIME: "image/png", Filename: "b.png", IdempotencyKey: "owner-b-bytes"})
		if err == nil {
			order <- "owner-b"
		}
		secondDone <- err
	}()
	waitForQueue(t, s, 2)

	started := time.Now()
	_, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/png", Filename: "a-extra.png"})
	if !busyError(err) || time.Since(started) > 750*time.Millisecond {
		t.Fatalf("owner already waiting was not rejected promptly: %v elapsed=%s", err, time.Since(started))
	}
	cancelActive()
	if err := <-activeDone; err == nil {
		t.Fatal("canceled slow URL reported success")
	}
	select {
	case err := <-secondDone:
		if err != nil {
			t.Fatalf("other owner did not complete: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("other owner made no progress after the slow URL was canceled")
	}
	select {
	case err := <-firstDone:
		if err != nil {
			t.Fatalf("first owner did not complete after the other owner: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("first owner's queued save did not finish")
	}
	if first, second := <-order, <-order; first != "owner-b" || second != "owner-a" {
		t.Fatalf("completion order was %s then %s", first, second)
	}
	var saved int
	if err := db.QueryRow(`SELECT count(*) FROM assets WHERE owner_user_id=?`, other).Scan(&saved); err != nil || saved != 1 {
		t.Fatalf("other owner assets=%d error=%v", saved, err)
	}
}

func TestCancelingQueuedSaveFreesCapacity(t *testing.T) {
	db, _, directory := ingestionDatabase(t)
	media := newHangMedia(t)
	s := originIngestion(t, db, directory, media.URL)
	holders := make([]struct {
		cancel context.CancelFunc
		done   chan error
	}, ingestQueueLimit+1)
	for i := range holders {
		owner := insertOwner(t, db)
		ctx, cancel := context.WithCancel(context.Background())
		holders[i].cancel = cancel
		holders[i].done = make(chan error, 1)
		go func(i int) {
			_, err := s.SaveURL(ctx, owner, media.URL+"/slow.png", Input{IdempotencyKey: fmt.Sprintf("queue-%d", i)})
			holders[i].done <- err
		}(i)
		if i == 0 {
			waitForFetch(t, media, holders[0].done)
			continue
		}
		waitForQueue(t, s, i)
	}
	overflowOwner := insertOwner(t, db)
	started := time.Now()
	_, err := s.SaveURL(context.Background(), overflowOwner, media.URL+"/slow.png", Input{IdempotencyKey: "overflow"})
	if !busyError(err) || time.Since(started) > 750*time.Millisecond {
		t.Fatalf("full queue did not reject promptly: %v elapsed=%s", err, time.Since(started))
	}
	holders[2].cancel()
	select {
	case err := <-holders[2].done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("canceled waiter returned %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("canceled waiter did not return")
	}
	replacementCtx, cancelReplacement := context.WithCancel(context.Background())
	defer cancelReplacement()
	replacementDone := make(chan error, 1)
	go func() {
		_, err := s.SaveURL(replacementCtx, overflowOwner, media.URL+"/slow.png", Input{IdempotencyKey: "replacement"})
		replacementDone <- err
	}()
	waitForQueue(t, s, ingestQueueLimit)
	select {
	case err := <-replacementDone:
		t.Fatalf("replacement was not queued after cancellation: %v", err)
	default:
	}
	if media.hits.Load() != 1 || processingClaims(t, db) != 1 {
		t.Fatalf("queued saves fetched or claimed: fetches=%d claims=%d", media.hits.Load(), processingClaims(t, db))
	}
	holders[0].cancel()
	if err := <-holders[0].done; err == nil {
		t.Fatal("canceled active URL reported success")
	}
	deadline := time.Now().Add(2 * time.Second)
	for media.hits.Load() < 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if media.hits.Load() < 2 {
		t.Fatal("canceling the active URL did not admit a queued owner")
	}
	for i := range holders {
		if i == 2 {
			continue
		}
		holders[i].cancel()
	}
	cancelReplacement()
	for i := range holders {
		if i == 0 || i == 2 {
			continue
		}
		if err := <-holders[i].done; err == nil {
			t.Fatal("canceled queued URL reported success")
		}
	}
	if err := <-replacementDone; err == nil {
		t.Fatal("canceled replacement reported success")
	}
	if processingClaims(t, db) != 0 {
		t.Fatal("cancellation left a processing claim")
	}
}

func TestRetainedReceiptSkipsSaturatedAdmission(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	media := newHangMedia(t)
	s := originIngestion(t, db, directory, media.URL)
	original := pngFixture(t)
	saved, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/png", Filename: "kept.png", IdempotencyKey: "capture-1"})
	if err != nil || saved.Asset == nil {
		t.Fatal(err)
	}
	activeCtx, cancelActive := context.WithCancel(context.Background())
	defer cancelActive()
	activeDone := make(chan error, 1)
	blocker := insertOwner(t, db)
	go func() {
		_, err := s.SaveURL(activeCtx, blocker, media.URL+"/slow.png", Input{IdempotencyKey: "blocker"})
		activeDone <- err
	}()
	waitForFetch(t, media, activeDone)
	cancels := make([]context.CancelFunc, ingestQueueLimit)
	fillerDone := make(chan struct{}, ingestQueueLimit)
	for i := range ingestQueueLimit {
		queuedOwner := insertOwner(t, db)
		ctx, cancel := context.WithCancel(context.Background())
		cancels[i] = cancel
		go func(i int) {
			_, _ = s.SaveURL(ctx, queuedOwner, media.URL+"/slow.png", Input{IdempotencyKey: fmt.Sprintf("filler-%d", i)})
			fillerDone <- struct{}{}
		}(i)
		waitForQueue(t, s, i+1)
	}
	started := time.Now()
	replay, err := s.SaveURL(context.Background(), owner, "http://127.0.0.1:1/unreachable", Input{IdempotencyKey: "capture-1"})
	if err != nil || replay.Asset == nil || replay.Asset.ID != saved.Asset.ID || replay.IsDuplicate || time.Since(started) > 750*time.Millisecond {
		t.Fatalf("saturated URL replay: %+v %v elapsed=%s", replay, err, time.Since(started))
	}
	bodyReplay, err := s.Save(context.Background(), owner, Input{MIME: "invalid", Reader: failedReader{}, IdempotencyKey: "capture-1"})
	if err != nil || bodyReplay.Asset == nil || bodyReplay.Asset.ID != saved.Asset.ID {
		t.Fatalf("saturated byte replay: %+v %v", bodyReplay, err)
	}
	if media.hits.Load() != 1 || processingClaims(t, db) != 1 {
		t.Fatalf("replay fetched or claimed: fetches=%d claims=%d", media.hits.Load(), processingClaims(t, db))
	}
	cancelActive()
	for _, cancel := range cancels {
		cancel()
	}
	if err := <-activeDone; err == nil {
		t.Fatal("canceled blocker reported success")
	}
	for range ingestQueueLimit {
		<-fillerDone
	}
}
