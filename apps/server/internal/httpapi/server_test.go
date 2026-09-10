package httpapi

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/config"
)

func TestLegacyHostRedirectAllowlistIsolation(t *testing.T) {
	hosts := []string{"legacy.example", "archive.example"}
	for _, test := range []struct {
		name       string
		host       string
		hosts      []string
		wantStatus int
	}{
		{"disabled by default", "legacy.example", nil, http.StatusMisdirectedRequest},
		{"canonical remains served", "CANONICAL.example", hosts, http.StatusNoContent},
		{"canonical port remains exact", "canonical.example:443", hosts, http.StatusMisdirectedRequest},
		{"explicit legacy hostname", "LEGACY.example", hosts, http.StatusPermanentRedirect},
		{"second hostname with request port", "archive.example:443", hosts, http.StatusPermanentRedirect},
		{"unconfigured hostname", "other.example", hosts, http.StatusMisdirectedRequest},
		{"subdomains are not implicitly allowed", "child.legacy.example", hosts, http.StatusMisdirectedRequest},
		{"hostname suffix cannot impersonate an entry", "legacy.example.attacker.example", hosts, http.StatusMisdirectedRequest},
	} {
		t.Run(test.name, func(t *testing.T) {
			s := &Server{config: config.Config{BaseURL: "https://canonical.example", RedirectHosts: test.hosts}, logger: slog.Default()}
			handler := s.boundary(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(http.MethodGet, "https://"+test.host+"/app", nil)
			request.Header.Set("X-Forwarded-Host", "legacy.example")
			request.Header.Set("Forwarded", "host=legacy.example;proto=https")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status %d, want %d", response.Code, test.wantStatus)
			}
			wantLocation := ""
			if test.wantStatus == http.StatusPermanentRedirect {
				wantLocation = "https://canonical.example/app"
			}
			if got := response.Header().Get("Location"); got != wantLocation {
				t.Fatalf("Location %q, want %q", got, wantLocation)
			}
		})
	}
}

func TestLegacyHostRedirectFixesOriginAndDropsQuery(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			s := &Server{config: config.Config{BaseURL: "https://canonical.example:8443", RedirectHosts: []string{"legacy.example"}}, logger: slog.Default()}
			handler := s.boundary(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				t.Fatal("legacy request reached application routes")
			}))
			request := httptest.NewRequest(method, "https://legacy.example//attacker.example/%2ffolder%3Fpart?token=discard-me&next=https%3A%2F%2Fattacker.example", nil)
			request.Header.Set("X-Forwarded-Host", "attacker.example")
			request.Header.Set("X-Forwarded-Proto", "http")
			request.Header.Set("Referer", "https://legacy.example/app?token=discard-me")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusPermanentRedirect {
				t.Fatalf("status %d, want a permanent redirect", response.Code)
			}
			if got := response.Header().Get("Location"); got != "https://canonical.example:8443//attacker.example/%2ffolder%3Fpart" {
				t.Fatalf("redirect changed the origin or escaped path, or retained the query: %q", got)
			}
			if response.Header().Get("Referrer-Policy") != "no-referrer" || strings.Contains(response.Body.String(), "discard-me") {
				t.Fatal("redirect could disclose the original query through its referrer or body")
			}
			if method == http.MethodHead && response.Body.Len() != 0 {
				t.Fatal("HEAD redirect returned a response body")
			}
		})
	}
}

func TestLegacyHostRedirectRefusesAPIAndNonBrowserMethods(t *testing.T) {
	for _, test := range []struct {
		method     string
		path       string
		wantStatus int
	}{
		{http.MethodGet, "/api", http.StatusGone},
		{http.MethodHead, "/api/", http.StatusGone},
		{http.MethodGet, "/%61pi/assets", http.StatusGone},
		{http.MethodGet, "//app/../api/assets", http.StatusGone},
		{http.MethodGet, "/api/../app", http.StatusGone},
		{http.MethodPost, "/app", http.StatusGone},
		{http.MethodOptions, "/app", http.StatusGone},
		{http.MethodGet, "/apiary", http.StatusPermanentRedirect},
	} {
		t.Run(test.method+test.path, func(t *testing.T) {
			s := &Server{config: config.Config{BaseURL: "https://canonical.example", RedirectHosts: []string{"legacy.example"}}, logger: slog.Default()}
			handler := s.boundary(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				t.Fatal("legacy request forwarded credentials or a body to application routes")
			}))
			request := httptest.NewRequest(test.method, "https://legacy.example"+test.path+"?token=private-query", strings.NewReader("private-body"))
			request.Header.Set("Authorization", "Bearer private-token")
			request.Header.Set("Cookie", "session=private-session")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status %d, want %d", response.Code, test.wantStatus)
			}
			if test.wantStatus == http.StatusGone && response.Header().Get("Location") != "" {
				t.Fatal("retired API or mutation request received a forwarding location")
			}
			for _, secret := range []string{"private-query", "private-body", "private-token", "private-session"} {
				if strings.Contains(response.Body.String(), secret) {
					t.Fatal("legacy response disclosed request credentials or body")
				}
			}
		})
	}
}

func TestLegacyHostAllowlistPreservesLoopbackRedirect(t *testing.T) {
	s := &Server{config: config.Config{BaseURL: "http://127.0.0.1:3001", RedirectHosts: []string{"localhost"}}, logger: slog.Default()}
	handler := s.boundary(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("noncanonical loopback request reached application routes")
	}))
	request := httptest.NewRequest(http.MethodGet, "http://localhost:3001/api/version?keep=local", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusTemporaryRedirect || response.Header().Get("Location") != "http://127.0.0.1:3001/api/version?keep=local" {
		t.Fatalf("loopback redirect behavior changed: status=%d Location=%q", response.Code, response.Header().Get("Location"))
	}
}
