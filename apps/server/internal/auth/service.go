package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	SessionCookie   = "sploot_session"
	browserLifetime = 30 * 24 * time.Hour
	deviceLifetime  = 90 * 24 * time.Hour
)

var extensionOrigin = regexp.MustCompile(`^chrome-extension://[a-p]{32}$`)

type Options struct {
	BaseURL          string
	RegistrationOpen bool
}

type Service struct {
	db               *sql.DB
	baseURL          *url.URL
	registrationOpen bool
	passwordSlots    chan struct{}
}

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// Session carries a newly minted credential to the HTTP boundary only. Tokens
// are never persisted or included in ordinary account JSON responses.
type Session struct {
	User      User      `json:"user"`
	Token     string    `json:"-"`
	ExpiresAt time.Time `json:"-"`
}

func New(db *sql.DB, opts Options) (*Service, error) {
	if db == nil {
		return nil, errors.New("authentication requires a persistent database")
	}
	base, err := url.Parse(opts.BaseURL)
	if err != nil || base == nil || (base.Scheme != "http" && base.Scheme != "https") || base.Hostname() == "" || base.User != nil || base.Opaque != "" || base.RawQuery != "" || base.ForceQuery || base.Fragment != "" || base.RawFragment != "" || base.RawPath != "" || (base.Path != "" && base.Path != "/") {
		return nil, errors.New("authentication base URL must be an HTTP(S) origin")
	}
	base.Path = ""
	return &Service{db: db, baseURL: base, registrationOpen: opts.RegistrationOpen, passwordSlots: make(chan struct{}, 2)}, nil
}

// AllowedOrigin governs CORS, not cookie authority. Extension origins can only
// present bearer credentials; browser cookies are restricted to the base URL.
func (s *Service) AllowedOrigin(origin string) bool {
	return origin == s.baseURL.String() || extensionOrigin.MatchString(origin)
}

// CheckBrowserRequest also protects unauthenticated login/registration from
// login CSRF. Missing Origin is permitted only for read-only requests.
func (s *Service) CheckBrowserRequest(r *http.Request) error {
	origins := r.Header.Values("Origin")
	if len(origins) > 1 || (len(origins) == 1 && origins[0] != s.baseURL.String()) || (!safeMethod(r.Method) && len(origins) != 1) {
		return forbiddenOrigin()
	}
	if !strings.EqualFold(r.Host, s.baseURL.Host) {
		return forbiddenOrigin()
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		// A top-level link may legitimately navigate from another site. It
		// cannot mutate state or read an API response on that site's behalf.
		if !safeMethod(r.Method) || r.Header.Get("Sec-Fetch-Mode") != "navigate" {
			return forbiddenOrigin()
		}
	}
	return nil
}

// CheckPairingRequest permits extension and non-browser pairing clients but
// never derives authority from cookies or a caller-supplied identity.
func (s *Service) CheckPairingRequest(r *http.Request) error {
	if len(r.Header.Values("Authorization")) != 0 {
		return unauthorized()
	}
	return s.checkBearerOrigin(r)
}

func (s *Service) checkBearerOrigin(r *http.Request) error {
	origins := r.Header.Values("Origin")
	if len(origins) > 1 || (len(origins) == 1 && !s.AllowedOrigin(origins[0])) {
		return forbiddenOrigin()
	}
	if len(origins) == 0 && r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return forbiddenOrigin()
	}
	return nil
}

// Resolve authenticates exactly one credential kind. An explicit malformed,
// expired or revoked bearer never falls back to a more privileged cookie.
// allowToken enables published save/search PATs, not device credentials.
func (s *Service) Resolve(r *http.Request, allowToken bool) (model.Principal, error) {
	if err := r.Context().Err(); err != nil {
		return model.Principal{}, err
	}
	var principal model.Principal
	var err error
	headers := r.Header.Values("Authorization")
	if len(headers) != 0 {
		if len(headers) != 1 {
			return principal, unauthorized()
		}
		parts := strings.Fields(headers[0])
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return principal, unauthorized()
		}
		if err := s.checkBearerOrigin(r); err != nil {
			return principal, err
		}
		switch {
		case strings.HasPrefix(parts[1], "spld_"):
			principal, err = s.resolveSession(r.Context(), parts[1], "device")
		case allowToken && strings.HasPrefix(parts[1], "splt_"):
			principal, err = s.resolveToken(r.Context(), parts[1])
		default:
			err = unauthorized()
		}
	} else {
		token, valid := browserCredential(r)
		if !valid {
			return principal, unauthorized()
		}
		if err := s.CheckBrowserRequest(r); err != nil {
			return principal, err
		}
		principal, err = s.resolveSession(r.Context(), token, "browser")
	}
	if err != nil {
		return model.Principal{}, err
	}
	if owners := r.Header.Values("X-Sploot-User-ID"); len(owners) != 0 && (len(owners) != 1 || owners[0] != principal.UserID) {
		return model.Principal{}, &model.APIError{Status: http.StatusConflict, Message: "The signed-in account changed. Sign in to the original account before retrying this capture.", Code: "ACCOUNT_CHANGED"}
	}
	return principal, nil
}

func (s *Service) ResolveBrowser(r *http.Request) (model.Principal, error) {
	principal, err := s.Resolve(r, false)
	if err != nil {
		return model.Principal{}, err
	}
	if principal.Method != "browser" {
		return model.Principal{}, browserRequired()
	}
	return principal, nil
}

func (s *Service) ResolveDevice(r *http.Request) (model.Principal, error) {
	principal, err := s.Resolve(r, false)
	if err != nil {
		return model.Principal{}, err
	}
	if principal.Method != "device" {
		return model.Principal{}, &model.APIError{Status: http.StatusForbidden, Message: "A device credential is required", Code: "device_required"}
	}
	return principal, nil
}

func (s *Service) resolveSession(ctx context.Context, token, kind string) (model.Principal, error) {
	prefix := ""
	if kind == "device" {
		prefix = "spld_"
	}
	if !validSecret(token, prefix) {
		return model.Principal{}, unauthorized()
	}
	principal := model.Principal{Method: kind}
	now := time.Now().UTC()
	err := s.db.QueryRowContext(ctx, `UPDATE auth_sessions SET last_used_at = ?
		WHERE token_hash = ? AND kind = ? AND expires_at > ?
		AND EXISTS (SELECT 1 FROM users WHERE users.id = auth_sessions.user_id)
		RETURNING id, user_id, (SELECT email FROM users WHERE users.id = auth_sessions.user_id)`,
		now, secretHash(token), kind, now).Scan(&principal.SessionID, &principal.UserID, &principal.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Principal{}, unauthorized()
	}
	if err != nil {
		return model.Principal{}, authUnavailable()
	}
	return principal, nil
}

func (s *Service) resolveToken(ctx context.Context, token string) (model.Principal, error) {
	if !validSecret(token, "splt_") {
		return model.Principal{}, unauthorized()
	}
	principal := model.Principal{Method: "upload-token"}
	err := s.db.QueryRowContext(ctx, `UPDATE upload_tokens SET last_used_at = ?
		WHERE token_hash = ? AND revoked_at IS NULL
		AND EXISTS (SELECT 1 FROM users WHERE users.id = upload_tokens.user_id)
		RETURNING user_id, (SELECT email FROM users WHERE users.id = upload_tokens.user_id)`,
		time.Now().UTC(), secretHash(token)).Scan(&principal.UserID, &principal.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Principal{}, unauthorized()
	}
	if err != nil {
		return model.Principal{}, authUnavailable()
	}
	return principal, nil
}

func (s *Service) SetSessionCookie(w http.ResponseWriter, session Session) {
	http.SetCookie(w, &http.Cookie{Name: SessionCookie, Value: session.Token, Path: "/", HttpOnly: true, Secure: s.baseURL.Scheme == "https", SameSite: http.SameSiteLaxMode, MaxAge: int(browserLifetime / time.Second), Expires: session.ExpiresAt})
}

func (s *Service) ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: SessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: s.baseURL.Scheme == "https", SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(1, 0).UTC()})
}

func browserCredential(r *http.Request) (string, bool) {
	// Inspect raw cookie fields so a malformed duplicate cannot disappear in
	// net/http's forgiving parser and expose a different valid credential.
	count := 0
	for _, header := range r.Header.Values("Cookie") {
		for _, field := range strings.Split(header, ";") {
			name, _, _ := strings.Cut(strings.TrimSpace(field), "=")
			if strings.TrimSpace(name) == SessionCookie {
				count++
			}
		}
	}
	if count != 1 {
		return "", false
	}
	cookie, err := r.Cookie(SessionCookie)
	if err != nil || !validSecret(cookie.Value, "") {
		return "", false
	}
	return cookie.Value, true
}

func validSecret(token, prefix string) bool {
	if !strings.HasPrefix(token, prefix) || len(token) != len(prefix)+43 {
		return false
	}
	decoded, err := base64.RawURLEncoding.Strict().DecodeString(token[len(prefix):])
	return err == nil && len(decoded) == 32
}

func newSecret(prefix string) (string, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", authUnavailable()
	}
	return prefix + base64.RawURLEncoding.EncodeToString(value[:]), nil
}

func secretHash(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func safeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func unauthorized() *model.APIError {
	return &model.APIError{Status: http.StatusUnauthorized, Message: "Unauthorized", Code: "unauthorized"}
}

func invalidCredentials() *model.APIError {
	return &model.APIError{Status: http.StatusUnauthorized, Message: "Email or password is incorrect", Code: "invalid_credentials"}
}

func browserRequired() *model.APIError {
	return &model.APIError{Status: http.StatusForbidden, Message: "Sign in through the browser to manage account security", Code: "browser_required"}
}

func forbiddenOrigin() *model.APIError {
	return &model.APIError{Status: http.StatusForbidden, Message: "Request origin does not match this application", Code: "origin_forbidden"}
}

func authUnavailable() *model.APIError {
	return &model.APIError{Status: http.StatusServiceUnavailable, Message: "Authentication is temporarily unavailable", Code: "auth_unavailable", Retryable: true}
}
