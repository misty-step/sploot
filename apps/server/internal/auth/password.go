package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	passwordParameters = "$argon2id$v=19$m=65536,t=3,p=2$"
	// A nonexistent account performs the same bounded Argon2 work. This
	// sentinel is never accepted as an account's password.
	dummyPasswordHash = passwordParameters + "AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
)

func normalizeEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	parsed, err := mail.ParseAddress(email)
	if err != nil || len(email) > 254 || parsed.Name != "" || parsed.Address != email || !strings.Contains(email, "@") {
		return "", &model.APIError{Status: http.StatusBadRequest, Message: "Enter a valid email address", Code: "invalid_email"}
	}
	return email, nil
}

func validatePassword(password string) error {
	length := utf8.RuneCountInString(password)
	if !utf8.ValidString(password) || length < 12 || length > 128 || len(password) > 512 {
		return &model.APIError{Status: http.StatusBadRequest, Message: "Use a password with 12–128 characters", Code: "invalid_password"}
	}
	return nil
}

func hashPassword(password string) (string, error) {
	var salt [16]byte
	if _, err := rand.Read(salt[:]); err != nil {
		return "", authUnavailable()
	}
	hash := argon2.IDKey([]byte(password), salt[:], 3, 64*1024, 2, 32)
	return passwordParameters + base64.RawStdEncoding.EncodeToString(salt[:]) + "$" + base64.RawStdEncoding.EncodeToString(hash), nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	valid := len(parts) == 6 && strings.HasPrefix(encoded, passwordParameters)
	var salt, expected []byte
	if valid {
		var saltErr, hashErr error
		salt, saltErr = base64.RawStdEncoding.Strict().DecodeString(parts[4])
		expected, hashErr = base64.RawStdEncoding.Strict().DecodeString(parts[5])
		valid = saltErr == nil && hashErr == nil && len(salt) == 16 && len(expected) == 32
	}
	if !valid {
		salt, expected = make([]byte, 16), make([]byte, 32)
	}
	actual := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return subtle.ConstantTimeCompare(actual, expected) == 1 && valid
}

func (s *Service) acquirePassword(r *http.Request, account string) error {
	ctx := r.Context()
	// A global budget bounds both Argon2 work and the number of attacker-
	// chosen account/IP rows. Forwarded addresses are never trusted here.
	if err := s.limit(ctx, "password:global", 60, time.Minute); err != nil {
		return err
	}
	if err := s.limit(ctx, "password:peer:"+requestPeer(r), 30, 15*time.Minute); err != nil {
		return err
	}
	if err := s.limit(ctx, "password:account:"+account, 10, 15*time.Minute); err != nil {
		return err
	}
	select {
	case s.passwordSlots <- struct{}{}:
		return nil
	default:
		return rateLimited(1)
	}
}

func (s *Service) releasePassword() { <-s.passwordSlots }

// limit increments a persistent, fixed-window counter atomically. Refused
// attempts cannot keep increasing the counter or extend a victim's lockout.
func (s *Service) limit(ctx context.Context, key string, maximum int, window time.Duration) error {
	now := time.Now().UTC()
	var count int
	err := s.db.QueryRowContext(ctx, `INSERT INTO auth_attempts (key, count, window_start) VALUES (?, 1, ?)
		ON CONFLICT(key) DO UPDATE SET
		count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
		window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
		WHERE window_start <= ? OR count < ? RETURNING count`,
		secretHash(key), now, now.Add(-window), now.Add(-window), now.Add(-window), maximum).Scan(&count)
	if errors.Is(err, sql.ErrNoRows) {
		return rateLimited(int(window / time.Second))
	}
	if err != nil {
		return authUnavailable()
	}
	// All configured windows are shorter than a day. Expiry is independent
	// of success, and bounds retained rows without an in-memory timer.
	if _, err := s.db.ExecContext(ctx, `DELETE FROM auth_attempts WHERE window_start < ?`, now.Add(-24*time.Hour)); err != nil {
		return authUnavailable()
	}
	return nil
}

func requestPeer(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "unknown"
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return "unknown"
	}
	if ip.To4() == nil {
		// IPv6 clients cannot bypass the password budget by rotating privacy
		// addresses within their assigned /64.
		return ip.Mask(net.CIDRMask(64, 128)).String()
	}
	return ip.String()
}

func rateLimited(seconds int) *model.APIError {
	if seconds < 1 {
		seconds = 1
	}
	return &model.APIError{Status: http.StatusTooManyRequests, Message: "Too many authentication attempts. Try again later.", Code: "rate_limited", Retryable: true, RetryAfter: seconds}
}
