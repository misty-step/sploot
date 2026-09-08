package auth

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	qaHeader        = "X-Sploot-QA-Auth"
	qaCookie        = "sploot_qa_auth"
	qaDeploymentID  = "local-pwa-capture-v1"
	qaDeploymentEnv = "local-qa"
	qaAudience      = "sploot-pwa-capture"
	qaLifetime      = 15 * time.Minute
)

var qaUserIDPattern = regexp.MustCompile(`^qa-[a-z0-9-]{1,64}$`)

// This wire format is shared with apps/web/lib/auth/qa-local-core.ts. The
// deployment ID and audience are fixed, not caller-controlled token issuers.
type qaPayload struct {
	Version       int    `json:"v"`
	UserID        string `json:"userId"`
	Email         string `json:"email,omitempty"`
	SessionID     string `json:"sessionId,omitempty"`
	Audience      string `json:"audience"`
	DeploymentID  string `json:"deploymentId"`
	DeploymentEnv string `json:"deploymentEnv"`
	IssuedAt      int64  `json:"iat"`
	ExpiresAt     int64  `json:"exp"`
}

// MintQALocalToken is only for Main's local login route. It never provisions
// an account, accepts an arbitrary identity, or returns the signing secret.
func (s *Service) MintQALocalToken(r *http.Request) (string, error) {
	if err := s.qaBoundary(r); err != nil {
		return "", err
	}
	if len(r.Header.Values("Authorization")) != 0 || cookiePresent(r, "__session") {
		return "", unauthorized()
	}
	if err := s.requireUser(r.Context(), s.qaUserID); err != nil {
		return "", err
	}
	now := time.Now().Unix()
	payload, err := json.Marshal(qaPayload{
		Version: 1, UserID: s.qaUserID, SessionID: "qa-local-session",
		Audience: qaAudience, DeploymentID: qaDeploymentID, DeploymentEnv: qaDeploymentEnv,
		IssuedAt: now, ExpiresAt: now + int64(qaLifetime/time.Second),
	})
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(s.qaSignature(encoded)), nil
}

func (s *Service) verifyQAToken(token string, now time.Time) (qaPayload, error) {
	var payload qaPayload
	if len(s.qaSecret) == 0 || len(token) > 4096 {
		return payload, unauthorized()
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return payload, unauthorized()
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, s.qaSignature(parts[0])) {
		return payload, unauthorized()
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return payload, unauthorized()
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&payload) != nil {
		return payload, unauthorized()
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return payload, unauthorized()
	}
	if payload.Version != 1 || payload.UserID != s.qaUserID || !qaUserIDPattern.MatchString(payload.UserID) || payload.Audience != qaAudience || payload.DeploymentID != qaDeploymentID || payload.DeploymentEnv != qaDeploymentEnv {
		return payload, unauthorized()
	}
	if payload.IssuedAt <= 0 || payload.IssuedAt > now.Unix() || payload.ExpiresAt <= now.Unix() || payload.ExpiresAt <= payload.IssuedAt || payload.ExpiresAt-payload.IssuedAt > int64(qaLifetime/time.Second) {
		return payload, unauthorized()
	}
	return payload, nil
}

func (s *Service) qaSignature(encoded string) []byte {
	mac := hmac.New(sha256.New, s.qaSecret)
	mac.Write([]byte(encoded))
	return mac.Sum(nil)
}

func (s *Service) qaBoundary(r *http.Request) error {
	forbidden := func() error {
		return &model.APIError{Status: http.StatusForbidden, Message: "Local QA authentication is not available for this request", Code: "qa_auth_forbidden"}
	}
	if len(s.qaSecret) == 0 || s.baseURL == nil {
		return forbidden()
	}
	peer, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return forbidden()
	}
	ip := net.ParseIP(peer)
	if ip == nil || !ip.IsLoopback() || !strings.EqualFold(r.Host, s.baseURL.Host) {
		return forbidden()
	}
	// Forwarded addresses are assertions by another hop, not a loopback
	// transport boundary. QA is deliberately unavailable through any proxy.
	for _, header := range []string{"Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Real-IP"} {
		if len(r.Header.Values(header)) != 0 {
			return forbidden()
		}
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.baseURL.String() {
		return forbidden()
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "none" && site != "same-origin" {
		return forbidden()
	}
	if err := r.Context().Err(); err != nil {
		return err
	}
	return nil
}
