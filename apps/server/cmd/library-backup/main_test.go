package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommandNeverPrintsMalformedDatabaseAuthority(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://operator:private-credential@host/source?password=private-credential")
	t.Setenv("PGSERVICE", "")
	var output, diagnostic bytes.Buffer
	code := run(context.Background(), []string{"backup", "--directory", filepath.Join(t.TempDir(), "snapshot")}, &output, &diagnostic)
	if code == 0 {
		t.Fatal("ambiguous database authority accepted")
	}
	if strings.Contains(output.String()+diagnostic.String(), "private-credential") {
		t.Fatal("database credential printed")
	}
}

func TestTargetAuthorityRejectsSymlinksAndPublicFiles(t *testing.T) {
	directory := t.TempDir()
	secret := filepath.Join(directory, "target")
	if err := os.WriteFile(secret, []byte("postgresql://operator:private-credential@127.0.0.1/recovered"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(directory, "target-link")
	if err := os.Symlink(secret, link); err != nil {
		t.Fatal(err)
	}
	if _, err := readTargetURL(link); err == nil {
		t.Fatal("symlinked authority accepted")
	}
	if err := os.Chmod(secret, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := readTargetURL(secret); err == nil {
		t.Fatal("publicly readable authority accepted")
	}
}
