package contract

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// SHA256Hex is the stored checksum, capture receipt, and snapshot digest form:
// lowercase hex of SHA-256. Wire parsers that accept mixed case (ZIP export
// catalogs) are a different identity and must not call this.
func SHA256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

// ValidSHA256Hex reports whether value is a stored SHA-256 digest. Uppercase
// hex is rejected so a later byte compare cannot treat "Ab" and "ab" as
// different files with the same checksum.
func ValidSHA256Hex(value string) bool {
	if len(value) != sha256.Size*2 || strings.ToLower(value) != value {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size
}
