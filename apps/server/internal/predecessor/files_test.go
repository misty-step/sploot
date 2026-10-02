package predecessor

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCopyObjectFailsWhenContextIsAlreadyCanceled(t *testing.T) {
	parent := t.TempDir()
	if err := os.Chmod(parent, 0700); err != nil {
		t.Fatal(err)
	}
	sourcePath := filepath.Join(parent, "source")
	targetPath := filepath.Join(parent, "target")
	for _, path := range []string{sourcePath, targetPath} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	data := []byte("captured-object")
	if err := os.WriteFile(filepath.Join(sourcePath, "object.bin"), data, 0600); err != nil {
		t.Fatal(err)
	}
	source, err := os.OpenRoot(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = source.Close() })
	target, err := os.OpenRoot(targetPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = target.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := copyObject(ctx, source, target, "object.bin", "canceled.bin", int64(len(data)), digest(data)); err == nil {
		t.Fatal("canceled copyObject succeeded")
	}

	if err := copyObject(context.Background(), source, target, "object.bin", "copy.bin", int64(len(data)), digest(data)); err != nil {
		t.Fatal(err)
	}
}
