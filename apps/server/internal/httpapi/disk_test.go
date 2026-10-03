package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/config"
	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/diskreserve"
	"github.com/misty-step/sploot/apps/server/internal/ingest"
	"github.com/misty-step/sploot/apps/server/internal/model"
	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

func TestMain(m *testing.M) {
	if os.Getenv("SPLOOT_RESERVE_HELPER") == "cli" {
		args := strings.Split(os.Getenv("SPLOOT_RESERVE_ARGV"), "\n")
		if len(args) > 0 && args[len(args)-1] == "" {
			args = args[:len(args)-1]
		}
		os.Exit(recovery.RunCLI(context.Background(), args, os.Stdout, os.Stderr))
	}
	os.Exit(m.Run())
}

func TestExportLowSpaceRefusesBeforeStaging(t *testing.T) {
	app, db, _, owner := newDiskServer(t)
	if err := app.ledger.SetReserve(4096); err != nil {
		t.Fatal(err)
	}
	estimate, err := libraryExportStagingBytes(context.Background(), db, owner, app.exportDir)
	if err != nil {
		t.Fatal(err)
	}
	app.ledger.SetProbe(func(string) (uint64, int64, error) {
		return 11, estimate + 4096 - 1, nil
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/library/export", nil)
	app.exportLibrary(recorder, request, model.Principal{UserID: owner})
	if recorder.Code != http.StatusInsufficientStorage {
		t.Fatalf("status %d body %s", recorder.Code, recorder.Body.String())
	}
	var failure model.APIError
	if err := json.Unmarshal(recorder.Body.Bytes(), &failure); err != nil || failure.Code != "storage_reserve_exceeded" {
		t.Fatalf("export refusal: %s %v", recorder.Body.String(), err)
	}
	if files := regularFiles(t, app.exportDir); len(files) != 0 {
		t.Fatalf("low space created export scratch: %v", files)
	}
}

func TestSimultaneousSaveExportBackupCannotOverReserve(t *testing.T) {
	app, db, directory, owner := newDiskServer(t)
	const reserve int64 = 4096
	const device uint64 = 11
	if err := app.ledger.SetReserve(reserve); err != nil {
		t.Fatal(err)
	}
	work := t.TempDir()
	saveN, err := ingest.SaveStagingBytes(app.config.MediaDirectory)
	if err != nil {
		t.Fatal(err)
	}
	exportN, err := libraryExportStagingBytes(context.Background(), db, owner, app.exportDir)
	if err != nil {
		t.Fatal(err)
	}
	backupN, err := recovery.StagingBytes(directory, work)
	if err != nil {
		t.Fatal(err)
	}
	budget := saveN + exportN + backupN - 1
	available := budget + reserve
	app.ledger.SetProbe(func(string) (uint64, int64, error) {
		return device, available, nil
	})
	child := startReserveHold(t, directory, work, backupN, reserve, device, available)
	defer child.release()

	original := smallGIF(t)
	reader := &gatedReader{reader: bytes.NewReader(original), entered: make(chan struct{}), release: make(chan struct{})}
	saveDone := make(chan error, 1)
	go func() {
		_, err := app.ingest.Save(context.Background(), owner, ingest.Input{Reader: reader, MIME: "image/gif", Filename: "overlap.gif"})
		saveDone <- err
	}()
	writer := &blockingOKWriter{entered: make(chan struct{}), release: make(chan struct{})}
	exportDone := make(chan struct{})
	go func() {
		request := httptest.NewRequest(http.MethodGet, "/api/library/export", nil)
		app.exportLibrary(writer, request, model.Principal{UserID: owner})
		close(exportDone)
	}()

	saveHeld, saveErr := waitSave(t, reader.entered, saveDone)
	exportHeld := waitExport(t, writer.entered, exportDone)
	if saveHeld == exportHeld {
		t.Fatalf("save and export both held=%v under budget %d (save %d export %d backup %d)", saveHeld, budget, saveN, exportN, backupN)
	}
	if !saveHeld && (saveErr == nil || !reserveRefused(saveErr) || reader.reads != 0) {
		t.Fatalf("refused save consumed bytes: err=%v reads=%d", saveErr, reader.reads)
	}
	if !saveHeld && len(dirEntries(t, app.config.MediaDirectory)) != 0 {
		t.Fatalf("refused save created media scratch: %v", dirEntries(t, app.config.MediaDirectory))
	}
	if !exportHeld && (writer.code != http.StatusInsufficientStorage || !strings.Contains(writer.body.String(), "storage_reserve_exceeded")) {
		t.Fatalf("refused export status=%d body=%s", writer.code, writer.body.String())
	}
	if !exportHeld && len(regularFiles(t, app.exportDir)) != 0 {
		t.Fatalf("refused export created scratch: %v", regularFiles(t, app.exportDir))
	}
	held := sumHoldBytes(t, filepath.Join(directory, diskreserve.DirectoryName, "holds"))
	peak := app.ledger.PeakHeld(device)
	if held > budget || peak > budget || held < backupN || peak < backupN {
		t.Fatalf("overlapping claims exceeded the budget: held=%d peak=%d budget=%d backup=%d", held, peak, budget, backupN)
	}

	if saveHeld {
		close(reader.release)
		select {
		case err := <-saveDone:
			if err != nil {
				t.Fatalf("admitted save failed after release: %v", err)
			}
		case <-time.After(30 * time.Second):
			t.Fatal("save did not finish")
		}
	}
	if exportHeld {
		close(writer.release)
	}
	select {
	case <-exportDone:
	case <-time.After(30 * time.Second):
		t.Fatal("export did not finish")
	}
	child.release()
	if files := dirEntries(t, filepath.Join(directory, diskreserve.DirectoryName, "holds")); len(files) != 0 {
		t.Fatalf("finished consumers left reservations: %v", files)
	}
}

type reserveChild struct {
	cmd  *exec.Cmd
	in   io.WriteCloser
	once sync.Once
}

func (c *reserveChild) release() {
	c.once.Do(func() {
		_ = c.in.Close()
		_ = c.cmd.Wait()
	})
}

func startReserveHold(t *testing.T, dataDir, work string, nbytes, reserve int64, device uint64, available int64) *reserveChild {
	t.Helper()
	args := strings.Join([]string{
		"reserve",
		"--ledger", filepath.Join(dataDir, diskreserve.DirectoryName),
		"--target", work,
		"--bytes", strconv.FormatInt(nbytes, 10),
		"--reserve-bytes", strconv.FormatInt(reserve, 10),
	}, "\n")
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(),
		"SPLOOT_RESERVE_HELPER=cli",
		"SPLOOT_RESERVE_ARGV="+args,
		"SPLOOT_DEPLOYMENT_ENV=test",
		"SPLOOT_DISKRESERVE_PROBE=device="+strconv.FormatUint(device, 10)+",available="+strconv.FormatInt(available, 10),
	)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	line := make([]byte, len("reserved\n"))
	if _, err := io.ReadFull(stdout, line); err != nil || string(line) != "reserved\n" {
		_ = stdin.Close()
		_ = cmd.Wait()
		t.Fatalf("backup reservation did not admit: %q %v %s", line, err, stderr.String())
	}
	return &reserveChild{cmd: cmd, in: stdin}
}

func waitSave(t *testing.T, entered <-chan struct{}, done <-chan error) (bool, error) {
	t.Helper()
	select {
	case <-entered:
		return true, nil
	case err := <-done:
		return false, err
	case <-time.After(20 * time.Second):
		t.Fatal("save admission did not settle")
	}
	return false, nil
}

func waitExport(t *testing.T, entered <-chan struct{}, done <-chan struct{}) bool {
	t.Helper()
	select {
	case <-entered:
		return true
	case <-done:
		return false
	case <-time.After(20 * time.Second):
		t.Fatal("export admission did not settle")
	}
	return false
}

func reserveRefused(err error) bool {
	var api *model.APIError
	return errors.As(err, &api) && api.Status == http.StatusInsufficientStorage && api.Code == "storage_reserve_exceeded"
}

func newDiskServer(t *testing.T) (*Server, *sql.DB, string, string) {
	t.Helper()
	directory := filepath.Join(t.TempDir(), "library")
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	owner := model.NewID()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash) VALUES(?,?,?)`, owner, owner+"@example.invalid", "hash"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Address: "127.0.0.1:9", BaseURL: "http://127.0.0.1:9",
		DataDirectory: directory, MediaDirectory: filepath.Join(directory, "media"),
		ModelDirectory: filepath.Join(directory, "models"), Environment: "test",
		CursorSecret: bytes.Repeat([]byte("s"), 32), UploadsEnabled: true,
	}
	app, err := New(cfg, db, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = app.Close()
		_ = db.Close()
	})
	return app, db, directory, owner
}

type gatedReader struct {
	reader  io.Reader
	entered chan struct{}
	release chan struct{}
	once    sync.Once
	reads   int
}

func (g *gatedReader) Read(p []byte) (int, error) {
	g.once.Do(func() {
		close(g.entered)
		<-g.release
	})
	g.reads++
	return g.reader.Read(p)
}

type blockingOKWriter struct {
	header  http.Header
	code    int
	body    bytes.Buffer
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (w *blockingOKWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}
	return w.header
}

func (w *blockingOKWriter) WriteHeader(status int) {
	w.code = status
	if status != http.StatusOK {
		return
	}
	w.once.Do(func() { close(w.entered) })
	<-w.release
}

func (w *blockingOKWriter) Write(p []byte) (int, error) {
	if w.code == 0 {
		w.WriteHeader(http.StatusOK)
	}
	if w.code != http.StatusOK {
		_, _ = w.body.Write(p)
	}
	return len(p), nil
}

func smallGIF(t *testing.T) []byte {
	t.Helper()
	palette := color.Palette{color.RGBA{10, 20, 30, 255}, color.RGBA{40, 50, 60, 255}}
	frame := image.NewPaletted(image.Rect(0, 0, 8, 8), palette)
	var output bytes.Buffer
	if err := gif.EncodeAll(&output, &gif.GIF{Image: []*image.Paletted{frame}, Delay: []int{5}}); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func regularFiles(t *testing.T, directory string) []string {
	t.Helper()
	var names []string
	for _, name := range dirEntries(t, directory) {
		info, err := os.Lstat(filepath.Join(directory, name))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().IsRegular() {
			names = append(names, name)
		}
	}
	return names
}

func dirEntries(t *testing.T, directory string) []string {
	t.Helper()
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func sumHoldBytes(t *testing.T, directory string) int64 {
	t.Helper()
	var sum int64
	for _, name := range dirEntries(t, directory) {
		payload, err := os.ReadFile(filepath.Join(directory, name))
		if err != nil {
			t.Fatal(err)
		}
		n, err := holdBytes(payload)
		if err != nil {
			t.Fatal(err)
		}
		sum += n
	}
	return sum
}

func holdBytes(payload []byte) (int64, error) {
	text := strings.TrimSuffix(string(payload), "\n")
	fields := strings.Split(text, "\n")
	if len(fields) != 3 || fields[0] != "v1" || !strings.HasPrefix(fields[2], "bytes=") {
		return 0, errors.New("hold record")
	}
	return strconv.ParseInt(strings.TrimPrefix(fields[2], "bytes="), 10, 64)
}
