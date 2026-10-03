package contract

import "testing"

func TestUTF16LengthCountsJavaScriptCodeUnits(t *testing.T) {
	if got := UTF16Length("a"); got != 1 {
		t.Fatalf("BMP character: got %d", got)
	}
	if got := UTF16Length("𐐷"); got != 2 {
		t.Fatalf("supplementary-plane character must count as two UTF-16 units, got %d", got)
	}
}

func TestTrimClientWhitespaceMatchesECMAScript(t *testing.T) {
	if got := TrimClientWhitespace("\ufefftoken\ufeff"); got != "token" {
		t.Fatalf("BOM must trim: %q", got)
	}
	if got := TrimClientWhitespace("\u0085token\u0085"); got != "\u0085token\u0085" {
		t.Fatalf("NEXT LINE must remain: %q", got)
	}
}
