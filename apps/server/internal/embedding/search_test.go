package embedding

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func TestSearchCursorRejectsDifferentOwnerAndContext(t *testing.T) {
	service := &Service{opts: Options{CursorSecret: []byte("cursor-context-regression-secret")}}
	original, err := validateSearch(model.SearchRequest{Query: "  Cat\tMEME ", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := service.encodeCursor(searchCursor{UserID: "owner-one", Order: "relevance", ID: "last-asset", RawDistance: "0.12345678901234567", Context: original})
	if err != nil {
		t.Fatal(err)
	}
	cursor, err := service.decodeCursor(encoded, "owner-one", original)
	if err != nil || cursor.RawDistance != "0.12345678901234567" {
		t.Fatalf("exact Postgres distance was not retained: %v", err)
	}
	if _, err = service.decodeCursor(encoded, "owner-two", original); err == nil {
		t.Fatal("cross-owner cursor accepted")
	}
	for _, field := range []string{"query", "model", "threshold", "favorite", "tag", "limit", "sort", "direction"} {
		t.Run(field, func(t *testing.T) {
			changed := original
			switch field {
			case "query":
				changed.Query = "different meme"
			case "model":
				changed.EmbeddingModel = "different-model"
			case "threshold":
				changed.Threshold = 0.9
			case "favorite":
				changed.FavoriteOnly = true
			case "tag":
				tag := "another-tag"
				changed.TagID = &tag
			case "limit":
				changed.Limit = 3
			case "sort":
				changed.Sort = "createdAt"
			case "direction":
				changed.Direction = "asc"
			}
			if _, err := service.decodeCursor(encoded, "owner-one", changed); err == nil {
				t.Fatal("cursor accepted after changing context")
			}
		})
	}
	tampered := encoded[:len(encoded)-2] + "AA"
	if _, err = service.decodeCursor(tampered, "owner-one", original); err == nil {
		t.Fatal("tampered signature accepted")
	}
}

func TestProviderDoesNotResubmitDeniedPrediction(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Method != http.MethodPost || r.URL.Path != "/v1/predictions" {
			t.Errorf("unexpected provider operation: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Cancel-After") != "20s" {
			t.Error("provider execution deadline missing")
		}
		w.Header().Set("Retry-After", "120")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()
	service := &Service{opts: Options{ReplicateToken: "test-provider-token"}, http: providerTestClient(t, server.URL)}
	_, err := service.predict(context.Background(), "text", "query that must not be retried")
	var failed *providerError
	if !errors.As(err, &failed) || failed.reason != "provider_rate_limit" || failed.retryAfter != 120 {
		t.Fatalf("provider backoff lost: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("one admission caused %d provider requests", requests.Load())
	}
}

func TestProviderRejectsWrongDimension(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"id": "wrong-dimension", "status": "succeeded", "output": map[string]any{"embedding": make([]float64, contract.EmbeddingDimension-1)}})
	}))
	defer server.Close()
	service := &Service{opts: Options{ReplicateToken: "test-provider-token"}, http: providerTestClient(t, server.URL)}
	if _, err := service.predict(context.Background(), "text", "invalid vector"); err == nil {
		t.Fatal("provider vector with incompatible dimension was accepted")
	}
}

type testProviderTransport struct {
	target    *url.URL
	transport http.RoundTripper
}

func (transport testProviderTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	forward := request.Clone(request.Context())
	forward.URL.Scheme = transport.target.Scheme
	forward.URL.Host = transport.target.Host
	return transport.transport.RoundTrip(forward)
}
func providerTestClient(t *testing.T, target string) *http.Client {
	t.Helper()
	parsed, err := url.Parse(target)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Transport: testProviderTransport{target: parsed, transport: http.DefaultTransport}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// Synthetic vectors exist only as deterministic test fixtures. Shipped search
// and indexing never call this helper or synthesize provider output.
func testVector(component int) []float64 {
	vector := make([]float64, contract.EmbeddingDimension)
	vector[component] = 1
	return vector
}
