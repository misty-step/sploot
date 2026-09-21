package ingest

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestOwnerMediaPrefixIsTheSaveOpenPurgeLayout(t *testing.T) {
	owner, assetID := "owner-id", "asset-id"
	sum := sha256.Sum256([]byte(owner))
	want := "uploads/" + hex.EncodeToString(sum[:16]) + "/" + assetID + "/"
	prefix := OwnerMediaPrefix(owner, assetID)
	if prefix != want {
		t.Fatalf("owner media prefix changed: got %q want %q", prefix, want)
	}
	original := prefix + "meme.gif"
	poster := prefix + "poster/preview.jpg"
	if !ownedMediaPath(owner, assetID, original) || !ownedMediaPath(owner, assetID, poster) {
		t.Fatal("saved original or poster fell outside the owner prefix")
	}
	foreign := OwnerMediaPrefix("other-owner", assetID) + "meme.gif"
	if ownedMediaPath(owner, assetID, foreign) {
		t.Fatal("another owner's object was treated as owned")
	}
	if ownedMediaPath(owner, assetID, prefix+"../other.gif") || ownedMediaPath(owner, "", original) || ownedMediaPath("", assetID, original) {
		t.Fatal("unsafe or unowned media path was accepted")
	}
	if !strings.HasPrefix("media/"+original, "media/"+prefix) {
		t.Fatal("recovery snapshot prefix cannot be composed from OwnerMediaPrefix")
	}
}
