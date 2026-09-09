package library

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

func TestPaginationCursorBindsOwnerViewAndPageSize(t *testing.T) {
	s := New(nil, []byte(strings.Repeat("c", 32)))
	now := time.Unix(1800000000, 0).UTC()
	binding, err := normalizeList("owner-a", model.ListOptions{Sort: "shuffle", Seed: "500000", Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	cursor := listCursor{Version: 1, Context: listContextHash(binding), Snapshot: now, AfterID: "asset-boundary", AfterValue: "4611686018427387904", Offset: 20}
	token, err := s.encodeCursor(cursor)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := s.decodeCursor(token, binding, now.Add(time.Minute))
	if err != nil || parsed.AfterID != cursor.AfterID || parsed.Offset != 20 {
		t.Fatalf("cursor continuation: %v, %v", parsed, err)
	}
	cases := map[string]func(*listContext){
		"different owner":      func(c *listContext) { c.Owner = "owner-b" },
		"different seed":       func(c *listContext) { c.Seed = "750000" },
		"favorites filter":     func(c *listContext) { favorite := true; c.Favorite = &favorite },
		"non-favorites filter": func(c *listContext) { favorite := false; c.Favorite = &favorite },
		"different tag":        func(c *listContext) { c.TagID = "tag-a" },
		"trash view":           func(c *listContext) { c.Deleted = true },
		"different page size":  func(c *listContext) { c.Limit = 21 },
		"different order":      func(c *listContext) { c.Sort = "createdAt" },
	}
	for name, modify := range cases {
		t.Run(name, func(t *testing.T) {
			other := binding
			modify(&other)
			if _, err := s.decodeCursor(token, other, now); err == nil {
				t.Fatal("cursor accepted in another pagination context")
			}
		})
	}
	parts := strings.Split(token, ".")
	body, _ := base64.RawURLEncoding.DecodeString(parts[0])
	parts[0] = base64.RawURLEncoding.EncodeToString([]byte(strings.Replace(string(body), "asset-boundary", "asset-injected", 1)))
	if _, err := s.decodeCursor(strings.Join(parts, "."), binding, now); err == nil {
		t.Fatal("tampered cursor accepted")
	}
	if _, err := s.decodeCursor(token, binding, now.Add(cursorLifetime)); err == nil {
		t.Fatal("expired cursor accepted")
	}
}
