package ctxio

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestReaderPassesBytesUntilContextIsDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	source := strings.NewReader("abcdef")
	wrapped := Reader(ctx, source)

	first := make([]byte, 3)
	n, err := wrapped.Read(first)
	if err != nil || n != 3 || string(first) != "abc" {
		t.Fatalf("live read: n=%d err=%v data=%q", n, err, first)
	}

	cancel()
	n, err = wrapped.Read(make([]byte, 3))
	if n != 0 || !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled read: n=%d err=%v", n, err)
	}
	if source.Len() != 3 {
		t.Fatalf("canceled read consumed the wrapped stream: remaining=%d", source.Len())
	}
}

func TestWriterPassesBytesUntilContextIsDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var sink bytes.Buffer
	wrapped := Writer(ctx, &sink)

	n, err := wrapped.Write([]byte("ab"))
	if err != nil || n != 2 || sink.String() != "ab" {
		t.Fatalf("live write: n=%d err=%v data=%q", n, err, sink.String())
	}

	cancel()
	n, err = wrapped.Write([]byte("cd"))
	if n != 0 || !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled write: n=%d err=%v", n, err)
	}
	if sink.String() != "ab" {
		t.Fatalf("canceled write mutated the wrapped stream: data=%q", sink.String())
	}
}

func TestReaderPreservesUnderlyingErrors(t *testing.T) {
	want := errors.New("source failed")
	n, err := Reader(context.Background(), failingReader{err: want}).Read(make([]byte, 4))
	if n != 0 || !errors.Is(err, want) {
		t.Fatalf("underlying error: n=%d err=%v", n, err)
	}
}

type failingReader struct{ err error }

func (r failingReader) Read([]byte) (int, error) { return 0, r.err }

func TestReaderReportsEOF(t *testing.T) {
	n, err := io.Copy(io.Discard, Reader(context.Background(), strings.NewReader("ok")))
	if n != 2 || err != nil {
		t.Fatalf("copy: n=%d err=%v", n, err)
	}
}
