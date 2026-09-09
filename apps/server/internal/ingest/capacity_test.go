package ingest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type countedReader struct {
	reader io.Reader
	reads  int
}

func (r *countedReader) Read(value []byte) (int, error) {
	r.reads++
	return r.reader.Read(value)
}

func TestDiskReserveRejectsBeforeReadingAndAllowsExactReservation(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	original := animatedFixture(t, 90)
	reader := &countedReader{reader: bytes.NewReader(original)}
	s.storageReserveBytes = 4096
	reservation := 2*int64(contract.UploadMaxBytes) + maxPosterBytes + 1
	available := reservation + s.storageReserveBytes - 1
	s.availableBytes = func() (int64, error) { return available, nil }
	_, err := s.Save(context.Background(), owner, Input{Reader: reader, MIME: "image/gif", IdempotencyKey: "reserve-retry"})
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != 507 || apiError.Code != "storage_reserve_exceeded" || reader.reads != 0 {
		t.Fatalf("reserve failure consumed upload bytes: reads=%d error=%v", reader.reads, err)
	}
	if count := retainedFiles(t, filepath.Join(directory, "media")); count != 0 {
		t.Fatalf("reserve rejection spooled %d files", count)
	}
	available++
	result, err := s.Save(context.Background(), owner, Input{Reader: reader, MIME: "image/gif", IdempotencyKey: "reserve-retry"})
	if err != nil || result.Asset == nil || result.IsDuplicate {
		t.Fatalf("exact reserve or released receipt was rejected: %+v %v", result, err)
	}
}

func TestUnknownDiskAvailabilityFailsClosedBeforeReading(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	s.availableBytes = func() (int64, error) { return 0, errors.New("filesystem unavailable") }
	reader := &countedReader{reader: bytes.NewReader(animatedFixture(t, 110))}
	_, err := s.Save(context.Background(), owner, Input{Reader: reader, MIME: "image/gif"})
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Code != "storage_unavailable" || reader.reads != 0 {
		t.Fatalf("unknown disk capacity was treated as available: reads=%d error=%v", reader.reads, err)
	}
}

func TestConcurrentOwnersAndServicesShareOneInstanceLimit(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	other := model.NewID()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash) VALUES(?,?,?)`, other, other+"@example.invalid", "hash"); err != nil {
		t.Fatal(err)
	}
	services := []*Service{localIngestion(t, db, directory), localIngestion(t, db, directory)}
	owners := []string{owner, other}
	original := animatedFixture(t, 180)
	spooled, err := spool(context.Background(), t.TempDir(), bytes.NewReader(original), "image/gif")
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := services[0].prepare(context.Background(), spooled)
	if err != nil {
		t.Fatal(err)
	}
	physicalBytes := int64(len(original) + len(prepared.poster))
	for _, service := range services {
		service.storageLimitBytes = physicalBytes
	}
	var group sync.WaitGroup
	start := make(chan struct{})
	results := make([]model.UploadResponse, 2)
	failures := make([]error, 2)
	for index := range services {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			<-start
			results[index], failures[index] = services[index].Save(context.Background(), owners[index], Input{Reader: bytes.NewReader(original), MIME: "image/gif"})
		}(index)
	}
	close(start)
	group.Wait()
	accepted, rejected := 0, 0
	for index, err := range failures {
		if err == nil && results[index].Asset != nil && !results[index].IsDuplicate {
			accepted++
			continue
		}
		var apiError *model.APIError
		if !errors.As(err, &apiError) || apiError.Code != "storage_limit_exceeded" {
			t.Fatalf("unexpected concurrent admission result: %+v %v", results[index], err)
		}
		rejected++
	}
	var used int64
	if err := db.QueryRow(physicalUsageSQL).Scan(&used); err != nil {
		t.Fatal(err)
	}
	if accepted != 1 || rejected != 1 || used != physicalBytes || retainedFiles(t, filepath.Join(directory, "media")) != 2 {
		t.Fatalf("instance limit admitted cross-owner excess: accepted=%d rejected=%d bytes=%d", accepted, rejected, used)
	}
}

type gatedReader struct {
	reader  io.Reader
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (r *gatedReader) Read(value []byte) (int, error) {
	r.once.Do(func() { close(r.started); <-r.release })
	return r.reader.Read(value)
}

func TestConcurrentSpoolsCannotConsumeUnreservedDisk(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	first, second := localIngestion(t, db, directory), localIngestion(t, db, directory)
	original := animatedFixture(t, 150)
	reader := &gatedReader{reader: bytes.NewReader(original), started: make(chan struct{}), release: make(chan struct{})}
	done := make(chan error, 1)
	go func() {
		_, err := first.Save(context.Background(), owner, Input{Reader: reader, MIME: "image/gif"})
		done <- err
	}()
	select {
	case <-reader.started:
	case err := <-done:
		t.Fatalf("first save failed before its spool: %v", err)
	}
	waiting := &countedReader{reader: bytes.NewReader(original)}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	_, err := second.Save(ctx, owner, Input{Reader: waiting, MIME: "image/gif", IdempotencyKey: "canceled-admission"})
	cancel()
	close(reader.release)
	firstErr := <-done
	if !errors.Is(err, context.DeadlineExceeded) || waiting.reads != 0 || firstErr != nil {
		t.Fatalf("a second service read bytes before its admission: reads=%d waiting=%v first=%v", waiting.reads, err, firstErr)
	}
	retry, err := second.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", IdempotencyKey: "canceled-admission"})
	if err != nil || !retry.Success || !retry.IsDuplicate || retry.Asset == nil {
		t.Fatalf("canceled admission retained a processing receipt: %+v %v", retry, err)
	}
}
