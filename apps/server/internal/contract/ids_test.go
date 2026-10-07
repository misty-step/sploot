package contract

import (
	"strings"
	"testing"
)

func TestValidAssetIDMatchesStoredIdentifierGrammar(t *testing.T) {
	supplementary := "\U0001F600" // two UTF-16 code units
	cases := []struct {
		name  string
		id    string
		valid bool
	}{
		{name: "ascii", id: "asset-1", valid: true},
		{name: "empty", id: "", valid: false},
		{name: "nul", id: "asset\x00id", valid: false},
		{name: "invalid utf-8", id: "asset\xffid", valid: false},
		{name: "128 bmp units", id: strings.Repeat("a", AssetIDMaxLength), valid: true},
		{name: "129 bmp units", id: strings.Repeat("a", AssetIDMaxLength+1), valid: false},
		{name: "64 supplementary units", id: strings.Repeat(supplementary, AssetIDMaxLength/2), valid: true},
		{name: "65 supplementary units", id: strings.Repeat(supplementary, AssetIDMaxLength/2+1), valid: false},
		{name: "200 latin-1 bytes", id: strings.Repeat("é", 100), valid: true},
	}
	for _, test := range cases {
		if got := ValidAssetID(test.id); got != test.valid {
			t.Fatalf("%s: ValidAssetID(%q)=%v, want %v", test.name, test.id, got, test.valid)
		}
	}
}

func TestValidShareSlugMatchesStoredShareGrammar(t *testing.T) {
	cases := []struct {
		name  string
		slug  string
		valid bool
	}{
		{name: "predecessor nanoid", slug: "abcdefghij", valid: true},
		{name: "generated alphabet", slug: "Abc_def-0123456789XYZabcde", valid: true},
		{name: "empty", slug: "", valid: false},
		{name: "nine chars", slug: "abcdefghi", valid: false},
		{name: "129 chars", slug: strings.Repeat("a", 129), valid: false},
		{name: "128 chars", slug: strings.Repeat("a", 128), valid: true},
		{name: "space", slug: "abcdefghij k", valid: false},
		{name: "slash", slug: "abcdefghi/j", valid: false},
		{name: "plus", slug: "abcdefghij+", valid: false},
	}
	for _, test := range cases {
		if got := ValidShareSlug(test.slug); got != test.valid {
			t.Fatalf("%s: ValidShareSlug(%q)=%v, want %v", test.name, test.slug, got, test.valid)
		}
	}
}
