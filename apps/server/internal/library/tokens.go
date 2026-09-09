package library

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const maxActiveTokens = 10
const maxTokenNameLength = 64

type UploadToken struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type MintedToken struct {
	UploadToken
	Token string `json:"token"`
}

func (s *Service) Tokens(ctx context.Context, owner string) ([]UploadToken, error) {
	if err := s.ready(owner); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, prefix, last_used_at, created_at
		FROM upload_tokens WHERE user_id = ?1 AND revoked_at IS NULL ORDER BY created_at DESC, id DESC`, owner)
	if err != nil {
		return nil, fmt.Errorf("list upload tokens: %w", err)
	}
	defer rows.Close()
	tokens := make([]UploadToken, 0)
	for rows.Next() {
		var token UploadToken
		if err := rows.Scan(&token.ID, &token.Name, &token.Prefix, &token.LastUsedAt, &token.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan upload token: %w", err)
		}
		tokens = append(tokens, token)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read upload tokens: %w", err)
	}
	return tokens, nil
}

// MintToken rechecks the issuing browser session in the credential transaction.
// The plaintext appears only in this return value; storage receives its hash and prefix.
func (s *Service) MintToken(ctx context.Context, principal model.Principal, name string) (MintedToken, error) {
	var result MintedToken
	name = trimClientWhitespace(name)
	if name == "" {
		return result, badRequest("Give your token a name")
	}
	if !utf8.ValidString(name) || strings.ContainsRune(name, 0) || utf16Length(name) > maxTokenNameLength {
		return result, badRequest("Token name must be 64 characters or fewer")
	}
	tx, err := s.beginOwner(ctx, principal.UserID)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if principal.Method != "browser" {
		return result, &model.APIError{Status: http.StatusForbidden, Message: "Sign in through the browser to manage account security", Code: "browser_required"}
	}
	var active bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM auth_sessions
		WHERE id = ?1 AND user_id = ?2 AND kind = 'browser' AND expires_at > ?3)`,
		principal.SessionID, principal.UserID, time.Now().UTC()).Scan(&active); err != nil {
		return result, fmt.Errorf("check token issuing session: %w", err)
	}
	if !active {
		return result, &model.APIError{Status: http.StatusUnauthorized, Message: "Unauthorized", Code: "unauthorized"}
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM upload_tokens WHERE user_id = ?1 AND revoked_at IS NULL`, principal.UserID).Scan(&count); err != nil {
		return result, fmt.Errorf("count upload tokens: %w", err)
	}
	if count >= maxActiveTokens {
		return result, &model.APIError{Status: http.StatusUnprocessableEntity, Code: "token_limit", Message: "You can have at most 10 active tokens; revoke one first"}
	}
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return result, fmt.Errorf("generate upload token: %w", err)
	}
	randomPart := base64.RawURLEncoding.EncodeToString(random[:])
	plaintext := "splt_" + randomPart
	hash := sha256.Sum256([]byte(plaintext))
	err = tx.QueryRowContext(ctx, `INSERT INTO upload_tokens (id, user_id, name, token_hash, prefix)
		VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, name, prefix, created_at`, model.NewID(), principal.UserID, name, hex.EncodeToString(hash[:]), "splt_"+randomPart[:6]).Scan(&result.ID, &result.Name, &result.Prefix, &result.CreatedAt)
	if err != nil {
		return MintedToken{}, fmt.Errorf("persist upload token: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return MintedToken{}, fmt.Errorf("commit upload token: %w", err)
	}
	result.Token = plaintext
	return result, nil
}

// RevokeToken preserves the existing idempotent, non-enumerating contract:
// missing, already revoked, and foreign tokens all return the same success.
func (s *Service) RevokeToken(ctx context.Context, owner, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE upload_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?1 AND id = ?2 AND revoked_at IS NULL`, owner, id); err != nil {
		return fmt.Errorf("revoke upload token: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit token revocation: %w", err)
	}
	return nil
}
