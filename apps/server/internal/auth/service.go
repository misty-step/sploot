package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/jwks"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

type Options struct {
	ClerkSecretKey      string
	ClerkPublishableKey string
	BaseURL             string
	Environment         string
	AuthorizedParties   []string
	QALocalSecret       string
	QALocalUserID       string
}

type Service struct {
	pool              *pgxpool.Pool
	baseURL           *url.URL
	issuer            string
	authorizedParties map[string]bool
	jwks              *jwks.Client
	keyMu             sync.Mutex
	keys              map[string]*clerk.JSONWebKey
	keysExpireAt      time.Time
	keyRefreshAt      time.Time
	qaSecret          []byte
	qaUserID          string
}

func New(pool *pgxpool.Pool, opts Options) (*Service, error) {
	if pool == nil {
		return nil, errors.New("auth: database pool is required")
	}
	base, err := parseOrigin(opts.BaseURL)
	if err != nil || (base.Scheme != "https" && base.Scheme != "http") {
		return nil, errors.New("auth: BaseURL must be an absolute HTTP(S) origin")
	}
	environment := strings.ToLower(strings.TrimSpace(opts.Environment))
	local := environment == "development" || environment == "test" || environment == "local-qa"
	if !local && (base.Scheme != "https" || loopbackHost(base.Hostname())) {
		return nil, errors.New("auth: non-local deployments require a public HTTPS BaseURL")
	}
	s := &Service{pool: pool, baseURL: base, authorizedParties: map[string]bool{base.String(): true}}
	qaConfigured := opts.QALocalSecret != "" || opts.QALocalUserID != ""
	if qaConfigured {
		if !local || !loopbackHost(base.Hostname()) || !localDatabaseHost(pool.Config().ConnConfig.Host) {
			return nil, errors.New("auth: QA authentication requires explicit nonproduction, a loopback BaseURL, and a local database")
		}
		if len(opts.QALocalSecret) < 32 || !qaUserIDPattern.MatchString(opts.QALocalUserID) {
			return nil, errors.New("auth: QA requires a secret of at least 32 bytes and a qa-namespace user ID")
		}
		s.qaSecret, s.qaUserID = []byte(opts.QALocalSecret), opts.QALocalUserID
	}
	if opts.ClerkSecretKey == "" && opts.ClerkPublishableKey == "" {
		if !qaConfigured {
			return nil, errors.New("auth: Clerk keys are required outside explicitly configured local QA")
		}
		return s, nil
	}
	issuer, keyMode, err := publishableKeyIssuer(opts.ClerkPublishableKey)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(opts.ClerkSecretKey, "sk_"+keyMode+"_") || len(opts.ClerkSecretKey) <= len("sk_"+keyMode+"_") {
		return nil, errors.New("auth: Clerk secret and publishable keys must be configured for the same instance mode")
	}
	if !local && keyMode != "live" {
		return nil, errors.New("auth: non-local deployments require live Clerk keys")
	}
	s.issuer = issuer
	parties := []string{
		"https://sploot.app", "https://www.sploot.app",
		"chrome-extension://ipnlamdcakhmbidjlpoinkgimfapejna",
		"chrome-extension://hikefmnilgapfckjmillbhcocihjffhn",
		"chrome-extension://fbhkflbcnllfogefckablkafjknmcfnd",
		base.String(),
	}
	if local {
		parties = append(parties, "http://localhost:3000", "http://localhost:3001")
	}
	parties = append(parties, opts.AuthorizedParties...)
	for _, party := range parties {
		origin, err := parseOrigin(party)
		if err != nil || (origin.Scheme != "https" && origin.Scheme != "chrome-extension" && !(local && origin.Scheme == "http" && loopbackHost(origin.Hostname()))) {
			return nil, fmt.Errorf("auth: invalid authorized-party origin %q", party)
		}
		if origin.Scheme == "chrome-extension" && (len(origin.Hostname()) != 32 || strings.Trim(origin.Hostname(), "abcdefghijklmnop") != "" || origin.Port() != "") {
			return nil, fmt.Errorf("auth: invalid extension authorized party %q", party)
		}
		s.authorizedParties[origin.String()] = true
	}
	key := opts.ClerkSecretKey
	s.jwks = &jwks.Client{Backend: clerk.NewBackend(&clerk.BackendConfig{
		Key:        &key,
		HTTPClient: &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
	})}
	return s, nil
}

// AllowedOrigin is the common authority for JWT authorized parties and CORS.
func (s *Service) AllowedOrigin(origin string) bool {
	return s.authorizedParties[origin]
}

// Resolve never provisions users or accepts a PAT unless this route opts in.
// A presented but invalid credential is terminal: it cannot fall back to a
// different cookie or credential kind with more authority.
func (s *Service) Resolve(r *http.Request, allowToken bool) (model.Principal, error) {
	if err := r.Context().Err(); err != nil {
		return model.Principal{}, err
	}
	qaToken, qaPresent, qaErr := requestCredential(r, qaHeader, qaCookie)
	if qaPresent {
		if qaErr != nil {
			return model.Principal{}, unauthorized()
		}
		if err := s.qaBoundary(r); err != nil {
			return model.Principal{}, err
		}
		if len(r.Header.Values("Authorization")) != 0 || cookiePresent(r, "__session") {
			return model.Principal{}, unauthorized()
		}
		payload, err := s.verifyQAToken(qaToken, time.Now())
		if err != nil {
			return model.Principal{}, err
		}
		if err := s.requireUser(r.Context(), payload.UserID); err != nil {
			return model.Principal{}, err
		}
		sessionID := payload.SessionID
		if sessionID == "" {
			sessionID = "qa-local-session"
		}
		return model.Principal{UserID: payload.UserID, SessionID: sessionID, Method: "qa-local"}, nil
	}
	var token, method string
	headers := r.Header.Values("Authorization")
	if len(headers) > 0 {
		if len(headers) != 1 {
			return model.Principal{}, unauthorized()
		}
		parts := strings.Fields(headers[0])
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return model.Principal{}, unauthorized()
		}
		token, method = parts[1], "clerk-bearer"
		if strings.HasPrefix(token, "splt_") {
			if !allowToken {
				return model.Principal{}, unauthorized()
			}
			return s.resolveToken(r.Context(), token)
		}
	} else {
		var present bool
		var err error
		token, present, err = requestCredential(r, "", "__session")
		if !present || err != nil {
			return model.Principal{}, unauthorized()
		}
		method = "clerk-cookie"
	}
	claims, err := s.verifySession(r.Context(), token)
	if err != nil {
		return model.Principal{}, err
	}
	owner, err := s.resolveClerkIdentity(r.Context(), claims.Subject)
	if err != nil {
		return model.Principal{}, err
	}
	return model.Principal{UserID: owner, SessionID: claims.SessionID, Method: method}, nil
}

type sessionState struct {
	Status string `json:"sts"`
}

func (s *Service) verifySession(ctx context.Context, token string) (*clerk.SessionClaims, error) {
	if s.jwks == nil || len(token) > 16*1024 {
		return nil, unauthorized()
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, unauthorized()
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, unauthorized()
	}
	var header struct {
		Algorithm string `json:"alg"`
		KeyID     string `json:"kid"`
	}
	if json.Unmarshal(headerBytes, &header) != nil || header.Algorithm != "RS256" || header.KeyID == "" || len(header.KeyID) > 256 {
		return nil, unauthorized()
	}
	// Unverified decoding is used only to reject an unrelated issuer before a
	// key fetch. Identity is read exclusively from the SDK's verified claims.
	unverified, err := clerkjwt.Decode(ctx, &clerkjwt.DecodeParams{Token: token})
	if err != nil || unverified.Issuer != s.issuer {
		return nil, unauthorized()
	}
	key, err := s.sessionKey(ctx, header.KeyID)
	if err != nil {
		return nil, err
	}
	claims, err := clerkjwt.Verify(ctx, &clerkjwt.VerifyParams{
		Token: token, JWK: key, Leeway: 5 * time.Second,
		ProxyURL:                &s.issuer,
		AuthorizedPartyHandler:  func(party string) bool { return s.authorizedParties[party] },
		CustomClaimsConstructor: func(context.Context) any { return &sessionState{} },
	})
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, unauthorized()
	}
	if claims.Issuer != s.issuer || claims.Subject == "" || claims.SessionID == "" || claims.Expiry == nil || claims.IssuedAt == nil || claims.NotBefore == nil {
		return nil, unauthorized()
	}
	if *claims.Expiry <= *claims.IssuedAt {
		return nil, unauthorized()
	}
	state, ok := claims.Custom.(*sessionState)
	if !ok || (state.Status != "" && state.Status != "active") {
		return nil, unauthorized()
	}
	return claims, nil
}

func (s *Service) sessionKey(ctx context.Context, id string) (*clerk.JSONWebKey, error) {
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	now := time.Now()
	if now.Before(s.keysExpireAt) {
		if key := s.keys[id]; key != nil {
			return key, nil
		}
	}
	// Unknown key IDs cannot amplify provider requests. A rotation triggers
	// a refresh after at most five seconds; successful keys cache for 5m.
	if now.Before(s.keyRefreshAt) {
		if !now.Before(s.keysExpireAt) {
			return nil, authUnavailable()
		}
		return nil, unauthorized()
	}
	s.keyRefreshAt = now.Add(5 * time.Second)
	set, err := s.jwks.Get(ctx, &jwks.GetParams{})
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, authUnavailable()
	}
	if set == nil || len(set.Keys) == 0 {
		return nil, authUnavailable()
	}
	keys := make(map[string]*clerk.JSONWebKey, len(set.Keys))
	for _, key := range set.Keys {
		if key != nil && key.Algorithm == "RS256" && key.KeyID != "" {
			keys[key.KeyID] = key
		}
	}
	s.keys, s.keysExpireAt = keys, now.Add(5*time.Minute)
	if key := keys[id]; key != nil {
		return key, nil
	}
	return nil, unauthorized()
}

func (s *Service) resolveClerkIdentity(ctx context.Context, subject string) (string, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT owner FROM (
		SELECT u.id AS owner FROM user_identities i JOIN users u ON u.id = i.user_id
		WHERE i.provider = 'clerk' AND i.provider_subject = $1
		UNION ALL SELECT id AS owner FROM users WHERE id = $1
	) identities LIMIT 2`, subject)
	if err != nil {
		return "", fmt.Errorf("resolve Clerk identity: %w", err)
	}
	defer rows.Close()
	var owner string
	for rows.Next() {
		var candidate string
		if err := rows.Scan(&candidate); err != nil {
			return "", fmt.Errorf("scan Clerk identity: %w", err)
		}
		if owner != "" && owner != candidate {
			return "", &model.APIError{Status: http.StatusConflict, Code: "enrollment_identity_conflict", Message: "This identity is linked to conflicting accounts"}
		}
		owner = candidate
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("read Clerk identity: %w", err)
	}
	if owner == "" {
		return "", enrollmentClosed()
	}
	return owner, nil
}

func (s *Service) requireUser(ctx context.Context, owner string) error {
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, owner).Scan(&exists); err != nil {
		return fmt.Errorf("read enrolled user: %w", err)
	}
	if !exists {
		return enrollmentClosed()
	}
	return nil
}

func (s *Service) resolveToken(ctx context.Context, token string) (model.Principal, error) {
	if len(token) != len("splt_")+43 {
		return model.Principal{}, unauthorized()
	}
	bytes, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(token, "splt_"))
	if err != nil || len(bytes) != 32 {
		return model.Principal{}, unauthorized()
	}
	hash := sha256.Sum256([]byte(token))
	var owner string
	// Join the durable enrollment receipt in the same statement as usage
	// recording, so a revoked token or removed account is never authenticated.
	err = s.pool.QueryRow(ctx, `UPDATE upload_tokens t SET last_used_at = CURRENT_TIMESTAMP
		FROM users u WHERE t.user_id = u.id AND t.token_hash = $1 AND t.revoked_at IS NULL
		RETURNING t.user_id`, hex.EncodeToString(hash[:])).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Principal{}, unauthorized()
	}
	if err != nil {
		return model.Principal{}, fmt.Errorf("authenticate upload token: %w", err)
	}
	return model.Principal{UserID: owner, Method: "upload-token"}, nil
}

func requestCredential(r *http.Request, header, cookie string) (string, bool, error) {
	var value string
	present := false
	if header != "" {
		values := r.Header.Values(header)
		if len(values) > 1 {
			return "", true, unauthorized()
		}
		if len(values) == 1 {
			value, present = values[0], true
		}
	}
	count := 0
	for _, c := range r.Cookies() {
		if c.Name != cookie {
			continue
		}
		count++
		if count > 1 || (present && value != c.Value) {
			return "", true, unauthorized()
		}
		value, present = c.Value, true
	}
	if count == 0 && cookiePresent(r, cookie) {
		return "", true, unauthorized()
	}
	if present && (value == "" || len(value) > 16*1024) {
		return "", true, unauthorized()
	}
	return value, present, nil
}

func cookiePresent(r *http.Request, name string) bool {
	for _, header := range r.Header.Values("Cookie") {
		for _, field := range strings.Split(header, ";") {
			key, _, _ := strings.Cut(strings.TrimSpace(field), "=")
			if key == name {
				return true
			}
		}
	}
	return false
}

func parseOrigin(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || u.Opaque != "" {
		return nil, errors.New("invalid origin")
	}
	u.Path, u.RawPath = "", ""
	u.Scheme, u.Host = strings.ToLower(u.Scheme), strings.ToLower(u.Host)
	return u, nil
}

func publishableKeyIssuer(key string) (string, string, error) {
	mode := ""
	for _, candidate := range []string{"live", "test"} {
		if strings.HasPrefix(key, "pk_"+candidate+"_") {
			mode = candidate
			break
		}
	}
	if mode == "" {
		return "", "", errors.New("auth: invalid Clerk publishable key")
	}
	encoded := strings.TrimPrefix(key, "pk_"+mode+"_")
	decoded, err := base64.RawStdEncoding.DecodeString(strings.TrimRight(encoded, "="))
	if err != nil || !strings.HasSuffix(string(decoded), "$") {
		return "", "", errors.New("auth: malformed Clerk publishable key")
	}
	host := strings.TrimSuffix(string(decoded), "$")
	u, err := parseOrigin("https://" + host)
	if err != nil || u.Host != host || u.Port() != "" || loopbackHost(host) || !strings.Contains(host, ".") {
		return "", "", errors.New("auth: invalid Clerk frontend hostname")
	}
	return u.String(), mode, nil
}

func loopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func localDatabaseHost(host string) bool { return loopbackHost(host) || strings.HasPrefix(host, "/") }
func unauthorized() *model.APIError {
	return &model.APIError{Status: http.StatusUnauthorized, Message: "Unauthorized", Code: "unauthorized"}
}
func authUnavailable() *model.APIError {
	return &model.APIError{Status: http.StatusServiceUnavailable, Message: "Authentication is temporarily unavailable", Code: "auth_unavailable", Retryable: true}
}
func enrollmentClosed() *model.APIError {
	return &model.APIError{Status: http.StatusForbidden, Message: "This account is not enrolled", Code: "enrollment_closed"}
}
