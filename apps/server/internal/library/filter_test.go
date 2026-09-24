package library

import (
	"strings"
	"testing"
	"time"
)

func TestOwnedAssetHasTagFencesOnAssetOwner(t *testing.T) {
	fragment := OwnedAssetHasTag("?3")
	if !strings.Contains(fragment, "t.owner_user_id = a.owner_user_id") {
		t.Fatal("tag filter must fence tags to the asset owner")
	}
	if strings.Contains(fragment, "?1") || strings.Count(fragment, "?") != 1 {
		t.Fatal("tag filter must take only the tag placeholder")
	}
	if !strings.Contains(fragment, "t.id = ?3") {
		t.Fatal("tag filter must bind the supplied tag placeholder")
	}
}

func TestListFilterUsesOwnedAssetHasTag(t *testing.T) {
	where, args := listFilter(listContext{Owner: "owner-a", TagID: "tag-a"}, time.Unix(1800000000, 0).UTC())
	if !strings.Contains(where, OwnedAssetHasTag("?3")) {
		t.Fatal("library list must use the shared tag filter")
	}
	if len(args) != 3 || args[0] != "owner-a" || args[2] != "tag-a" {
		t.Fatalf("tag bind drifted: %#v", args)
	}
	plain, _ := listFilter(listContext{Owner: "owner-a"}, time.Unix(1800000000, 0).UTC())
	if strings.Contains(plain, "asset_tags") {
		t.Fatal("unfiltered list included a tag predicate")
	}
}
