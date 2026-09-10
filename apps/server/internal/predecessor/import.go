package predecessor

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

func intString(value int64) string { return strconv.FormatInt(value, 10) }

// Import publishes only a fully verified new target. The original capture, base
// directory, and any existing output are never modified. Failure leaves the new
// private archive/report for diagnosis, but never publishes a partial library.
func Import(ctx context.Context, options Options) (report Report, err error) {
	report.Schema, report.Status = "sploot.predecessor.import.v1", "incomplete"
	if options.InvitationLifetime == 0 {
		options.InvitationLifetime = 24 * time.Hour
	}
	if options.InvitationLifetime < time.Minute || options.InvitationLifetime > 7*24*time.Hour {
		return report, reject("invitation_lifetime")
	}
	if _, err := claimOrigin(options.BaseURL); err != nil {
		return report, err
	}
	capture, capturePath, err := privateDirectory(options.CaptureDirectory)
	if err != nil {
		return report, err
	}
	defer capture.Close()
	base, basePath, err := privateDirectory(options.BaseDirectory)
	if err != nil {
		return report, err
	}
	defer base.Close()
	if err := requireOfflineBase(base); err != nil {
		return report, err
	}
	targetPath, err := newOutputPath(options.TargetDirectory)
	if err != nil {
		return report, err
	}
	archivePath, err := newOutputPath(options.ArchiveDirectory)
	if err != nil {
		return report, err
	}
	claimsPath, err := newOutputPath(options.ClaimsFile)
	if err != nil {
		return report, err
	}
	claimsParent, _, err := privateDirectory(filepath.Dir(claimsPath))
	if err != nil {
		return report, err
	}
	claimsParent.Close()
	for i, path := range []string{capturePath, basePath, targetPath, archivePath} {
		for j, other := range []string{capturePath, basePath, targetPath, archivePath} {
			if i != j && (path == other || strings.HasPrefix(path, other+string(os.PathSeparator))) {
				return report, reject("overlapping_directories")
			}
		}
		if claimsPath == path || strings.HasPrefix(claimsPath, path+string(os.PathSeparator)) {
			return report, reject("claims_output_must_be_separate")
		}
	}
	rawCapture, err := readPrivate(capture, "capture.json", maxCaptureBytes)
	if err != nil {
		return report, err
	}
	var source Capture
	if json.Unmarshal(rawCapture, &source) != nil {
		return report, reject("capture_json")
	}
	if err := validateCapture(source); err != nil {
		return report, err
	}
	mappingRoot, _, err := privateDirectory(filepath.Dir(options.MappingFile))
	if err != nil {
		return report, err
	}
	defer mappingRoot.Close()
	rawMapping, err := readPrivate(mappingRoot, filepath.Base(options.MappingFile), 1<<20)
	if err != nil {
		return report, err
	}
	var mapping Mapping
	decoder := json.NewDecoder(bytes.NewReader(rawMapping))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&mapping) != nil {
		return report, reject("mapping_json")
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return report, reject("mapping_trailing_json")
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return report, reject("entropy_unavailable")
	}
	report.ImportID, report.CaptureSHA = hex.EncodeToString(random[:]), digest(rawCapture)
	archive, _, err := newPrivateDirectory(archivePath)
	if err != nil {
		return report, err
	}
	defer archive.Close()
	defer func() {
		if err != nil {
			report.Status = "rejected"
			if len(report.Issues) == 0 {
				report.Issues = append(report.Issues, Issue{Code: "conversion_failed"})
			}
			_ = writeJSON(archive, "import-report.json", report)
		}
	}()
	// Preserve the entire capture tree, including schema dumps and retrieval
	// receipts that are intentionally not interpreted by the converter.
	if err := walkBase(ctx, capture, archive, "."); err != nil {
		return report, err
	}
	archivedCapture, err := readPrivate(archive, "capture.json", maxCaptureBytes)
	if err != nil || digest(archivedCapture) != report.CaptureSHA {
		return report, reject("capture_changed")
	}
	for _, object := range source.Objects {
		file, err := privateFile(archive, object.Path)
		if err != nil {
			return report, err
		}
		info, statErr := file.Stat()
		checksum, hashErr := hashReader(contextReader{ctx, file})
		file.Close()
		if statErr != nil || hashErr != nil || info.Size() != object.Size || checksum != object.SHA256 {
			return report, reject("object_integrity")
		}
	}
	if _, _, err := writePrivate(archive, "owner-mapping.json", bytes.NewReader(rawMapping)); err != nil {
		return report, err
	}
	stagingPath := filepath.Join(filepath.Dir(targetPath), ".sploot-import-"+report.ImportID)
	staging, _, err := newPrivateDirectory(stagingPath)
	if err != nil {
		return report, err
	}
	defer staging.Close()
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(stagingPath)
		}
	}()
	if err := copyBase(ctx, base, staging); err != nil {
		return report, err
	}
	// The base is now detached; migration and inspection touch only the copy.
	db, err := database.Open(ctx, stagingPath)
	if err != nil {
		return report, reject("base_schema")
	}
	defer db.Close()
	p, err := buildPlan(ctx, db, source, mapping, &report)
	if err != nil {
		return report, err
	}
	invitations, err := importOwners(ctx, db, p, options.InvitationLifetime)
	if err != nil {
		return report, err
	}
	for _, asset := range p.assets {
		receipt, err := importAsset(ctx, db, archive, staging, p, asset)
		if err != nil {
			report.Issues = append(report.Issues, Issue{Code: "asset_conversion_failed", SourceID: asset.ID})
			return report, reject("asset_conversion")
		}
		report.Assets = append(report.Assets, receipt)
	}
	if err := importTags(ctx, db, p); err != nil {
		return report, err
	}
	report.Status = "complete"
	rawReport, err := json.Marshal(report)
	if err != nil {
		return report, reject("report_encoding")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO predecessor_imports(id,capture_sha256,capture_json,mapping_json,report_json) VALUES(?,?,?,?,?)`, report.ImportID, report.CaptureSHA, string(rawCapture), string(rawMapping), string(rawReport)); err != nil {
		return report, reject("retained_provenance")
	}
	if err := verifyImported(ctx, db, p, report); err != nil {
		return report, err
	}
	// Seal without WAL so recovery reads cannot depend on excluded sidecars.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if _, err := db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return report, reject("native_checkpoint")
	}
	var mode string
	if err := db.QueryRowContext(ctx, `PRAGMA journal_mode=DELETE`).Scan(&mode); err != nil || mode != "delete" {
		return report, reject("native_seal")
	}
	if err := db.Close(); err != nil {
		return report, reject("native_close")
	}
	if err := recovery.VerifyLibrary(ctx, stagingPath); err != nil {
		return report, reject("native_recovery_invariants")
	}
	if err := writeClaims(options.BaseURL, claimsPath, invitations); err != nil {
		return report, err
	}
	claimsPublished := false
	defer func() {
		if !claimsPublished {
			_ = os.Remove(claimsPath)
		}
	}()
	if err := syncDirectory(staging, "."); err != nil {
		return report, reject("native_directory_sync")
	}
	// Atomic no-replace publication also rejects a destination created by a
	// competing operator between preflight and this final boundary.
	if err := renameNew(stagingPath, targetPath); err != nil {
		return report, reject("native_publication")
	}
	published, claimsPublished = true, true
	parent, err := os.Open(filepath.Dir(targetPath))
	if err != nil {
		return report, reject("native_parent_sync")
	}
	err = parent.Sync()
	parent.Close()
	if err != nil {
		return report, reject("native_parent_sync")
	}
	if err := writeJSON(archive, "import-report.json", report); err != nil {
		return report, err
	}
	return report, nil
}

func importOwners(ctx context.Context, db *sql.DB, p plan, lifetime time.Duration) ([]auth.Invitation, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, reject("account_transaction")
	}
	defer tx.Rollback()
	ids := make([]string, 0, len(p.users))
	for id := range p.users {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var invitations []auth.Invitation
	for _, id := range ids {
		mapping := p.owners[id]
		if mapping.TargetUserID != "" {
			continue
		}
		user := p.users[id]
		email := user.Email
		if mapping.LoginEmail != "" {
			email = mapping.LoginEmail
		}
		if err := auth.CreateInvitedAccount(ctx, tx, auth.User{ID: id, Email: email}, user.CreatedAt.Time, user.UpdatedAt.Time); err != nil {
			return nil, reject("separate_account_identity_conflict")
		}
		invitation, err := auth.IssueInvitation(ctx, tx, id, lifetime)
		if err != nil {
			return nil, err
		}
		invitations = append(invitations, invitation)
	}
	if err := tx.Commit(); err != nil {
		return nil, reject("account_commit")
	}
	return invitations, nil
}

func importAsset(ctx context.Context, db *sql.DB, archive, target *os.Root, p plan, asset sourceAsset) (AssetReceipt, error) {
	object := p.objects[asset.BlobURL]
	owner := targetOwner(p, asset.Owner)
	file, err := privateFile(archive, object.Path)
	if err != nil {
		return AssetReceipt{}, err
	}
	var header [512]byte
	n, readErr := file.Read(header[:])
	file.Close()
	mime := ingest.DetectMediaMIME(header[:n])
	if readErr != nil && readErr != io.EOF || !contract.IsAllowedMIME(mime) {
		return AssetReceipt{}, reject("unsupported_stored_media")
	}
	prefix := "uploads/" + digest([]byte(owner))[:32] + "/" + asset.ID
	pathname := prefix + "/" + asset.ID + mediaExtension(mime)
	posterPath := prefix + "/poster/preview.jpg"
	if err := copyObject(ctx, archive, target, object.Path, "media/"+pathname, object.Size, object.SHA256); err != nil {
		return AssetReceipt{}, err
	}
	poster, width, height, err := ingest.PrepareImportedPoster(ctx, filepath.Join(target.Name(), "media", pathname), mime)
	if err != nil {
		return AssetReceipt{}, err
	}
	posterSize, posterSHA, err := writePrivate(target, "media/"+posterPath, bytes.NewReader(poster))
	if err != nil {
		return AssetReceipt{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AssetReceipt{}, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO assets(id,owner_user_id,blob_url,thumbnail_url,pathname,thumbnail_path,mime,width,height,size,checksum_sha256,storage_size,storage_sha256,thumbnail_storage_size,thumbnail_storage_sha256,favorite,created_at,updated_at,deleted_at,share_slug,shuffle_key)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, asset.ID, owner, "/media/"+asset.ID, "/media/"+asset.ID+"?thumbnail=1", pathname, posterPath, mime, width, height, object.Size, object.SHA256, object.Size, object.SHA256, posterSize, posterSHA, asset.Favorite, asset.CreatedAt, asset.UpdatedAt, asset.DeletedAt, p.shares[asset.ID], asset.ShuffleKey)
	if err != nil {
		return AssetReceipt{}, err
	}
	// Source vectors and retry/provider state remain in capture_json only.
	if _, err := tx.ExecContext(ctx, `INSERT INTO asset_embeddings(asset_id,owner_user_id) VALUES(?,?)`, asset.ID, owner); err != nil {
		return AssetReceipt{}, err
	}
	if err := tx.Commit(); err != nil {
		return AssetReceipt{}, err
	}
	return AssetReceipt{AssetID: asset.ID, SourceOwner: asset.Owner, TargetOwner: owner, ObjectPath: object.Path, HistoricalSize: asset.Size, HistoricalSHA: asset.Checksum, StoredSize: object.Size, StoredSHA: object.SHA256, HistoricalMatchesStored: asset.Size == object.Size && asset.Checksum == object.SHA256, NativePath: pathname, PosterSHA: posterSHA, PosterSize: posterSize, Share: p.shares[asset.ID]}, nil
}

func importTags(ctx context.Context, db *sql.DB, p plan) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return reject("tag_transaction")
	}
	defer tx.Rollback()
	for _, tag := range p.tags {
		if _, err := tx.ExecContext(ctx, `INSERT INTO tags(id,owner_user_id,name,color,created_at,updated_at) VALUES(?,?,?,?,?,?)`, tag.ID, targetOwner(p, tag.Owner), tag.Name, tag.Color, tag.CreatedAt, tag.UpdatedAt); err != nil {
			return reject("tag_identity_conflict")
		}
	}
	for _, link := range p.links {
		if _, err := tx.ExecContext(ctx, `INSERT INTO asset_tags(asset_id,tag_id) VALUES(?,?)`, link.AssetID, link.TagID); err != nil {
			return reject("tag_link_conflict")
		}
	}
	if err := tx.Commit(); err != nil {
		return reject("tag_commit")
	}
	return nil
}

func verifyImported(ctx context.Context, db *sql.DB, p plan, report Report) error {
	if len(p.assets) != len(report.Assets) {
		return reject("native_asset_coverage")
	}
	for _, source := range p.assets {
		var owner string
		var favorite bool
		var created, updated time.Time
		var deleted sql.NullTime
		var share sql.NullString
		var pending bool
		err := db.QueryRowContext(ctx, `SELECT a.owner_user_id,a.favorite,a.created_at,a.updated_at,a.deleted_at,a.share_slug,e.status='pending' AND e.dim=0 AND e.image_embedding IS NULL
			FROM assets a JOIN asset_embeddings e ON e.asset_id=a.id AND e.owner_user_id=a.owner_user_id WHERE a.id=?`, source.ID).Scan(&owner, &favorite, &created, &updated, &deleted, &share, &pending)
		if err != nil || owner != targetOwner(p, source.Owner) || favorite != source.Favorite || !created.Equal(source.CreatedAt.Time) || !updated.Equal(source.UpdatedAt.Time) || deleted.Valid != (source.DeletedAt != nil) || deleted.Valid && !deleted.Time.Equal(source.DeletedAt.Time) || !pending {
			return reject("native_owner_metadata_parity")
		}
		expectedShare := p.shares[source.ID]
		if share.Valid != (expectedShare != nil) || share.Valid && share.String != *expectedShare {
			return reject("native_share_parity")
		}
	}
	return nil
}

func mediaExtension(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	}
	panic(fmt.Sprintf("unvalidated media type %q", mime))
}
