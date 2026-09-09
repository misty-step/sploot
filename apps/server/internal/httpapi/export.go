package httpapi

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"database/sql"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const libraryExportTimeout = 15 * time.Minute

type libraryExportRecord struct {
	Asset     json.RawMessage `json:"asset"`
	Embedding json.RawMessage `json:"embedding"`
	TagLinks  json.RawMessage `json:"asset_tags"`
	// Private account credentials and query caches are never part of this export.
	Media []libraryExportMedia `json:"media,omitempty"`
}

type libraryExportMedia struct {
	Rendition            string `json:"rendition"`
	Path                 string `json:"path"`
	Name                 string `json:"name"`
	MIME                 string `json:"mime"`
	Bytes                int64  `json:"bytes"`
	SHA256               string `json:"sha256"`
	StoredSHA256Verified bool   `json:"stored_sha256_verified"`
}

type libraryExportManifest struct {
	Format           string    `json:"format"`
	Version          int       `json:"version"`
	OwnerID          string    `json:"owner_user_id"`
	SnapshotAt       time.Time `json:"snapshot_at"`
	CompletedAt      time.Time `json:"completed_at"`
	Assets           int64     `json:"assets"`
	DeletedAssets    int64     `json:"soft_deleted_assets"`
	Tags             int64     `json:"tags"`
	MediaObjects     int64     `json:"media_objects"`
	MediaBytes       int64     `json:"media_bytes"`
	AssetMetadata    string    `json:"asset_metadata"`
	TagMetadata      string    `json:"tag_metadata"`
	MetadataEncoding string    `json:"metadata_encoding"`
	Integrity        string    `json:"integrity"`
	Scope            string    `json:"scope"`
}

// Only media-locator fields are decoded; complete SQLite asset and indexing
// metadata remain JSON in each archive record.
type libraryExportAsset struct {
	ID              string  `json:"id"`
	OwnerID         string  `json:"owner_user_id"`
	URL             string  `json:"blob_url"`
	ThumbnailURL    *string `json:"thumbnail_url"`
	Pathname        string  `json:"pathname"`
	ThumbnailPath   *string `json:"thumbnail_path"`
	MIME            string  `json:"mime"`
	Size            int64   `json:"size"`
	Checksum        string  `json:"checksum_sha256"`
	StorageSize     *int64  `json:"storage_size"`
	StorageSHA256   *string `json:"storage_sha256"`
	ThumbnailSize   *int64  `json:"thumbnail_storage_size"`
	ThumbnailSHA256 *string `json:"thumbnail_storage_sha256"`
	DeletedAt       *string `json:"deleted_at"`
}

type libraryExportExpectation struct {
	bytes  *int64
	sha256 string
}

func (s *Server) exportLibrary(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		s.failure(w, r, &model.APIError{Status: http.StatusMethodNotAllowed, Message: "Library downloads require GET."})
		return
	}
	if principal.UserID == "" {
		s.failure(w, r, &model.APIError{Status: http.StatusUnauthorized, Message: "Sign in to export your library."})
		return
	}
	select {
	case s.exportSlot <- struct{}{}:
		defer func() { <-s.exportSlot }()
	default:
		s.failure(w, r, &model.APIError{Status: http.StatusTooManyRequests, Code: "export_busy", Message: "Another library download is in progress. Try again shortly.", Retryable: true, RetryAfter: 30})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), libraryExportTimeout)
	defer cancel()
	deadline, _ := ctx.Deadline()
	controller := http.NewResponseController(w)
	if err := controller.SetWriteDeadline(deadline); err != nil && !errors.Is(err, http.ErrNotSupported) {
		s.failure(w, r, err)
		return
	}

	file, err := os.CreateTemp("", "sploot-library-export-*.zip")
	if err != nil {
		s.failure(w, r, fmt.Errorf("create private library archive: %w", err))
		return
	}
	defer removeLibraryExportFile(file)
	buffer := make([]byte, 64<<10)
	manifest, err := s.buildLibraryExport(ctx, principal.UserID, file, buffer)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	info, err := file.Stat()
	if err != nil {
		s.failure(w, r, fmt.Errorf("inspect completed library archive: %w", err))
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		s.failure(w, r, fmt.Errorf("rewind completed library archive: %w", err))
		return
	}
	if err := ctx.Err(); err != nil {
		s.failure(w, r, err)
		return
	}

	// A disconnected or stalled recipient must not hold the single disk slot.
	// Wait for the callback before returning so it cannot affect a later request
	// that reuses this connection.
	interrupted := make(chan struct{})
	stopInterrupt := context.AfterFunc(ctx, func() {
		_ = controller.SetWriteDeadline(time.Now())
		close(interrupted)
	})
	defer func() {
		if !stopInterrupt() {
			<-interrupted
		}
	}()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": "sploot-library-" + manifest.SnapshotAt.UTC().Format("20060102T150405Z") + ".zip"}))
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	n, err := io.CopyBuffer(libraryExportWriter{ctx: ctx, writer: w}, libraryExportReader{ctx: ctx, reader: file}, buffer)
	if err != nil || n != info.Size() {
		s.logger.Warn("library export download interrupted", "operation", "library_export_download", "bytes_sent", n)
		// Headers cannot be retracted once transmission begins. Aborting, with
		// the complete Content-Length, makes truncation a transport error rather
		// than a successful partial ZIP (including under HTTP/2).
		panic(http.ErrAbortHandler)
	}
}

func (s *Server) buildLibraryExport(ctx context.Context, owner string, file *os.File, buffer []byte) (libraryExportManifest, error) {
	manifest := libraryExportManifest{
		Format: "sploot-owned-library", Version: 2, OwnerID: owner,
		AssetMetadata:    "assets/<12-digit-sequence>/metadata.json; media paths in each record are archive-relative",
		TagMetadata:      "tags.ndjson; one complete owner-scoped tag row per line, including unused tags",
		MetadataEncoding: "SQLite snake_case column names and JSON values; timestamps use UTC. image_embedding is a hexadecimal little-endian float32 BLOB or null. Asset IDs remain metadata, never archive paths.",
		Integrity:        "Every media entry must match its stored byte count and SHA-256. ZIP CRCs protect metadata and media in transit.",
		Scope:            "All owner assets in one read-only SQLite snapshot, including trash, originals, referenced posters, indexing metadata and tags. Account credentials and other owners are excluded. This is not a database backup.",
	}
	catalog, err := os.CreateTemp("", "sploot-library-catalog-*.ndjson")
	if err != nil {
		return manifest, fmt.Errorf("create private library catalog: %w", err)
	}
	defer removeLibraryExportFile(catalog)
	archive := zip.NewWriter(libraryExportWriter{ctx: ctx, writer: file})
	closed := false
	defer func() {
		if !closed {
			_ = archive.Close()
		}
	}()

	if err := s.captureLibraryExport(ctx, owner, archive, catalog, &manifest); err != nil {
		return manifest, err
	}
	if _, err := catalog.Seek(0, io.SeekStart); err != nil {
		return manifest, fmt.Errorf("rewind private library catalog: %w", err)
	}
	decoder := json.NewDecoder(libraryExportReader{ctx: ctx, reader: catalog})
	var records int64
	for {
		var record libraryExportRecord
		if err := decoder.Decode(&record); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return manifest, fmt.Errorf("read private library catalog: %w", err)
		}
		var asset libraryExportAsset
		if json.Unmarshal(record.Asset, &asset) != nil || asset.OwnerID != owner || asset.ID == "" {
			return manifest, libraryExportInvalid("The library catalog contains invalid asset ownership or metadata.")
		}
		original, poster, hasPoster, err := libraryExportExpectations(asset)
		if err != nil {
			return manifest, err
		}
		records++
		directory := fmt.Sprintf("assets/%012d/", records)
		mediaAsset := model.Asset{ID: asset.ID, OwnerID: asset.OwnerID, BlobURL: asset.URL, ThumbnailURL: asset.ThumbnailURL, Pathname: asset.Pathname, MIME: asset.MIME, Size: asset.Size, Checksum: asset.Checksum}
		media, err := s.writeLibraryExportMedia(ctx, archive, mediaAsset, false, original, directory, manifest.SnapshotAt, buffer)
		if err != nil {
			return manifest, err
		}
		record.Media = append(record.Media, media)
		if hasPoster {
			media, err = s.writeLibraryExportMedia(ctx, archive, mediaAsset, true, poster, directory, manifest.SnapshotAt, buffer)
			if err != nil {
				return manifest, err
			}
			record.Media = append(record.Media, media)
		}
		for _, media := range record.Media {
			manifest.MediaObjects++
			manifest.MediaBytes += media.Bytes
		}
		if asset.DeletedAt != nil {
			manifest.DeletedAssets++
		}
		writer, err := libraryExportEntry(archive, directory+"metadata.json", manifest.SnapshotAt, zip.Deflate)
		if err != nil {
			return manifest, err
		}
		if err := json.NewEncoder(writer).Encode(record); err != nil {
			return manifest, fmt.Errorf("write library asset metadata: %w", err)
		}
	}
	if records != manifest.Assets {
		return manifest, libraryExportInvalid("The private library catalog ended before all assets were exported.")
	}
	manifest.CompletedAt = time.Now().UTC()
	writer, err := libraryExportEntry(archive, "manifest.json", manifest.SnapshotAt, zip.Deflate)
	if err != nil {
		return manifest, err
	}
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(manifest); err != nil {
		return manifest, fmt.Errorf("write library manifest: %w", err)
	}
	err = archive.Close()
	closed = true
	if err != nil {
		return manifest, fmt.Errorf("finish library archive: %w", err)
	}
	if err := file.Sync(); err != nil {
		return manifest, fmt.Errorf("flush completed library archive: %w", err)
	}
	return manifest, ctx.Err()
}

// SQLite's driver uses immediate transactions for writers. An explicit deferred
// transaction on one connection keeps this catalog snapshot reader-only. It ends
// before media copies, so large exports do not retain a WAL snapshot for minutes.
func (s *Server) captureLibraryExport(ctx context.Context, owner string, archive *zip.Writer, catalog *os.File, manifest *libraryExportManifest) error {
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "BEGIN DEFERRED"); err != nil {
		return err
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = conn.ExecContext(rollbackCtx, "ROLLBACK")
	}()
	manifest.SnapshotAt = time.Now().UTC()
	tagWriter, err := libraryExportEntry(archive, "tags.ndjson", manifest.SnapshotAt, zip.Deflate)
	if err != nil {
		return err
	}
	rows, err := conn.QueryContext(ctx, `SELECT * FROM tags WHERE owner_user_id=? ORDER BY id`, owner)
	if err != nil {
		return err
	}
	columns, err := rows.Columns()
	if err != nil {
		rows.Close()
		return err
	}
	tagEncoder := json.NewEncoder(tagWriter)
	for rows.Next() {
		row, err := libraryExportRow(rows, columns)
		if err != nil {
			rows.Close()
			return err
		}
		if err := tagEncoder.Encode(row); err != nil {
			rows.Close()
			return err
		}
		manifest.Tags++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = conn.QueryContext(ctx, `SELECT a.*,
		(SELECT json_object('asset_id',e.asset_id,'owner_user_id',e.owner_user_id,'model_name',e.model_name,
			'model_version',e.model_version,'dim',e.dim,'image_embedding',CASE WHEN e.image_embedding IS NULL THEN NULL ELSE hex(e.image_embedding) END,
			'status',e.status,'attempts',e.attempts,'error',e.error,'processing_token',e.processing_token,
			'processing_until',e.processing_until,'next_attempt_at',e.next_attempt_at,'created_at',e.created_at,'updated_at',e.updated_at)
			FROM asset_embeddings e WHERE e.asset_id=a.id AND e.owner_user_id=?),
		(SELECT json_group_array(json_object('asset_id',at.asset_id,'tag_id',at.tag_id))
			FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id AND t.owner_user_id=?),
		EXISTS(SELECT 1 FROM asset_embeddings e WHERE e.asset_id=a.id AND e.owner_user_id<>?)
			OR EXISTS(SELECT 1 FROM asset_tags at LEFT JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id AND (t.owner_user_id IS NULL OR t.owner_user_id<>?))
		FROM assets a WHERE a.owner_user_id=? ORDER BY a.id`, owner, owner, owner, owner, owner)
	if err != nil {
		return err
	}
	defer rows.Close()
	columns, err = rows.Columns()
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(libraryExportWriter{ctx: ctx, writer: catalog})
	values := make([]any, len(columns))
	pointers := make([]any, len(values))
	for index := range values {
		pointers[index] = &values[index]
	}
	n := len(values) - 3
	asset := make(map[string]any, n)
	for rows.Next() {
		if err := rows.Scan(pointers...); err != nil {
			return err
		}
		if invalid, ok := values[n+2].(int64); !ok || invalid != 0 {
			return libraryExportInvalid("The library contains inconsistent ownership metadata; no archive was produced.")
		}
		for index, name := range columns[:n] {
			asset[name] = values[index]
		}
		payload, err := json.Marshal(asset)
		if err != nil {
			return err
		}
		record := libraryExportRecord{Asset: payload, Embedding: json.RawMessage("null"), TagLinks: json.RawMessage("[]")}
		if value, ok := values[n].(string); ok {
			record.Embedding = json.RawMessage(value)
		}
		if value, ok := values[n+1].(string); ok {
			record.TagLinks = json.RawMessage(value)
		}
		if err := encoder.Encode(record); err != nil {
			return err
		}
		manifest.Assets++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = conn.ExecContext(ctx, "COMMIT")
	return err
}

func libraryExportRow(rows *sql.Rows, columns []string) (map[string]any, error) {
	values, pointers := make([]any, len(columns)), make([]any, len(columns))
	for index := range values {
		pointers[index] = &values[index]
	}
	if err := rows.Scan(pointers...); err != nil {
		return nil, err
	}
	row := make(map[string]any, len(columns))
	for index, name := range columns {
		row[name] = values[index]
	}
	return row, nil
}

func libraryExportExpectations(asset libraryExportAsset) (libraryExportExpectation, libraryExportExpectation, bool, error) {
	original := libraryExportExpectation{bytes: asset.StorageSize}
	poster := libraryExportExpectation{bytes: asset.ThumbnailSize}
	if asset.StorageSHA256 != nil {
		original.sha256 = *asset.StorageSHA256
	}
	if asset.ThumbnailSHA256 != nil {
		poster.sha256 = *asset.ThumbnailSHA256
	}
	hasPoster := asset.ThumbnailPath != nil && *asset.ThumbnailPath != ""
	if asset.Size <= 0 || !libraryExportSHA256(asset.Checksum) || original.bytes == nil ||
		*original.bytes != asset.Size || original.sha256 != asset.Checksum ||
		hasPoster && (poster.bytes == nil || *poster.bytes <= 0 || !libraryExportSHA256(poster.sha256)) ||
		!hasPoster && (poster.bytes != nil || poster.sha256 != "" || asset.ThumbnailURL != nil) {
		return original, poster, hasPoster, libraryExportInvalid(fmt.Sprintf("Asset %q has inconsistent storage metadata; no archive was produced.", asset.ID))
	}
	return original, poster, hasPoster, nil
}

func (s *Server) writeLibraryExportMedia(ctx context.Context, archive *zip.Writer, asset model.Asset, thumbnail bool, expected libraryExportExpectation, directory string, snapshotAt time.Time, buffer []byte) (libraryExportMedia, error) {
	rendition, basename := "original", "original"
	if thumbnail {
		rendition, basename = "thumbnail", "poster"
	}
	receipt := libraryExportMedia{Rendition: rendition, StoredSHA256Verified: expected.sha256 != ""}
	incomplete := func(reason string) (libraryExportMedia, error) {
		if err := ctx.Err(); err != nil {
			return receipt, err
		}
		return receipt, &model.APIError{Status: http.StatusConflict, Code: "export_incomplete", Message: fmt.Sprintf("Library export stopped: %s for asset %q %s. No archive was produced.", rendition, asset.ID, reason)}
	}
	if err := ctx.Err(); err != nil {
		return receipt, err
	}
	source, err := s.openMedia(ctx, asset, thumbnail)
	if err != nil {
		return incomplete("could not be opened; check retained media and storage availability")
	}
	if source.Body == nil {
		return incomplete("has no readable body")
	}
	defer source.Body.Close()
	info, err := source.File.Stat()
	if err != nil || !info.Mode().IsRegular() || expected.bytes == nil || info.Size() != *expected.bytes {
		return incomplete("has a byte count different from the catalog")
	}

	receipt.Path = directory + basename + libraryExportExtension(source.MIME)
	receipt.Name, receipt.MIME = source.Name, source.MIME
	writer, err := libraryExportEntry(archive, receipt.Path, snapshotAt, zip.Store)
	if err != nil {
		return receipt, err
	}
	hash := sha256.New()
	var reader io.Reader = libraryExportReader{ctx: ctx, reader: source.Body}
	if expected.bytes != nil {
		reader = io.LimitReader(reader, *expected.bytes+1)
	}
	receipt.Bytes, err = io.CopyBuffer(io.MultiWriter(writer, hash), reader, buffer)
	closeErr := source.Body.Close()
	if err != nil || closeErr != nil {
		return incomplete("could not be read and archived completely")
	}
	if err := ctx.Err(); err != nil {
		return receipt, err
	}
	if expected.bytes != nil && receipt.Bytes != *expected.bytes {
		return incomplete("does not match its expected byte count")
	}
	receipt.SHA256 = hex.EncodeToString(hash.Sum(nil))
	if expected.sha256 != "" && !strings.EqualFold(receipt.SHA256, expected.sha256) {
		return incomplete("does not match its stored SHA-256 digest")
	}
	return receipt, nil
}

func libraryExportEntry(archive *zip.Writer, name string, modified time.Time, method uint16) (io.Writer, error) {
	header := &zip.FileHeader{Name: name, Method: method}
	header.SetMode(0600)
	header.SetModTime(modified.UTC())
	writer, err := archive.CreateHeader(header)
	if err != nil {
		return nil, fmt.Errorf("create library archive entry: %w", err)
	}
	return writer, nil
}

// Archive names contain only generated ordinal directories, fixed basenames,
// and this allowlist. Source URLs, IDs, tag names, and filenames never become paths.
func libraryExportExtension(contentType string) string {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	switch strings.ToLower(mediaType) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/avif":
		return ".avif"
	case "image/heic":
		return ".heic"
	case "image/heif":
		return ".heif"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	default:
		return ".bin"
	}
}

func libraryExportSHA256(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	for _, digit := range value {
		if !(digit >= '0' && digit <= '9' || digit >= 'a' && digit <= 'f' || digit >= 'A' && digit <= 'F') {
			return false
		}
	}
	return true
}

func libraryExportInvalid(message string) error {
	return &model.APIError{Status: http.StatusConflict, Code: "export_invalid_catalog", Message: message}
}

func removeLibraryExportFile(file *os.File) {
	_ = file.Close()
	_ = os.Remove(file.Name())
}

type libraryExportReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r libraryExportReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}

type libraryExportWriter struct {
	ctx    context.Context
	writer io.Writer
}

func (w libraryExportWriter) Write(buffer []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	return w.writer.Write(buffer)
}
