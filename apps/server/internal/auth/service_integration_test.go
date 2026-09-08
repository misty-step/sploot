package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func authDatabase(t *testing.T) (*pgxpool.Pool, string, string) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DB path unverified: DATABASE_URL is required")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if !localDatabaseHost(config.ConnConfig.Host) {
		t.Fatal("auth integration tests require a local, migrated pgvector database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	owner, other := "qa-auth-"+model.NewID(), "qa-auth-"+model.NewID()
	for _, id := range []string{owner, other} {
		if _, err := pool.Exec(context.Background(), `INSERT INTO users (id, email, "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)`, id, id+"@sploot.test"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if _, err := pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id); err != nil {
				t.Error(err)
			}
		})
	}
	return pool, owner, other
}

func tokenRequest(token string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "https://www.sploot.app/api/upload", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func TestDatabasePATScopeHashOnlyStorageAndRevocation(t *testing.T) {
	pool, owner, other := authDatabase(t)
	ctx := context.Background()
	lib := library.New(pool, []byte(strings.Repeat("cursor-test-key-", 3)))
	s := &Service{pool: pool}
	minted, err := lib.MintToken(ctx, owner, "phone")
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := pool.QueryRow(ctx, `SELECT token_hash FROM upload_tokens WHERE id = $1 AND user_id = $2`, minted.ID, owner).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	expected := sha256.Sum256([]byte(minted.Token))
	if stored != hex.EncodeToString(expected[:]) || stored == minted.Token {
		t.Fatal("token was not stored as SHA-256 only")
	}
	listed, err := lib.Tokens(ctx, owner)
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
	_, err = s.Resolve(tokenRequest(minted.Token), false)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	principal, err := s.Resolve(tokenRequest(minted.Token), true)
	if err != nil || principal.UserID != owner || principal.Method != "upload-token" {
		t.Fatalf("allowed PAT request: %#v %v", principal, err)
	}
	if err := lib.RevokeToken(ctx, other, minted.ID); err != nil {
		t.Fatal(err)
	}
	principal, err = s.Resolve(tokenRequest(minted.Token), true)
	if err != nil || principal.UserID != owner {
		t.Fatalf("cross-owner revoke affected token: %#v %v", principal, err)
	}
	if err := lib.RevokeToken(ctx, owner, minted.ID); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(tokenRequest(minted.Token), true)
	requireAPIStatus(t, err, http.StatusUnauthorized)
	listed, err = lib.Tokens(ctx, owner)
	if err != nil || len(listed) != 0 {
		t.Fatalf("revoked token is still listed: %#v %v", listed, err)
	}
}

func TestDatabaseIdentityMappingPreservesOwnerWithoutEnrollment(t *testing.T) {
	pool, owner, _ := authDatabase(t)
	ctx := context.Background()
	s, key := signingService(t)
	s.pool = pool
	subject := "user_recovered_" + model.NewID()
	_, err := pool.Exec(ctx, `INSERT INTO user_identities (id, user_id, provider, provider_subject, updated_at) VALUES ($1, $2, 'clerk', $3, CURRENT_TIMESTAMP)`, model.NewID(), owner, subject)
	if err != nil {
		t.Fatal(err)
	}
	token := signedJWT(t, key, sessionClaims(subject))
	principal, err := s.Resolve(tokenRequest(token), false)
	if err != nil || principal.UserID != owner || principal.Method != "clerk-bearer" {
		t.Fatalf("existing identity was not mapped to its owner: %#v %v", principal, err)
	}
	cookieRequest := httptest.NewRequest(http.MethodGet, "https://www.sploot.app/api/assets", nil)
	cookieRequest.AddCookie(&http.Cookie{Name: "__session", Value: token})
	principal, err = s.Resolve(cookieRequest, false)
	if err != nil || principal.UserID != owner || principal.Method != "clerk-cookie" {
		t.Fatalf("existing cookie identity: %#v %v", principal, err)
	}
	unknown := "user_unenrolled_" + model.NewID()
	_, err = s.Resolve(tokenRequest(signedJWT(t, key, sessionClaims(unknown))), false)
	requireAPIStatus(t, err, http.StatusForbidden)
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, unknown).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("authentication implicitly enrolled an unknown user")
	}
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)`, subject, subject+"@sploot.test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, subject); err != nil {
			t.Error(err)
		}
	})
	_, err = s.Resolve(tokenRequest(token), false)
	requireAPIStatus(t, err, http.StatusConflict)
}

func TestDatabaseConcurrentTokenMintingCannotExceedActiveLimit(t *testing.T) {
	pool, owner, _ := authDatabase(t)
	lib := library.New(pool, []byte(strings.Repeat("cursor-test-key-", 3)))
	var group sync.WaitGroup
	errors := make(chan error, 11)
	for range 11 {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := lib.MintToken(context.Background(), owner, "device")
			errors <- err
		}()
	}
	group.Wait()
	close(errors)
	created, refused := 0, 0
	for err := range errors {
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

func TestDatabaseQALoginMintsBoundSessionForExistingQAUserOnly(t *testing.T) {
	pool, owner, _ := authDatabase(t)
	s, err := New(pool, Options{BaseURL: "http://127.0.0.1:3001", Environment: "test", QALocalSecret: strings.Repeat("q", 32), QALocalUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3001/qa-auth/login", nil)
	r.RemoteAddr = "127.0.0.1:42310"
	token, err := s.MintQALocalToken(r)
	if err != nil {
		t.Fatal(err)
	}
	r = httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3001/api/assets", nil)
	r.RemoteAddr = "127.0.0.1:42310"
	r.AddCookie(&http.Cookie{Name: "sploot_qa_auth", Value: token})
	principal, err := s.Resolve(r, false)
	if err != nil || principal.UserID != owner || principal.Method != "qa-local" {
		t.Fatalf("QA cookie session: %#v %v", principal, err)
	}
	if _, err := pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, owner); err != nil {
		t.Fatal(err)
	}
	_, err = s.Resolve(r, false)
	requireAPIStatus(t, err, http.StatusForbidden)
	_, err = s.MintQALocalToken(r)
	requireAPIStatus(t, err, http.StatusForbidden)
}
