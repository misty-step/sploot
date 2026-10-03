package contract

import (
	"strings"
	"unicode/utf8"
)

// ValidAssetID reports whether id is a stored asset or tag identifier.
// The length bound is UTF-16 code units so Go matches @sploot/common
// isValidAssetId (JavaScript string.length). Invalid UTF-8 and NUL cannot
// be a persisted identifier.
func ValidAssetID(id string) bool {
	return id != "" && utf8.ValidString(id) && !strings.ContainsRune(id, 0) && UTF16Length(id) <= AssetIDMaxLength
}
