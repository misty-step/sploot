package embedding

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	userMinuteLimit        = 5
	globalMinuteLimit      = 50
	userConcurrencyLimit   = 1
	globalConcurrencyLimit = 3
	inflightTTL            = 180 * time.Second
	processingTTL          = 10 * time.Minute
	failedCooldown         = 2 * time.Minute
	maxAttempts            = 3
	retryBase              = time.Minute
	revivalQuarantine      = 15 * time.Minute
	maxRevivals            = 1
	providerTimeout        = 20 * time.Second
	providerBackoff        = 30 * time.Second
	probeTTL               = 60 * time.Second
	indexWindow            = 5 * time.Minute
	indexWindowLimit       = 10
	queryCacheTTL          = 30 * 24 * time.Hour
	cursorMaxLength        = 8192
	searchMaxLimit         = 100
	searchDefaultThreshold = 0.12
	providerCircuitKey     = "replicate-image"
	limiterLock            = "sploot:embedding-rate-limit:v1"
	circuitLock            = "sploot:embedding-provider-circuit:v2"
	costLock               = "sploot:cost-admission:v1"
)

// Options projects runtime configuration; zero attempt limits select the generated
// economics policy. Explicit limits may reduce, but never raise, that policy.
// Cached query vectors remain usable when Enabled is false or no token is set.
type Options struct {
	ReplicateToken        string
	Environment           string
	MediaDirectory        string
	CursorSecret          []byte
	Enabled               bool
	Logger                *slog.Logger
	GlobalDailyAttempts   int
	GlobalMonthlyAttempts int
	UserDailyAttempts     int
	UserMonthlyAttempts   int
	CostAdmissionHalted   bool
}

type Service struct {
	pool    *pgxpool.Pool
	opts    Options
	http    *http.Client
	running atomic.Bool
	wake    chan struct{}
}

func New(pool *pgxpool.Pool, opts Options) (*Service, error) {
	if pool == nil {
		return nil, errors.New("embedding requires Postgres")
	}
	if len(opts.CursorSecret) == 0 {
		return nil, errors.New("embedding requires a search cursor secret")
	}
	limits := []struct {
		value   *int
		ceiling int
		name    string
	}{
		{&opts.GlobalDailyAttempts, contract.EmbeddingGlobalDailyAttempts, "global daily"},
		{&opts.GlobalMonthlyAttempts, contract.EmbeddingGlobalMonthlyAttempts, "global monthly"},
		{&opts.UserDailyAttempts, contract.EmbeddingUserDailyAttempts, "user daily"},
		{&opts.UserMonthlyAttempts, contract.EmbeddingUserMonthlyAttempts, "user monthly"},
	}
	for _, limit := range limits {
		if limit.ceiling <= 0 {
			return nil, fmt.Errorf("embedding %s policy must be positive", limit.name)
		}
		if *limit.value == 0 {
			*limit.value = limit.ceiling
		}
		if *limit.value < 1 || *limit.value > limit.ceiling {
			return nil, fmt.Errorf("embedding %s limit must be between 1 and %d", limit.name, limit.ceiling)
		}
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	opts.CursorSecret = append([]byte(nil), opts.CursorSecret...)
	opts.ReplicateToken = strings.TrimSpace(opts.ReplicateToken)
	return &Service{
		pool: pool, opts: opts, wake: make(chan struct{}, 1),
		http: &http.Client{Timeout: providerTimeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
	}, nil
}

func (s *Service) providerConfigured() error {
	if !s.opts.Enabled {
		return apiError(503, "Embedding generation is disabled", "embeddings_disabled", 30)
	}
	if s.opts.ReplicateToken == "" || s.opts.ReplicateToken == "your_replicate_token_here" {
		return apiError(503, "Embedding provider is not configured", "embedding_configuration", 0)
	}
	if s.opts.CostAdmissionHalted {
		return apiError(503, "New provider work is paused", "emergency_stop", 30)
	}
	return nil
}

func apiError(status int, message, code string, retryAfter int) *model.APIError {
	return &model.APIError{Status: status, Message: message, Code: code, Retryable: retryAfter > 0, RetryAfter: retryAfter}
}

type admissionError struct {
	reason     string
	retryAfter int
}

func (e *admissionError) Error() string { return "Embedding admission denied: " + e.reason }
func (e *admissionError) public() *model.APIError {
	status := 429
	if e.reason == "limiter_unavailable" || e.reason == "provider_circuit_open" {
		status = 503
	}
	return apiError(status, "Embedding generation is temporarily unavailable", e.reason, e.retryAfter)
}

func publicError(err error) error {
	var denied *admissionError
	if errors.As(err, &denied) {
		return denied.public()
	}
	var provider *providerError
	if errors.As(err, &provider) {
		if provider.terminal {
			return apiError(503, "Embedding provider rejected the request", provider.reason, 0)
		}
		status := 503
		if provider.reason == "provider_rate_limit" {
			status = 429
		}
		return apiError(status, "Embedding provider is temporarily unavailable", provider.reason, provider.retryAfter)
	}
	return err
}

// report sends the same safety boundary to both local structured logs and Sentry.
// Never attach media bytes, provider tokens, or users' search text.
func (s *Service) report(event, reason string, retryAfter int) {
	s.opts.Logger.Error(event, "reason", reason, "retry_after_seconds", retryAfter)
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelError)
		scope.SetTag("component", "embedding")
		scope.SetTag("reason", reason)
		scope.SetTag("retry_after_seconds", strconv.Itoa(retryAfter))
		sentry.CaptureMessage(event)
	})
}

func detachedContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

func retrySeconds(until, now time.Time) int {
	return max(1, int((until.Sub(now)+time.Second-1)/time.Second))
}
func nextDay(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
}
func nextMonth(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
}
