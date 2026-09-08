//go:build integration

package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

// These tests require the real migrated pgvector schema and FFmpeg. They never
// create a substitute schema, and refuse a nonlocal DATABASE_URL.
func ingestionDatabase(t *testing.T) (*pgxpool.Pool, string) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Fatal("DB path unverified: integration tests require DATABASE_URL against local migrated pgvector PostgreSQL")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	host := config.ConnConfig.Host
	ip := net.ParseIP(host)
	if host != "localhost" && !(ip != nil && ip.IsLoopback()) && !filepath.IsAbs(host) {
		t.Fatal("refusing ingestion integration writes to a nonlocal database")
	}
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	owner := "ingest-test-" + model.NewID()
	if _, err = pool.Exec(context.Background(), `INSERT INTO users (id,email,"updatedAt") VALUES ($1,$2,now())`, owner, owner+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, owner); err != nil {
			t.Errorf("remove owned ingestion test account: %v", err)
		}
	})
	return pool, owner
}

func localIngestion(t *testing.T, pool *pgxpool.Pool) *Service {
	t.Helper()
	s, err := New(pool, Options{MediaDirectory: t.TempDir(), Environment: "test", UploadsEnabled: true, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func animatedFixture(t *testing.T, variant byte) []byte {
	t.Helper()
	palette := color.Palette{color.RGBA{variant, 20, 70, 255}, color.RGBA{20, 190, 240, 255}}
	first, second := image.NewPaletted(image.Rect(0, 0, 32, 16), palette), image.NewPaletted(image.Rect(0, 0, 32, 16), palette)
	for index := range second.Pix {
		second.Pix[index] = 1
	}
	var output bytes.Buffer
	if err := gif.EncodeAll(&output, &gif.GIF{Image: []*image.Paletted{first, second}, Delay: []int{5, 5}, LoopCount: 0}); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func TestSavePreservesAnimationAndReplaysWithoutProviderWork(t *testing.T) {
	pool, owner := ingestionDatabase(t)
	s := localIngestion(t, pool)
	original := animatedFixture(t, 230)
	result, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "reaction.gif", IdempotencyKey: "capture-1", Tags: []string{"reaction", " reaction "}})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Success || result.IsDuplicate || result.Asset == nil {
		t.Fatalf("save result: %+v", result)
	}
	persisted, err := os.ReadFile(filepath.Join(s.store.directory, result.Asset.Pathname))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(persisted, original) {
		t.Fatal("saved GIF was transcoded instead of preserving original animation bytes")
	}
	sum := sha256.Sum256(original)
	if result.Asset.Checksum != hex.EncodeToString(sum[:]) {
		t.Fatal("duplicate checksum is not the original SHA-256")
	}
	var replicaBytes int64
	var tags int
	if err := pool.QueryRow(context.Background(), `SELECT
		(SELECT sum(size) FROM asset_storage_replicas WHERE asset_id=a.id AND active),
		(SELECT count(*) FROM asset_tags WHERE asset_id=a.id)
		FROM assets a WHERE a.id=$2 AND a.owner_user_id=$1`, owner, result.Asset.ID).Scan(&replicaBytes, &tags); err != nil {
		t.Fatal(err)
	}
	poster, err := os.ReadFile(filepath.Join(s.store.directory, filepath.Dir(result.Asset.Pathname), "poster", "preview.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	if replicaBytes != int64(len(original)+len(poster)) || tags != 1 {
		t.Fatalf("durable save ledger bytes=%d tags=%d", replicaBytes, tags)
	}
	// A completed request bypasses even malformed new bodies/URLs. Neither
	// changing FFmpeg's path nor an invalid remote target may trigger work.
	s.ffmpeg = "/not-a-provider"
	replay, err := s.Save(context.Background(), owner, Input{MIME: "invalid", Reader: failedReader{}, IdempotencyKey: "capture-1"})
	if err != nil || replay.Asset == nil || replay.Asset.ID != result.Asset.ID || replay.IsDuplicate {
		t.Fatalf("completed replay: %+v %v", replay, err)
	}
	replay, err = s.SaveURL(context.Background(), owner, "http://127.0.0.1:1/unreachable", Input{IdempotencyKey: "capture-1"})
	if err != nil || replay.Asset == nil || replay.Asset.ID != result.Asset.ID {
		t.Fatalf("URL replay performed remote work: %+v %v", replay, err)
	}
}

type failedReader struct{}

func (failedReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestConcurrentSavesUseOnePhysicalQuotaAndPreserveTrashFlags(t *testing.T) {
	pool, owner := ingestionDatabase(t)
	s := localIngestion(t, pool)
	original := animatedFixture(t, 210)
	spooled, err := spool(context.Background(), t.TempDir(), bytes.NewReader(original), "image/gif")
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := s.prepare(context.Background(), spooled)
	if err != nil {
		t.Fatal(err)
	}
	physicalBytes := int64(len(original) + len(prepared.poster))
	if _, err := pool.Exec(context.Background(), `INSERT INTO user_storage_quotas (user_id,limit_bytes,updated_at) VALUES ($1,$2,now())`, owner, physicalBytes); err != nil {
		t.Fatal(err)
	}
	var wait sync.WaitGroup
	start := make(chan struct{})
	results := make([]model.UploadResponse, 2)
	errorsFound := make([]error, 2)
	for index := range results {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			results[index], errorsFound[index] = s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "reaction.gif"})
		}(index)
	}
	close(start)
	wait.Wait()
	for _, err := range errorsFound {
		if err != nil {
			t.Fatal(err)
		}
	}
	if results[0].Asset.ID != results[1].Asset.ID || results[0].IsDuplicate == results[1].IsDuplicate {
		t.Fatalf("concurrent saves did not settle on the actual duplicate: %+v", results)
	}
	id := results[0].Asset.ID
	var usage int64
	if err := pool.QueryRow(context.Background(), physicalUsageSQL, owner).Scan(&usage); err != nil {
		t.Fatal(err)
	}
	if usage != physicalBytes {
		t.Fatalf("quota double-counted concurrent save: used=%d want=%d", usage, physicalBytes)
	}
	if _, err := pool.Exec(context.Background(), `UPDATE assets SET favorite=true,deleted_at=now(),share_slug=$3 WHERE owner_user_id=$1 AND id=$2`, owner, id, "ingest-share-"+model.NewID()); err != nil {
		t.Fatal(err)
	}
	s.ffmpeg = "/not-a-provider"
	duplicate, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "renamed.gif"})
	if err != nil || !duplicate.IsDuplicate || duplicate.Asset.ID != id {
		t.Fatalf("trashed duplicate was not returned: %+v %v", duplicate, err)
	}
	var favorite, deleted, shared bool
	if err := pool.QueryRow(context.Background(), `SELECT favorite,deleted_at IS NOT NULL,share_slug IS NOT NULL FROM assets WHERE owner_user_id=$1 AND id=$2`, owner, id).Scan(&favorite, &deleted, &shared); err != nil {
		t.Fatal(err)
	}
	if !favorite || !deleted || !shared {
		t.Fatal("deduplication modified existing favorite/deletion/sharing flags")
	}
	_, err = s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(animatedFixture(t, 100)), MIME: "image/gif", Filename: "different.gif"})
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Code != "quota_exceeded" || apiError.Quota.UsedBytes != physicalBytes {
		t.Fatalf("trash incorrectly freed physical quota: %v", err)
	}
	var files int
	if err := filepath.WalkDir(s.store.directory, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			files++
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if files != 2 {
		t.Fatalf("duplicate or quota failure left %d objects; want one original and one poster", files)
	}
}

func TestPosterAndExistingReservationsConsumeQuotaBeforeBlobWrites(t *testing.T) {
	pool, owner := ingestionDatabase(t)
	s := localIngestion(t, pool)
	original := animatedFixture(t, 160)
	spooled, err := spool(context.Background(), t.TempDir(), bytes.NewReader(original), "image/gif")
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := s.prepare(context.Background(), spooled)
	if err != nil {
		t.Fatal(err)
	}
	physicalBytes := int64(len(original) + len(prepared.poster))
	if _, err := pool.Exec(context.Background(), `INSERT INTO user_storage_quotas (user_id,limit_bytes,updated_at) VALUES ($1,$2,now())`, owner, len(original)); err != nil {
		t.Fatal(err)
	}
	save := func() (model.UploadResponse, error) {
		return s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "reaction.gif"})
	}
	_, err = save()
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Code != "quota_exceeded" || apiError.Quota.IncomingBytes != physicalBytes {
		t.Fatalf("poster was omitted from quota admission: %v", err)
	}
	if _, err := pool.Exec(context.Background(), `UPDATE user_storage_quotas SET limit_bytes=$2 WHERE user_id=$1`, owner, physicalBytes); err != nil {
		t.Fatal(err)
	}
	reservation := model.NewID()
	if _, err := pool.Exec(context.Background(), `INSERT INTO storage_quota_reservations (id,owner_user_id,bytes,expires_at) VALUES ($1,$2,1,now()+interval '15 minutes')`, reservation, owner); err != nil {
		t.Fatal(err)
	}
	_, err = save()
	if !errors.As(err, &apiError) || apiError.Code != "quota_exceeded" || apiError.Quota.ReservedBytes != 1 {
		t.Fatalf("existing reservation was omitted from quota admission: %v", err)
	}
	if err := filepath.WalkDir(s.store.directory, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			t.Error("quota-rejected upload performed a physical object write")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `UPDATE storage_quota_reservations SET expires_at=now()-interval '1 second' WHERE id=$1 AND owner_user_id=$2`, reservation, owner); err != nil {
		t.Fatal(err)
	}
	result, err := save()
	if err != nil || !result.Success || result.IsDuplicate {
		t.Fatalf("expired reservation did not release headroom: %+v %v", result, err)
	}
	var reservations int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM storage_quota_reservations WHERE owner_user_id=$1`, owner).Scan(&reservations); err != nil {
		t.Fatal(err)
	}
	if reservations != 0 {
		t.Fatal("expired reservation survived the asset commit")
	}
}

// lostCommitAcknowledgement returns a real PostgreSQL commit's success as a
// transport error, reproducing the ambiguous-ACK case without faking storage.
type lostCommitAcknowledgement struct {
	pgx.Tx
	fatal bool
}

func (tx lostCommitAcknowledgement) Commit(ctx context.Context) error {
	if err := tx.Tx.Commit(ctx); err != nil {
		return err
	}
	if tx.fatal {
		return &pgconn.PgError{Code: "57P01", Severity: "FATAL", Message: "terminating connection due to administrator command"}
	}
	return io.ErrUnexpectedEOF
}

func TestCleanupCannotDeleteCommittedMedia(t *testing.T) {
	for _, outcome := range []string{"committed", "acknowledgement-lost", "fatal-after-commit", "rolled-back"} {
		t.Run(outcome, func(t *testing.T) {
			pool, owner := ingestionDatabase(t)
			s := localIngestion(t, pool)
			original := animatedFixture(t, 190)
			sum := sha256.Sum256(original)
			checksum := hex.EncodeToString(sum[:])
			id := model.NewID()
			object, err := s.store.putBytes(context.Background(), "boundary/"+id+".gif", original, "image/gif", checksum)
			if err != nil {
				t.Fatal(err)
			}
			write := stagedWrite{store: s.store, logger: s.logger}
			write.track(object)
			tx, err := pool.Begin(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(context.Background())
			if _, err := tx.Exec(context.Background(), `INSERT INTO assets (id,owner_user_id,blob_url,pathname,mime,size,checksum_sha256,"updatedAt") VALUES ($1,$2,$3,$4,'image/gif',$5,$6,now())`, id, owner, object.url, object.key, len(original), checksum); err != nil {
				t.Fatal(err)
			}
			if outcome == "rolled-back" {
				if _, err := tx.Exec(context.Background(), `SELECT 1/0`); err == nil {
					t.Fatal("expected real PostgreSQL transaction failure")
				}
			}
			var committing pgx.Tx = tx
			if outcome == "acknowledgement-lost" || outcome == "fatal-after-commit" {
				committing = lostCommitAcknowledgement{Tx: tx, fatal: outcome == "fatal-after-commit"}
			}
			err = write.commit(context.Background(), committing)
			if outcome == "committed" && err != nil || outcome != "committed" && err == nil {
				t.Fatalf("unexpected commit outcome: %v", err)
			}
			// This deferred cleanup may run after any subsequent failure. It
			// must decide from transaction ownership, not the caller's error.
			write.cleanup(context.Background())
			persisted, readErr := os.ReadFile(filepath.Join(s.store.directory, object.key))
			var assetExists bool
			if err := pool.QueryRow(context.Background(), `SELECT EXISTS (SELECT 1 FROM assets WHERE owner_user_id=$1 AND id=$2)`, owner, id).Scan(&assetExists); err != nil {
				t.Fatal(err)
			}
			if outcome == "rolled-back" {
				if !errors.Is(readErr, os.ErrNotExist) || assetExists {
					t.Fatalf("rolled-back asset or object survived: file=%v asset=%v", readErr, assetExists)
				}
			} else if readErr != nil || !bytes.Equal(persisted, original) || !assetExists {
				t.Fatalf("cleanup deleted committed media: file=%v asset=%v", readErr, assetExists)
			}
		})
	}
}
