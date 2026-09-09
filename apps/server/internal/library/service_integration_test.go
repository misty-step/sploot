package library

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func libraryDatabase(t *testing.T) (*Service, string, string) {
	t.Helper()
	db, err := database.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	owner, other := "library-"+model.NewID(), "library-"+model.NewID()
	for _, id := range []string{owner, other} {
		if _, err := db.ExecContext(context.Background(), `INSERT INTO users(id, email, password_hash) VALUES (?1, ?2, 'test-only-hash')`, id, id+"@sploot.test"); err != nil {
			t.Fatal(err)
		}
	}
	return New(db, []byte(strings.Repeat("cursor-test-key-", 3))), owner, other
}

func seedLibraryAsset(t *testing.T, s *Service, owner, suffix string, shuffleKey int64) string {
	t.Helper()
	id := owner + "-" + suffix
	hash := sha256.Sum256([]byte(id))
	_, err := s.db.ExecContext(context.Background(), `INSERT INTO assets (id, owner_user_id, blob_url, pathname, mime, size, storage_size, thumbnail_storage_size, checksum_sha256, shuffle_key, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, 'image/gif', 100, 120, 8, ?5, ?6, '2025-01-01 00:00:00', CURRENT_TIMESTAMP)`,
		id, owner, "/media/"+id, id+".gif", hex.EncodeToString(hash[:]), shuffleKey)
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
	before, err := s.Stats(ctx, owner)
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
	during, err := s.Stats(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if during.StorageBytes != before.StorageBytes || during.ActiveStorageBytes != 0 || during.TrashStorageBytes != before.StorageBytes {
		t.Fatalf("soft deletion released physical storage: before=%#v after=%#v", before, during)
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
	// Even metadata written directly with a retained share slug must restore
	// privately, not just assets deleted by this service.
	legacySlug, err := s.Share(ctx, owner, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE assets SET deleted_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?1 AND id = ?2`, owner, id); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Restore(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	_, err = s.Shared(ctx, legacySlug)
	libraryStatus(t, err, http.StatusNotFound)
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

func TestDatabaseStorageCountsPhysicalFilesAndTrashPerOwner(t *testing.T) {
	s, owner, other := libraryDatabase(t)
	ctx := context.Background()
	id := seedLibraryAsset(t, s, owner, "physical", 1)
	seedLibraryAsset(t, s, other, "foreign", 2)
	stats, err := s.Stats(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if stats.StorageBytes != 128 || stats.ActiveStorageBytes != 128 || stats.TrashStorageBytes != 0 {
		t.Fatalf("physical original and poster accounting: %#v", stats)
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE assets SET storage_size = NULL WHERE owner_user_id = ?1 AND id = ?2`, owner, id); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	stats, err = s.Stats(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if stats.StorageBytes != 108 || stats.TrashStorageBytes != 108 || stats.ActiveStorageBytes != 0 {
		t.Fatalf("trashed physical files or per-file size fallback lost: %#v", stats)
	}
}

func TestDatabaseTimestampCursorDoesNotRepeatEqualTimeBoundary(t *testing.T) {
	s, owner, _ := libraryDatabase(t)
	ctx := context.Background()
	a := seedLibraryAsset(t, s, owner, "a", 10)
	b := seedLibraryAsset(t, s, owner, "b", 20)
	c := seedLibraryAsset(t, s, owner, "c", 30)
	options := model.ListOptions{Limit: 1}
	var ids []string
	for range 3 {
		page, err := s.List(ctx, owner, options)
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Assets) != 1 {
			t.Fatalf("missing timestamp page: %#v", page)
		}
		ids = append(ids, page.Assets[0].ID)
		options.Cursor = page.NextCursor
	}
	if !reflect.DeepEqual(ids, []string{c, b, a}) || options.Cursor != "" {
		t.Fatalf("equal-time cursor repeated or skipped a boundary: %v", ids)
	}
}

func assetIDs(assets []model.Asset) []string {
	ids := make([]string, len(assets))
	for i, asset := range assets {
		ids[i] = asset.ID
	}
	return ids
}

func TestStorageStatsKeepPendingPurgeChargesOwnerScoped(t *testing.T) {
	s, owner, other := libraryDatabase(t)
	seedLibraryAsset(t, s, owner, "active", 1)
	if _, err := s.db.Exec(`INSERT INTO asset_purges(asset_id,owner_user_id,pathname,thumbnail_path,storage_size,thumbnail_storage_size)
		VALUES('owned-pending',?,'uploads/owned-pending','uploads/owned-pending/poster',7,3),('foreign-pending',?,'uploads/foreign-pending','uploads/foreign-pending/poster',500,100)`, owner, other); err != nil {
		t.Fatal(err)
	}
	stats, err := s.Stats(context.Background(), owner)
	if err != nil {
		t.Fatal(err)
	}
	if stats.ActiveStorageBytes != 128 || stats.TrashStorageBytes != 10 || stats.StorageBytes != 138 {
		t.Fatalf("pending purge charge leaked across owners or was released early: %+v", stats)
	}
}
