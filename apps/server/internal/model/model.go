package model

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type Principal struct {
	UserID    string
	SessionID string
	Method    string
}

type Tag struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

type Asset struct {
	ID              string     `json:"id"`
	OwnerID         string     `json:"-"`
	BlobURL         string     `json:"blobUrl"`
	ThumbnailURL    *string    `json:"thumbnailUrl"`
	Pathname        string     `json:"pathname"`
	Filename        string     `json:"filename"`
	MIME            string     `json:"mime"`
	Size            int64      `json:"size"`
	Width           *int       `json:"width"`
	Height          *int       `json:"height"`
	Checksum        string     `json:"checksum"`
	Favorite        bool       `json:"favorite"`
	Tags            []Tag      `json:"tags"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	DeletedAt       *time.Time `json:"deletedAt,omitempty"`
	ShareSlug       *string    `json:"shareSlug,omitempty"`
	EmbeddingStatus string     `json:"embeddingStatus,omitempty"`
	Similarity      float64    `json:"similarity,omitempty"`
	Relevance       float64    `json:"relevance,omitempty"`
}

type ListOptions struct {
	Limit        int
	Offset       int
	Cursor       string
	Sort         string
	Direction    string
	Seed         string
	FavoriteOnly bool
	Favorite     *bool
	TagID        string
	Deleted      bool
}

type AssetPage struct {
	Assets     []Asset `json:"assets"`
	Total      int     `json:"total"`
	HasMore    bool    `json:"hasMore"`
	NextCursor string  `json:"nextCursor,omitempty"`
	Limit      int     `json:"limit"`
	Offset     int     `json:"offset"`
}

type SearchRequest struct {
	Query        string   `json:"query"`
	Limit        int      `json:"limit"`
	Threshold    *float64 `json:"threshold"`
	FavoriteOnly bool     `json:"favoriteOnly"`
	TagID        *string  `json:"tagId"`
	Offset       int      `json:"offset"`
	Cursor       string   `json:"cursor"`
}

type SearchResponse struct {
	Results        []Asset `json:"results"`
	Query          string  `json:"query"`
	Total          int     `json:"total"`
	HasMore        bool    `json:"hasMore"`
	NextCursor     string  `json:"nextCursor,omitempty"`
	Limit          int     `json:"limit"`
	Threshold      float64 `json:"threshold"`
	ProcessingTime int64   `json:"processingTime"`
}

type UploadAsset struct {
	ID             string    `json:"id"`
	BlobURL        string    `json:"blobUrl"`
	Pathname       string    `json:"pathname"`
	Filename       string    `json:"filename"`
	MIMEType       string    `json:"mimeType"`
	Size           int64     `json:"size"`
	Checksum       string    `json:"checksum"`
	CreatedAt      time.Time `json:"createdAt"`
	NeedsEmbedding bool      `json:"needsEmbedding"`
}

type UploadResponse struct {
	Success     bool         `json:"success"`
	Asset       *UploadAsset `json:"asset,omitempty"`
	Message     string       `json:"message,omitempty"`
	IsDuplicate bool         `json:"isDuplicate"`
}

type Quota struct {
	UsedBytes      int64 `json:"usedBytes"`
	LimitBytes     int64 `json:"limitBytes"`
	RemainingBytes int64 `json:"remainingBytes"`
	ReservedBytes  int64 `json:"reservedBytes,omitempty"`
	IncomingBytes  int64 `json:"incomingBytes,omitempty"`
}

type ErrorAction struct {
	Type  string `json:"type"`
	Label string `json:"label"`
	Href  string `json:"href,omitempty"`
}

type APIError struct {
	Status     int          `json:"-"`
	Message    string       `json:"error"`
	Code       string       `json:"code,omitempty"`
	Retryable  bool         `json:"retryable,omitempty"`
	RetryAfter int          `json:"-"`
	Quota      *Quota       `json:"quota,omitempty"`
	Action     *ErrorAction `json:"action,omitempty"`
}

func (e *APIError) Error() string { return e.Message }

func NewID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(value[:])
}
