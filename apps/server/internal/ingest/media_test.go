package ingest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/library"
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

func TestSanitizeTagsUsesLibraryIdentity(t *testing.T) {
	input := []string{"\ufeffReaction", "reaction", " REACTION ", "\ufeffΟΣ\ufeff"}
	got, err := sanitizeTags(input)
	if err != nil {
		t.Fatal(err)
	}
	want, err := library.NormalizeTagNames(input, contract.TagMaxRequestItems)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(got, []string{"reaction", "ος"}) {
		t.Fatalf("upload tag names drifted from library identity: got %#v want %#v", got, want)
	}
}

func TestSanitizeTagsKeepsUploadErrorContract(t *testing.T) {
	_, err := sanitizeTags([]string{" "})
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != 400 || apiError.Code != "invalid_upload" || apiError.Message != "A tag name is empty or too long" {
		t.Fatalf("empty tag used a library error contract: %v", err)
	}
	tooMany := make([]string, contract.TagMaxRequestItems+1)
	for i := range tooMany {
		tooMany[i] = "tag"
	}
	_, err = sanitizeTags(tooMany)
	if !errors.As(err, &apiError) || apiError.Message != "Too many tags" {
		t.Fatalf("request-size error drifted: %v", err)
	}
}
