package predecessor

import (
	"strings"
	"testing"
)

func TestClaimOriginUsesCanonicalApplicationOrigin(t *testing.T) {
	origin, err := claimOrigin("https://Library.EXAMPLE/")
	if err != nil {
		t.Fatal(err)
	}
	if origin.String() != "https://library.example" {
		t.Fatalf("canonical origin %q, want https://library.example", origin)
	}
	origin, err = claimOrigin("http://127.0.0.1:3001/")
	if err != nil || origin.String() != "http://127.0.0.1:3001" {
		t.Fatalf("loopback origin %q, %v", origin, err)
	}
	if _, err := claimOrigin("http://library.example"); err == nil || !strings.Contains(err.Error(), "claim_origin_requires_https") {
		t.Fatalf("public HTTP origin: %v", err)
	}
	if _, err := claimOrigin("https://library.example/app"); err == nil || !strings.Contains(err.Error(), "claim_origin") || strings.Contains(err.Error(), "claim_origin_requires_https") {
		t.Fatalf("path is not an origin: %v", err)
	}
}
