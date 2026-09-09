package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const testBaseURL = "https://sploot.example"
const testPassword = "correct horse battery staple"

func authDatabase(t *testing.T) (*Service, string) {
	t.Helper()
	directory := t.TempDir()
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s, err := New(db, Options{BaseURL: testBaseURL, RegistrationOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	return s, directory
}

func authRequest(method, path string) *http.Request {
	r := httptest.NewRequest(method, testBaseURL+path, nil)
	r.RemoteAddr = "127.0.0.1:43123"
	if !safeMethod(method) {
		r.Header.Set("Origin", testBaseURL)
	}
	return r
}

func sessionRequest(method, path string, session Session) *http.Request {
	r := authRequest(method, path)
	r.AddCookie(&http.Cookie{Name: SessionCookie, Value: session.Token})
	return r
}

func tokenRequest(token string) *http.Request {
	r := authRequest(http.MethodGet, "/api/assets")
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func registerAccount(t *testing.T, s *Service, email string) Session {
	t.Helper()
	session, err := s.Register(authRequest(http.MethodPost, "/api/auth/register"), email, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	return session
}

func browserPrincipal(t *testing.T, s *Service, session Session) model.Principal {
	t.Helper()
	principal, err := s.ResolveBrowser(sessionRequest(http.MethodGet, "/api/auth/session", session))
	if err != nil {
		t.Fatal(err)
	}
	return principal
}

func pairedDevice(t *testing.T, s *Service, session Session, name string) DeviceAuthorization {
	t.Helper()
	challenge, err := s.RequestDevice(authRequest(http.MethodPost, "/api/auth/device"), name)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ApproveDevice(context.Background(), browserPrincipal(t, s, session), challenge.UserCode, true); err != nil {
		t.Fatal(err)
	}
	result, err := s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), challenge.DeviceCode)
	if err != nil || result.Status != "authorized" || result.User == nil || result.User.ID != session.User.ID {
		t.Fatalf("pairing did not authorize the approving owner: status=%s error=%v", result.Status, err)
	}
	return result
}

func TestAccountsPersistAndRevokedOrExpiredSessionsCannotAuthenticate(t *testing.T) {
	s, directory := authDatabase(t)
	session := registerAccount(t, s, "  Alice@Example.com  ")
	if session.User.Email != "alice@example.com" {
		t.Fatalf("account email not canonical: %s", session.User.Email)
	}
	var storedPassword, storedToken string
	if err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, session.User.ID).Scan(&storedPassword); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT token_hash FROM auth_sessions WHERE user_id = ?`, session.User.ID).Scan(&storedToken); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(storedPassword, passwordParameters) || strings.Contains(storedPassword, testPassword) || storedToken != secretHash(session.Token) || storedToken == session.Token {
		t.Fatal("password or session secret was not stored as a one-way hash")
	}
	_, err := s.Register(authRequest(http.MethodPost, "/api/auth/register"), "ALICE@example.com", testPassword)
	requireAPIStatus(t, err, http.StatusConflict)
	_, err = s.Login(authRequest(http.MethodPost, "/api/auth/login"), session.User.Email, "incorrect password")
	requireAPIStatus(t, err, http.StatusUnauthorized)
	_, err = s.Login(authRequest(http.MethodPost, "/api/auth/login"), "missing@example.com", testPassword)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	if err := s.db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s, err = New(db, Options{BaseURL: testBaseURL, RegistrationOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	if principal := browserPrincipal(t, s, session); principal.UserID != session.User.ID || principal.Email != session.User.Email {
		t.Fatal("restart lost the session's durable owner")
	}
	second, err := s.Login(authRequest(http.MethodPost, "/api/auth/login"), session.User.Email, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Logout(context.Background(), browserPrincipal(t, s, second)); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(sessionRequest(http.MethodGet, "/api/assets", second), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	if _, err := s.db.Exec(`UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?`, time.Now().UTC().Add(-time.Minute), secretHash(session.Token)); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(sessionRequest(http.MethodGet, "/api/assets", session), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestExplicitCredentialsCannotFallBackOrGainBrowserAuthority(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	other := registerAccount(t, s, "other@example.com")
	var ownerHash, otherHash string
	if err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, owner.User.ID).Scan(&ownerHash); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, other.User.ID).Scan(&otherHash); err != nil {
		t.Fatal(err)
	}
	if ownerHash == otherHash {
		t.Fatal("accounts with equal passwords reused a salt")
	}
	device := pairedDevice(t, s, owner, "Extension")
	request := tokenRequest(device.Token)
	request.Header.Set("Origin", "chrome-extension://"+strings.Repeat("a", 32))
	principal, err := s.Resolve(request, false)
	if err != nil || principal.Method != "device" || principal.UserID != owner.User.ID {
		t.Fatalf("device library authority: %v", err)
	}
	_, err = s.ResolveBrowser(request)
	requireAPIStatus(t, err, http.StatusForbidden)
	request.Header.Set("X-Sploot-User-ID", other.User.ID)
	_, err = s.Resolve(request, false)
	requireAPIStatus(t, err, http.StatusConflict)
	for name, modify := range map[string]func(*http.Request){
		"invalid bearer": func(r *http.Request) { r.Header.Set("Authorization", "Bearer invalid") },
		"blank bearer":   func(r *http.Request) { r.Header.Set("Authorization", "") },
		"duplicate authorization": func(r *http.Request) {
			r.Header.Add("Authorization", "Bearer "+device.Token)
			r.Header.Add("Authorization", "Bearer "+device.Token)
		},
		"duplicate cookie":            func(r *http.Request) { r.Header.Add("Cookie", SessionCookie+"=invalid") },
		"whitespace cookie duplicate": func(r *http.Request) { r.Header.Add("Cookie", SessionCookie+" =invalid") },
		"malformed cookie duplicate":  func(r *http.Request) { r.Header.Add("Cookie", SessionCookie+"=\"unterminated") },
	} {
		t.Run(name, func(t *testing.T) {
			r := sessionRequest(http.MethodGet, "/api/assets", owner)
			modify(r)
			_, err := s.Resolve(r, true)
			requireAPIStatus(t, err, http.StatusUnauthorized)
		})
	}
	request = sessionRequest(http.MethodGet, "/api/auth/session", owner)
	request.Header.Set("Origin", "chrome-extension://"+strings.Repeat("a", 32))
	_, err = s.Resolve(request, false)
	requireAPIStatus(t, err, http.StatusForbidden)
	request = sessionRequest(http.MethodPost, "/api/upload", owner)
	request.Header.Del("Origin")
	_, err = s.Resolve(request, true)
	requireAPIStatus(t, err, http.StatusForbidden)
}

func TestDeviceApprovalIsOneTimeOwnerFencedAndRevocable(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	other := registerAccount(t, s, "other@example.com")
	ownerPrincipal, otherPrincipal := browserPrincipal(t, s, owner), browserPrincipal(t, s, other)
	challenge, err := s.RequestDevice(authRequest(http.MethodPost, "/api/auth/device"), "Laptop")
	if err != nil {
		t.Fatal(err)
	}
	pending, err := s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), challenge.DeviceCode)
	if err != nil || pending.Status != "pending" || pending.Token != "" || pending.User != nil {
		t.Fatalf("unapproved request gained authority: status=%s error=%v", pending.Status, err)
	}
	_, err = s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), challenge.DeviceCode)
	requireAPIStatus(t, err, http.StatusTooManyRequests)
	if err := s.ApproveDevice(context.Background(), ownerPrincipal, challenge.UserCode, true); err != nil {
		t.Fatal(err)
	}
	_, err = s.DeviceInfo(context.Background(), otherPrincipal, challenge.UserCode)
	requireAPIStatus(t, err, http.StatusNotFound)
	requireAPIStatus(t, s.ApproveDevice(context.Background(), otherPrincipal, challenge.UserCode, false), http.StatusNotFound)
	if _, err := s.db.Exec(`UPDATE device_requests SET poll_after = ? WHERE user_code = ?`, time.Now().UTC().Add(-time.Minute), challenge.UserCode); err != nil {
		t.Fatal(err)
	}
	type outcome struct {
		result DeviceAuthorization
		err    error
	}
	outcomes := make(chan outcome, 2)
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			result, err := s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), challenge.DeviceCode)
			outcomes <- outcome{result, err}
		}()
	}
	group.Wait()
	close(outcomes)
	var token string
	authorized, consumed := 0, 0
	for outcome := range outcomes {
		if outcome.err == nil {
			authorized++
			token = outcome.result.Token
			if outcome.result.Status != "authorized" || outcome.result.User == nil || outcome.result.User.ID != owner.User.ID {
				t.Fatal("device authorization changed the approving owner")
			}
		} else {
			requireAPIStatus(t, outcome.err, http.StatusGone)
			consumed++
		}
	}
	if authorized != 1 || consumed != 1 {
		t.Fatalf("device challenge was not consumed once: authorized=%d consumed=%d", authorized, consumed)
	}
	devices, err := s.Devices(context.Background(), ownerPrincipal)
	if err != nil || len(devices) != 1 || devices[0].Name != "Laptop" {
		t.Fatalf("device account listing: count=%d error=%v", len(devices), err)
	}
	otherDevices, err := s.Devices(context.Background(), otherPrincipal)
	if err != nil || len(otherDevices) != 0 {
		t.Fatal("device listing crossed the account boundary")
	}
	var stored string
	if err := s.db.QueryRow(`SELECT token_hash FROM auth_sessions WHERE id = ?`, devices[0].ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	serialized, err := json.Marshal(devices)
	if err != nil {
		t.Fatal(err)
	}
	if stored != secretHash(token) || strings.Contains(string(serialized), token) || strings.Contains(string(serialized), stored) {
		t.Fatal("device storage or listing exposed credential material")
	}
	if err := s.RevokeDevice(context.Background(), otherPrincipal, devices[0].ID); err != nil {
		t.Fatal(err)
	}
	if principal, err := s.Resolve(tokenRequest(token), false); err != nil || principal.UserID != owner.User.ID {
		t.Fatalf("foreign device revoke changed authority: %v", err)
	}
	if err := s.RevokeDevice(context.Background(), ownerPrincipal, devices[0].ID); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(tokenRequest(token), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestPasswordChangeRevokesOtherCredentialsWithoutCrossingOwners(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	other := registerAccount(t, s, "other@example.com")
	second, err := s.Login(authRequest(http.MethodPost, "/api/auth/login"), owner.User.Email, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	secondPrincipal := browserPrincipal(t, s, second)
	device := pairedDevice(t, s, owner, "Extension")
	lib := library.New(s.db, []byte(strings.Repeat("cursor-test-key-", 3)))
	token, err := lib.MintToken(context.Background(), browserPrincipal(t, s, owner), "Shortcut")
	if err != nil {
		t.Fatal(err)
	}
	challenge, err := s.RequestDevice(authRequest(http.MethodPost, "/api/auth/device"), "Unclaimed device")
	if err != nil {
		t.Fatal(err)
	}
	principal := browserPrincipal(t, s, owner)
	if err := s.ApproveDevice(context.Background(), principal, challenge.UserCode, true); err != nil {
		t.Fatal(err)
	}
	request := sessionRequest(http.MethodPost, "/api/auth/password", owner)
	requireAPIStatus(t, s.ChangePassword(request, principal, "incorrect password", "a different long password"), http.StatusUnauthorized)
	if err := s.ChangePassword(request, principal, testPassword, "a different long password"); err != nil {
		t.Fatal(err)
	}
	if got := browserPrincipal(t, s, owner); got.UserID != owner.User.ID {
		t.Fatal("password change lost current browser session")
	}
	if got := browserPrincipal(t, s, other); got.UserID != other.User.ID {
		t.Fatal("password change revoked another account's session")
	}
	for _, r := range []*http.Request{sessionRequest(http.MethodGet, "/api/assets", second), tokenRequest(device.Token), tokenRequest(token.Token)} {
		_, err := s.Resolve(r, true)
		requireAPIStatus(t, err, http.StatusUnauthorized)
	}
	_, err = lib.MintToken(context.Background(), secondPrincipal, "Revoked browser")
	requireAPIStatus(t, err, http.StatusUnauthorized)
	tokens, err := lib.Tokens(context.Background(), owner.User.ID)
	if err != nil || len(tokens) != 0 {
		t.Fatalf("revoked browser retained token authority: tokens=%d error=%v", len(tokens), err)
	}
	_, err = s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), challenge.DeviceCode)
	requireAPIStatus(t, err, http.StatusForbidden)
	_, err = s.Login(authRequest(http.MethodPost, "/api/auth/login"), owner.User.Email, testPassword)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	updated, err := s.Login(authRequest(http.MethodPost, "/api/auth/login"), owner.User.Email, "a different long password")
	if err != nil || updated.User.ID != owner.User.ID {
		t.Fatalf("new password cannot authenticate the original owner: %v", err)
	}
}

func TestDeniedExpiredAndDisconnectedDevicesCannotAuthenticate(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	principal := browserPrincipal(t, s, owner)
	denied, err := s.RequestDevice(authRequest(http.MethodPost, "/api/auth/device"), "Denied device")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ApproveDevice(context.Background(), principal, denied.UserCode, false); err != nil {
		t.Fatal(err)
	}
	_, err = s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), denied.DeviceCode)
	requireAPIStatus(t, err, http.StatusForbidden)
	expired, err := s.RequestDevice(authRequest(http.MethodPost, "/api/auth/device"), "Expired request")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE device_requests SET expires_at = ? WHERE user_code = ?`, time.Now().UTC().Add(-time.Minute), expired.UserCode); err != nil {
		t.Fatal(err)
	}
	_, err = s.PollDevice(authRequest(http.MethodPost, "/api/auth/device/token"), expired.DeviceCode)
	requireAPIStatus(t, err, http.StatusGone)
	device := pairedDevice(t, s, owner, "Disconnected device")
	devicePrincipal, err := s.ResolveDevice(tokenRequest(device.Token))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DisconnectDevice(context.Background(), devicePrincipal); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(tokenRequest(device.Token), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	device = pairedDevice(t, s, owner, "Expired credential")
	if _, err := s.db.Exec(`UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?`, time.Now().UTC().Add(-time.Minute), secretHash(device.Token)); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(tokenRequest(device.Token), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestDatabasePATScopeHashOnlyStorageAndRevocation(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	other := registerAccount(t, s, "other@example.com")
	ctx := context.Background()
	lib := library.New(s.db, []byte(strings.Repeat("cursor-test-key-", 3)))
	minted, err := lib.MintToken(ctx, browserPrincipal(t, s, owner), "phone")
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := s.db.QueryRowContext(ctx, `SELECT token_hash FROM upload_tokens WHERE id = ? AND user_id = ?`, minted.ID, owner.User.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != secretHash(minted.Token) || stored == minted.Token {
		t.Fatal("token was not stored as SHA-256 only")
	}
	listed, err := lib.Tokens(ctx, owner.User.ID)
	if err != nil {
		t.Fatal(err)
	}
	serialized, err := json.Marshal(listed)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(serialized), minted.Token) || strings.Contains(string(serialized), stored) {
		t.Fatal("token listing disclosed a credential or its hash")
	}
	request := tokenRequest(minted.Token)
	request.AddCookie(&http.Cookie{Name: SessionCookie, Value: owner.Token})
	_, err = s.Resolve(request, false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	principal, err := s.Resolve(request, true)
	if err != nil || principal.UserID != owner.User.ID || principal.Method != "upload-token" {
		t.Fatalf("allowed PAT request: %v", err)
	}
	_, err = lib.MintToken(ctx, principal, "Escalated PAT")
	requireAPIStatus(t, err, http.StatusForbidden)
	if err := lib.RevokeToken(ctx, other.User.ID, minted.ID); err != nil {
		t.Fatal(err)
	}
	principal, err = s.Resolve(tokenRequest(minted.Token), true)
	if err != nil || principal.UserID != owner.User.ID {
		t.Fatalf("cross-owner revoke affected token: %v", err)
	}
	if err := lib.RevokeToken(ctx, owner.User.ID, minted.ID); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(request, true)
	requireAPIStatus(t, err, http.StatusUnauthorized)
}

func TestDatabaseTokenMintingRejectsForeignOrNonBrowserAuthority(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	other := registerAccount(t, s, "other@example.com")
	principal := browserPrincipal(t, s, owner)
	device := pairedDevice(t, s, owner, "Extension")
	devicePrincipal, err := s.Resolve(tokenRequest(device.Token), false)
	if err != nil {
		t.Fatal(err)
	}
	foreignOwner := principal
	foreignOwner.UserID = other.User.ID
	missingSession := principal
	missingSession.SessionID = ""
	untyped := principal
	untyped.Method = ""
	disguisedDevice := devicePrincipal
	disguisedDevice.Method = "browser"
	lib := library.New(s.db, []byte(strings.Repeat("cursor-test-key-", 3)))
	for _, test := range []struct {
		name      string
		principal model.Principal
		status    int
	}{
		{"foreign owner", foreignOwner, http.StatusUnauthorized},
		{"missing session", missingSession, http.StatusUnauthorized},
		{"missing method", untyped, http.StatusForbidden},
		{"device method", devicePrincipal, http.StatusForbidden},
		{"device session posing as browser", disguisedDevice, http.StatusUnauthorized},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := lib.MintToken(context.Background(), test.principal, "Unauthorized token")
			requireAPIStatus(t, err, test.status)
		})
	}
	for _, userID := range []string{owner.User.ID, other.User.ID} {
		tokens, err := lib.Tokens(context.Background(), userID)
		if err != nil || len(tokens) != 0 {
			t.Fatalf("rejected authority issued tokens: tokens=%d error=%v", len(tokens), err)
		}
	}
}

func TestDatabaseTokenMintingRechecksBrowserExpiry(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	principal := browserPrincipal(t, s, owner)
	if _, err := s.db.Exec(`UPDATE auth_sessions SET expires_at = ? WHERE id = ?`,
		time.Unix(1, 0).UTC(), principal.SessionID); err != nil {
		t.Fatal(err)
	}
	lib := library.New(s.db, []byte(strings.Repeat("cursor-test-key-", 3)))
	_, err := lib.MintToken(context.Background(), principal, "Expired browser")
	requireAPIStatus(t, err, http.StatusUnauthorized)
	tokens, err := lib.Tokens(context.Background(), owner.User.ID)
	if err != nil || len(tokens) != 0 {
		t.Fatalf("expired browser issued tokens: tokens=%d error=%v", len(tokens), err)
	}
}

func TestDatabaseConcurrentTokenMintingCannotExceedActiveLimit(t *testing.T) {
	s, _ := authDatabase(t)
	owner := registerAccount(t, s, "owner@example.com")
	principal := browserPrincipal(t, s, owner)
	lib := library.New(s.db, []byte(strings.Repeat("cursor-test-key-", 3)))
	var group sync.WaitGroup
	results := make(chan error, 11)
	for range 11 {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := lib.MintToken(context.Background(), principal, "device")
			results <- err
		}()
	}
	group.Wait()
	close(results)
	created, refused := 0, 0
	for err := range results {
		if err == nil {
			created++
			continue
		}
		requireAPIStatus(t, err, http.StatusUnprocessableEntity)
		refused++
	}
	if created != 10 || refused != 1 {
		t.Fatalf("concurrent minting bypassed cap: created=%d refused=%d", created, refused)
	}
}

func TestAuthenticationAttemptBudgetIsAtomicPersistentAndExpires(t *testing.T) {
	s, _ := authDatabase(t)
	var group sync.WaitGroup
	results := make(chan error, 12)
	for range 12 {
		group.Add(1)
		go func() {
			defer group.Done()
			results <- s.limit(context.Background(), "bounded-account", 3, time.Minute)
		}()
	}
	group.Wait()
	close(results)
	allowed, refused := 0, 0
	for err := range results {
		if err == nil {
			allowed++
		} else {
			var apiError *model.APIError
			if !errors.As(err, &apiError) || apiError.Status != http.StatusTooManyRequests || apiError.RetryAfter < 1 {
				t.Fatalf("unexpected attempt rejection: %v", err)
			}
			refused++
		}
	}
	if allowed != 3 || refused != 9 {
		t.Fatalf("concurrent attempt cap bypassed: allowed=%d refused=%d", allowed, refused)
	}
	restarted, err := New(s.db, Options{BaseURL: testBaseURL, RegistrationOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	requireAPIStatus(t, restarted.limit(context.Background(), "bounded-account", 3, time.Minute), http.StatusTooManyRequests)
	if _, err := s.db.Exec(`UPDATE auth_attempts SET window_start = ? WHERE key = ?`, time.Now().UTC().Add(-2*time.Minute), secretHash("bounded-account")); err != nil {
		t.Fatal(err)
	}
	if err := restarted.limit(context.Background(), "bounded-account", 3, time.Minute); err != nil {
		t.Fatalf("expired authentication lockout remained active: %v", err)
	}
}

func TestAccountSwitchRevokesOldCookieAndFencesPendingCaptures(t *testing.T) {
	s, _ := authDatabase(t)
	first := registerAccount(t, s, "first@example.com")
	second := registerAccount(t, s, "second@example.com")
	switched, err := s.Login(sessionRequest(http.MethodPost, "/api/auth/login", first), second.User.Email, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(sessionRequest(http.MethodGet, "/api/assets", first), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	request := sessionRequest(http.MethodPost, "/api/upload", switched)
	request.Header.Set("X-Sploot-User-ID", first.User.ID)
	_, err = s.Resolve(request, true)
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != http.StatusConflict || apiError.Code != "ACCOUNT_CHANGED" {
		t.Fatalf("stale capture crossed the account switch: %v", err)
	}
	request.Header.Set("X-Sploot-User-ID", second.User.ID)
	principal, err := s.Resolve(request, true)
	if err != nil || principal.UserID != second.User.ID {
		t.Fatalf("current account could not capture after switch: %v", err)
	}
}
