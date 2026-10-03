package library

// OwnedAssetHasTag is the owner-fenced "asset a has tag T" predicate.
// Browse and semantic search both filter with this identity. The only bind
// is the tag id; the owner fence is a.owner_user_id so a forgotten owner
// parameter cannot leak another account's tags.
func OwnedAssetHasTag(placeholder string) string {
	return `EXISTS (SELECT 1 FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = a.id AND t.owner_user_id = a.owner_user_id AND t.id = ` + placeholder + `)`
}
