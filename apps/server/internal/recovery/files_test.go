package recovery

import (
	"context"
	"io"
	"testing"
)

func TestHashFileFailsWhenContextIsAlreadyCanceled(t *testing.T) {
	dir := testSnapshotDir(t)
	artifact, err := dir.writeFile("object.bin", func(w io.Writer) error {
		_, err := w.Write([]byte("snapshot-bytes"))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := dir.hashFile(ctx, artifact.Path); err == nil {
		t.Fatal("canceled hashFile succeeded")
	}
	if err := dir.verifyArtifact(ctx, artifact); err == nil {
		t.Fatal("canceled verifyArtifact succeeded")
	}

	got, err := dir.hashFile(context.Background(), artifact.Path)
	if err != nil || got != artifact {
		t.Fatalf("live hashFile: got %#v err=%v want %#v", got, err, artifact)
	}
	if err := dir.verifyArtifact(context.Background(), artifact); err != nil {
		t.Fatal(err)
	}
}
