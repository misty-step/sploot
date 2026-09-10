// Package recovery creates private, consistent SQLite and immutable-media
// snapshots. A snapshot contains account password hashes: restore only trusted
// snapshots and protect it like the live library. Sessions and device credentials
// are deliberately invalidated; the signing secret is never copied.
package recovery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

const Format = "sploot-library-backup"
const Version = 2
const credentialPolicy = "Account password hashes retained; browser sessions, device sessions, device requests, upload tokens, account invitations and auth attempts removed; signing secret excluded."

type Options struct {
	DataDirectory  string
	Directory      string
	MaxObjectBytes int64
	ObjectTimeout  time.Duration
}

type RestoreOptions struct {
	Directory           string
	TargetDataDirectory string
}

type Artifact struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

// A database-ready manifest freezes all metadata and permits media-only resume.
// Its database has already been sanitized and never changes on resume.
type Manifest struct {
	Format      string     `json:"format"`
	Version     int        `json:"version"`
	ID          string     `json:"id"`
	Phase       string     `json:"phase"`
	SourceID    string     `json:"sourceId"`
	CreatedAt   time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	Database    Artifact   `json:"database"`
	Media       *Artifact  `json:"media,omitempty"`
	AssetCount  int64      `json:"assetCount"`
	ObjectCount int64      `json:"objectCount"`
	MediaBytes  int64      `json:"mediaBytes"`
	Credentials string     `json:"credentials"`
}

type MediaEntry struct {
	AssetID   string `json:"assetId"`
	OwnerID   string `json:"ownerId"`
	Rendition string `json:"rendition"`
	Path      string `json:"path"`
	Bytes     int64  `json:"bytes"`
	SHA256    string `json:"sha256"`
	MIME      string `json:"mime"`
}

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
		return "invalid-id"
	}
	for _, r := range id {
		if r < 32 || r == 127 {
			return "invalid-id"
		}
	}
	return id
}
func digest(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }
func contextFailure(ctx context.Context, phase string) error {
	if ctx.Err() != nil {
		return failure(phase, "operation cancelled or deadline exceeded")
	}
	return nil
}
