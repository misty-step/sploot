package diskreserve

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if os.Getenv("SPLOOT_DISKRESERVE_HELPER") == "hold" {
		os.Exit(runHoldHelper())
	}
	os.Exit(m.Run())
}

type holdHelperArgs struct {
	Ledger    string `json:"ledger"`
	Target    string `json:"target"`
	Bytes     int64  `json:"bytes"`
	Reserve   int64  `json:"reserve"`
	Device    uint64 `json:"device"`
	Available int64  `json:"available"`
}

func runHoldHelper() int {
	var args holdHelperArgs
	if err := json.Unmarshal([]byte(os.Getenv("SPLOOT_DISKRESERVE_HELPER_ARGS")), &args); err != nil {
		return 2
	}
	ledger, err := Open(args.Ledger, func() int64 { return args.Reserve }, func(string) (uint64, int64, error) {
		return args.Device, args.Available, nil
	})
	if err != nil {
		return 1
	}
	hold, err := ledger.Reserve(context.Background(), args.Target, args.Bytes)
	if err != nil {
		return 1
	}
	defer hold.Release()
	os.Stdout.WriteString("reserved\n")
	_, _ = os.Stdin.Read(make([]byte, 1))
	return 0
}

func testLedger(t *testing.T, reserve, available int64, device uint64) (*Ledger, string) {
	t.Helper()
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	ledger, err := Open(filepath.Join(root, "ledger"), func() int64 { return reserve }, func(string) (uint64, int64, error) {
		return device, available, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return ledger, target
}

func TestLowSpaceAndUnknownSpaceAdmitNothing(t *testing.T) {
	ledger, target := testLedger(t, 10, 20, 4)
	if _, err := ledger.Reserve(context.Background(), target, 11); !errors.Is(err, ErrInsufficientSpace) {
		t.Fatalf("low space error: %v", err)
	}
	if holds := holdCount(t, ledger); holds != 0 {
		t.Fatalf("refused admission left %d records", holds)
	}
	ledger.SetProbe(func(string) (uint64, int64, error) { return 0, 0, errors.New("stat failed") })
	if _, err := ledger.Reserve(context.Background(), target, 1); !errors.Is(err, ErrSpaceUnknown) {
		t.Fatalf("unknown space error: %v", err)
	}
	if holds := holdCount(t, ledger); holds != 0 {
		t.Fatalf("unknown space left %d records", holds)
	}
	ledger.SetProbe(func(string) (uint64, int64, error) { return 4, 20, nil })
	hold, err := ledger.Reserve(context.Background(), target, 10)
	if err != nil {
		t.Fatal(err)
	}
	hold.Release()
}

func TestSimultaneousReservationsCannotExceedBudget(t *testing.T) {
	ledger, target := testLedger(t, 0, 100, 5)
	release := make(chan struct{})
	results := make(chan bool, 2)
	start := make(chan struct{})
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			hold, err := ledger.Reserve(context.Background(), target, 60)
			results <- err == nil
			if err == nil {
				<-release
				hold.Release()
			}
		}()
	}
	close(start)
	accepted := 0
	for range 2 {
		if <-results {
			accepted++
		}
	}
	if accepted != 1 || ledger.PeakHeld(5) != 60 {
		t.Fatalf("overlapping 60-byte claims on a 100-byte budget: accepted=%d peak=%d", accepted, ledger.PeakHeld(5))
	}
	close(release)
	group.Wait()
}

func TestReservationsAreScopedToTheTargetFilesystem(t *testing.T) {
	root := t.TempDir()
	first := filepath.Join(root, "a")
	second := filepath.Join(root, "b")
	if err := os.Mkdir(first, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(second, 0700); err != nil {
		t.Fatal(err)
	}
	ledger, err := Open(filepath.Join(root, "ledger"), func() int64 { return 0 }, func(target string) (uint64, int64, error) {
		if filepath.Base(target) == "a" {
			return 1, 50, nil
		}
		return 2, 50, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	left, err := ledger.Reserve(context.Background(), first, 50)
	if err != nil {
		t.Fatal(err)
	}
	defer left.Release()
	right, err := ledger.Reserve(context.Background(), second, 50)
	if err != nil {
		t.Fatal(err)
	}
	defer right.Release()
	if _, err := ledger.Reserve(context.Background(), first, 1); !errors.Is(err, ErrInsufficientSpace) {
		t.Fatalf("same filesystem ignored the existing claim: %v", err)
	}
}

func TestCanceledWaitLeavesNoReservation(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	unblock := make(chan struct{})
	var once sync.Once
	ledger, err := Open(filepath.Join(root, "ledger"), func() int64 { return 0 }, func(string) (uint64, int64, error) {
		once.Do(func() { close(started) })
		<-unblock
		return 9, 100, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	type outcome struct {
		hold *Hold
		err  error
	}
	first := make(chan outcome, 1)
	go func() {
		hold, err := ledger.Reserve(context.Background(), target, 10)
		first <- outcome{hold, err}
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("admission did not reach the space probe")
	}
	ctx, cancel := context.WithCancel(context.Background())
	second := make(chan outcome, 1)
	go func() {
		hold, err := ledger.Reserve(ctx, target, 10)
		second <- outcome{hold, err}
	}()
	time.Sleep(50 * time.Millisecond)
	cancel()
	got := <-second
	if !errors.Is(got.err, context.Canceled) || got.hold != nil {
		t.Fatalf("canceled admission: %+v", got)
	}
	close(unblock)
	owner := <-first
	if owner.err != nil {
		t.Fatal(owner.err)
	}
	owner.hold.Release()
	if holds := holdCount(t, ledger); holds != 0 {
		t.Fatalf("cancellation or release left %d records", holds)
	}
}

func TestProcessDeathReleasesReservation(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	ledgerDir := filepath.Join(root, "ledger")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal(holdHelperArgs{Ledger: ledgerDir, Target: target, Bytes: 80, Reserve: 0, Device: 12, Available: 80})
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), "SPLOOT_DISKRESERVE_HELPER=hold", "SPLOOT_DISKRESERVE_HELPER_ARGS="+string(args))
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stdin = nil
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(stdout)
	line, err := reader.ReadString('\n')
	if err != nil || line != "reserved\n" {
		t.Fatalf("helper did not admit: %q %v", line, err)
	}
	if err := cmd.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = cmd.Wait()
	_ = stdin.Close()
	ledger, err := Open(ledgerDir, func() int64 { return 0 }, func(string) (uint64, int64, error) {
		return 12, 80, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	hold, err := ledger.Reserve(context.Background(), target, 80)
	if err != nil {
		t.Fatalf("process death stranded the reservation: %v", err)
	}
	hold.Release()
}

func TestParentDeathReleasesReservation(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	ledgerDir := filepath.Join(root, "ledger")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal(holdHelperArgs{Ledger: ledgerDir, Target: target, Bytes: 70, Reserve: 0, Device: 13, Available: 70})
	script := filepath.Join(root, "parent.py")
	body := "import os, signal, subprocess, sys\n" +
		"env = os.environ.copy()\n" +
		"env['SPLOOT_DISKRESERVE_HELPER'] = 'hold'\n" +
		"env['SPLOOT_DISKRESERVE_HELPER_ARGS'] = sys.argv[2]\n" +
		"proc = subprocess.Popen([sys.argv[1], '-test.run=^$'], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE)\n" +
		"line = proc.stdout.readline()\n" +
		"if line != b'reserved\\n':\n" +
		"    raise SystemExit('helper did not admit')\n" +
		"print(proc.pid, flush=True)\n" +
		"os.kill(os.getpid(), signal.SIGKILL)\n"
	if err := os.WriteFile(script, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("python3", script, os.Args[0], string(args))
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(out)
	line, err := reader.ReadString('\n')
	if err != nil {
		_ = cmd.Wait()
		t.Fatalf("parent did not report the holder: %v", err)
	}
	_ = cmd.Wait()
	var pid int
	if _, err := fmtSscan(line, &pid); err != nil || pid <= 0 {
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
	ledger, err := Open(ledgerDir, func() int64 { return 0 }, func(string) (uint64, int64, error) {
		return 13, 70, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	hold, err := ledger.Reserve(context.Background(), target, 70)
	if err != nil {
		t.Fatalf("parent death stranded the reservation: %v", err)
	}
	hold.Release()
}

func TestStaleRecordIsReapedAndLiveCorruptionFailsClosed(t *testing.T) {
	ledger, target := testLedger(t, 0, 40, 8)
	stale := filepath.Join(ledger.holds, "0123456789abcdef0123456789abcdef")
	if err := os.WriteFile(stale, encodeRecord(8, 40), 0600); err != nil {
		t.Fatal(err)
	}
	hold, err := ledger.Reserve(context.Background(), target, 40)
	if err != nil {
		t.Fatalf("stale reservation was still charged: %v", err)
	}
	hold.Release()
	if _, err := os.Lstat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("stale reservation file was not reaped")
	}
	corrupt := filepath.Join(ledger.holds, "abcdef0123456789abcdef0123456789")
	file, err := os.OpenFile(corrupt, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := file.WriteString("not-a-record\n"); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX); err != nil {
		t.Fatal(err)
	}
	defer syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
	if _, err := ledger.Reserve(context.Background(), target, 1); !errors.Is(err, ErrSpaceUnknown) {
		t.Fatalf("corrupt live reservation was admitted over: %v", err)
	}
}

func holdCount(t *testing.T, ledger *Ledger) int {
	t.Helper()
	entries, err := os.ReadDir(ledger.holds)
	if err != nil {
		t.Fatal(err)
	}
	return len(entries)
}

func fmtSscan(line string, pid *int) (int, error) {
	n, err := parsePID(line)
	*pid = n
	if err != nil {
		return 0, err
	}
	return 1, nil
}

func parsePID(line string) (int, error) {
	n := 0
	for _, r := range line {
		if r < '0' || r > '9' {
			if n == 0 {
				return 0, errors.New("no pid")
			}
			return n, nil
		}
		n = n*10 + int(r-'0')
	}
	if n == 0 {
		return 0, errors.New("no pid")
	}
	return n, nil
}
