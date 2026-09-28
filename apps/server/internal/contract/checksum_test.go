package contract

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestSHA256HexIsLowercaseDigest(t *testing.T) {
	sum := sha256.Sum256([]byte("sploot"))
	got := SHA256Hex([]byte("sploot"))
	if got != hex.EncodeToString(sum[:]) || got != strings.ToLower(got) || !ValidSHA256Hex(got) {
		t.Fatalf("stored SHA-256 hex: %q", got)
	}
}

func mixedCaseHex(value string) string {
	for i, digit := range value {
		if digit >= 'a' && digit <= 'f' {
			return value[:i] + strings.ToUpper(value[i:i+1]) + value[i+1:]
		}
	}
	panic("SHA-256 hex without a letter")
}

func TestValidSHA256HexRejectsNonStoredForms(t *testing.T) {
	valid := SHA256Hex([]byte("sploot"))
	cases := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "stored lowercase digest", value: valid, want: true},
		{name: "uppercase hex", value: strings.ToUpper(valid)},
		{name: "mixed-case hex", value: mixedCaseHex(valid)},
		{name: "empty"},
		{name: "odd length", value: valid[:63]},
		{name: "short hex", value: valid[:32]},
		{name: "long hex", value: valid + "ab"},
		{name: "non-hex", value: strings.Repeat("g", 64)},
		{name: "whitespace", value: valid[:63] + " "},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if got := ValidSHA256Hex(test.value); got != test.want {
				t.Fatalf("ValidSHA256Hex(%q)=%v, want %v", test.value, got, test.want)
			}
		})
	}
}
