package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

func (s *Service) Register(r *http.Request, email, password string) (Session, error) {
	if err := s.accountEntry(r); err != nil {
		return Session{}, err
	}
	if !s.registrationOpen {
		return Session{}, &model.APIError{Status: http.StatusForbidden, Message: "Account registration is closed on this instance", Code: "registration_closed"}
	}
	email, err := normalizeEmail(email)
	if err != nil {
		return Session{}, err
	}
	if err := validatePassword(password); err != nil {
		return Session{}, err
	}
	if err := s.acquirePassword(r, email); err != nil {
		return Session{}, err
	}
	defer s.releasePassword()
	hash, err := hashPassword(password)
	if err != nil {
		return Session{}, err
	}
	ctx := r.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, authUnavailable()
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	user := User{ID: model.NewID(), Email: email}
	result, err := tx.ExecContext(ctx, `INSERT INTO users (id, email, password_hash, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`, user.ID, email, hash, now, now)
	if err != nil {
		return Session{}, authUnavailable()
	}
	if count, err := result.RowsAffected(); err != nil {
		return Session{}, authUnavailable()
	} else if count != 1 {
		return Session{}, &model.APIError{Status: http.StatusConflict, Message: "An account with this email already exists. Sign in instead.", Code: "account_exists"}
	}
	session, err := s.newBrowserSession(ctx, tx, user, r, now)
	if err != nil {
		return Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return Session{}, authUnavailable()
	}
	return session, nil
}

func (s *Service) Login(r *http.Request, email, password string) (Session, error) {
	if err := s.accountEntry(r); err != nil {
		return Session{}, err
	}
	email, err := normalizeEmail(email)
	if err != nil || len(password) > 512 {
		return Session{}, invalidCredentials()
	}
	if err := s.acquirePassword(r, email); err != nil {
		return Session{}, err
	}
	defer s.releasePassword()
	ctx := r.Context()
	var user User
	var hash string
	err = s.db.QueryRowContext(ctx, `SELECT id, email, password_hash FROM users WHERE email = ?`, email).Scan(&user.ID, &user.Email, &hash)
	found := err == nil
	if errors.Is(err, sql.ErrNoRows) {
		hash = dummyPasswordHash
	} else if err != nil {
		return Session{}, authUnavailable()
	}
	if !verifyPassword(password, hash) || !found {
		return Session{}, invalidCredentials()
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, authUnavailable()
	}
	defer tx.Rollback()
	// A password change racing the expensive hash verification must not
	// permit the old password to create a credential after revocation.
	var current bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)`, user.ID, hash).Scan(&current); err != nil {
		return Session{}, authUnavailable()
	}
	if !current {
		return Session{}, invalidCredentials()
	}
	session, err := s.newBrowserSession(ctx, tx, user, r, time.Now().UTC())
	if err != nil {
		return Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return Session{}, authUnavailable()
	}
	return session, nil
}

func (s *Service) accountEntry(r *http.Request) error {
	if len(r.Header.Values("Authorization")) != 0 {
		return unauthorized()
	}
	return s.CheckBrowserRequest(r)
}

func (s *Service) newBrowserSession(ctx context.Context, tx *sql.Tx, user User, r *http.Request, now time.Time) (Session, error) {
	token, err := newSecret("")
	if err != nil {
		return Session{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE expires_at <= ?`, now); err != nil {
		return Session{}, authUnavailable()
	}
	// Account switching invalidates the old cookie rather than leaving a
	// usable abandoned credential, even when switching to a different user.
	if previous, valid := browserCredential(r); valid {
		if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE token_hash = ? AND kind = 'browser'`, secretHash(previous)); err != nil {
			return Session{}, authUnavailable()
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE id IN (
		SELECT id FROM auth_sessions WHERE user_id = ? AND kind = 'browser'
		ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 19)`, user.ID); err != nil {
		return Session{}, authUnavailable()
	}
	session := Session{User: user, Token: token, ExpiresAt: now.Add(browserLifetime)}
	if _, err := tx.ExecContext(ctx, `INSERT INTO auth_sessions
		(id, user_id, token_hash, kind, name, expires_at, created_at, last_used_at)
		VALUES (?, ?, ?, 'browser', 'Browser', ?, ?, ?)`,
		model.NewID(), user.ID, secretHash(token), session.ExpiresAt, now, now); err != nil {
		return Session{}, authUnavailable()
	}
	return session, nil
}

func (s *Service) Logout(ctx context.Context, principal model.Principal) error {
	if principal.Method != "browser" {
		return browserRequired()
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE id = ? AND user_id = ? AND kind = 'browser'`, principal.SessionID, principal.UserID); err != nil {
		return authUnavailable()
	}
	return nil
}

// ChangePassword keeps only the current browser session. All other browser
// sessions, devices, save/search tokens and unconsumed approved pairings lose
// authority atomically with the password update.
func (s *Service) ChangePassword(r *http.Request, principal model.Principal, currentPassword, password string) error {
	if principal.Method != "browser" {
		return browserRequired()
	}
	if err := s.CheckBrowserRequest(r); err != nil {
		return err
	}
	if err := validatePassword(password); err != nil {
		return err
	}
	if len(currentPassword) > 512 {
		return invalidCredentials()
	}
	if err := s.acquirePassword(r, strings.ToLower(principal.Email)); err != nil {
		return err
	}
	defer s.releasePassword()
	ctx := r.Context()
	var previousHash string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id = ?`, principal.UserID).Scan(&previousHash); errors.Is(err, sql.ErrNoRows) {
		return unauthorized()
	} else if err != nil {
		return authUnavailable()
	}
	if !verifyPassword(currentPassword, previousHash) {
		return invalidCredentials()
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return authUnavailable()
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	result, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ?
		WHERE id = ? AND password_hash = ? AND EXISTS (SELECT 1 FROM auth_sessions
		WHERE id = ? AND user_id = users.id AND kind = 'browser' AND expires_at > ?)`,
		hash, now, principal.UserID, previousHash, principal.SessionID, now)
	if err != nil {
		return authUnavailable()
	}
	if count, err := result.RowsAffected(); err != nil {
		return authUnavailable()
	} else if count != 1 {
		return unauthorized()
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = ? AND id != ?`, principal.UserID, principal.SessionID); err != nil {
		return authUnavailable()
	}
	if _, err := tx.ExecContext(ctx, `UPDATE upload_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, now, principal.UserID); err != nil {
		return authUnavailable()
	}
	if _, err := tx.ExecContext(ctx, `UPDATE device_requests SET denied_at = ? WHERE approved_user_id = ? AND consumed_at IS NULL AND denied_at IS NULL`, now, principal.UserID); err != nil {
		return authUnavailable()
	}
	if err := tx.Commit(); err != nil {
		return authUnavailable()
	}
	return nil
}
