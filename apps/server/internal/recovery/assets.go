package recovery

import (
	"context"
	"database/sql"
	"strings"

	"github.com/misty-step/sploot/apps/server/internal/contract"
)

// walkMedia streams one frozen asset at a time; trash is deliberately included.
// The database file is already detached from the running application's writers.
func walkMedia(ctx context.Context, db *sql.DB, visit func(MediaEntry) error) (int64, int64, int64, error) {
	rows, err := db.QueryContext(ctx, `SELECT id,owner_user_id,pathname,mime,size,checksum_sha256,storage_size,storage_sha256,thumbnail_path,thumbnail_storage_size,thumbnail_storage_sha256 FROM assets ORDER BY id`)
	if err != nil {
		return 0, 0, 0, failure("media", "cannot read frozen asset catalog")
	}
	defer rows.Close()
	var assets, objects, total int64
	for rows.Next() {
		var id, owner, key, mediaType, checksum string
		var size int64
		var storedSize, posterSize sql.NullInt64
		var storedSHA, posterKey, posterSHA sql.NullString
		if err := rows.Scan(&id, &owner, &key, &mediaType, &size, &checksum, &storedSize, &storedSHA, &posterKey, &posterSize, &posterSHA); err != nil {
			return assets, objects, total, failure("media", "cannot decode frozen asset metadata")
		}
		if !storedSize.Valid || storedSize.Int64 != size || !storedSHA.Valid || storedSHA.String != checksum || !contract.IsAllowedMIME(mediaType) {
			return assets, objects, total, assetFailure("media", id, "original storage receipt is inconsistent")
		}
		entries := [2]MediaEntry{{AssetID: id, OwnerID: owner, Rendition: "original", Path: "media/" + key, Bytes: size, SHA256: checksum, MIME: mediaType}}
		count := 1
		if posterKey.Valid {
			if !posterSize.Valid || !posterSHA.Valid {
				return assets, objects, total, assetFailure("media", id, "poster storage receipt is incomplete")
			}
			entries[1] = MediaEntry{AssetID: id, OwnerID: owner, Rendition: "thumbnail", Path: "media/" + posterKey.String, Bytes: posterSize.Int64, SHA256: posterSHA.String, MIME: "image/jpeg"}
			count++
		} else if posterSize.Valid || posterSHA.Valid {
			return assets, objects, total, assetFailure("media", id, "poster metadata has no retained file")
		}
		for _, entry := range entries[:count] {
			if err := validateMedia(entry); err != nil {
				return assets, objects, total, err
			}
			if err := visit(entry); err != nil {
				return assets, objects, total, err
			}
			objects++
			total += entry.Bytes
		}
		assets++
	}
	if err := rows.Err(); err != nil {
		return assets, objects, total, failure("media", "frozen catalog ended early")
	}
	return assets, objects, total, nil
}

func validateMedia(entry MediaEntry) error {
	ownerPrefix := "media/uploads/" + digest([]byte(entry.OwnerID))[:32] + "/" + entry.AssetID + "/"
	byteLimit := int64(contract.UploadMaxBytes)
	if entry.Rendition == "thumbnail" {
		byteLimit = 2 * 1024 * 1024
	}
	if entry.AssetID == "" || entry.OwnerID == "" || entry.Rendition != "original" && entry.Rendition != "thumbnail" || !validRelative(entry.Path) || !strings.HasPrefix(entry.Path, ownerPrefix) || entry.Bytes <= 0 || entry.Bytes > byteLimit || !validSHA(entry.SHA256) {
		return assetFailure("media", entry.AssetID, "invalid media ownership, path or byte receipt")
	}
	return nil
}
