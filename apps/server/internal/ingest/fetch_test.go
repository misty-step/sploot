package ingest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func fixtureFetcher(origin string) *Service {
	return &Service{enabled: true, localImportOrigin: origin, fetchClient: newFetchClient(origin)}
}

func TestURLImportRejectsPrivateRedirectBeforeContact(t *testing.T) {
	var contacted atomic.Int32
	private := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { contacted.Add(1); w.WriteHeader(http.StatusOK) }))
	defer private.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, private.URL+"/secret", http.StatusFound)
	}))
	defer origin.Close()
	s := fixtureFetcher(origin.URL)
	_, _, _, err := s.Fetch(context.Background(), origin.URL+"/image")
	var apiError *model.APIError
	if !errors.As(err, &apiError) || contacted.Load() != 0 {
		t.Fatalf("private redirect contacted=%d error=%v", contacted.Load(), err)
	}
	_, _, _, err = s.Fetch(context.Background(), strings.Replace(origin.URL, "http://", "http://user:password@", 1)+"/image")
	if !errors.As(err, &apiError) {
		t.Fatalf("credential URL was not rejected: %v", err)
	}
}

func TestURLImportRejectsEveryPrivateDNSAnswer(t *testing.T) {
	lookup := func(context.Context, string, string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr("127.0.0.1")}, nil
	}
	connection, err := dialRemote(context.Background(), "tcp", "media.example:80", "", lookup)
	if connection != nil {
		connection.Close()
		t.Fatal("mixed public/private DNS was dialed")
	}
	var apiError *model.APIError
	if !errors.As(err, &apiError) {
		t.Fatalf("mixed DNS should fail before dialing, got %v", err)
	}
	for _, address := range []string{"::ffff:127.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::", "100.64.0.1", "169.254.169.254", "198.19.1.2", "fd00::1", "fe80::1", "0.0.0.0"} {
		if publicAddress(netip.MustParseAddr(address)) {
			t.Errorf("unsafe connection address admitted: %s", address)
		}
	}
	for _, address := range []string{"1.1.1.1", "2606:4700:4700::1111"} {
		if !publicAddress(netip.MustParseAddr(address)) {
			t.Errorf("public address rejected: %s", address)
		}
	}
}

func TestRemoteMediaStreamsByteRangesThroughRedirects(t *testing.T) {
	original := []byte("0123456789abcdefghij")
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("Referer") != "" {
			t.Error("remote import forwarded credentials or a referer")
		}
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, "/media", http.StatusFound)
			return
		}
		http.ServeContent(w, r, "original.gif", time.Time{}, bytes.NewReader(original))
	}))
	defer origin.Close()
	s := fixtureFetcher(origin.URL)
	s.enabled = false // Turning capture off must not turn delivery off.
	response, err := s.OpenRemote(context.Background(), origin.URL+"/redirect", "bytes=3-8")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 206 || response.Header.Get("Content-Range") != "bytes 3-8/20" || !bytes.Equal(body, original[3:9]) {
		t.Fatalf("incorrect byte range: status=%d range=%q body=%q", response.StatusCode, response.Header.Get("Content-Range"), body)
	}
	response, err = s.OpenRemote(context.Background(), origin.URL+"/media", "bytes=99-")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 416 {
		t.Fatalf("unsatisfiable range status = %d", response.StatusCode)
	}
}

func TestRemoteMediaBoundsDeclaredAndStreamedBytes(t *testing.T) {
	for _, mode := range []string{"declared-oversize", "streamed-oversize", "exact-limit"} {
		t.Run(mode, func(t *testing.T) {
			origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "image/png")
				if mode == "declared-oversize" {
					w.Header().Set("Content-Length", strconv.Itoa(contract.UploadMaxBytes+1))
					w.WriteHeader(http.StatusOK)
					return
				}
				w.(http.Flusher).Flush()
				size := int64(contract.UploadMaxBytes)
				if mode == "streamed-oversize" {
					size++
				}
				_, _ = io.CopyN(w, repeatedBytes{}, size)
			}))
			defer origin.Close()
			body, _, _, err := fixtureFetcher(origin.URL).Fetch(context.Background(), origin.URL+"/image")
			var count int64
			if err == nil {
				defer body.Close()
				count, err = io.Copy(io.Discard, body)
			}
			if mode == "exact-limit" {
				if err != nil || count != int64(contract.UploadMaxBytes) {
					t.Fatalf("exact bound count=%d error=%v", count, err)
				}
			} else {
				var apiError *model.APIError
				if !errors.As(err, &apiError) || apiError.Status != 413 || count > int64(contract.UploadMaxBytes) {
					t.Fatalf("oversize count=%d error=%v", count, err)
				}
			}
		})
	}
}

type repeatedBytes struct{}

func (repeatedBytes) Read(buffer []byte) (int, error) {
	for index := range buffer {
		buffer[index] = 'x'
	}
	return len(buffer), nil
}

func TestRemoteMediaCancellationStopsStalledBody(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer origin.Close()
	ctx, cancel := context.WithCancel(context.Background())
	body, _, _, err := fixtureFetcher(origin.URL).Fetch(ctx, origin.URL+"/stalled")
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	defer body.Close()
	cancel()
	_, err = io.Copy(io.Discard, body)
	if err == nil {
		t.Fatal("canceled media stream did not fail")
	}
}

func TestLocalImportPermissionIsOneExplicitOrigin(t *testing.T) {
	for _, origin := range []string{"http://localhost:8080", "http://10.0.0.1:8080", "http://127.0.0.1", "http://127.0.0.1:8080/private"} {
		if _, err := validateLocalImportOrigin(origin, true); err == nil {
			t.Errorf("unsafe local origin admitted: %s", origin)
		}
	}
	if _, err := validateLocalImportOrigin("http://127.0.0.1:8080", false); err == nil {
		t.Fatal("production admitted local import")
	}
	origin, err := validateLocalImportOrigin("http://[::1]:8080", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := validateRemoteURL(origin+"/image", origin); err != nil {
		t.Fatal(err)
	}
	if _, err := validateRemoteURL("http://"+net.JoinHostPort("::1", "8081")+"/image", origin); err == nil {
		t.Fatal("local permission escaped its configured port")
	}
}
