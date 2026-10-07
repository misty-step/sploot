package library

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func TestSharedUsesStoredShareSlugGrammar(t *testing.T) {
	s := &Service{db: &sql.DB{}}
	if !contract.ValidShareSlug(strings.Repeat("a", 10)) {
		t.Fatal("10-character alphabet slug must remain valid")
	}
	cases := map[string]string{
		"empty":      "",
		"nine chars": "abcdefghi",
		"129 chars":  strings.Repeat("a", 129),
		"slash":      "abcdefghi/j",
	}
	for name, slug := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := s.Shared(context.Background(), slug)
			var api *model.APIError
			if !errors.As(err, &api) || api.Status != http.StatusNotFound || api.Code != "asset_not_found" {
				t.Fatalf("status/code=%v, want 404 asset_not_found", err)
			}
		})
	}
}
