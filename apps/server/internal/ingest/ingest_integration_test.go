package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func ingestionDatabase(t *testing.T) (*sql.DB, string, string) {
	t.Helper()
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
	return db, owner, directory
}

func localIngestion(t *testing.T, db *sql.DB, directory string) *Service {
	t.Helper()
	s, err := New(db, Options{MediaDirectory: filepath.Join(directory, "media"), Environment: "test", UploadsEnabled: true, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
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

func pngFixture(t *testing.T) []byte {
	t.Helper()
	var output bytes.Buffer
	if err := png.Encode(&output, image.NewRGBA(image.Rect(0, 0, 32, 16))); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func videoFixture(t *testing.T) []byte {
	t.Helper()
	path := filepath.Join(t.TempDir(), "original.mp4")
	command := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=64x32:r=5", "-t", "0.4", "-c:v", "mpeg4", "-threads", "1", path)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("create real MP4: %s %v", output, err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestOriginalsAndReceiptsSurviveRestart(t *testing.T) {
	for _, media := range []struct {
		name, mime string
		fixture    func(*testing.T) []byte
	}{
		{"still.png", "image/png", pngFixture}, {"animation.gif", "image/gif", func(t *testing.T) []byte { return animatedFixture(t, 230) }}, {"video.mp4", "video/mp4", videoFixture},
	} {
		t.Run(media.name, func(t *testing.T) {
			db, owner, directory := ingestionDatabase(t)
			s := localIngestion(t, db, directory)
			original := media.fixture(t)
			result, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: media.mime, Filename: media.name, IdempotencyKey: "capture-1", Tags: []string{"reaction", " reaction "}})
			if err != nil {
				t.Fatal(err)
			}
			if !result.Success || result.IsDuplicate || result.Asset == nil || result.Asset.BlobURL != "/media/"+result.Asset.ID {
				t.Fatalf("save result: %+v", result)
			}
			s.Close()
			db.Close()
			reopened, err := database.Open(context.Background(), directory)
			if err != nil {
				t.Fatal(err)
			}
			defer reopened.Close()
			s = localIngestion(t, reopened, directory)
			file, err := s.OpenMedia(context.Background(), owner, result.Asset.ID, false)
			if err != nil {
				t.Fatal(err)
			}
			persisted, err := io.ReadAll(file)
			file.Close()
			if err != nil || !bytes.Equal(persisted, original) {
				t.Fatal("restart changed original media bytes")
			}
			sum := sha256.Sum256(original)
			if result.Asset.Checksum != hex.EncodeToString(sum[:]) {
				t.Fatal("receipt does not hash original bytes")
			}
			poster, err := s.OpenMedia(context.Background(), owner, result.Asset.ID, true)
			if err != nil {
				t.Fatal(err)
			}
			preview, err := jpeg.Decode(poster)
			poster.Close()
			if err != nil || preview.Bounds().Dx() > 768 || preview.Bounds().Dy() > 768 {
				t.Fatalf("invalid durable poster: %v", err)
			}
			var pending, tags int
			if err := reopened.QueryRow(`SELECT (SELECT count(*) FROM asset_embeddings WHERE asset_id=? AND owner_user_id=? AND status='pending'), (SELECT count(*) FROM asset_tags WHERE asset_id=?)`, result.Asset.ID, owner, result.Asset.ID).Scan(&pending, &tags); err != nil {
				t.Fatal(err)
			}
			if pending != 1 || tags != 1 {
				t.Fatalf("durable indexing/tag intent lost: pending=%d tags=%d", pending, tags)
			}
			s.ffmpeg = "/not-a-decoder"
			replay, err := s.Save(context.Background(), owner, Input{MIME: "invalid", Reader: failedReader{}, IdempotencyKey: "capture-1"})
			if err != nil || replay.Asset == nil || replay.Asset.ID != result.Asset.ID || replay.IsDuplicate {
				t.Fatalf("retained replay changed or read new body: %+v %v", replay, err)
			}
			replay, err = s.SaveURL(context.Background(), owner, "http://127.0.0.1:1/unreachable", Input{IdempotencyKey: "capture-1"})
			if err != nil || replay.Asset == nil || replay.Asset.ID != result.Asset.ID {
				t.Fatalf("URL replay refetched media: %+v %v", replay, err)
			}
		})
	}
}

type failedReader struct{}

func (failedReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestConcurrentSavesDeduplicateWithinInstanceLimitAndPreserveTrash(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
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
	s.storageLimitBytes = physicalBytes
	var wait sync.WaitGroup
	start := make(chan struct{})
	results := make([]model.UploadResponse, 2)
	failures := make([]error, 2)
	for index := range results {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			results[index], failures[index] = s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "reaction.gif", IdempotencyKey: fmt.Sprintf("capture-%d", index)})
		}(index)
	}
	close(start)
	wait.Wait()
	for _, err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	if results[0].Asset.ID != results[1].Asset.ID || results[0].IsDuplicate == results[1].IsDuplicate {
		t.Fatalf("concurrent originals were not deduplicated: %+v", results)
	}
	id := results[0].Asset.ID
	if _, err := db.Exec(`UPDATE assets SET favorite=1,deleted_at=CURRENT_TIMESTAMP,share_slug=? WHERE owner_user_id=? AND id=?`, model.NewID(), owner, id); err != nil {
		t.Fatal(err)
	}
	decoder := s.ffmpeg
	s.ffmpeg = "/not-a-decoder"
	duplicate, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "renamed.gif"})
	if err != nil || !duplicate.IsDuplicate || duplicate.Asset.ID != id {
		t.Fatalf("trash duplicate was not retained: %+v %v", duplicate, err)
	}
	s.ffmpeg = decoder
	var favorite, deleted, shared bool
	if err := db.QueryRow(`SELECT favorite,deleted_at IS NOT NULL,share_slug IS NOT NULL FROM assets WHERE id=? AND owner_user_id=?`, id, owner).Scan(&favorite, &deleted, &shared); err != nil {
		t.Fatal(err)
	}
	if !favorite || !deleted || !shared {
		t.Fatal("duplicate capture mutated library state")
	}
	_, err = s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(animatedFixture(t, 100)), MIME: "image/gif", Filename: "different.gif"})
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != 507 || apiError.Code != "storage_limit_exceeded" {
		t.Fatalf("trash incorrectly freed physical storage: %v", err)
	}
	if count := retainedFiles(t, filepath.Join(directory, "media")); count != 2 {
		t.Fatalf("failed or duplicate captures leaked %d retained files", count)
	}
}

func retainedFiles(t *testing.T, directory string) int {
	t.Helper()
	count := 0
	if err := filepath.WalkDir(directory, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			count++
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestInstanceLimitFailureReleasesReceiptWithoutPublishingFiles(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	original := animatedFixture(t, 160)
	s.storageLimitBytes = int64(len(original))
	save := func() (model.UploadResponse, error) {
		return s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(original), MIME: "image/gif", Filename: "reaction.gif", IdempotencyKey: "retry-after-capacity"})
	}
	_, err := save()
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Code != "storage_limit_exceeded" {
		t.Fatalf("poster not included in physical storage: %v", err)
	}
	if count := retainedFiles(t, filepath.Join(directory, "media")); count != 0 {
		t.Fatalf("capacity failure left %d files", count)
	}
	s.storageLimitBytes = 0
	result, err := save()
	if err != nil || !result.Success || result.IsDuplicate {
		t.Fatalf("unlimited capacity retry did not settle original request: %+v %v", result, err)
	}
}

func TestMediaNeverOpensAnotherOwnerOrSymlink(t *testing.T) {
	db, owner, directory := ingestionDatabase(t)
	s := localIngestion(t, db, directory)
	result, err := s.Save(context.Background(), owner, Input{Reader: bytes.NewReader(animatedFixture(t, 120)), MIME: "image/gif", Filename: "original.gif"})
	if err != nil {
		t.Fatal(err)
	}
	if file, err := s.OpenMedia(context.Background(), "another-owner", result.Asset.ID, false); err == nil {
		file.Close()
		t.Fatal("another owner opened private media")
	}
	originalPath := filepath.Join(directory, "media", result.Asset.Pathname)
	if err := os.Remove(originalPath); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(t.TempDir(), "private-secret")
	if err := os.WriteFile(secret, bytes.Repeat([]byte("s"), int(result.Asset.Size)), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, originalPath); err != nil {
		t.Fatal(err)
	}
	if file, err := s.OpenMedia(context.Background(), owner, result.Asset.ID, false); err == nil {
		file.Close()
		t.Fatal("media followed a private-file symlink")
	}
}
