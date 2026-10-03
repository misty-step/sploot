package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/misty-step/sploot/apps/server/internal/contract"
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
	if owner == "" {
		return nil, unauthorized()
	}
	if s.db == nil {
		return nil, &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Code: "library_unavailable", Retryable: true}
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
	name = contract.TrimClientWhitespace(name)
	if name == "" {
		return result, &model.APIError{Status: http.StatusBadRequest, Message: "Give your token a name", Code: "invalid_request"}
	}
	if !utf8.ValidString(name) || strings.ContainsRune(name, 0) || contract.UTF16Length(name) > maxTokenNameLength {
		return result, &model.APIError{Status: http.StatusBadRequest, Message: "Token name must be 64 characters or fewer", Code: "invalid_request"}
	}
	tx, err := s.beginTokenOwner(ctx, principal.UserID)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if principal.Method != "browser" {
		return result, browserRequired()
	}
	active, err := activeBrowserSession(ctx, tx, principal, time.Now().UTC())
	if err != nil {
		return result, fmt.Errorf("check token issuing session: %w", err)
	}
	if !active {
		return result, unauthorized()
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM upload_tokens WHERE user_id = ?1 AND revoked_at IS NULL`, principal.UserID).Scan(&count); err != nil {
		return result, fmt.Errorf("count upload tokens: %w", err)
	}
	if count >= maxActiveTokens {
		return result, &model.APIError{Status: http.StatusUnprocessableEntity, Code: "token_limit", Message: "You can have at most 10 active tokens; revoke one first"}
	}
	plaintext, prefix, hash, err := newUploadToken()
	if err != nil {
		return result, fmt.Errorf("generate upload token: %w", err)
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO upload_tokens (id, user_id, name, token_hash, prefix)
		VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, name, prefix, created_at`, model.NewID(), principal.UserID, name, hash, prefix).Scan(&result.ID, &result.Name, &result.Prefix, &result.CreatedAt)
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
	if !contract.ValidAssetID(id) {
		return &model.APIError{Status: http.StatusBadRequest, Message: "Invalid asset or tag id", Code: "invalid_request"}
	}
	tx, err := s.beginTokenOwner(ctx, owner)
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

func (s *Service) beginTokenOwner(ctx context.Context, owner string) (*sql.Tx, error) {
	if owner == "" {
		return nil, unauthorized()
	}
	if s.db == nil {
		return nil, &model.APIError{Status: http.StatusServiceUnavailable, Message: "Library is temporarily unavailable", Code: "library_unavailable", Retryable: true}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin library mutation: %w", err)
	}
	var id string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id = ?1`, owner).Scan(&id)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &model.APIError{Status: http.StatusForbidden, Message: "Account not found", Code: "account_not_found"}
		}
		return nil, fmt.Errorf("check library account: %w", err)
	}
	return tx, nil
}
