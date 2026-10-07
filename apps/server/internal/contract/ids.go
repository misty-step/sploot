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

// ValidShareSlug reports whether slug is a stored public share capability.
// Generated Go slugs are 32-character base64url; imported predecessor slugs
// may be 10 to 128 characters of the same alphabet. Byte length is the
// bound because the alphabet is ASCII; mixed case is significant.
func ValidShareSlug(slug string) bool {
	return len(slug) >= 10 && len(slug) <= 128 && strings.Trim(slug, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") == ""
}
