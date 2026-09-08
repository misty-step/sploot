// Package recovery creates read-only, complete PostgreSQL and media snapshots.
// Archives contain private account data and executable SQL: only restore trusted snapshots.
package recovery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

const Format = "sploot-library-backup"
const Version = 1
const FixtureHost = "sploot-qa-seed.public.blob.vercel-storage.com"

// Options deliberately has no default database authority or storage credentials.
// FixtureDirectory maps the URL path on FixtureHost directly beneath that root.
// A seeded Next library therefore uses apps/web/public, not public/qa-blob-seed.
type Options struct {
	DatabaseURL      string
	Directory        string
	FixtureDirectory string
	AllowMediaHosts  []string
	Workers          int
	MaxObjectBytes   int64
	ObjectTimeout    time.Duration
}

type RestoreOptions struct {
	Directory      string
	TargetURL      string
	MediaDirectory string
	AllowRemote    bool
}

type Artifact struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type DatabaseIdentity struct {
	Name           string `json:"name"`
	EndpointSHA256 string `json:"endpointSha256"`
	ServerVersion  int    `json:"serverVersion"`
}

// Manifest is atomically replaced only after the phase's artifacts are durable.
// database-ready permits media-only resume without reconnecting to the source.
type Manifest struct {
	Format      string           `json:"format"`
	Version     int              `json:"version"`
	ID          string           `json:"id"`
	State       string           `json:"state"`
	CreatedAt   time.Time        `json:"createdAt"`
	CompletedAt *time.Time       `json:"completedAt,omitempty"`
	Source      DatabaseIdentity `json:"source"`
	Database    Artifact         `json:"database"`
	Inventory   Artifact         `json:"inventory"`
	Assets      Artifact         `json:"assets"`
	Sources     Artifact         `json:"sources"`
	Media       *Artifact        `json:"media,omitempty"`
	AssetCount  int64            `json:"assetCount"`
	ObjectCount int64            `json:"objectCount"`
	MediaBytes  int64            `json:"mediaBytes"`
}

type TableInventory struct {
	Schema string `json:"schema"`
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Rows   int64  `json:"rows"`
	SHA256 string `json:"sha256"`
}

type SequenceInventory struct {
	Schema    string `json:"schema"`
	Name      string `json:"name"`
	LastValue int64  `json:"lastValue"`
	IsCalled  bool   `json:"isCalled"`
}

type Inventory struct {
	Tables        []TableInventory    `json:"tables"`
	Sequences     []SequenceInventory `json:"sequences"`
	CatalogSHA256 string              `json:"catalogSha256"`
}

// MediaEntry is one line in media.ndjson. Paths are relative to the snapshot or
// restored media directory. Neither this file nor normal command output has URLs.
type MediaEntry struct {
	AssetID   string `json:"assetId"`
	OwnerID   string `json:"ownerId"`
	Rendition string `json:"rendition"`
	Path      string `json:"path"`
	Bytes     int64  `json:"bytes"`
	SHA256    string `json:"sha256"`
	MIME      string `json:"mime"`
}

type objectSource struct {
	AssetID        string   `json:"assetId"`
	OwnerID        string   `json:"ownerId"`
	Rendition      string   `json:"rendition"`
	Path           string   `json:"path"`
	MIME           string   `json:"mime"`
	ExpectedBytes  *int64   `json:"expectedBytes,omitempty"`
	ExpectedSHA256 string   `json:"expectedSha256,omitempty"`
	URLs           []string `json:"urls"`
}

// PhaseError intentionally omits underlying driver/provider messages, which can
// contain credentials, signed URLs, SQL data, or private local path names.
type PhaseError struct {
	Phase   string
	AssetID string
	Reason  string
}

func (e *PhaseError) Error() string {
	if e.AssetID != "" {
		return fmt.Sprintf("%s: asset %q: %s", e.Phase, safeID(e.AssetID), e.Reason)
	}
	return e.Phase + ": " + e.Reason
}

func failure(phase, reason string) error { return &PhaseError{Phase: phase, Reason: reason} }
func assetFailure(phase, id, reason string) error {
	return &PhaseError{Phase: phase, AssetID: id, Reason: reason}
}

func safeID(id string) string {
	if len(id) > 128 {
		return "sha256:" + digest([]byte(id))
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return "sha256:" + digest([]byte(id))
		}
	}
	return id
}

func digest(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }

func mediaPath(id, rendition string) string { return "media/" + digest([]byte(id)) + "/" + rendition }

func contextFailure(ctx context.Context, phase string) error {
	if ctx.Err() != nil {
		return failure(phase, "operation canceled; completed media objects remain resumable")
	}
	return failure(phase, "operation failed")
}
