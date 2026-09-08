package recovery

import (
	"context"
	"encoding/json"
	"io"
	"strings"

	"github.com/jackc/pgx/v5"
)

type assetRow struct {
	ID              string  `json:"id"`
	OwnerID         string  `json:"owner_user_id"`
	URL             string  `json:"blob_url"`
	ThumbnailURL    *string `json:"thumbnail_url"`
	MIME            string  `json:"mime"`
	Size            int64   `json:"size"`
	SHA256          string  `json:"checksum_sha256"`
	Favorite        bool    `json:"favorite"`
	DeletedAt       *string `json:"deleted_at"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	Width           *int    `json:"width"`
	Height          *int    `json:"height"`
	StorageProvider string  `json:"storage_provider"`
	StorageSize     *int64  `json:"storage_size"`
	StorageSHA256   *string `json:"storage_sha256"`
	ThumbnailSize   *int64  `json:"thumbnail_storage_size"`
	ThumbnailSHA256 *string `json:"thumbnail_storage_sha256"`
}

type replicaRow struct {
	Rendition   string  `json:"rendition"`
	URL         string  `json:"delivery_url"`
	Size        int64   `json:"size"`
	SHA256      string  `json:"sha256"`
	Active      bool    `json:"active"`
	ContentType *string `json:"content_type"`
}

type assetInventory struct {
	ID           string          `json:"id"`
	OwnerID      string          `json:"ownerId"`
	MIME         string          `json:"mime"`
	Bytes        int64           `json:"bytes"`
	SHA256       string          `json:"sha256"`
	Favorite     bool            `json:"favorite"`
	DeletedAt    *string         `json:"deletedAt"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
	Width        *int            `json:"width"`
	Height       *int            `json:"height"`
	Original     string          `json:"original"`
	Thumbnail    string          `json:"thumbnail,omitempty"`
	Embedding    json.RawMessage `json:"embedding"`
	Tags         json.RawMessage `json:"tags"`
	ReplicaCount int             `json:"replicaCount"`
}

// All rows, including soft-deleted assets, belong to the recovery snapshot.
// Retired replica metadata is fully preserved in the database archive. A single
// portable byte copy per rendition is sufficient; matching active replicas may
// supply those bytes if a legacy delivery URL has already been retired.
func captureAssets(ctx context.Context, tx pgx.Tx, dir *snapshotDirectory) (Artifact, Artifact, int64, int64, error) {
	var assetsArtifact, sourcesArtifact Artifact
	var assetCount, objectCount int64
	query := `SELECT to_jsonb(a)::text,
 COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.generation DESC,r.provider,r.id) FROM public.asset_storage_replicas r WHERE r.asset_id=a.id),'[]'::jsonb)::text,
 COALESCE((SELECT (to_jsonb(e)-'image_embedding'-'embeddingVector') || jsonb_build_object('hasImageVector',e.image_embedding IS NOT NULL,'hasAlternativeVector',e."embeddingVector" IS NOT NULL) FROM public.asset_embeddings e WHERE e.asset_id=a.id),'null'::jsonb)::text,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color) ORDER BY t.id) FROM public.asset_tags at JOIN public.tags t ON t.id=at.tag_id WHERE at.asset_id=a.id),'[]'::jsonb)::text
 FROM public.assets a ORDER BY a.id COLLATE "C"`
	rows, err := tx.Query(ctx, query)
	if err != nil {
		return assetsArtifact, sourcesArtifact, 0, 0, databaseError("asset-inventory", err)
	}
	defer rows.Close()
	assetsArtifact, err = dir.writeFile("assets.ndjson", func(assetWriter io.Writer) error {
		var writeErr error
		sourcesArtifact, writeErr = dir.writeFile("sources.ndjson", func(sourceWriter io.Writer) error {
			assetEncoder, sourceEncoder := json.NewEncoder(assetWriter), json.NewEncoder(sourceWriter)
			for rows.Next() {
				var rawAsset, rawReplicas, embedding, tags []byte
				if err := rows.Scan(&rawAsset, &rawReplicas, &embedding, &tags); err != nil {
					return databaseError("asset-inventory", err)
				}
				var asset assetRow
				var replicas []replicaRow
				if len(rawAsset)+len(rawReplicas)+len(embedding)+len(tags) > maxRecordBytes || json.Unmarshal(rawAsset, &asset) != nil || json.Unmarshal(rawReplicas, &replicas) != nil {
					return failure("asset-inventory", "invalid or oversized asset metadata")
				}
				objects, err := sourcesForAsset(asset, replicas)
				if err != nil {
					return err
				}
				entry := assetInventory{ID: asset.ID, OwnerID: asset.OwnerID, MIME: asset.MIME, Bytes: asset.Size, SHA256: asset.SHA256, Favorite: asset.Favorite, DeletedAt: asset.DeletedAt, CreatedAt: asset.CreatedAt, UpdatedAt: asset.UpdatedAt, Width: asset.Width, Height: asset.Height, Original: objects[0].Path, Embedding: embedding, Tags: tags, ReplicaCount: len(replicas)}
				if len(objects) > 1 {
					entry.Thumbnail = objects[1].Path
				}
				if err := assetEncoder.Encode(entry); err != nil {
					return assetFailure("asset-inventory", asset.ID, "cannot write asset metadata")
				}
				for _, object := range objects {
					if err := sourceEncoder.Encode(object); err != nil {
						return assetFailure("asset-inventory", asset.ID, "cannot write source metadata")
					}
					objectCount++
				}
				assetCount++
			}
			if err := rows.Err(); err != nil {
				return databaseError("asset-inventory", err)
			}
			return nil
		})
		return writeErr
	})
	return assetsArtifact, sourcesArtifact, assetCount, objectCount, err
}

func sourcesForAsset(asset assetRow, replicas []replicaRow) ([]objectSource, error) {
	if asset.ID == "" || asset.OwnerID == "" || len(asset.ID) > 128 || asset.Size < 0 || !validSHA(asset.SHA256) {
		return nil, assetFailure("asset-inventory", asset.ID, "invalid identity, owner, original byte count, or SHA-256")
	}
	size, checksum := &asset.Size, asset.SHA256
	if asset.StorageSize != nil {
		size = asset.StorageSize
	}
	if asset.StorageSHA256 != nil {
		checksum = *asset.StorageSHA256
	}
	if *size < 0 || !validSHA(checksum) {
		return nil, assetFailure("asset-inventory", asset.ID, "invalid stored byte count or SHA-256")
	}
	// Legacy optimization retained capture metadata separately from the bytes
	// actually stored. The database archive preserves both; recover stored bytes.
	original := objectSource{AssetID: asset.ID, OwnerID: asset.OwnerID, Rendition: "original", Path: mediaPath(asset.ID, "original"), MIME: asset.MIME, ExpectedBytes: size, ExpectedSHA256: checksum}
	if asset.URL != "" {
		original.URLs = append(original.URLs, asset.URL)
	}
	for _, replica := range replicas {
		if replica.Active && replica.Rendition == "original" && replica.Size == *size && replica.SHA256 == checksum {
			original.URLs = appendUnique(original.URLs, replica.URL)
			if replica.ContentType != nil {
				original.MIME = *replica.ContentType
			}
		}
	}
	if len(original.URLs) == 0 {
		return nil, assetFailure("asset-inventory", asset.ID, "original has no usable delivery location")
	}
	objects := []objectSource{original}
	if asset.ThumbnailURL != nil && *asset.ThumbnailURL != "" {
		thumbnail := objectSource{AssetID: asset.ID, OwnerID: asset.OwnerID, Rendition: "thumbnail", Path: mediaPath(asset.ID, "thumbnail"), MIME: "", ExpectedBytes: asset.ThumbnailSize, URLs: []string{*asset.ThumbnailURL}}
		if asset.ThumbnailSHA256 != nil {
			thumbnail.ExpectedSHA256 = *asset.ThumbnailSHA256
		}
		if thumbnail.ExpectedSHA256 != "" && !validSHA(thumbnail.ExpectedSHA256) || thumbnail.ExpectedBytes != nil && *thumbnail.ExpectedBytes < 0 {
			return nil, assetFailure("asset-inventory", asset.ID, "invalid thumbnail checksum metadata")
		}
		for _, replica := range replicas {
			if !replica.Active || replica.Rendition != "thumbnail" {
				continue
			}
			if thumbnail.ExpectedSHA256 == "" && replica.URL == *asset.ThumbnailURL {
				thumbnail.ExpectedSHA256 = replica.SHA256
				if thumbnail.ExpectedBytes == nil {
					size := replica.Size
					thumbnail.ExpectedBytes = &size
				}
			}
			if thumbnail.ExpectedSHA256 == replica.SHA256 && (thumbnail.ExpectedBytes == nil || *thumbnail.ExpectedBytes == replica.Size) {
				thumbnail.URLs = appendUnique(thumbnail.URLs, replica.URL)
				if replica.ContentType != nil {
					thumbnail.MIME = *replica.ContentType
				}
			}
		}
		objects = append(objects, thumbnail)
	} else if asset.ThumbnailSize != nil || asset.ThumbnailSHA256 != nil {
		return nil, assetFailure("asset-inventory", asset.ID, "thumbnail metadata exists without a delivery URL")
	}
	return objects, nil
}

func appendUnique(values []string, value string) []string {
	if strings.TrimSpace(value) == "" {
		return values
	}
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
