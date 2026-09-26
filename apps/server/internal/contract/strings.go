package contract

import (
	"strings"
	"unicode"
)

// UTF16Length is the JavaScript string length used by shared upload and
// metadata bounds: UTF-16 code units, not Go runes or bytes.
func UTF16Length(value string) int {
	count := 0
	for _, r := range value {
		count++
		if r > 0xffff {
			count++
		}
	}
	return count
}

// TrimClientWhitespace matches ECMAScript String.prototype.trim: it removes
// BOM and Unicode space, but not NEXT LINE (U+0085).
func TrimClientWhitespace(value string) string {
	return strings.TrimFunc(value, func(r rune) bool {
		return r == '\ufeff' || (r != '\u0085' && unicode.IsSpace(r))
	})
}
