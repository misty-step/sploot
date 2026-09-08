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

	"github.com/jackc/pgx/v5"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const libraryExportTimeout = 15 * time.Minute

type libraryExportRecord struct {
	Asset     json.RawMessage      `json:"asset"`
	Embedding json.RawMessage      `json:"embedding"`
	TagLinks  json.RawMessage      `json:"asset_tags"`
	Replicas  json.RawMessage      `json:"asset_storage_replicas"`
	Media     []libraryExportMedia `json:"media,omitempty"`
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

// Only the fields needed to locate and verify bytes are decoded. The complete
// database rows, including both vectors, remain raw JSON in each asset record.
type libraryExportAsset struct {
	ID                 string  `json:"id"`
	OwnerID            string  `json:"owner_user_id"`
	URL                string  `json:"blob_url"`
	ThumbnailURL       *string `json:"thumbnail_url"`
	Pathname           string  `json:"pathname"`
	ThumbnailPath      *string `json:"thumbnail_path"`
	ThumbnailKey       *string `json:"thumbnail_storage_key"`
	ThumbnailSourceKey *string `json:"thumbnail_storage_source_key"`
	MIME               string  `json:"mime"`
	Size               int64   `json:"size"`
	Checksum           string  `json:"checksum_sha256"`
	StorageSize        *int64  `json:"storage_size"`
	StorageSHA256      *string `json:"storage_sha256"`
	ThumbnailSize      *int64  `json:"thumbnail_storage_size"`
	ThumbnailSHA256    *string `json:"thumbnail_storage_sha256"`
	DeletedAt          *string `json:"deleted_at"`
}

type libraryExportReplica struct {
	Rendition string `json:"rendition"`
	URL       string `json:"delivery_url"`
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	Active    bool   `json:"active"`
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
		Format: "sploot-owned-library", Version: 1, OwnerID: owner,
		AssetMetadata:    "assets/<12-digit-sequence>/metadata.json; media paths in each record are archive-relative",
		TagMetadata:      "tags.ndjson; one complete owner-scoped tag row per line, including unused tags",
		MetadataEncoding: "Original PostgreSQL column names and JSON values; timestamps use UTC. image_embedding and embeddingVector are PostgreSQL vector literals or null. Asset IDs are preserved only in metadata, never used as archive paths.",
		Integrity:        "Every media entry records its actual byte count and SHA-256. Available stored byte counts and SHA-256 values must match. Legacy media without a stored digest has stored_sha256_verified=false. ZIP CRCs protect metadata and media in transit.",
		Scope:            "All owner asset rows at one repeatable-read, read-only PostgreSQL snapshot, including soft-deleted rows; one complete original and every referenced poster, full embeddings, tag links, and storage replica metadata. Replica byte duplicates, authentication credentials, global caches, and operational jobs are not included. This is not a database backup.",
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
		var replicas []libraryExportReplica
		if json.Unmarshal(record.Asset, &asset) != nil || json.Unmarshal(record.Replicas, &replicas) != nil || asset.OwnerID != owner || asset.ID == "" {
			return manifest, libraryExportInvalid("The library catalog contains invalid asset ownership or metadata.")
		}
		original, poster, hasPoster, err := libraryExportExpectations(asset, replicas)
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

// Spooling only the catalog lets us release the connection and the MVCC
// snapshot before fetching media. No library-sized slice or vector collection
// is retained in Go memory; pgx reads one row and JSON decoding one asset at a time.
func (s *Server) captureLibraryExport(ctx context.Context, owner string, archive *zip.Writer, catalog *os.File, manifest *libraryExportManifest) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return fmt.Errorf("open library export snapshot: %w", err)
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(rollbackCtx)
	}()
	if _, err := tx.Exec(ctx, `SET LOCAL TIME ZONE 'UTC'`); err != nil {
		return fmt.Errorf("set library snapshot timezone: %w", err)
	}
	if err := tx.QueryRow(ctx, `SELECT transaction_timestamp()`).Scan(&manifest.SnapshotAt); err != nil {
		return fmt.Errorf("read library snapshot timestamp: %w", err)
	}
	tagWriter, err := libraryExportEntry(archive, "tags.ndjson", manifest.SnapshotAt, zip.Deflate)
	if err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT to_jsonb(t)::text FROM public.tags t WHERE t.owner_user_id=$1 ORDER BY t.id COLLATE "C"`, owner)
	if err != nil {
		return fmt.Errorf("read owned library tags: %w", err)
	}
	tagEncoder := json.NewEncoder(tagWriter)
	for rows.Next() {
		var tag json.RawMessage
		if err := rows.Scan(&tag); err != nil {
			rows.Close()
			return fmt.Errorf("read library tag: %w", err)
		}
		if err := tagEncoder.Encode(tag); err != nil {
			rows.Close()
			return fmt.Errorf("write library tag: %w", err)
		}
		manifest.Tags++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("stream library tags: %w", err)
	}

	// Every join is rooted in the owner's assets. Inconsistent cross-owner
	// links fail the whole export rather than leaking or silently omitting data.
	rows, err = tx.Query(ctx, `SELECT to_jsonb(a)::text,
		COALESCE((SELECT (to_jsonb(e)-'image_embedding'-'embeddingVector') ||
			jsonb_build_object('image_embedding', e.image_embedding::text, 'embeddingVector', e."embeddingVector"::text)
			FROM public.asset_embeddings e WHERE e.asset_id=a.id AND e.owner_user_id=$1), 'null'::jsonb)::text,
		COALESCE((SELECT jsonb_agg(to_jsonb(at) ORDER BY at.tag_id COLLATE "C")
			FROM public.asset_tags at JOIN public.tags t ON t.id=at.tag_id
			WHERE at.asset_id=a.id AND t.owner_user_id=$1), '[]'::jsonb)::text,
		COALESCE((SELECT jsonb_agg(to_jsonb(replica) ORDER BY replica.rendition, replica.generation, replica.provider, replica.id)
			FROM public.asset_storage_replicas replica WHERE replica.asset_id=a.id), '[]'::jsonb)::text,
		EXISTS(SELECT 1 FROM public.asset_embeddings e WHERE e.asset_id=a.id AND e.owner_user_id IS DISTINCT FROM $1)
		OR EXISTS(SELECT 1 FROM public.asset_tags at LEFT JOIN public.tags t ON t.id=at.tag_id
			WHERE at.asset_id=a.id AND t.owner_user_id IS DISTINCT FROM $1)
		FROM public.assets a WHERE a.owner_user_id=$1 ORDER BY a.id COLLATE "C"`, owner)
	if err != nil {
		return fmt.Errorf("read owned library catalog: %w", err)
	}
	defer rows.Close()
	encoder := json.NewEncoder(libraryExportWriter{ctx: ctx, writer: catalog})
	for rows.Next() {
		var record libraryExportRecord
		var invalidOwnership bool
		if err := rows.Scan(&record.Asset, &record.Embedding, &record.TagLinks, &record.Replicas, &invalidOwnership); err != nil {
			return fmt.Errorf("read library asset catalog: %w", err)
		}
		if invalidOwnership {
			return libraryExportInvalid("The library contains inconsistent ownership metadata; no archive was produced.")
		}
		if err := encoder.Encode(record); err != nil {
			return fmt.Errorf("write private library catalog: %w", err)
		}
		manifest.Assets++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("stream library asset catalog: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("finish library export snapshot: %w", err)
	}
	return nil
}

func libraryExportExpectations(asset libraryExportAsset, replicas []libraryExportReplica) (libraryExportExpectation, libraryExportExpectation, bool, error) {
	original := libraryExportExpectation{bytes: asset.StorageSize}
	poster := libraryExportExpectation{bytes: asset.ThumbnailSize}
	if asset.StorageSHA256 != nil {
		original.sha256 = *asset.StorageSHA256
	}
	if asset.ThumbnailSHA256 != nil {
		poster.sha256 = *asset.ThumbnailSHA256
	}
	hasPoster := asset.ThumbnailURL != nil && *asset.ThumbnailURL != ""
	posterMetadata := asset.ThumbnailPath != nil || asset.ThumbnailKey != nil || asset.ThumbnailSourceKey != nil || asset.ThumbnailSize != nil || asset.ThumbnailSHA256 != nil
	invalid := func() (libraryExportExpectation, libraryExportExpectation, bool, error) {
		return original, poster, hasPoster, libraryExportInvalid(fmt.Sprintf("Asset %q has inconsistent storage metadata; no archive was produced.", asset.ID))
	}
	if asset.Size < 0 || !libraryExportSHA256(asset.Checksum) ||
		asset.StorageSHA256 != nil && !libraryExportSHA256(*asset.StorageSHA256) ||
		asset.ThumbnailSHA256 != nil && !libraryExportSHA256(*asset.ThumbnailSHA256) {
		return invalid()
	}
	for _, replica := range replicas {
		var expected *libraryExportExpectation
		var currentURL string
		switch replica.Rendition {
		case "original":
			expected, currentURL = &original, asset.URL
		case "thumbnail":
			posterMetadata = true
			expected = &poster
			if hasPoster {
				currentURL = *asset.ThumbnailURL
			}
		default:
			return invalid()
		}
		if !replica.Active && replica.URL != currentURL {
			continue
		}
		if replica.Size < 0 || !libraryExportSHA256(replica.SHA256) ||
			expected.bytes != nil && *expected.bytes != replica.Size ||
			expected.sha256 != "" && !strings.EqualFold(expected.sha256, replica.SHA256) {
			return invalid()
		}
		if expected.bytes == nil {
			size := replica.Size
			expected.bytes = &size
		}
		if expected.sha256 == "" {
			expected.sha256 = replica.SHA256
		}
	}
	// The upload deduplication checksum can describe pre-processing input in
	// older libraries. Explicit stored-byte metadata takes precedence.
	if original.bytes == nil {
		original.bytes = &asset.Size
	}
	if original.sha256 == "" {
		original.sha256 = asset.Checksum
	}
	if *original.bytes < 0 || poster.bytes != nil && *poster.bytes < 0 || !hasPoster && posterMetadata {
		return invalid()
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
	source, err := s.openMedia(ctx, asset, thumbnail, "")
	if err != nil {
		return incomplete("could not be opened; check retained media and storage availability")
	}
	if source.Body == nil {
		return incomplete("has no readable body")
	}
	defer source.Body.Close()
	if source.Status != http.StatusOK || source.Header.Get("Content-Range") != "" {
		return incomplete("did not return the complete object")
	}
	if encoding := source.Header.Get("Content-Encoding"); encoding != "" && !strings.EqualFold(encoding, "identity") {
		return incomplete("returned encoded instead of exact stored bytes")
	}
	var sourceSize *int64
	if length := source.Header.Get("Content-Length"); length != "" {
		value, err := strconv.ParseInt(length, 10, 64)
		if err != nil || value < 0 || value == 1<<63-1 {
			return incomplete("has an invalid storage byte count")
		}
		sourceSize = &value
	}
	if source.File != nil {
		info, err := source.File.Stat()
		if err != nil || !info.Mode().IsRegular() {
			return incomplete("is not a readable regular file")
		}
		value := info.Size()
		if sourceSize != nil && *sourceSize != value {
			return incomplete("has conflicting storage byte counts")
		}
		sourceSize = &value
	}
	if expected.bytes != nil && sourceSize != nil && *expected.bytes != *sourceSize {
		return incomplete("has a byte count different from the catalog")
	}
	if expected.bytes == nil {
		expected.bytes = sourceSize
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
