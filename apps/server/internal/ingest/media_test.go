package ingest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

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
