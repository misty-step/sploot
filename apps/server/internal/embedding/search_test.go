package embedding

import (
	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/model"
	"math"
	"testing"
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
