package auth

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

func requireAPIStatus(t *testing.T, err error, status int) {
	t.Helper()
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != status {
		t.Fatalf("wanted API status %d, got %v", status, err)
	}
}

func TestBrowserOriginAuthorityDoesNotExtendToExtensions(t *testing.T) {
	base, err := url.Parse("https://sploot.example")
	if err != nil {
		t.Fatal(err)
	}
	s := &Service{baseURL: base}
	extension := "chrome-extension://" + strings.Repeat("a", 32)
	if !s.AllowedOrigin(extension) {
		t.Fatal("extension bearer origin rejected")
	}
	for _, origin := range []string{"https://sploot.example.attacker.invalid", extension + "/", "chrome-extension://" + strings.Repeat("q", 32), "null"} {
		if s.AllowedOrigin(origin) {
			t.Fatalf("foreign origin accepted: %s", origin)
		}
	}
	for name, modify := range map[string]func(*http.Request){
		"missing mutation origin": func(r *http.Request) { r.Header.Del("Origin") },
		"extension cookie":        func(r *http.Request) { r.Header.Set("Origin", extension) },
		"foreign origin":          func(r *http.Request) { r.Header.Set("Origin", "https://attacker.invalid") },
		"duplicate origin":        func(r *http.Request) { r.Header.Add("Origin", base.String()) },
		"foreign host":            func(r *http.Request) { r.Host = "attacker.invalid" },
		"cross-site fetch":        func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") },
	} {
		t.Run(name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, base.String()+"/api/auth/login", nil)
			r.Header.Set("Origin", base.String())
			modify(r)
			requireAPIStatus(t, s.CheckBrowserRequest(r), http.StatusForbidden)
		})
	}
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		r := httptest.NewRequest(method, base.String()+"/api/auth/session", nil)
		if method == http.MethodPost {
			r.Header.Set("Origin", base.String())
		}
		if err := s.CheckBrowserRequest(r); err != nil {
			t.Fatalf("same-origin browser request rejected: %v", err)
		}
	}
}

func TestBrowserCookiesAreHostOnlyAndExpireOnLogout(t *testing.T) {
	for _, scheme := range []string{"http", "https"} {
		t.Run(scheme, func(t *testing.T) {
			base, err := url.Parse(scheme + "://sploot.example")
			if err != nil {
				t.Fatal(err)
			}
			s := &Service{baseURL: base}
			token, err := newSecret("")
			if err != nil {
				t.Fatal(err)
			}
			expires := time.Now().UTC().Add(browserLifetime).Truncate(time.Second)
			recorder := httptest.NewRecorder()
			s.SetSessionCookie(recorder, Session{Token: token, ExpiresAt: expires})
			cookies := recorder.Result().Cookies()
			if len(cookies) != 1 {
				t.Fatalf("expected one session cookie, got %d", len(cookies))
			}
			cookie := cookies[0]
			if cookie.Name != SessionCookie || cookie.Value != token || cookie.Path != "/" || cookie.Domain != "" || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Secure != (scheme == "https") || !cookie.Expires.Equal(expires) || cookie.MaxAge != int(browserLifetime/time.Second) {
				t.Fatal("session cookie lost its host, security, or lifetime boundary")
			}
			recorder = httptest.NewRecorder()
			s.ClearSessionCookie(recorder)
			cookies = recorder.Result().Cookies()
			if len(cookies) != 1 || cookies[0].Name != SessionCookie || cookies[0].Value != "" || cookies[0].MaxAge != -1 || cookies[0].Path != "/" || !cookies[0].HttpOnly || cookies[0].Secure != (scheme == "https") || !cookies[0].Expires.Before(time.Now()) {
				t.Fatal("logout did not expire the same protected cookie")
			}
		})
	}
}

func TestPasswordPolicyUsesCharactersWithoutCompositionRules(t *testing.T) {
	for _, password := range []string{strings.Repeat("a", 12), strings.Repeat("界", 128)} {
		if err := validatePassword(password); err != nil {
			t.Fatalf("valid password boundary rejected: %v", err)
		}
	}
	for _, password := range []string{strings.Repeat("a", 11), strings.Repeat("界", 129)} {
		requireAPIStatus(t, validatePassword(password), http.StatusBadRequest)
	}
}

func TestAccountEntryRejectsLoginCSRFAndBearerAuthority(t *testing.T) {
	base, err := url.Parse(testBaseURL)
	if err != nil {
		t.Fatal(err)
	}
	s := &Service{baseURL: base, registrationOpen: true}
	for _, operation := range []struct {
		name string
		run  func(*http.Request, string, string) (Session, error)
	}{
		{"register", s.Register},
		{"login", s.Login},
	} {
		t.Run(operation.name, func(t *testing.T) {
			request := authRequest(http.MethodPost, "/api/auth/"+operation.name)
			request.Header.Del("Origin")
			_, err := operation.run(request, "owner@example.com", testPassword)
			requireAPIStatus(t, err, http.StatusForbidden)
			request.Header.Set("Origin", testBaseURL)
			request.Header.Set("Authorization", "Bearer invalid")
			_, err = operation.run(request, "owner@example.com", testPassword)
			requireAPIStatus(t, err, http.StatusUnauthorized)
		})
	}
	s.registrationOpen = false
	_, err = s.Register(authRequest(http.MethodPost, "/api/auth/register"), "owner@example.com", testPassword)
	requireAPIStatus(t, err, http.StatusForbidden)
}
