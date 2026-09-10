package predecessor

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

type importFixture struct {
	options  Options
	capture  Capture
	mapping  Mapping
	operator auth.Session
	original []byte
}

func request(method, path string) *http.Request {
	r := httptest.NewRequest(method, "https://sploot.example"+path, nil)
	r.Header.Set("Origin", "https://sploot.example")
	r.RemoteAddr = "127.0.0.1:44123"
	return r
}

func raw(t *testing.T, value any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func writeFixtureFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}

func fixture(t *testing.T) importFixture {
	t.Helper()
	parent := t.TempDir()
	if err := os.Chmod(parent, 0700); err != nil {
		t.Fatal(err)
	}
	f := importFixture{options: Options{CaptureDirectory: filepath.Join(parent, "capture"), BaseDirectory: filepath.Join(parent, "base"), MappingFile: filepath.Join(parent, "mapping.json"), TargetDirectory: filepath.Join(parent, "native"), ArchiveDirectory: filepath.Join(parent, "archive"), ClaimsFile: filepath.Join(parent, "claims.json"), BaseURL: "https://sploot.example", InvitationLifetime: time.Hour}}
	if err := os.Mkdir(f.options.BaseDirectory, 0700); err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(context.Background(), f.options.BaseDirectory)
	if err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, auth.Options{BaseURL: f.options.BaseURL, RegistrationOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	f.operator, err = service.Register(request(http.MethodPost, "/api/auth/register"), "operator@example.invalid", "operator account password")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	writeFixtureFile(t, filepath.Join(f.options.BaseDirectory, "signing.key"), bytes.Repeat([]byte{42}, 32))
	now := time.Date(2024, 5, 6, 7, 8, 9, 123456000, time.UTC)
	stamp := sourceTimestamp{now}
	f.capture = Capture{Schema: CaptureSchema, CapturedAt: time.Now().UTC(), SourceRevision: "source-revision", Tables: map[string][]json.RawMessage{}, ClerkUsers: []json.RawMessage{raw(t, map[string]any{"id": "clerk-only", "primary_email_address_id": "email-id", "email_addresses": []map[string]string{{"id": "email-id", "email_address": "clerk@example.invalid"}}, "created_at": now.UnixMilli(), "updated_at": now.UnixMilli()})}}
	for _, name := range []string{"users", "assets", "tags", "asset_tags", "user_identities", "asset_embeddings"} {
		f.capture.Tables[name] = []json.RawMessage{}
	}
	f.capture.Tables["users"] = []json.RawMessage{raw(t, sourceUser{ID: "source-a", Email: "old@example.invalid", CreatedAt: stamp, UpdatedAt: stamp}), raw(t, sourceUser{ID: "source-b", Email: "other@example.invalid", CreatedAt: stamp, UpdatedAt: stamp})}
	encodeImage := func(red uint8) []byte {
		picture := image.NewRGBA(image.Rect(0, 0, 16, 16))
		for y := range 16 {
			for x := range 16 {
				picture.Set(x, y, color.RGBA{R: red, G: 100, B: 50, A: 255})
			}
		}
		var value bytes.Buffer
		if err := png.Encode(&value, picture); err != nil {
			t.Fatal(err)
		}
		return value.Bytes()
	}
	f.original = encodeImage(200)
	historical := encodeImage(100)
	objects := [][]byte{f.original, historical, []byte("unassigned retained bytes")}
	for i, value := range objects {
		name := "objects/object-" + intString(int64(i))
		object := Object{URL: "https://store.public.blob.vercel-storage.com/" + name, Pathname: name, Path: name, Size: int64(len(value)), SHA256: digest(value)}
		f.capture.Objects = append(f.capture.Objects, object)
		writeFixtureFile(t, filepath.Join(f.options.CaptureDirectory, name), value)
	}
	slug := "shared-link-a"
	asset := sourceAsset{ID: "asset-a", Owner: "source-a", BlobURL: f.capture.Objects[0].URL, Pathname: f.capture.Objects[0].Pathname, MIME: "image/png", Size: int64(len(historical)), Checksum: digest(historical), Favorite: true, CreatedAt: stamp, UpdatedAt: stamp, Share: &slug, ShuffleKey: 9223372036854775806}
	f.capture.Tables["assets"] = append(f.capture.Tables["assets"], raw(t, asset))
	asset.ID, asset.Owner, asset.Checksum, asset.Size, asset.Share, asset.DeletedAt = "asset-b", "source-b", digest(f.original), int64(len(f.original)), nil, &stamp
	f.capture.Tables["assets"] = append(f.capture.Tables["assets"], raw(t, asset))
	f.capture.Tables["asset_embeddings"] = []json.RawMessage{raw(t, map[string]any{"asset_id": "asset-a", "owner_user_id": "source-a", "dim": 768, "status": "ready", "image_embedding": "[1,0,0]"})}
	f.capture.Tables["audit_receipts"] = []json.RawMessage{raw(t, map[string]any{"historical": "retained source-only metadata"})}
	f.capture.Completeness.Database, f.capture.Completeness.Clerk, f.capture.Completeness.Objects, f.capture.Completeness.Verified = true, true, true, true
	f.mapping = Mapping{Schema: MappingSchema, Owners: []OwnerMapping{{SourceUserID: "source-a", TargetUserID: f.operator.User.ID}, {SourceUserID: "source-b"}, {SourceUserID: "clerk-only"}}}
	f.persist(t)
	return f
}

func (f *importFixture) persist(t *testing.T) {
	t.Helper()
	f.capture.Counts.Tables = map[string]int{}
	for name, rows := range f.capture.Tables {
		f.capture.Counts.Tables[name] = len(rows)
	}
	f.capture.Counts.Assets, f.capture.Counts.Users, f.capture.Counts.ClerkUsers, f.capture.Counts.Objects = len(f.capture.Tables["assets"]), len(f.capture.Tables["users"]), len(f.capture.ClerkUsers), len(f.capture.Objects)
	f.capture.Counts.Bytes = 0
	for _, object := range f.capture.Objects {
		f.capture.Counts.Bytes += object.Size
	}
	writeFixtureFile(t, filepath.Join(f.options.CaptureDirectory, "capture.json"), raw(t, f.capture))
	writeFixtureFile(t, f.options.MappingFile, raw(t, f.mapping))
}

func TestImportPreservesPostgresTimestamps(t *testing.T) {
	f := fixture(t)
	expected := time.Date(2024, 5, 6, 7, 8, 9, 123456000, time.UTC)
	for _, table := range []string{"users", "assets", "tags"} {
		for i, encoded := range f.capture.Tables[table] {
			var row map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &row); err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"createdAt", "updatedAt", "deleted_at"} {
				if value, exists := row[name]; exists && string(value) != "null" {
					row[name] = raw(t, expected.Format("2006-01-02T15:04:05.999999999"))
				}
			}
			f.capture.Tables[table][i] = raw(t, row)
		}
	}
	f.persist(t)
	if _, err := Import(context.Background(), f.options); err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(context.Background(), f.options.TargetDirectory)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var created, updated, deleted time.Time
	if err := db.QueryRow(`SELECT created_at,updated_at,deleted_at FROM assets WHERE id='asset-b'`).Scan(&created, &updated, &deleted); err != nil {
		t.Fatal(err)
	}
	if !created.Equal(expected) || !updated.Equal(expected) || !deleted.Equal(expected) {
		t.Fatal("PostgreSQL timestamps lost UTC meaning or fractional precision")
	}
}

func TestImportUsesStoredMediaTypeWithoutChangingBytes(t *testing.T) {
	f := fixture(t)
	var historical map[string]json.RawMessage
	if err := json.Unmarshal(f.capture.Tables["assets"][0], &historical); err != nil {
		t.Fatal(err)
	}
	historical["mime"] = raw(t, "image/gif")
	f.capture.Tables["assets"][0] = raw(t, historical)
	f.persist(t)
	report, err := Import(context.Background(), f.options)
	if err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(context.Background(), f.options.TargetDirectory)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var mime, path string
	if err := db.QueryRow(`SELECT mime,pathname FROM assets WHERE id='asset-a'`).Scan(&mime, &path); err != nil {
		t.Fatal(err)
	}
	if mime != "image/png" || filepath.Ext(path) != ".png" {
		t.Fatal("native media retained a misleading historical upload type")
	}
	stored, err := os.ReadFile(filepath.Join(f.options.TargetDirectory, "media", path))
	if err != nil || !bytes.Equal(stored, f.original) {
		t.Fatal("correcting the media type changed original stored bytes")
	}
	archived, err := os.ReadFile(filepath.Join(f.options.ArchiveDirectory, "capture.json"))
	if err != nil || digest(archived) != report.CaptureSHA {
		t.Fatal("historical MIME provenance changed")
	}
}

func TestImportPreservesOwnersBytesCredentialsAndPortableRecovery(t *testing.T) {
	f := fixture(t)
	ctx := context.Background()
	report, err := Import(ctx, f.options)
	if err != nil {
		t.Fatal(err)
	}
	if report.Owners != 3 || report.NewAccounts != 2 || len(report.Assets) != 2 || len(report.Recovered) != 1 || len(report.Unassigned) != 1 {
		t.Fatal("identity or byte coverage was lost")
	}
	if report.Assets[0].HistoricalMatchesStored {
		t.Fatal("transformed stored bytes were misrepresented as historical upload bytes")
	}
	actual, err := os.ReadFile(filepath.Join(f.options.TargetDirectory, "media", report.Assets[0].NativePath))
	if err != nil || !bytes.Equal(actual, f.original) {
		t.Fatal("main bytes were transformed")
	}
	db, err := database.Open(ctx, f.options.TargetDirectory)
	if err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, auth.Options{BaseURL: f.options.BaseURL, RegistrationOpen: false})
	if err != nil {
		t.Fatal(err)
	}
	r := request(http.MethodGet, "/api/auth/session")
	r.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: f.operator.Token})
	principal, err := service.ResolveBrowser(r)
	if err != nil || principal.UserID != f.operator.User.ID {
		t.Fatal("mapped operator session did not survive")
	}
	if _, err := service.Login(request(http.MethodPost, "/api/auth/login"), f.operator.User.Email, "operator account password"); err != nil {
		t.Fatal("mapped operator password did not survive")
	}
	var captureJSON string
	if err := db.QueryRow(`SELECT capture_json FROM predecessor_imports`).Scan(&captureJSON); err != nil {
		t.Fatal(err)
	}
	var preserved Capture
	if err := json.Unmarshal([]byte(captureJSON), &preserved); err != nil || len(preserved.Tables["audit_receipts"]) != 1 {
		t.Fatal("source-only metadata was not retained")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	snapshot := filepath.Join(filepath.Dir(f.options.TargetDirectory), "snapshot")
	if _, err := recovery.Backup(ctx, recovery.Options{DataDirectory: f.options.TargetDirectory, Directory: snapshot}); err != nil {
		t.Fatal(err)
	}
	restored := filepath.Join(filepath.Dir(f.options.TargetDirectory), "restored")
	if _, err := recovery.Restore(ctx, recovery.RestoreOptions{Directory: snapshot, TargetDataDirectory: restored}); err != nil {
		t.Fatal(err)
	}
	if _, err := recovery.VerifyRestore(ctx, recovery.RestoreOptions{Directory: snapshot, TargetDataDirectory: restored}); err != nil {
		t.Fatal(err)
	}
	db, err = database.Open(ctx, restored)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	service, err = auth.New(db, auth.Options{BaseURL: f.options.BaseURL})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResolveBrowser(r); err == nil {
		t.Fatal("portable recovery retained a session")
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM account_invitations`).Scan(&count); err != nil || count != 0 {
		t.Fatal("portable recovery retained invitation authority")
	}
	if _, err := service.Login(request(http.MethodPost, "/api/auth/login"), f.operator.User.Email, "operator account password"); err != nil {
		t.Fatal("portable recovery lost account password")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	claimsPath := filepath.Join(filepath.Dir(restored), "restored-claims.json")
	if err := InviteOwner(ctx, restored, "source-b", f.options.BaseURL, claimsPath, time.Hour); err != nil {
		t.Fatalf("cannot reissue an invitation after portable recovery: %v", err)
	}
	encoded, err := os.ReadFile(claimsPath)
	if err != nil {
		t.Fatal(err)
	}
	var claims struct{ Invitations []struct{ URL string } }
	if err := json.Unmarshal(encoded, &claims); err != nil || len(claims.Invitations) != 1 {
		t.Fatal("restored owner invitation was not issued")
	}
	link, err := url.Parse(claims.Invitations[0].URL)
	if err != nil {
		t.Fatal(err)
	}
	parameters, err := url.ParseQuery(link.Fragment)
	if err != nil {
		t.Fatal(err)
	}
	db, err = database.Open(ctx, restored)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	service, err = auth.New(db, auth.Options{BaseURL: f.options.BaseURL})
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := service.ClaimInvitation(request(http.MethodPost, "/api/auth/claim"), parameters.Get("userId"), parameters.Get("token"), "recovered owner password")
	if err != nil || claimed.User.ID != "source-b" {
		t.Fatalf("restored unclaimed owner cannot activate their library: %v", err)
	}
}

func TestImportRejectsCorruptionAndSymlinkWithoutPublishing(t *testing.T) {
	for _, corruption := range []string{"bytes", "symlink"} {
		t.Run(corruption, func(t *testing.T) {
			f := fixture(t)
			path := filepath.Join(f.options.CaptureDirectory, f.capture.Objects[0].Path)
			if corruption == "bytes" {
				writeFixtureFile(t, path, []byte("not the captured bytes"))
			} else {
				outside := filepath.Join(filepath.Dir(f.options.CaptureDirectory), "outside.png")
				writeFixtureFile(t, outside, f.original)
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(outside, path); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := Import(context.Background(), f.options); err == nil {
				t.Fatal("unsafe capture was imported")
			}
			if _, err := os.Lstat(f.options.TargetDirectory); !os.IsNotExist(err) {
				t.Fatal("rejected import published a native library")
			}
			if _, err := os.Lstat(f.options.ClaimsFile); !os.IsNotExist(err) {
				t.Fatal("rejected import published invitations")
			}
		})
	}
}

func TestImportRequiresOwnerAndShareConflictResolution(t *testing.T) {
	f := fixture(t)
	f.mapping.Owners[1].TargetUserID = f.operator.User.ID
	f.persist(t)
	if _, err := Import(context.Background(), f.options); err == nil {
		t.Fatal("source owners were merged")
	}
	f = fixture(t)
	var asset sourceAsset
	if err := json.Unmarshal(f.capture.Tables["assets"][0], &asset); err != nil {
		t.Fatal(err)
	}
	bad := "short"
	asset.Share = &bad
	f.capture.Tables["assets"][0] = raw(t, asset)
	f.persist(t)
	if _, err := Import(context.Background(), f.options); err == nil {
		t.Fatal("invalid share was silently dropped")
	}
	f.options.ArchiveDirectory += "-resolved"
	f.mapping.Shares = []ShareResolution{{AssetID: asset.ID, Action: "replace", Slug: "replacement-link", Reason: "operator resolved invalid old slug"}}
	f.persist(t)
	report, err := Import(context.Background(), f.options)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Shares) != 1 || report.Assets[0].Share == nil || *report.Assets[0].Share != "replacement-link" {
		t.Fatal("explicit share resolution was not applied and retained")
	}
}

func TestImportRetainsEqualContentIdentitiesAndSavePrefersLiveAsset(t *testing.T) {
	f := fixture(t)
	var second sourceAsset
	if err := json.Unmarshal(f.capture.Tables["assets"][1], &second); err != nil {
		t.Fatal(err)
	}
	second.Owner = "source-a"
	f.capture.Tables["assets"][1] = raw(t, second)
	f.persist(t)
	report, err := Import(context.Background(), f.options)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.CanonicalDuplicates) != 1 || len(report.CanonicalDuplicates[0].AssetIDs) != 2 || len(report.Assets) != 2 {
		t.Fatal("equal-content source identities were lost or conflated")
	}
	if report.Assets[0].NativePath == report.Assets[1].NativePath {
		t.Fatal("distinct source assets share a purgeable native path")
	}
	db, err := database.Open(context.Background(), f.options.TargetDirectory)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	service, err := ingest.New(db, ingest.Options{MediaDirectory: filepath.Join(f.options.TargetDirectory, "media"), Environment: "test", UploadsEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	saved, err := service.Save(context.Background(), f.operator.User.ID, ingest.Input{Filename: "another.png", MIME: "image/png", Reader: bytes.NewReader(f.original)})
	if err != nil || !saved.IsDuplicate || saved.Asset == nil || saved.Asset.ID != "asset-a" {
		t.Fatal("normal save did not choose the retained live equal-content identity")
	}
	var count, trash int
	if err := db.QueryRow(`SELECT COUNT(*),SUM(deleted_at IS NOT NULL) FROM assets WHERE owner_user_id=?`, f.operator.User.ID).Scan(&count, &trash); err != nil || count != 2 || trash != 1 {
		t.Fatal("deduplicated save changed retained asset or trash identities")
	}
}
