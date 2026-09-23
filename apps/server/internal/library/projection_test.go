package library

import (
	"strings"
	"testing"
)

func TestOwnedAssetTagsJSONIsTheAssetProjection(t *testing.T) {
	if !strings.Contains(OwnedAssetTagsJSON, "t.owner_user_id = a.owner_user_id") {
		t.Fatal("tag projection must fence tags to the asset owner")
	}
	if strings.Contains(OwnedAssetTagsJSON, "?") {
		t.Fatal("tag projection must not take a query bind; search and list share the asset-owner fence")
	}
	if !strings.Contains(OwnedAssetTagsJSON, "ORDER BY t.name, t.id") {
		t.Fatal("tag projection order drifted")
	}
	if !strings.Contains(OwnedAssetTagsJSON, "json_object('id', t.id, 'name', t.name, 'color', t.color)") {
		t.Fatal("tag projection wire shape drifted")
	}
	if !strings.Contains(assetColumns, OwnedAssetTagsJSON) {
		t.Fatal("library asset reads must use the shared tag projection")
	}
}
