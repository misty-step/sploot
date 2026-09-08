package auth

import (
	"context"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/jwks"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func signingService(t *testing.T) (*Service, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return &Service{
		issuer:            "https://test.clerk.accounts.dev",
		authorizedParties: map[string]bool{"https://www.sploot.app": true},
		jwks:              &jwks.Client{}, keysExpireAt: time.Now().Add(time.Hour),
		keys: map[string]*clerk.JSONWebKey{"test-key": {Key: &key.PublicKey, KeyID: "test-key", Algorithm: "RS256", Use: "sig"}},
	}, key
}

func sessionClaims(subject string) map[string]any {
	now := time.Now().Unix()
	return map[string]any{"iss": "https://test.clerk.accounts.dev", "sub": subject, "sid": "sess_test", "azp": "https://www.sploot.app", "iat": now - 10, "nbf": now - 10, "exp": now + 60, "v": 2}
}

func signedJWT(t *testing.T, key *rsa.PrivateKey, claims map[string]any) string {
	t.Helper()
	body, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","kid":"test-key","typ":"JWT"}`)) + "." + base64.RawURLEncoding.EncodeToString(body)
	hash := sha256.Sum256([]byte(payload))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if err != nil {
		t.Fatal(err)
	}
	return payload + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func requireAPIStatus(t *testing.T, err error, status int) {
	t.Helper()
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != status {
		t.Fatalf("wanted API status %d, got %v", status, err)
	}
}

func TestSessionVerificationRejectsInvalidAuthorityAndInactiveSessions(t *testing.T) {
	s, key := signingService(t)
	valid, err := s.verifySession(context.Background(), signedJWT(t, key, sessionClaims("user_existing")))
	if err != nil || valid.Subject != "user_existing" || valid.SessionID != "sess_test" {
		t.Fatalf("valid session: %v, %v", valid, err)
	}
	cases := map[string]func(map[string]any){
		"wrong issuer":             func(c map[string]any) { c["iss"] = "https://other.clerk.accounts.dev" },
		"foreign authorized party": func(c map[string]any) { c["azp"] = "https://www.sploot.app.attacker.invalid" },
		"missing authorized party": func(c map[string]any) { delete(c, "azp") },
		"expired":                  func(c map[string]any) { c["iat"] = time.Now().Unix() - 100; c["exp"] = time.Now().Unix() - 30 },
		"future not before":        func(c map[string]any) { c["nbf"] = time.Now().Unix() + 30 },
		"missing expiry":           func(c map[string]any) { delete(c, "exp") },
		"missing session id":       func(c map[string]any) { delete(c, "sid") },
		"pending session":          func(c map[string]any) { c["sts"] = "pending" },
	}
	for name, modify := range cases {
		t.Run(name, func(t *testing.T) {
			claims := sessionClaims("user_existing")
			modify(claims)
			_, err := s.verifySession(context.Background(), signedJWT(t, key, claims))
			requireAPIStatus(t, err, http.StatusUnauthorized)
		})
	}
	token := signedJWT(t, key, sessionClaims("user_existing"))
	parts := strings.Split(token, ".")
	signature, _ := base64.RawURLEncoding.DecodeString(parts[2])
	signature[0] ^= 1
	parts[2] = base64.RawURLEncoding.EncodeToString(signature)
	_, err = s.verifySession(context.Background(), strings.Join(parts, "."))
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestPATRequiresExplicitOptInAndDoesNotFallBackToSession(t *testing.T) {
	s, key := signingService(t)
	r := httptest.NewRequest(http.MethodGet, "https://www.sploot.app/api/upload-tokens", nil)
	r.Header.Set("Authorization", "Bearer splt_"+strings.Repeat("A", 43))
	r.AddCookie(&http.Cookie{Name: "__session", Value: signedJWT(t, key, sessionClaims("user_existing"))})
	_, err := s.Resolve(r, false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	r.Header.Add("Authorization", "Bearer another")
	_, err = s.Resolve(r, true)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func signedQA(t *testing.T, secret string, payload map[string]any) string {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestQATokensHonorCanonicalBindingAndLifetime(t *testing.T) {
	now := time.Unix(1800000000, 0)
	secret := strings.Repeat("q", 32)
	s := &Service{qaSecret: []byte(secret), qaUserID: "qa-regression"}
	payload := func() map[string]any {
		return map[string]any{
			"v": 1, "userId": "qa-regression", "deploymentId": "local-pwa-capture-v1", "deploymentEnv": "local-qa", "audience": "sploot-pwa-capture", "iat": now.Unix() - 1, "exp": now.Unix() + 899,
		}
	}
	parsed, err := s.verifyQAToken(signedQA(t, secret, payload()), now)
	if err != nil || parsed.UserID != "qa-regression" {
		t.Fatalf("canonical token: %v, %v", parsed, err)
	}
	cases := map[string]func(map[string]any){
		"different configured user": func(p map[string]any) { p["userId"] = "qa-other" },
		"real user":                 func(p map[string]any) { p["userId"] = "user_real" },
		"production deployment":     func(p map[string]any) { p["deploymentEnv"] = "production" },
		"different issuer":          func(p map[string]any) { p["deploymentId"] = "other-local" },
		"different audience":        func(p map[string]any) { p["audience"] = "sploot-gallery-evidence" },
		"expired":                   func(p map[string]any) { p["exp"] = now.Unix() },
		"future issued":             func(p map[string]any) { p["iat"] = now.Unix() + 1 },
		"overlong lifetime":         func(p map[string]any) { p["exp"] = now.Unix() + 900 },
		"unknown field":             func(p map[string]any) { p["admin"] = true },
	}
	for name, modify := range cases {
		t.Run(name, func(t *testing.T) {
			p := payload()
			modify(p)
			_, err := s.verifyQAToken(signedQA(t, secret, p), now)
			requireAPIStatus(t, err, http.StatusUnauthorized)
		})
	}
	_, err = s.verifyQAToken(signedQA(t, "wrong signing authority", payload()), now)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestQABoundaryRejectsRemoteProxyAndCrossOriginRequests(t *testing.T) {
	base, _ := url.Parse("http://127.0.0.1:3001")
	s := &Service{baseURL: base, qaSecret: []byte(strings.Repeat("q", 32)), qaUserID: "qa-regression"}
	request := func() *http.Request {
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3001/qa-auth/login", nil)
		r.RemoteAddr = "127.0.0.1:43123"
		return r
	}
	if err := s.qaBoundary(request()); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*http.Request){
		"remote transport":      func(r *http.Request) { r.RemoteAddr = "203.0.113.8:43123" },
		"missing transport":     func(r *http.Request) { r.RemoteAddr = "" },
		"DNS rebinding":         func(r *http.Request) { r.Host = "attacker.invalid:3001" },
		"forwarded proxy":       func(r *http.Request) { r.Header.Set("X-Forwarded-For", "127.0.0.1") },
		"cross origin":          func(r *http.Request) { r.Header.Set("Origin", "https://attacker.invalid") },
		"cross site navigation": func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			r := request()
			mutate(r)
			requireAPIStatus(t, s.qaBoundary(r), http.StatusForbidden)
		})
	}
	r := request()
	r.Header.Set("X-Sploot-QA-Auth", "invalid")
	r.Header.Set("Authorization", "Bearer ignored-session")
	_, err := s.Resolve(r, true)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestQAConfigurationRejectsProductionAndNonLocalDatabase(t *testing.T) {
	for _, configuration := range []struct{ environment, base, host, user string }{
		{"production", "https://www.sploot.app", "127.0.0.1", "qa-regression"},
		{"test", "http://127.0.0.1:3001", "remote-database.invalid", "qa-regression"},
		{"test", "http://127.0.0.1:3001", "127.0.0.1", "user_existing"},
	} {
		t.Run(configuration.environment+"-"+configuration.host+"-"+configuration.user, func(t *testing.T) {
			config, err := pgxpool.ParseConfig("postgres://test@" + configuration.host + "/test?sslmode=disable")
			if err != nil {
				t.Fatal(err)
			}
			config.MinConns = 0
			pool, err := pgxpool.NewWithConfig(context.Background(), config)
			if err != nil {
				t.Fatal(err)
			}
			defer pool.Close()
			_, err = New(pool, Options{Environment: configuration.environment, BaseURL: configuration.base, QALocalUserID: configuration.user, QALocalSecret: strings.Repeat("q", 32)})
			if err == nil {
				t.Fatal("unsafe QA configuration was accepted")
			}
		})
	}
}
