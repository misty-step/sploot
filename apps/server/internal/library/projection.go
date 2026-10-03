package library

// OwnedAssetTagsJSON is the owner-fenced [{id,name,color}] array on asset alias a.
// Browse and semantic search both return that shape. The fence is the asset's
// owner column, not a query bind, so a join that forgets the owner parameter
// still cannot leak another account's tags.
const OwnedAssetTagsJSON = `COALESCE((SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
		FROM (SELECT t.id, t.name, t.color FROM asset_tags at JOIN tags t ON t.id = at.tag_id
		WHERE at.asset_id = a.id AND t.owner_user_id = a.owner_user_id ORDER BY t.name, t.id) t), '[]')`
