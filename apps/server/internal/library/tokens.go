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
	rows, err := s.pool.Query(ctx, `SELECT id, name, prefix, last_used_at, created_at
		FROM upload_tokens WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC, id DESC`, owner)
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

// MintToken must only be routed after Resolve(request, false). The plaintext
// appears only in this return value; the database receives SHA-256 and prefix.
func (s *Service) MintToken(ctx context.Context, owner, name string) (MintedToken, error) {
	var result MintedToken
	name = trimClientWhitespace(name)
	if name == "" {
		return result, badRequest("Give your token a name")
	}
	if !utf8.ValidString(name) || strings.ContainsRune(name, 0) || utf16Length(name) > maxTokenNameLength {
		return result, badRequest("Token name must be 64 characters or fewer")
	}
	tx, err := s.beginOwner(ctx, owner)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM upload_tokens WHERE user_id = $1 AND revoked_at IS NULL`, owner).Scan(&count); err != nil {
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
	err = tx.QueryRow(ctx, `INSERT INTO upload_tokens (id, user_id, name, token_hash, prefix)
		VALUES ($1, $2, $3, $4, $5) RETURNING id, name, prefix, created_at`, model.NewID(), owner, name, hex.EncodeToString(hash[:]), "splt_"+randomPart[:6]).Scan(&result.ID, &result.Name, &result.Prefix, &result.CreatedAt)
	if err != nil {
		return MintedToken{}, fmt.Errorf("persist upload token: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
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
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE upload_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id = $2 AND revoked_at IS NULL`, owner, id); err != nil {
		return fmt.Errorf("revoke upload token: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit token revocation: %w", err)
	}
	return nil
}
