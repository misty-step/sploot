package predecessor

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var safeShare = regexp.MustCompile(`^[A-Za-z0-9_-]{10,128}$`)

func validateCapture(c Capture) error {
	if c.Schema != CaptureSchema || c.CapturedAt.IsZero() || c.SourceRevision == "" || !c.Completeness.Database || !c.Completeness.Clerk || !c.Completeness.Objects || !c.Completeness.Verified {
		return reject("capture_incomplete")
	}
	if c.Tables == nil || c.ClerkUsers == nil || c.Objects == nil || len(c.Counts.Tables) != len(c.Tables) || c.Counts.Users != len(c.Tables["users"]) || c.Counts.Assets != len(c.Tables["assets"]) || c.Counts.ClerkUsers != len(c.ClerkUsers) || c.Counts.Objects != len(c.Objects) {
		return reject("capture_counts")
	}
	for _, name := range []string{"users", "assets", "tags", "asset_tags", "user_identities", "asset_embeddings"} {
		if rows, present := c.Tables[name]; !present || rows == nil {
			return reject("capture_required_table")
		}
	}
	for table, rows := range c.Tables {
		count, present := c.Counts.Tables[table]
		if !present || rows == nil || count != len(rows) {
			return reject("capture_table_counts")
		}
		for _, row := range rows {
			var value map[string]json.RawMessage
			if err := json.Unmarshal(row, &value); err != nil || value == nil {
				return reject("capture_table_row")
			}
		}
	}
	urls, paths, names := map[string]bool{}, map[string]bool{}, map[string]bool{}
	var total int64
	for _, object := range c.Objects {
		uri, err := url.Parse(object.URL)
		if err != nil || uri.Scheme != "https" || uri.Host == "" || uri.User != nil || uri.RawQuery != "" || uri.Fragment != "" || strings.TrimPrefix(uri.Path, "/") != object.Pathname || !validPath(object.Pathname) || !validPath(object.Path) || object.Path == "capture.json" || !validSHA(object.SHA256) || object.Size < 0 || object.Size > 1<<40 || urls[object.URL] || paths[object.Path] || names[object.Pathname] {
			return reject("capture_object_receipt")
		}
		urls[object.URL], paths[object.Path], names[object.Pathname] = true, true, true
		total += object.Size
	}
	if total != c.Counts.Bytes {
		return reject("capture_byte_count")
	}
	return nil
}

func buildPlan(ctx context.Context, db *sql.DB, c Capture, mapping Mapping, report *Report) (plan, error) {
	p := plan{users: map[string]sourceUser{}, owners: map[string]OwnerMapping{}, objects: map[string]Object{}, shares: map[string]*string{}}
	issue := func(code, id string) { report.Issues = append(report.Issues, Issue{Code: code, SourceID: id}) }
	if mapping.Schema != MappingSchema {
		return p, reject("mapping_schema")
	}
	for _, raw := range c.Tables["users"] {
		var user sourceUser
		if json.Unmarshal(raw, &user) != nil || !safeID.MatchString(user.ID) || user.Email == "" || user.CreatedAt.IsZero() || user.UpdatedAt.IsZero() || p.users[user.ID].ID != "" {
			return p, reject("source_user")
		}
		p.users[user.ID] = user
	}
	clerkIDs := map[string]bool{}
	for _, raw := range c.ClerkUsers {
		var user clerkUser
		if json.Unmarshal(raw, &user) != nil || !safeID.MatchString(user.ID) || clerkIDs[user.ID] {
			return p, reject("clerk_identity")
		}
		clerkIDs[user.ID] = true
		if _, present := p.users[user.ID]; present {
			continue
		}
		var email string
		for _, address := range user.Emails {
			if address.ID == user.PrimaryEmailID {
				email = address.Email
			}
		}
		if user.CreatedAt <= 0 || user.UpdatedAt <= 0 {
			return p, reject("clerk_timestamps")
		}
		p.users[user.ID] = sourceUser{ID: user.ID, Email: email, CreatedAt: sourceTimestamp{time.UnixMilli(user.CreatedAt).UTC()}, UpdatedAt: sourceTimestamp{time.UnixMilli(user.UpdatedAt).UTC()}}
	}
	// Generic source rows retain their exact values but owner references still
	// have to resolve. Known asset/tag relationships are checked below.
	for _, rows := range c.Tables {
		for _, raw := range rows {
			var row map[string]json.RawMessage
			if json.Unmarshal(raw, &row) != nil {
				return p, reject("source_row")
			}
			for _, name := range []string{"owner_user_id", "user_id"} {
				if value, exists := row[name]; exists && string(value) != "null" {
					var owner string
					if json.Unmarshal(value, &owner) != nil || p.users[owner].ID == "" {
						return p, reject("source_owner_reference")
					}
				}
			}
		}
	}
	targets := map[string]bool{}
	for _, owner := range mapping.Owners {
		if p.users[owner.SourceUserID].ID == "" || p.owners[owner.SourceUserID].SourceUserID != "" {
			return p, reject("mapping_source_identity")
		}
		target := owner.TargetUserID
		if target == "" {
			target = owner.SourceUserID
		}
		if !safeID.MatchString(target) || targets[target] {
			return p, reject("mapping_owner_merge")
		}
		targets[target] = true
		var email string
		err := db.QueryRowContext(ctx, `SELECT email FROM users WHERE id=?`, target).Scan(&email)
		if owner.TargetUserID != "" {
			if err != nil || owner.LoginEmail != "" {
				return p, reject("mapping_existing_account")
			}
		} else {
			if !errors.Is(err, sql.ErrNoRows) {
				return p, reject("mapping_new_identity_collision")
			}
			report.NewAccounts++
		}
		p.owners[owner.SourceUserID] = owner
	}
	if len(p.owners) != len(p.users) {
		return p, reject("mapping_incomplete_identity_union")
	}
	report.Owners = len(p.users)
	for _, object := range c.Objects {
		p.objects[object.URL] = object
	}
	assetIDs, tagIDs := map[string]string{}, map[string]string{}
	checksums := map[string][]string{}
	used := map[string]bool{}
	historical := map[string][]string{}
	resolutions := map[string]ShareResolution{}
	for _, resolution := range mapping.Shares {
		if resolutions[resolution.AssetID].AssetID != "" || resolution.Reason == "" || resolution.Action != "revoke" && resolution.Action != "replace" || resolution.Action == "revoke" && resolution.Slug != "" || resolution.Action == "replace" && !safeShare.MatchString(resolution.Slug) {
			return p, reject("share_resolution")
		}
		resolutions[resolution.AssetID] = resolution
	}
	usedSlugs := map[string]bool{}
	rows, err := db.QueryContext(ctx, `SELECT share_slug FROM assets WHERE share_slug IS NOT NULL`)
	if err != nil {
		return p, reject("base_shares")
	}
	for rows.Next() {
		var slug string
		if rows.Scan(&slug) != nil {
			rows.Close()
			return p, reject("base_shares")
		}
		usedSlugs[slug] = true
	}
	rows.Close()
	if rows.Err() != nil {
		return p, reject("base_shares")
	}
	for _, raw := range c.Tables["assets"] {
		if !hasFields(raw, "id", "owner_user_id", "blob_url", "pathname", "thumbnail_url", "thumbnail_path", "mime", "size", "checksum_sha256", "storage_size", "storage_sha256", "thumbnail_storage_size", "thumbnail_storage_sha256", "favorite", "createdAt", "updatedAt", "deleted_at", "share_slug", "shuffle_key", "width", "height") {
			return p, reject("source_asset_columns_incomplete")
		}
		var asset sourceAsset
		if json.Unmarshal(raw, &asset) != nil || !safeID.MatchString(asset.ID) || assetIDs[asset.ID] != "" || p.users[asset.Owner].ID == "" || !contract.IsAllowedMIME(asset.MIME) || !validSHA(asset.Checksum) || asset.Size <= 0 || asset.CreatedAt.IsZero() || asset.UpdatedAt.IsZero() || asset.ShuffleKey < 0 || asset.DeletedAt != nil && asset.DeletedAt.IsZero() {
			return p, reject("source_asset")
		}
		object, exists := p.objects[asset.BlobURL]
		if !exists || object.Size <= 0 || object.Size > int64(contract.UploadMaxBytes) || object.Pathname != asset.Pathname {
			return p, reject("source_primary_reference")
		}
		if (asset.StorageSize == nil) != (asset.StorageSHA == nil) || asset.StorageSize != nil && (*asset.StorageSize != object.Size || *asset.StorageSHA != object.SHA256) {
			return p, reject("source_primary_storage_receipt")
		}
		used[object.Path] = true
		if (asset.ThumbnailURL == nil) != (asset.ThumbnailPath == nil) {
			return p, reject("source_thumbnail_reference")
		}
		if asset.ThumbnailURL != nil {
			poster, exists := p.objects[*asset.ThumbnailURL]
			if !exists || poster.Pathname != *asset.ThumbnailPath {
				return p, reject("source_thumbnail_reference")
			}
			if (asset.PosterSize == nil) != (asset.PosterSHA == nil) || asset.PosterSize != nil && (*asset.PosterSize != poster.Size || *asset.PosterSHA != poster.SHA256) {
				return p, reject("source_thumbnail_storage_receipt")
			}
			used[poster.Path] = true
		} else if asset.PosterSize != nil || asset.PosterSHA != nil {
			return p, reject("source_thumbnail_receipt_without_object")
		}
		owner := targetOwner(p, asset.Owner)
		var collision bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM assets WHERE id=?)`, asset.ID).Scan(&collision); err != nil {
			return p, reject("base_asset_lookup")
		}
		if collision {
			issue("native_asset_identity_collision", asset.ID)
		}
		checksums[owner+":"+object.SHA256] = append(checksums[owner+":"+object.SHA256], asset.ID)
		assetIDs[asset.ID] = asset.Owner
		historical[asset.Checksum+":"+intString(asset.Size)] = append(historical[asset.Checksum+":"+intString(asset.Size)], asset.ID)
		slug := asset.Share
		if resolution, present := resolutions[asset.ID]; present {
			if slug == nil {
				issue("share_resolution_without_source_share", asset.ID)
			}
			if resolution.Action == "revoke" {
				slug = nil
			} else {
				replacement := resolution.Slug
				slug = &replacement
			}
			report.Shares = append(report.Shares, resolution)
			delete(resolutions, asset.ID)
		}
		if slug != nil {
			if !safeShare.MatchString(*slug) || asset.DeletedAt != nil || usedSlugs[*slug] {
				issue("share_requires_explicit_resolution", asset.ID)
			}
			usedSlugs[*slug] = true
		}
		p.shares[asset.ID] = slug
		p.assets = append(p.assets, asset)
	}
	if len(resolutions) != 0 {
		return p, reject("share_resolution_unknown_asset")
	}
	for _, raw := range c.Tables["tags"] {
		var tag sourceTag
		if json.Unmarshal(raw, &tag) != nil || !safeID.MatchString(tag.ID) || tagIDs[tag.ID] != "" || p.users[tag.Owner].ID == "" || strings.TrimSpace(tag.Name) == "" || tag.CreatedAt.IsZero() || tag.UpdatedAt.IsZero() {
			return p, reject("source_tag")
		}
		tagIDs[tag.ID] = tag.Owner
		p.tags = append(p.tags, tag)
	}
	for _, raw := range c.Tables["asset_tags"] {
		var link sourceLink
		if json.Unmarshal(raw, &link) != nil || assetIDs[link.AssetID] == "" || tagIDs[link.TagID] != assetIDs[link.AssetID] {
			return p, reject("source_cross_owner_tag_link")
		}
		p.links = append(p.links, link)
	}
	for _, raw := range c.Tables["asset_embeddings"] {
		var embedding struct {
			AssetID string `json:"asset_id"`
			Owner   string `json:"owner_user_id"`
		}
		if json.Unmarshal(raw, &embedding) != nil || assetIDs[embedding.AssetID] == "" || embedding.Owner != "" && assetIDs[embedding.AssetID] != embedding.Owner {
			return p, reject("source_embedding_owner")
		}
	}
	for _, object := range c.Objects {
		if used[object.Path] {
			continue
		}
		if ids := historical[object.SHA256+":"+intString(object.Size)]; len(ids) != 0 {
			report.Recovered = append(report.Recovered, RecoveryCandidate{ObjectPath: object.Path, AssetIDs: ids})
		} else {
			report.Unassigned = append(report.Unassigned, object.Path)
		}
	}
	sort.Slice(p.assets, func(i, j int) bool { return p.assets[i].ID < p.assets[j].ID })
	for key, ids := range checksums {
		if len(ids) > 1 {
			owner, checksum, _ := strings.Cut(key, ":")
			sort.Strings(ids)
			report.CanonicalDuplicates = append(report.CanonicalDuplicates, CanonicalDuplicate{OwnerID: owner, SHA256: checksum, AssetIDs: ids})
		}
	}
	sort.Slice(report.CanonicalDuplicates, func(i, j int) bool {
		a, b := report.CanonicalDuplicates[i], report.CanonicalDuplicates[j]
		if a.OwnerID != b.OwnerID {
			return a.OwnerID < b.OwnerID
		}
		return a.SHA256 < b.SHA256
	})
	if len(report.Issues) != 0 {
		return p, reject("unresolved_integrity_or_share_conflicts")
	}
	return p, nil
}

func targetOwner(p plan, source string) string {
	if target := p.owners[source].TargetUserID; target != "" {
		return target
	}
	return source
}

func hasFields(raw json.RawMessage, names ...string) bool {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return false
	}
	for _, name := range names {
		if _, present := fields[name]; !present {
			return false
		}
	}
	return true
}
