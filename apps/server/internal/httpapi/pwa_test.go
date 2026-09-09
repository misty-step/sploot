package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestShareBodyAllowsReadAfterProcessingDelay(t *testing.T) {
	previous := shareReadWindow
	shareReadWindow = 80 * time.Millisecond
	t.Cleanup(func() { shareReadWindow = previous })

	first := make(chan struct{})
	result := make(chan error, 1)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Proto != "HTTP/2.0" {
			result <- fmt.Errorf("expected HTTP/2.0, got %s", r.Proto)
			http.Error(w, "HTTP/2 required", http.StatusHTTPVersionNotSupported)
			return
		}
		body := http.MaxBytesReader(w, &shareBody{ReadCloser: r.Body, controller: http.NewResponseController(w)}, 1<<20)
		buf := make([]byte, 5)
		if _, err := io.ReadFull(body, buf); err != nil {
			result <- fmt.Errorf("first read: %w", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		close(first)
		time.Sleep(3 * shareReadWindow)
		if _, err := io.ReadFull(body, buf); err != nil {
			result <- fmt.Errorf("second read after processing: %w", err)
			http.Error(w, err.Error(), http.StatusRequestTimeout)
			return
		}
		result <- nil
		w.WriteHeader(http.StatusNoContent)
	}))
	server.EnableHTTP2 = true
	server.StartTLS()
	t.Cleanup(server.Close)

	reader, writer := io.Pipe()
	t.Cleanup(func() {
		_ = writer.Close()
		_ = reader.Close()
	})
	request, err := http.NewRequest(http.MethodPost, server.URL, reader)
	if err != nil {
		t.Fatal(err)
	}
	client := server.Client()
	client.Timeout = 3 * time.Second
	done := make(chan error, 1)
	go func() {
		response, err := client.Do(request)
		if err != nil {
			done <- err
			return
		}
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
		if response.StatusCode != http.StatusNoContent {
			done <- fmt.Errorf("status %d", response.StatusCode)
			return
		}
		done <- nil
	}()
	if _, err := writer.Write([]byte("hello")); err != nil {
		t.Fatal(err)
	}
	select {
	case <-first:
	case err := <-result:
		t.Fatalf("server failed before processing delay: %v", err)
	case err := <-done:
		t.Fatalf("client failed before processing delay: %v", err)
	case <-time.After(time.Second):
		t.Fatal("server never consumed the first body read")
	}
	time.Sleep(3 * shareReadWindow)
	if _, err := writer.Write([]byte("world")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("server never finished the delayed second read")
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("client never completed the HTTP/2 request")
	}
}
