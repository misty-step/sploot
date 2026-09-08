package recovery

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRestoreRejectsSourceAndNonlocalTargetsBeforeConnecting(t *testing.T) {
	t.Setenv("PGSERVICE", "")
	for _, test := range []struct{ name, url string }{
		{"same database via loopback alias", "postgresql://operator:private-value@127.0.0.1/library?sslmode=disable"},
		{"different database on nonlocal host", "postgresql://operator:private-value@database.example.com/recovered?sslmode=require"},
	} {
		t.Run(test.name, func(t *testing.T) {
			database, err := parseDatabase(test.url)
			if err != nil {
				t.Fatal(err)
			}
			err = database.constrainTarget(context.Background(), DatabaseIdentity{Name: "library"}, false)
			var phase *PhaseError
			if !errors.As(err, &phase) || phase.Phase != "restore-safety" {
				t.Fatalf("unsafe target accepted or failed outside safety boundary: %v", err)
			}
			if strings.Contains(err.Error(), "private-value") || strings.Contains(err.Error(), test.url) {
				t.Fatal("connection secret leaked")
			}
		})
	}
}

func TestNewDestinationNeverOverwritesAndRejectsRepositoryTrees(t *testing.T) {
	parent := t.TempDir()
	existing := filepath.Join(parent, "existing")
	if err := os.Mkdir(existing, 0700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(existing, "keep")
	if err := os.WriteFile(marker, []byte("operator data"), 0600); err != nil {
		t.Fatal(err)
	}
	if dir, err := newDirectory(existing); err == nil {
		dir.close()
		t.Fatal("existing destination accepted")
	}
	value, err := os.ReadFile(marker)
	if err != nil || string(value) != "operator data" {
		t.Fatal("existing destination changed")
	}
	repository := filepath.Join(parent, "repository")
	if err := os.Mkdir(repository, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repository, ".git"), []byte("gitdir: elsewhere"), 0600); err != nil {
		t.Fatal(err)
	}
	if dir, err := newDirectory(filepath.Join(repository, "private-media")); err == nil {
		dir.close()
		t.Fatal("repository media destination accepted")
	}
	if _, err := os.Stat(filepath.Join(repository, "private-media")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("rejected repository destination was created")
	}
}

func TestResumeReusesVerifiedBytesAndRepairsCorruption(t *testing.T) {
	directory, err := newDirectory(filepath.Join(t.TempDir(), "snapshot"))
	if err != nil {
		t.Fatal(err)
	}
	defer directory.close()
	if err := directory.mkdir("media"); err != nil {
		t.Fatal(err)
	}
	fixture := t.TempDir()
	// A real one-pixel GIF; no provider, database or command is mocked.
	data := []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b")
	fixtureFile := filepath.Join(fixture, "pixel.gif")
	if err := os.WriteFile(fixtureFile, data, 0600); err != nil {
		t.Fatal(err)
	}
	options, err := normalizedOptions(Options{FixtureDirectory: fixture})
	if err != nil {
		t.Fatal(err)
	}
	reader, err := newObjectReader(options)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.close()
	size := int64(len(data))
	storedChecksum := digest(data)
	sources, err := sourcesForAsset(assetRow{
		ID: "asset-original", OwnerID: "owner", MIME: "image/gif",
		Size: size + 128, SHA256: digest([]byte("capture before legacy optimization")),
		StorageSize: &size, StorageSHA256: &storedChecksum,
		URL: "https://" + FixtureHost + "/pixel.gif",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	source := sources[0]
	if err := recoverObject(context.Background(), directory, reader, options, source); err != nil {
		t.Fatal(err)
	}
	// A complete receipt is sufficient even after its provider object vanishes.
	if err := os.Remove(fixtureFile); err != nil {
		t.Fatal(err)
	}
	if err := recoverObject(context.Background(), directory, reader, options, source); err != nil {
		t.Fatal(err)
	}
	corrupt := append([]byte(nil), data...)
	corrupt[len(corrupt)-1] ^= 1
	if _, err := directory.writeFile(source.Path, func(w io.Writer) error { _, err := w.Write(corrupt); return err }); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fixtureFile, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err := recoverObject(context.Background(), directory, reader, options, source); err != nil {
		t.Fatal(err)
	}
	if err := directory.verifyArtifact(Artifact{Path: source.Path, Bytes: size, SHA256: digest(data)}); err != nil {
		t.Fatal("resume did not replace same-length corrupt bytes")
	}
	// Neither an old receipt nor a same-size provider mutation can pass SHA parity.
	if _, err := directory.writeFile(source.Path, func(w io.Writer) error { _, err := w.Write(corrupt); return err }); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fixtureFile, corrupt, 0600); err != nil {
		t.Fatal(err)
	}
	if err := recoverObject(context.Background(), directory, reader, options, source); err == nil {
		t.Fatal("changed provider bytes accepted as the frozen original")
	}
}

func TestRestoredMediaSupportsSeekingAndRejectsSameLengthCorruption(t *testing.T) {
	location := filepath.Join(t.TempDir(), "restored")
	directory, err := newDirectory(location)
	if err != nil {
		t.Fatal(err)
	}
	defer directory.close()
	if err := directory.mkdir("media"); err != nil {
		t.Fatal(err)
	}
	if err := directory.mkdir("media/" + digest([]byte("video"))); err != nil {
		t.Fatal(err)
	}
	data := []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0, 0, 0, 0, 'm', 'p', '4', '2', 'i', 's', 'o', 'm'}
	artifact, err := directory.writeFile(mediaPath("video", "original"), func(w io.Writer) error { _, err := w.Write(data); return err })
	if err != nil {
		t.Fatal(err)
	}
	entry := MediaEntry{AssetID: "video", OwnerID: "owner", Rendition: "original", Path: artifact.Path, Bytes: artifact.Bytes, SHA256: artifact.SHA256, MIME: "video/mp4"}
	manifest, err := directory.writeFile("media.ndjson", func(w io.Writer) error { return json.NewEncoder(w).Encode(entry) })
	if err != nil {
		t.Fatal(err)
	}
	if _, err := directory.writeJSON("restore.json", restoreReceipt{Format: "sploot-library-restore", Version: Version, SnapshotID: strings.Repeat("a", 32), Media: manifest, Objects: 1, Bytes: artifact.Bytes, VerifiedAt: time.Now().UTC()}); err != nil {
		t.Fatal(err)
	}
	reader, err := OpenMediaDirectory(location)
	if err != nil {
		t.Fatal(err)
	}
	file, metadata, err := reader.Open("video", "original")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Seek(4, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	var brand [8]byte
	if _, err := io.ReadFull(file, brand[:]); err != nil || string(brand[:]) != "ftypmp42" || metadata.MIME != "video/mp4" {
		t.Fatal("consumer cannot seek/read original media bytes with original MIME")
	}
	file.Close()
	reader.Close()
	data[len(data)-1] ^= 1
	if _, err := directory.writeFile(entry.Path, func(w io.Writer) error { _, err := w.Write(data); return err }); err != nil {
		t.Fatal(err)
	}
	if reader, err := OpenMediaDirectory(location); err == nil {
		reader.Close()
		t.Fatal("same-length restored media corruption accepted")
	}
}

func TestMediaDestinationRejectsPrivateAddressEncodings(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "::1", "::ffff:127.0.0.1", "169.254.169.254", "100.64.0.1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::"} {
		if publicAddress(net.ParseIP(address)) {
			t.Fatalf("nonpublic or translated internal address accepted: %s", address)
		}
	}
}
