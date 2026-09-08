package embedding

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

const predictionEndpoint = "https://api.replicate.com/v1/predictions"
const providerResponseLimit = 1 << 20
const localEmbeddingInputLimit = contract.UploadMaxBytes

var predictionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type providerError struct {
	reason     string
	retryAfter int
	terminal   bool
}

func (e *providerError) Error() string { return "Embedding prediction failed: " + e.reason }

type prediction struct {
	ID     string          `json:"id"`
	Status string          `json:"status"`
	Output json.RawMessage `json:"output"`
}

func newToken() string { return model.NewID() }

func (s *Service) generate(ctx context.Context, owner, capability, kind, input string, job *claim) ([]float64, error) {
	if err := s.providerConfigured(); err != nil {
		return nil, err
	}
	admission, err := s.reserve(ctx, owner, capability, job)
	if err != nil {
		return nil, err
	}
	defer s.release(admission)
	vector, err := s.predict(ctx, kind, input)
	if err != nil {
		var failed *providerError
		if !errors.As(err, &failed) {
			failed = &providerError{reason: "provider_unavailable", retryAfter: 30}
		}
		s.settleCircuit(admission.circuit, failed)
		return nil, failed
	}
	s.settleCircuit(admission.circuit, nil)
	return vector, nil
}

// predict submits exactly one billable POST. Polls and cancellation address only
// that prediction ID; neither connection errors nor HTTP 429s resubmit it.
// Cancel-After also bounds provider work if this process disappears mid-request.
func (s *Service) predict(parent context.Context, kind, input string) ([]float64, error) {
	ctx, cancel := context.WithTimeout(parent, providerTimeout)
	defer cancel()
	body, err := json.Marshal(struct {
		Version string            `json:"version"`
		Input   map[string]string `json:"input"`
	}{Version: contract.EmbeddingModel, Input: map[string]string{kind: input}})
	if err != nil {
		return nil, err
	}
	var current prediction
	completed := false
	defer func() {
		if !completed && predictionIDPattern.MatchString(current.ID) {
			s.cancelPrediction(current.ID)
		}
	}()
	if err = s.predictionRequest(ctx, http.MethodPost, predictionEndpoint, body, &current); err != nil {
		return nil, err
	}
	for {
		switch current.Status {
		case "succeeded":
			completed = true
			return decodeVector(current.Output)
		case "failed", "canceled":
			completed = true
			return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
		case "starting", "processing":
			if !predictionIDPattern.MatchString(current.ID) {
				return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
			}
		default:
			return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
		}
		timer := time.NewTimer(500 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
		case <-timer.C:
		}
		id := current.ID
		if err = s.predictionRequest(ctx, http.MethodGet, predictionEndpoint+"/"+id, nil, &current); err != nil {
			return nil, err
		}
		if current.ID != id {
			return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
		}
	}
}

func (s *Service) predictionRequest(ctx context.Context, method, target string, body []byte, result *prediction) error {
	req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.opts.ReplicateToken)
	req.Header.Set("Content-Type", "application/json")
	if method == http.MethodPost {
		req.Header.Set("Prefer", "wait=1")
		req.Header.Set("Cancel-After", "20s")
	}
	response, err := s.http.Do(req)
	if err != nil {
		return &providerError{reason: "provider_unavailable", retryAfter: 30}
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		failure := &providerError{reason: "provider_unavailable", retryAfter: parseRetryAfter(response.Header.Get("Retry-After"), time.Now())}
		if response.StatusCode == 429 {
			failure.reason = "provider_rate_limit"
		}
		if response.StatusCode >= 400 && response.StatusCode < 500 && response.StatusCode != 429 {
			failure.reason = "provider_rejected"
			failure.terminal = true
		}
		return failure
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, providerResponseLimit+1))
	if err != nil || len(data) > providerResponseLimit || json.Unmarshal(data, result) != nil {
		return &providerError{reason: "provider_unavailable", retryAfter: 30}
	}
	return nil
}

func (s *Service) cancelPrediction(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, predictionEndpoint+"/"+id+"/cancel", nil)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.opts.ReplicateToken)
	response, err := s.http.Do(req)
	if err == nil {
		response.Body.Close()
	}
}

func parseRetryAfter(value string, now time.Time) int {
	if seconds, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil && seconds > 0 && !math.IsInf(seconds, 0) && seconds < float64(1<<31) {
		return int(math.Ceil(seconds))
	}
	if until, err := http.ParseTime(value); err == nil && until.After(now) {
		return retrySeconds(until, now)
	}
	return 30
}

func decodeVector(data []byte) ([]float64, error) {
	var vector []float64
	if len(data) > 0 && data[0] == '{' {
		var envelope struct {
			Embedding []float64 `json:"embedding"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
		}
		vector = envelope.Embedding
	} else if err := json.Unmarshal(data, &vector); err != nil {
		return nil, &providerError{reason: "provider_unavailable", retryAfter: 30}
	}
	if err := validateVector(vector); err != nil {
		return nil, err
	}
	return vector, nil
}

func validateVector(vector []float64) error {
	if len(vector) != contract.EmbeddingDimension {
		return &providerError{reason: "provider_unavailable", retryAfter: 30}
	}
	var magnitude float64
	for _, component := range vector {
		// pgvector stores float32; reject finite float64 values that overflow it.
		if math.IsNaN(component) || math.IsInf(component, 0) || math.Abs(component) > math.MaxFloat32 {
			return &providerError{reason: "provider_unavailable", retryAfter: 30}
		}
		magnitude += component * component
	}
	if magnitude == 0 {
		return &providerError{reason: "provider_unavailable", retryAfter: 30}
	}
	return nil
}

func vectorSQL(vector []float64) string {
	var builder strings.Builder
	builder.Grow(len(vector) * 22)
	builder.WriteByte('[')
	for i, component := range vector {
		if i > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.FormatFloat(component, 'g', -1, 64))
	}
	builder.WriteByte(']')
	return builder.String()
}

func (s *Service) mediaInput(job claim) (string, error) {
	source := job.blobURL
	if job.thumbnailURL != nil && *job.thumbnailURL != "" {
		source = *job.thumbnailURL
	} else if strings.HasPrefix(job.mime, "video/") {
		return "", apiError(422, "Video has no poster for indexing", "video_without_poster", 0)
	}
	parsed, err := url.Parse(source)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil {
		return "", apiError(422, "Invalid embedding media URL", "embedding_media_invalid", 0)
	}
	if parsed.Hostname() != "sploot-qa-seed.public.blob.vercel-storage.com" {
		return source, nil
	}
	if s.opts.Environment == "production" || s.opts.MediaDirectory == "" {
		return "", apiError(503, "Local embedding media is unavailable", "embedding_configuration", 0)
	}
	name := strings.TrimPrefix(parsed.Path, "/")
	if name == "" || path.Clean(name) != name || strings.Contains(name, "\\") || strings.HasPrefix(name, "../") {
		return "", apiError(422, "Invalid local embedding media path", "embedding_media_invalid", 0)
	}
	root, err := os.OpenRoot(s.opts.MediaDirectory)
	if err != nil {
		return "", err
	}
	defer root.Close()
	file, err := root.Open(name)
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, localEmbeddingInputLimit+1))
	if err != nil {
		return "", err
	}
	if len(data) > localEmbeddingInputLimit {
		return "", apiError(422, "Local embedding media exceeds provider input bound", "embedding_media_too_large", 0)
	}
	mime := http.DetectContentType(data)
	if !strings.HasPrefix(mime, "image/") {
		return "", apiError(422, "Embedding requires an image or video poster", "embedding_media_invalid", 0)
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}
