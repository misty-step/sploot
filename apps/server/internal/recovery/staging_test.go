package recovery

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/diskreserve"
)

func TestMain(m *testing.M) {
	if os.Getenv("SPLOOT_RESERVE_HELPER") == "cli" {
		args := strings.Split(os.Getenv("SPLOOT_RESERVE_ARGV"), "\n")
		if len(args) > 0 && args[len(args)-1] == "" {
			args = args[:len(args)-1]
		}
		os.Exit(RunCLI(context.Background(), args, os.Stdout, os.Stderr))
	}
	os.Exit(m.Run())
}

func TestStagingBytesCoversSnapshotTarAndAge(t *testing.T) {
	fixture := newRecoveryFixture(t)
	work := t.TempDir()
	estimate, err := StagingBytes(fixture.directory, work)
	if err != nil {
		t.Fatal(err)
	}
	parent := t.TempDir()
	snapshot := filepath.Join(parent, "snapshot")
	if _, err := Backup(context.Background(), Options{DataDirectory: fixture.directory, Directory: snapshot}); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(parent, "snapshot.tar")
	cmd := exec.Command("tar", "-C", parent, "-cf", archive, "snapshot")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("tar: %v %s", err, out)
	}
	block, err := diskreserve.BlockSize(work)
	if err != nil {
		t.Fatal(err)
	}
	snapshotAlloc, err := treeAllocated(snapshot, block)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(archive)
	if err != nil {
		t.Fatal(err)
	}
	tarAlloc, err := diskreserve.RoundUp(info.Size(), block)
	if err != nil {
		t.Fatal(err)
	}
	ageAlloc, err := diskreserve.RoundUp(info.Size()+64<<10, block)
	if err != nil {
		t.Fatal(err)
	}
	peak, err := diskreserve.Add(snapshotAlloc, tarAlloc)
	if err != nil {
		t.Fatal(err)
	}
	peak, err = diskreserve.Add(peak, ageAlloc)
	if err != nil {
		t.Fatal(err)
	}
	if estimate < peak {
		t.Fatalf("staging estimate %d is below snapshot %d + tar %d + age %d", estimate, snapshotAlloc, tarAlloc, ageAlloc)
	}
}

func TestIndependentRestoreMatchesOriginals(t *testing.T) {
	fixture := newRecoveryFixture(t)
	parent := t.TempDir()
	snapshot := filepath.Join(parent, "snapshot")
	target := filepath.Join(parent, "restored")
	runIsolatedCLI(t, "backup", "--data-dir", fixture.directory, "--directory", snapshot)
	runIsolatedCLI(t, "restore", "--directory", snapshot, "--target-data-dir", target)
	sourceMedia := filepath.Join(fixture.directory, "media")
	restoredMedia := filepath.Join(target, "media")
	var compared int
	err := filepath.WalkDir(sourceMedia, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		rel, err := filepath.Rel(sourceMedia, path)
		if err != nil {
			return err
		}
		original, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		restored, err := os.ReadFile(filepath.Join(restoredMedia, rel))
		if err != nil {
			return err
		}
		if !bytes.Equal(original, restored) {
			return errors.New("restored media differs: " + rel)
		}
		compared++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if compared < 2 {
		t.Fatalf("restore compared %d media files", compared)
	}
	original, err := os.ReadFile(filepath.Join(sourceMedia, filepath.FromSlash(strings.TrimPrefix(fixture.original.Path, "media/"))))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(original, fixture.data) {
		t.Fatal("source fixture bytes changed before the comparison")
	}
}

func TestReserveParentDeathDropsClaim(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	ledgerDir := filepath.Join(root, "ledger")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	args := strings.Join([]string{"reserve", "--ledger", ledgerDir, "--target", target, "--bytes", "80", "--reserve-bytes", "0"}, "\n")
	script := filepath.Join(root, "parent.py")
	body := "import os, signal, subprocess, sys\n" +
		"env = os.environ.copy()\n" +
		"env['SPLOOT_RESERVE_HELPER'] = 'cli'\n" +
		"env['SPLOOT_RESERVE_ARGV'] = sys.argv[2]\n" +
		"env['SPLOOT_DEPLOYMENT_ENV'] = 'test'\n" +
		"env['SPLOOT_DISKRESERVE_PROBE'] = 'device=13,available=80'\n" +
		"proc = subprocess.Popen([sys.argv[1], '-test.run=^$'], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE)\n" +
		"line = proc.stdout.readline()\n" +
		"if line != b'reserved\\n':\n" +
		"    raise SystemExit('helper did not admit')\n" +
		"print(proc.pid, flush=True)\n" +
		"os.kill(os.getpid(), signal.SIGKILL)\n"
	if err := os.WriteFile(script, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("python3", script, os.Args[0], args)
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	line, err := readLine(out)
	_ = cmd.Wait()
	if err != nil {
		t.Fatalf("parent did not report the holder: %v", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(line))
	if err != nil || pid <= 0 {
		t.Fatalf("holder pid %q: %v", line, err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		if err := syscall.Kill(pid, 0); err != nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("parent death left the reservation process running")
		}
		time.Sleep(20 * time.Millisecond)
	}
	ledger, err := diskreserve.Open(ledgerDir, func() int64 { return 0 }, func(string) (uint64, int64, error) {
		return 13, 80, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	hold, err := ledger.Reserve(context.Background(), target, 80)
	if err != nil {
		t.Fatalf("parent death stranded the reservation: %v", err)
	}
	hold.Release()
}

func TestBackupRemoteLowSpaceRefusesBeforeSnapshot(t *testing.T) {
	fixture := newRecoveryFixture(t)
	root := t.TempDir()
	work := filepath.Join(root, "work")
	if err := os.Mkdir(work, 0700); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(root, "commands.log")
	command := backupShim(t, root, logPath)
	status := filepath.Join(root, "status.json")
	code, output := runBackupScript(t, fixture.directory, work, command, status, root, []string{
		"SPLOOT_DEPLOYMENT_ENV=test",
		"SPLOOT_DISKRESERVE_PROBE=device=9,available=1",
		"SPLOOT_STORAGE_RESERVE_BYTES=0",
	}, "")
	if code == 0 || strings.Contains(output, `"status": "ok"`) || fileExists(status) {
		t.Fatalf("low space published success: exit=%d output=%s", code, output)
	}
	failure := readFailure(t, status)
	if failure["phase"] != "reserve" {
		t.Fatalf("low space phase: %v", failure)
	}
	logged, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(logged)
	if !strings.Contains(text, "staging-bytes\n") || !strings.Contains(text, "reserve\n") || strings.Contains(text, "backup\n") {
		t.Fatalf("command log: %s", text)
	}
	entries, err := os.ReadDir(work)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "snapshot-") {
			t.Fatalf("low space created %s", entry.Name())
		}
	}
}

func TestBackupRemoteEncryptionAndUploadDoNotPublishSuccess(t *testing.T) {
	cases := []struct {
		name    string
		age     string
		factory string
		phase   string
	}{
		{name: "encryption", age: "exit 1", phase: "encrypt"},
		{name: "upload", age: "copy", factory: "upload", phase: "upload"},
		{name: "receipt", age: "copy", factory: "receipt", phase: "remote-receipt"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			fixture := newRecoveryFixture(t)
			root := t.TempDir()
			work := filepath.Join(root, "work")
			if err := os.Mkdir(work, 0700); err != nil {
				t.Fatal(err)
			}
			command := backupShim(t, root, filepath.Join(root, "commands.log"))
			ageDir := filepath.Join(root, "bin")
			if err := os.Mkdir(ageDir, 0700); err != nil {
				t.Fatal(err)
			}
			writeAge(t, filepath.Join(ageDir, "age"), test.age)
			status := filepath.Join(root, "status.json")
			code, output := runBackupScript(t, fixture.directory, work, command, status, root, []string{
				"SPLOOT_DEPLOYMENT_ENV=test",
				"SPLOOT_DISKRESERVE_PROBE=device=21,available=1099511627776",
				"SPLOOT_STORAGE_RESERVE_BYTES=0",
				"PATH=" + ageDir + string(os.PathListSeparator) + os.Getenv("PATH"),
			}, test.factory)
			if code == 0 || strings.Contains(output, `"status": "ok"`) || fileExists(status) {
				t.Fatalf("failed %s published success: exit=%d output=%s", test.name, code, output)
			}
			failure := readFailure(t, status)
			if failure["phase"] != test.phase {
				t.Fatalf("phase %v, want %s; output %s", failure["phase"], test.phase, output)
			}
			if fileExists(filepath.Join(work, "daily-"+time.Now().UTC().Format("20060102")+".json")) {
				t.Fatal("failed run published the daily marker")
			}
		})
	}
}

func runIsolatedCLI(t *testing.T, args ...string) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), "SPLOOT_RESERVE_HELPER=cli", "SPLOOT_RESERVE_ARGV="+strings.Join(args, "\n"))
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("isolated %v: %v\n%s", args[0], err, out)
	}
}

func backupShim(t *testing.T, root, logPath string) string {
	t.Helper()
	path := filepath.Join(root, "backup-command")
	body := "#!/bin/sh\nprintf '%s\\n' \"$1\" >> " + shellQuote(logPath) + "\nexport SPLOOT_RESERVE_HELPER=cli\nexport SPLOOT_RESERVE_ARGV=\"$(printf '%s\\n' \"$@\")\"\nexec " + shellQuote(os.Args[0]) + " -test.run=^$\n"
	if err := os.WriteFile(path, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
	return path
}

func writeAge(t *testing.T, path, mode string) {
	t.Helper()
	var body string
	if mode == "copy" {
		body = "#!/bin/sh\nout=\ninput=\nwhile [ $# -gt 0 ]; do\n  case \"$1\" in\n    --output) out=$2; shift 2 ;;\n    --recipient) shift 2 ;;\n    *) input=$1; shift ;;\n  esac\ndone\ncp \"$input\" \"$out\"\n"
	} else {
		body = "#!/bin/sh\necho 'age failed' >&2\nexit 1\n"
	}
	if err := os.WriteFile(path, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
}

func runBackupScript(t *testing.T, dataDir, work, command, status, root string, env []string, factory string) (int, string) {
	t.Helper()
	credentials := filepath.Join(root, "credentials")
	if err := os.WriteFile(credentials, []byte("[default]\naws_access_key_id = test-access\naws_secret_access_key = test-secret\n"), 0600); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(root, "invoke.py")
	if err := os.WriteFile(script, []byte(pythonInvoker), 0600); err != nil {
		t.Fatal(err)
	}
	argv, err := json.Marshal([]string{
		"--data-dir", dataDir,
		"--work-dir", work,
		"--backup-command", command,
		"--recipient", "age1testrecipientnotasecret",
		"--bucket-url", "https://example.r2.cloudflarestorage.com/sploot-recovery",
		"--credentials", credentials,
		"--status-file", status,
	})
	if err != nil {
		t.Fatal(err)
	}
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	runner := filepath.Join(wd, "..", "..", "scripts", "backup-remote.py")
	cmd := exec.Command("python3", script, runner, string(argv), factory)
	cmd.Env = append(os.Environ(), env...)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return 0, string(out)
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), string(out)
	}
	t.Fatal(err)
	return 1, string(out)
}

const pythonInvoker = `import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("backup_remote", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
argv = json.loads(sys.argv[2])
kind = sys.argv[3]

class UploadError:
    def upload_file(self, *args, **kwargs):
        raise RuntimeError("upload refused")
    def head_object(self, **kwargs):
        raise AssertionError("head after failed upload")

class ReceiptMismatch:
    def upload_file(self, *args, **kwargs):
        return None
    def head_object(self, **kwargs):
        return {"Metadata": {"sha256": "not-the-local-digest"}, "ContentLength": 1}

def factory(args):
    if kind == "upload":
        return UploadError(), object()
    if kind == "receipt":
        return ReceiptMismatch(), object()
    raise AssertionError("unexpected storage client")

try:
    if kind:
        mod.main(argv, storage_factory=factory)
    else:
        mod.main(argv)
except SystemExit as exc:
    print(exc.code)
    sys.exit(1)
print("completed")
`

func readFailure(t *testing.T, status string) map[string]any {
	t.Helper()
	payload, err := os.ReadFile(status + ".failure")
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func treeAllocated(root string, block int64) (int64, error) {
	var sum int64
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		rounded, err := diskreserve.RoundUp(info.Size(), block)
		if err != nil {
			return err
		}
		sum, err = diskreserve.Add(sum, rounded)
		return err
	})
	return sum, err
}

func shellQuote(path string) string {
	return "'" + strings.ReplaceAll(path, "'", `'\''`) + "'"
}

func readLine(r io.Reader) (string, error) {
	var buf bytes.Buffer
	tmp := make([]byte, 1)
	for {
		n, err := r.Read(tmp)
		if n == 1 {
			if tmp[0] == '\n' {
				return buf.String(), nil
			}
			buf.WriteByte(tmp[0])
		}
		if err != nil {
			if buf.Len() > 0 && errors.Is(err, io.EOF) {
				return buf.String(), nil
			}
			return "", err
		}
	}
}
