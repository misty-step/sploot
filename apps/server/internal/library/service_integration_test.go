package library

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func libraryDatabase(t *testing.T) (*Service, string, string) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DB path unverified: DATABASE_URL is required")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	host := config.ConnConfig.Host
	ip := net.ParseIP(host)
	if host != "localhost" && !strings.HasPrefix(host, "/") && (ip == nil || !ip.IsLoopback()) {
		t.Fatal("library integration tests require a local, migrated pgvector database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	owner, other := "qa-library-"+model.NewID(), "qa-library-"+model.NewID()
	for _, id := range []string{owner, other} {
		if _, err := pool.Exec(context.Background(), `INSERT INTO users (id, email, "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)`, id, id+"@sploot.test"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if _, err := pool.Exec(context.Background(), `DELETE FROM storage_cleanup_outbox WHERE asset_id IN (SELECT id FROM assets WHERE owner_user_id = $1)`, id); err != nil {
				t.Error(err)
			}
			if _, err := pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id); err != nil {
				t.Error(err)
			}
		})
	}
	return New(pool, []byte(strings.Repeat("cursor-test-key-", 3))), owner, other
}

func seedLibraryAsset(t *testing.T, s *Service, owner, suffix string, shuffleKey int64) string {
	t.Helper()
	id := owner + "-" + suffix
	hash := sha256.Sum256([]byte(id))
	_, err := s.pool.Exec(context.Background(), `INSERT INTO assets (id, owner_user_id, blob_url, pathname, mime, size, storage_size, thumbnail_storage_size, checksum_sha256, shuffle_key, "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, 'image/gif', 100, 120, 8, $5, $6, '2025-01-01T00:00:00'::timestamp, CURRENT_TIMESTAMP)`,
		id, owner, "https://sploot-qa-seed.public.blob.vercel-storage.com/"+id+".gif", id+".gif", hex.EncodeToString(hash[:]), shuffleKey)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func libraryStatus(t *testing.T, err error, status int) {
	t.Helper()
	var apiError *model.APIError
	if !errors.As(err, &apiError) || apiError.Status != status {
		t.Fatalf("wanted API status %d, got %v", status, err)
	}
}

func TestDatabaseCrossOwnerOperationsAndRestorePreservePrivateMedia(t *testing.T) {
	s, owner, other := libraryDatabase(t)
	ctx := context.Background()
	id := seedLibraryAsset(t, s, owner, "asset", 42)
	original, err := s.Get(ctx, owner, id)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Get(ctx, other, id)
	libraryStatus(t, err, http.StatusNotFound)
	_, err = s.UpdateFavorite(ctx, other, id, true)
	libraryStatus(t, err, http.StatusNotFound)
	libraryStatus(t, s.Delete(ctx, other, id), http.StatusNotFound)
	_, err = s.Restore(ctx, other, id)
	libraryStatus(t, err, http.StatusNotFound)
	_, err = s.Share(ctx, other, id)
	libraryStatus(t, err, http.StatusNotFound)
	libraryStatus(t, s.RevokeShare(ctx, other, id), http.StatusNotFound)

	foreignTag, err := s.CreateTag(ctx, other, "foreign", nil)
	if err != nil {
		t.Fatal(err)
	}
	added, err := s.AddTags(ctx, owner, id, []string{foreignTag.ID}, []string{" Reaction "})
	if err != nil {
		t.Fatal(err)
	}
	if len(added) != 1 || added[0].Name != "reaction" {
		t.Fatalf("foreign tag leaked or owned tag missing: %#v", added)
	}
	libraryStatus(t, s.DeleteTag(ctx, owner, foreignTag.ID), http.StatusNotFound)
	_, err = s.AddTags(ctx, other, id, []string{foreignTag.ID}, nil)
	libraryStatus(t, err, http.StatusNotFound)
	favorite, err := s.UpdateFavorite(ctx, owner, id, true)
	if err != nil {
		t.Fatal(err)
	}
	if !favorite.Favorite {
		t.Fatal("favorite mutation not visible")
	}
	before, err := s.Quota(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.SharedSlugByID(ctx, id)
	libraryStatus(t, err, http.StatusNotFound)
	slug, err := s.Share(ctx, owner, id)
	if err != nil {
		t.Fatal(err)
	}
	repeatedSlug, err := s.Share(ctx, owner, id)
	if err != nil || repeatedSlug != slug {
		t.Fatalf("share is not idempotent: %q %v", repeatedSlug, err)
	}
	shared, err := s.Shared(ctx, slug)
	if err != nil || shared.BlobURL != original.BlobURL {
		t.Fatalf("shared media: %#v %v", shared, err)
	}
	if len(shared.Tags) != 0 || shared.Favorite {
		t.Fatal("public share exposed private library state")
	}
	resolved, err := s.SharedSlugByID(ctx, id)
	if err != nil || resolved != slug {
		t.Fatalf("existing ID-based share link failed: %q %v", resolved, err)
	}
	if err := s.Delete(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	_, err = s.Get(ctx, owner, id)
	libraryStatus(t, err, http.StatusNotFound)
	_, err = s.Shared(ctx, slug)
	libraryStatus(t, err, http.StatusNotFound)
	_, err = s.SharedSlugByID(ctx, id)
	libraryStatus(t, err, http.StatusNotFound)
	trashed, err := s.List(ctx, owner, model.ListOptions{Deleted: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(trashed.Assets) != 1 || trashed.Assets[0].ID != id || !trashed.Assets[0].Favorite || len(trashed.Assets[0].Tags) != 1 || trashed.Assets[0].Tags[0].Name != "reaction" {
		t.Fatalf("trash lost asset state: %#v", trashed)
	}
	during, err := s.Quota(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if during.UsedBytes != before.UsedBytes || during.ActiveBytes != 0 || during.TrashBytes != before.UsedBytes {
		t.Fatalf("soft deletion released physical quota: before=%#v after=%#v", before, during)
	}
	restored, err := s.Restore(ctx, owner, id)
	if err != nil {
		t.Fatal(err)
	}
	if restored.ID != id || restored.BlobURL != original.BlobURL || restored.Checksum != original.Checksum || restored.MIME != "image/gif" || !restored.Favorite || restored.DeletedAt != nil || len(restored.Tags) != 1 {
		t.Fatalf("restore did not preserve original state: %#v", restored)
	}
	_, err = s.Shared(ctx, slug)
	libraryStatus(t, err, http.StatusNotFound)
	_, err = s.SharedSlugByID(ctx, id)
	libraryStatus(t, err, http.StatusNotFound)
	// Legacy soft deletion retained share_slug. Restoring that existing data
	// must be private too, not just assets deleted by the Go service.
	legacySlug, err := s.Share(ctx, owner, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, `UPDATE assets SET deleted_at = CURRENT_TIMESTAMP WHERE owner_user_id = $1 AND id = $2`, owner, id); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Restore(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	_, err = s.Shared(ctx, legacySlug)
	libraryStatus(t, err, http.StatusNotFound)
	if err := s.Delete(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO storage_cleanup_outbox (id, asset_id, provider, key, url, action, status, updated_at)
		VALUES ($1, $2, 'vercel', $3, $4, 'permanent-delete', 'done', CURRENT_TIMESTAMP)`, model.NewID(), id, original.Pathname, original.BlobURL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Restore(ctx, owner, id)
	libraryStatus(t, err, http.StatusConflict)
}

func TestDatabaseShuffleCursorSurvivesDeletionAndWrapsWithoutSkipping(t *testing.T) {
	s, owner, other := libraryDatabase(t)
	ctx := context.Background()
	a := seedLibraryAsset(t, s, owner, "a", 10)
	b := seedLibraryAsset(t, s, owner, "b", 20)
	c := seedLibraryAsset(t, s, owner, "c", maxShuffleKey/2+1)
	d := seedLibraryAsset(t, s, owner, "d", maxShuffleKey/2+1)
	seedLibraryAsset(t, s, other, "foreign", maxShuffleKey/2+1)
	options := model.ListOptions{Sort: "shuffle", Seed: "500000", Limit: 2}
	page, err := s.List(ctx, owner, options)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(assetIDs(page.Assets), []string{c, d}) || page.Total != 4 || !page.HasMore {
		t.Fatalf("first shuffled page: %#v", page)
	}
	// Remove both an earlier result and the boundary row: neither should
	// change the signed keyset position or skip the beginning of the ring.
	if err := s.Delete(ctx, owner, c); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, owner, d); err != nil {
		t.Fatal(err)
	}
	options.Cursor = page.NextCursor
	page, err = s.List(ctx, owner, options)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(assetIDs(page.Assets), []string{a, b}) || page.HasMore {
		t.Fatalf("ring continuation skipped or duplicated assets: %#v", page)
	}
	if _, err := s.UpdateFavorite(ctx, owner, a, true); err != nil {
		t.Fatal(err)
	}
	favorite := false
	page, err = s.List(ctx, owner, model.ListOptions{Favorite: &favorite})
	if err != nil || !reflect.DeepEqual(assetIDs(page.Assets), []string{b}) {
		t.Fatalf("favorite=false filter: %#v %v", page, err)
	}
}

func TestDatabaseQuotaUsesReplicaBytesAndPerRenditionFallback(t *testing.T) {
	s, owner, _ := libraryDatabase(t)
	ctx := context.Background()
	id := seedLibraryAsset(t, s, owner, "replica", 1)
	_, err := s.pool.Exec(ctx, `INSERT INTO asset_storage_replicas (id, asset_id, rendition, provider, logical_key, delivery_url, size, sha256, generation, active, updated_at)
		VALUES ($1, $2, 'original', 'vercel', $3, $4, 150, $5, 1, true, CURRENT_TIMESTAMP)`, model.NewID(), id, id+".gif", "https://sploot-qa-seed.public.blob.vercel-storage.com/"+id+".gif", strings.Repeat("a", 64))
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO storage_quota_reservations (id, owner_user_id, bytes, expires_at) VALUES ($1, $2, 25, CURRENT_TIMESTAMP + interval '10 minutes'), ($3, $2, 99, CURRENT_TIMESTAMP - interval '1 minute')`, model.NewID(), owner, model.NewID())
	if err != nil {
		t.Fatal(err)
	}
	quota, err := s.Quota(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != 158 || quota.ReservedBytes != 25 || quota.RemainingBytes != quota.LimitBytes-183 {
		t.Fatalf("physical quota drifted from replicas + thumbnail fallback: %#v", quota)
	}
}

func assetIDs(assets []model.Asset) []string {
	ids := make([]string, len(assets))
	for i, asset := range assets {
		ids[i] = asset.ID
	}
	return ids
}
