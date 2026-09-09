package embedding

import (
	"context"
	"database/sql"
	"encoding/binary"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	modelName              = "Xenova/clip-vit-base-patch32"
	maxAttempts            = 3
	processingTTL          = 2 * time.Minute
	inferenceTimeout       = 90 * time.Second
	retryBase              = 2 * time.Second
	queryCacheTTL          = 30 * 24 * time.Hour
	queryCacheEntries      = 512
	cursorMaxLength        = 8192
	searchMaxLimit         = 100
	searchDefaultThreshold = 0.12
)

// Engine is the real local multimodal model, shared by indexing and queries.
// The service never synthesizes vectors or falls back to another provider.
type Engine interface {
	Text(context.Context, string) ([]float32, error)
	Image(context.Context, string) ([]float32, error)
}

type Options struct {
	Engine         Engine
	MediaDirectory string
	CursorSecret   []byte
	Enabled        bool
	Logger         *slog.Logger
}

type Service struct {
	db      *sql.DB
	opts    Options
	running atomic.Bool
	wake    chan struct{}
	compute computeAdmission

	modelMu sync.RWMutex
	engine  Engine
	status  string
}

func New(db *sql.DB, opts Options) (*Service, error) {
	if db == nil {
		return nil, errors.New("embedding requires a SQLite database")
	}
	if len(opts.CursorSecret) < 32 {
		return nil, errors.New("embedding requires a cursor secret of at least 32 bytes")
	}
	if opts.Enabled && opts.MediaDirectory == "" {
		return nil, errors.New("enabled embeddings require a media directory")
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	opts.CursorSecret = append([]byte(nil), opts.CursorSecret...)
	status := "disabled"
	if opts.Enabled {
		status = "loading"
		if opts.Engine != nil {
			status = "ready"
		}
	}
	return &Service{db: db, opts: opts, wake: make(chan struct{}, 1), engine: opts.Engine, status: status}, nil
}

// SetEngine activates an initially loading or unavailable service. An installed
// engine cannot be replaced: the process owns its native lifetime until shutdown.
func (s *Service) SetEngine(engine Engine) error {
	s.modelMu.Lock()
	defer s.modelMu.Unlock()
	if !s.opts.Enabled {
		return errors.New("local inference is disabled")
	}
	if engine == nil {
		return errors.New("local inference requires an engine")
	}
	if s.engine != nil {
		return errors.New("local inference engine is already installed; restart to replace it")
	}
	s.engine = engine
	s.status = "ready"
	return nil
}

// MarkUnavailable stops new inference without destroying an installed engine or
// changing durable work. Preparation failures are repaired by an operator restart.
func (s *Service) MarkUnavailable() {
	s.modelMu.Lock()
	defer s.modelMu.Unlock()
	if s.opts.Enabled {
		s.status = "unavailable"
	}
}

func (s *Service) ModelStatus() string {
	s.modelMu.RLock()
	defer s.modelMu.RUnlock()
	return s.status
}

func (s *Service) currentEngine() (Engine, error) {
	s.modelMu.RLock()
	defer s.modelMu.RUnlock()
	switch s.status {
	case "ready":
		return s.engine, nil
	case "disabled":
		return nil, apiError(503, "Local indexing and search are disabled", "embeddings_disabled", 0)
	case "loading":
		return nil, apiError(503, "Local search is preparing; your saved library remains available", "embedding_loading", 2)
	default:
		return nil, apiError(503, "Local search is unavailable; repair the model installation and restart Sploot", "embedding_unavailable", 0)
	}
}

func (s *Service) available() error {
	_, err := s.currentEngine()
	return err
}

func apiError(status int, message, code string, retryAfter int) *model.APIError {
	return &model.APIError{Status: status, Message: message, Code: code, Retryable: retryAfter > 0, RetryAfter: retryAfter}
}

func validateVector(vector []float32) error {
	if len(vector) != inference.Dimension {
		return fmt.Errorf("local model returned %d dimensions; expected %d", len(vector), inference.Dimension)
	}
	var norm float64
	for _, component := range vector {
		value := float64(component)
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return errors.New("local model returned a non-finite vector")
		}
		norm += value * value
	}
	if norm == 0 {
		return errors.New("local model returned a zero vector")
	}
	return nil
}

// Vectors are canonical little-endian float32 blobs, never JSON or SQL text.
func encodeVector(vector []float32) ([]byte, error) {
	if err := validateVector(vector); err != nil {
		return nil, err
	}
	data := make([]byte, len(vector)*4)
	for i, value := range vector {
		binary.LittleEndian.PutUint32(data[i*4:], math.Float32bits(value))
	}
	return data, nil
}
func decodeVector(data []byte) ([]float32, error) {
	if len(data) != inference.Dimension*4 {
		return nil, errors.New("invalid cached vector size")
	}
	vector := make([]float32, inference.Dimension)
	for i := range vector {
		vector[i] = math.Float32frombits(binary.LittleEndian.Uint32(data[i*4:]))
	}
	if err := validateVector(vector); err != nil {
		return nil, err
	}
	return vector, nil
}

func retrySeconds(until, now time.Time) int {
	return max(1, int((until.Sub(now)+time.Second-1)/time.Second))
}
