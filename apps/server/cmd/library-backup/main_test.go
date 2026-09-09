package main

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

func TestCommandRequiresExplicitLocalAuthority(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://operator:private-credential@host/source")
	var output, diagnostic bytes.Buffer
	code := recovery.RunCLI(context.Background(), []string{"backup", "--directory", filepath.Join(t.TempDir(), "snapshot")}, &output, &diagnostic)
	if code == 0 {
		t.Fatal("ambient database authority was accepted")
	}
	if strings.Contains(output.String()+diagnostic.String(), "private-credential") {
		t.Fatal("ambient credential was printed")
	}
}

func TestRestoreRequiresExplicitSeparateTarget(t *testing.T) {
	var output, diagnostic bytes.Buffer
	code := recovery.RunCLI(context.Background(), []string{"restore", "--directory", filepath.Join(t.TempDir(), "snapshot")}, &output, &diagnostic)
	if code != 2 {
		t.Fatalf("restore without explicit target returned %d instead of rejecting arguments", code)
	}
}
