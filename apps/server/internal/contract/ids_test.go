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
