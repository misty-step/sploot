package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

// UnclaimedPassword is deliberately not an Argon2 hash. No password can verify
// against it; only a one-use operator invitation can activate this account.
const UnclaimedPassword = "!predecessor-unclaimed"

// Invitation is sensitive operator output, never an API response or log value.
type Invitation struct {
	UserID    string    `json:"userId"`
	Email     string    `json:"email"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// CreateInvitedAccount creates a distinct identity, never an email-based link.
// The importer owns the surrounding transaction and historical timestamps.
func CreateInvitedAccount(ctx context.Context, tx *sql.Tx, user User, createdAt, updatedAt time.Time) error {
	email, err := normalizeEmail(user.Email)
	if err != nil || email != user.Email || user.ID == "" || createdAt.IsZero() || updatedAt.IsZero() {
		return errors.New("invalid invited identity")
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)`, user.ID, email, UnclaimedPassword, createdAt, updatedAt)
	if err != nil {
		return errors.New("invited identity conflicts with an existing account; explicit mapping or a separate login email is required")
	}
	return nil
}

// IssueInvitation rotates only an unclaimed account's invitation. The caller
// must persist the plaintext in a new private file before committing tx.
func IssueInvitation(ctx context.Context, tx *sql.Tx, userID string, lifetime time.Duration) (Invitation, error) {
	var invitation Invitation
	if lifetime < time.Minute || lifetime > 7*24*time.Hour {
		return invitation, errors.New("invitation lifetime must be between one minute and seven days")
	}
	err := tx.QueryRowContext(ctx, `SELECT id,email FROM users WHERE id=? AND password_hash=?`, userID, UnclaimedPassword).Scan(&invitation.UserID, &invitation.Email)
	if err != nil {
		return invitation, errors.New("invitation requires an existing unclaimed account")
	}
	invitation.Token, err = newSecret("spli_")
	if err != nil {
		return Invitation{}, err
	}
	now := time.Now().UTC()
	invitation.ExpiresAt = now.Add(lifetime)
	_, err = tx.ExecContext(ctx, `INSERT INTO account_invitations(user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=excluded.created_at,consumed_at=NULL`, invitation.UserID, secretHash(invitation.Token), invitation.ExpiresAt, now)
	if err != nil {
		return Invitation{}, authUnavailable()
	}
	return invitation, nil
}

// ClaimInvitation fences the token and password update to one unclaimed user.
// GET never consumes authority. Closed public registration has no bearing here.
func (s *Service) ClaimInvitation(r *http.Request, userID, token, password string) (Session, error) {
	if err := s.accountEntry(r); err != nil {
		return Session{}, err
	}
	if !validSecret(token, "spli_") || userID == "" || len(userID) > 128 {
		return Session{}, invalidInvitation()
	}
	principal, resolveErr := s.ResolveBrowser(r)
	if resolveErr != nil {
		var apiError *model.APIError
		if !errors.As(resolveErr, &apiError) || apiError.Status != http.StatusUnauthorized {
			return Session{}, resolveErr
		}
	} else if principal.UserID != userID {
		return Session{}, &model.APIError{Status: http.StatusConflict, Code: "ACCOUNT_CHANGED", Message: "Sign out before claiming a different account"}
	}
	if err := validatePassword(password); err != nil {
		return Session{}, err
	}
	if err := s.acquirePassword(r, "claim:"+userID); err != nil {
		return Session{}, err
	}
	defer s.releasePassword()
	ctx := r.Context()
	digest := secretHash(token)
	var user User
	err := s.db.QueryRowContext(ctx, `SELECT u.id,u.email FROM users u JOIN account_invitations i ON i.user_id=u.id
		WHERE u.id=? AND u.password_hash=? AND i.token_hash=? AND i.consumed_at IS NULL AND i.expires_at>?`, userID, UnclaimedPassword, digest, time.Now().UTC()).Scan(&user.ID, &user.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, invalidInvitation()
	}
	if err != nil {
		return Session{}, authUnavailable()
	}
	hash, err := hashPassword(password)
	if err != nil {
		return Session{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, authUnavailable()
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	result, err := tx.ExecContext(ctx, `UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND password_hash=?
		AND EXISTS(SELECT 1 FROM account_invitations WHERE user_id=users.id AND token_hash=? AND consumed_at IS NULL AND expires_at>?)`, hash, now, user.ID, UnclaimedPassword, digest, now)
	if err != nil {
		return Session{}, authUnavailable()
	}
	count, err := result.RowsAffected()
	if err != nil {
		return Session{}, authUnavailable()
	}
	if count != 1 {
		return Session{}, invalidInvitation()
	}
	result, err = tx.ExecContext(ctx, `UPDATE account_invitations SET consumed_at=? WHERE user_id=? AND token_hash=? AND consumed_at IS NULL AND expires_at>?`, now, user.ID, digest, now)
	if err != nil {
		return Session{}, authUnavailable()
	}
	if count, err := result.RowsAffected(); err != nil || count != 1 {
		return Session{}, invalidInvitation()
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

func invalidInvitation() *model.APIError {
	return &model.APIError{Status: http.StatusGone, Code: "invitation_invalid", Message: "This invitation is invalid, expired, or already used. Request a new link from the operator."}
}
