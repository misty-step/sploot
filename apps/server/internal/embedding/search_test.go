package embedding

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func searchAPIError(t *testing.T, err error) *model.APIError {
	t.Helper()
	var api *model.APIError
	if !errors.As(err, &api) {
		t.Fatalf("error %v is not an APIError", err)
	}
	return api
}

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
		t.Fatalf("exact search distance was not retained: %v", err)
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

func TestValidateSearchUsesUTF16QueryLength(t *testing.T) {
	accepted := strings.Repeat("𐐷", 250)
	if contract.UTF16Length(accepted) != 500 {
		t.Fatal("250 supplementary characters must be 500 UTF-16 units")
	}
	if _, err := validateSearch(model.SearchRequest{Query: accepted, Limit: 1}); err != nil {
		t.Fatalf("500 UTF-16 units rejected: %v", err)
	}
	if _, err := validateSearch(model.SearchRequest{Query: strings.Repeat("a", 500), Limit: 1}); err != nil {
		t.Fatalf("500 BMP units rejected: %v", err)
	}
	cases := map[string]string{
		"501 bmp units":           strings.Repeat("a", 501),
		"251 supplementary units": strings.Repeat("𐐷", 251),
	}
	for name, query := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := validateSearch(model.SearchRequest{Query: query, Limit: 1})
			api := searchAPIError(t, err)
			if api.Status != 400 || api.Code != "invalid_search_query" {
				t.Fatalf("status=%d code=%q, want 400 invalid_search_query", api.Status, api.Code)
			}
		})
	}
}

func TestValidateSearchUsesStoredTagIDGrammar(t *testing.T) {
	latin1 := strings.Repeat("é", contract.AssetIDMaxLength)
	if !contract.ValidAssetID(latin1) {
		t.Fatal("128 latin-1 characters must be a valid stored id")
	}
	accepted := latin1
	if _, err := validateSearch(model.SearchRequest{Query: "cat", Limit: 1, TagID: &accepted}); err != nil {
		t.Fatalf("valid stored tag id rejected: %v", err)
	}
	cases := map[string]string{
		"empty":           "   ",
		"nul":             "tag\x00id",
		"129 ascii units": strings.Repeat("a", contract.AssetIDMaxLength+1),
	}
	for name, tag := range cases {
		t.Run(name, func(t *testing.T) {
			value := tag
			_, err := validateSearch(model.SearchRequest{Query: "cat", Limit: 1, TagID: &value})
			api := searchAPIError(t, err)
			if api.Status != 400 || api.Code != "invalid_search_tag" {
				t.Fatalf("status=%d code=%q, want 400 invalid_search_tag", api.Status, api.Code)
			}
		})
	}
}

func TestSearchCursorUsesStoredAssetIDGrammar(t *testing.T) {
	service := &Service{opts: Options{CursorSecret: []byte("cursor-id-grammar-regression-secret")}}
	binding, err := validateSearch(model.SearchRequest{Query: "cat", Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	valid, err := service.encodeCursor(searchCursor{UserID: "owner-one", Order: "relevance", ID: strings.Repeat("a", contract.AssetIDMaxLength), RawDistance: "0.2", Context: binding})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.decodeCursor(valid, "owner-one", binding); err != nil {
		t.Fatalf("valid stored cursor id rejected: %v", err)
	}
	oversize, err := service.encodeCursor(searchCursor{UserID: "owner-one", Order: "relevance", ID: strings.Repeat("a", contract.AssetIDMaxLength+1), RawDistance: "0.2", Context: binding})
	if err != nil {
		t.Fatal(err)
	}
	api := searchAPIError(t, mustDecodeCursorError(t, service, oversize, binding))
	if api.Status != 400 || api.Code != "invalid_search_cursor" {
		t.Fatalf("status=%d code=%q, want 400 invalid_search_cursor", api.Status, api.Code)
	}
}

func mustDecodeCursorError(t *testing.T, service *Service, token string, binding searchContext) error {
	t.Helper()
	_, err := service.decodeCursor(token, "owner-one", binding)
	if err == nil {
		t.Fatal("expected cursor rejection")
	}
	return err
}

func TestVectorBoundaryRejectsInvalidModelOutput(t *testing.T) {
	nan := testVector(0)
	nan[1] = float32(math.NaN())
	infinite := testVector(0)
	infinite[1] = float32(math.Inf(1))
	for name, vector := range map[string][]float32{
		"wrong-dimension": make([]float32, inference.Dimension-1),
		"zero":            make([]float32, inference.Dimension),
		"non-finite":      nan,
		"infinite":        infinite,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := encodeVector(vector); err == nil {
				t.Fatal("invalid model output accepted into the canonical vector boundary")
			}
		})
	}
}

// Synthetic vectors are deterministic test fixtures only. Real indexing and
// search always use the local multimodal Engine.
func testVector(component int) []float32 {
	vector := make([]float32, inference.Dimension)
	vector[component] = 1
	return vector
}
