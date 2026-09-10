// Package predecessor converts a complete private capture into a new native
// library. It never contacts providers or mutates the capture or native base.
package predecessor

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

const CaptureSchema = "sploot.predecessor.capture.v1"
const MappingSchema = "sploot.predecessor.mapping.v1"

type Options struct {
	CaptureDirectory   string
	BaseDirectory      string
	MappingFile        string
	TargetDirectory    string
	ArchiveDirectory   string
	ClaimsFile         string
	BaseURL            string
	InvitationLifetime time.Duration
}

type Capture struct {
	Schema         string                       `json:"schema"`
	CapturedAt     time.Time                    `json:"capturedAt"`
	SourceRevision string                       `json:"sourceRevision"`
	Tables         map[string][]json.RawMessage `json:"tables"`
	ClerkUsers     []json.RawMessage            `json:"clerkUsers"`
	Objects        []Object                     `json:"objects"`
	Completeness   struct {
		Database bool `json:"database"`
		Clerk    bool `json:"clerk"`
		Objects  bool `json:"objects"`
		Verified bool `json:"verified"`
	} `json:"completeness"`
	Counts struct {
		Tables     map[string]int `json:"tables"`
		Assets     int            `json:"assets"`
		Users      int            `json:"users"`
		ClerkUsers int            `json:"clerkUsers"`
		Objects    int            `json:"objects"`
		Bytes      int64          `json:"bytes"`
	} `json:"counts"`
}

type Object struct {
	URL      string `json:"url"`
	Pathname string `json:"pathname"`
	Size     int64  `json:"size"`
	SHA256   string `json:"sha256"`
	Path     string `json:"path"`
}

// Owners must enumerate the entire DB/Clerk identity union. A nonempty target
// selects an existing base account by ID, never email; no two sources may select
// the same destination. Otherwise a separate source-ID account is created.
type Mapping struct {
	Schema string            `json:"schema"`
	Owners []OwnerMapping    `json:"owners"`
	Shares []ShareResolution `json:"shares,omitempty"`
}

type OwnerMapping struct {
	SourceUserID string `json:"sourceUserId"`
	TargetUserID string `json:"targetUserId,omitempty"`
	LoginEmail   string `json:"loginEmail,omitempty"`
}

// Only incompatible shares require resolution. Revocation is explicit and
// retained in the private report; replacement must itself satisfy native rules.
type ShareResolution struct {
	AssetID string `json:"assetId"`
	Action  string `json:"action"`
	Slug    string `json:"slug,omitempty"`
	Reason  string `json:"reason"`
}

// Prisma's timestamp-without-time-zone columns contain UTC, while PostgreSQL
// row_to_json omits their zone suffix. Keep the untouched source JSON separately.
type sourceTimestamp struct{ time.Time }

func (stamp *sourceTimestamp) UnmarshalJSON(data []byte) error {
	if err := stamp.Time.UnmarshalJSON(data); err == nil {
		return nil
	}
	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return err
	}
	parsed, err := time.Parse("2006-01-02T15:04:05.999999999", text)
	if err != nil {
		return err
	}
	stamp.Time = parsed
	return nil
}

func (stamp sourceTimestamp) Value() (driver.Value, error) {
	return stamp.Time, nil
}

type sourceUser struct {
	ID        string          `json:"id"`
	Email     string          `json:"email"`
	CreatedAt sourceTimestamp `json:"createdAt"`
	UpdatedAt sourceTimestamp `json:"updatedAt"`
}

type clerkUser struct {
	ID             string `json:"id"`
	PrimaryEmailID string `json:"primary_email_address_id"`
	Emails         []struct {
		ID    string `json:"id"`
		Email string `json:"email_address"`
	} `json:"email_addresses"`
	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

type sourceAsset struct {
	ID            string           `json:"id"`
	Owner         string           `json:"owner_user_id"`
	BlobURL       string           `json:"blob_url"`
	ThumbnailURL  *string          `json:"thumbnail_url"`
	Pathname      string           `json:"pathname"`
	ThumbnailPath *string          `json:"thumbnail_path"`
	MIME          string           `json:"mime"`
	Width         *int             `json:"width"`
	Height        *int             `json:"height"`
	Size          int64            `json:"size"`
	Checksum      string           `json:"checksum_sha256"`
	StorageSize   *int64           `json:"storage_size"`
	StorageSHA    *string          `json:"storage_sha256"`
	PosterSize    *int64           `json:"thumbnail_storage_size"`
	PosterSHA     *string          `json:"thumbnail_storage_sha256"`
	Favorite      bool             `json:"favorite"`
	CreatedAt     sourceTimestamp  `json:"createdAt"`
	UpdatedAt     sourceTimestamp  `json:"updatedAt"`
	DeletedAt     *sourceTimestamp `json:"deleted_at"`
	Share         *string          `json:"share_slug"`
	ShuffleKey    int64            `json:"shuffle_key"`
}

type sourceTag struct {
	ID        string          `json:"id"`
	Owner     string          `json:"owner_user_id"`
	Name      string          `json:"name"`
	Color     *string         `json:"color"`
	CreatedAt sourceTimestamp `json:"createdAt"`
	UpdatedAt sourceTimestamp `json:"updatedAt"`
}

type sourceLink struct {
	AssetID string `json:"asset_id"`
	TagID   string `json:"tag_id"`
}

type Issue struct {
	Code     string `json:"code"`
	SourceID string `json:"sourceId,omitempty"`
}

type AssetReceipt struct {
	AssetID                 string  `json:"assetId"`
	SourceOwner             string  `json:"sourceOwner"`
	TargetOwner             string  `json:"targetOwner"`
	ObjectPath              string  `json:"objectPath"`
	HistoricalSize          int64   `json:"historicalUploadSize"`
	HistoricalSHA           string  `json:"historicalUploadSha256"`
	StoredSize              int64   `json:"storedSize"`
	StoredSHA               string  `json:"storedSha256"`
	HistoricalMatchesStored bool    `json:"historicalUploadMatchesStoredBytes"`
	NativePath              string  `json:"nativePath"`
	PosterSHA               string  `json:"posterSha256"`
	PosterSize              int64   `json:"posterSize"`
	Share                   *string `json:"shareSlug"`
}

type RecoveryCandidate struct {
	ObjectPath string   `json:"objectPath"`
	AssetIDs   []string `json:"historicalAssetIds"`
}

type CanonicalDuplicate struct {
	OwnerID  string   `json:"ownerId"`
	SHA256   string   `json:"sha256"`
	AssetIDs []string `json:"assetIds"`
}

type Report struct {
	Schema              string               `json:"schema"`
	ImportID            string               `json:"importId"`
	Status              string               `json:"status"`
	CaptureSHA          string               `json:"captureSha256"`
	Owners              int                  `json:"owners"`
	NewAccounts         int                  `json:"newAccounts"`
	Assets              []AssetReceipt       `json:"assets"`
	Unassigned          []string             `json:"unassignedObjectPaths"`
	Recovered           []RecoveryCandidate  `json:"recoveredHistoricalOriginals"`
	CanonicalDuplicates []CanonicalDuplicate `json:"canonicalDuplicateGroups"`
	Shares              []ShareResolution    `json:"shareResolutions"`
	Issues              []Issue              `json:"issues"`
}

type plan struct {
	users   map[string]sourceUser
	owners  map[string]OwnerMapping
	assets  []sourceAsset
	tags    []sourceTag
	links   []sourceLink
	objects map[string]Object
	shares  map[string]*string
}
