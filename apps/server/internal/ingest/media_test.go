package ingest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func TestDecoderOutputLimitCannotBeBypassedByFileCopy(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "decoder-output")
	if err := os.WriteFile(filename, bytes.Repeat([]byte{1}, 4096), 0600); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	output := limitedBuffer{limit: 128}
	_, err = io.Copy(&output, file)
	if err == nil || output.Len() > 128 {
		t.Fatalf("io.Copy bypassed the decoder output bound: length=%d error=%v", output.Len(), err)
	}
}

func TestOriginalUploadRejectsUnboundedReaderAndMIMESpoofing(t *testing.T) {
	_, err := spool(context.Background(), t.TempDir(), repeatedBytes{}, "image/gif")
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != 413 {
		t.Fatalf("unbounded upload did not stop at the shared limit: %v", err)
	}
	_, err = spool(context.Background(), t.TempDir(), bytes.NewBufferString("<html>not a GIF</html>"), "image/gif")
	if !errors.As(err, &apiError) || apiError.Status != 400 {
		t.Fatalf("spoofed MIME was accepted: %v", err)
	}
}

func TestSpoolAndPutFailWhenContextIsAlreadyCanceled(t *testing.T) {
	original := animatedFixture(t, 7)
	checksum := contract.SHA256Hex(original)
	media := filepath.Join(t.TempDir(), "media")
	if err := os.Mkdir(media, 0700); err != nil {
		t.Fatal(err)
	}
	store, err := newObjectStore(media)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.root.Close() })
	key := OwnerMediaPrefix("owner-id", "asset-id") + "meme.gif"

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	spoolSource := bytes.NewReader(original)
	if _, err := spool(ctx, t.TempDir(), spoolSource, "image/gif"); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled spool: %v", err)
	}
	if spoolSource.Len() != len(original) {
		t.Fatal("canceled spool consumed the upload")
	}
	putSource := bytes.NewReader(original)
	if _, err := store.put(ctx, key, putSource, int64(len(original)), checksum); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled put: %v", err)
	}
	if putSource.Len() != len(original) {
		t.Fatal("canceled put consumed the upload")
	}

	spooled, err := spool(context.Background(), t.TempDir(), bytes.NewReader(original), "image/gif")
	if err != nil || spooled.size != int64(len(original)) || spooled.checksum != checksum {
		t.Fatalf("live spool: %+v %v", spooled, err)
	}
	stored, err := store.put(context.Background(), key, bytes.NewReader(original), int64(len(original)), checksum)
	if err != nil || stored.key != key || stored.checksum != checksum {
		t.Fatalf("live put: %+v %v", stored, err)
	}
}
