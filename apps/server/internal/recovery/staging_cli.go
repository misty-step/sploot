package recovery

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"

	"github.com/misty-step/sploot/apps/server/internal/diskreserve"
)

func runStagingBytes(args []string, output, diagnostic io.Writer) int {
	flags := flag.NewFlagSet("staging-bytes", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dataDir := flags.String("data-dir", "", "live library directory")
	target := flags.String("target", "", "directory that will receive snapshot staging")
	if flags.Parse(args) != nil || flags.NArg() != 0 || *dataDir == "" || *target == "" {
		fmt.Fprintln(diagnostic, "staging-bytes requires --data-dir and --target.")
		return 2
	}
	estimate, err := StagingBytes(*dataDir, *target)
	if err != nil {
		fmt.Fprintln(diagnostic, "staging size could not be estimated")
		return 1
	}
	fmt.Fprintln(output, estimate)
	return 0
}

func runReserve(ctx context.Context, args []string, output, diagnostic io.Writer) int {
	// The parent is the backup runner. If it dies, this process must not keep
	// the claim: stdin closes with the parent, and on Linux its death also
	// signals this process.
	if err := adoptParentDeathSignal(); err != nil {
		fmt.Fprintln(diagnostic, "staging reservation failed")
		return 1
	}
	flags := flag.NewFlagSet("reserve", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	ledgerDir := flags.String("ledger", "", "shared reservation directory")
	target := flags.String("target", "", "directory that will receive the write")
	bytes := flags.Int64("bytes", -1, "bytes to reserve")
	reserve := flags.Int64("reserve-bytes", -1, "operating reserve that must remain free")
	if flags.Parse(args) != nil || flags.NArg() != 0 || *ledgerDir == "" || *target == "" || *bytes < 0 || *reserve < 0 {
		fmt.Fprintln(diagnostic, "reserve requires --ledger, --target, --bytes and --reserve-bytes.")
		return 2
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		cancel()
	}()
	ledger, err := diskreserve.Open(*ledgerDir, func() int64 { return *reserve }, probeFromEnvironment())
	if err != nil {
		fmt.Fprintln(diagnostic, "free disk space could not be checked")
		return 1
	}
	hold, err := ledger.Reserve(ctx, *target, *bytes)
	if err != nil {
		if errors.Is(err, diskreserve.ErrInsufficientSpace) {
			fmt.Fprintln(diagnostic, "not enough free disk to stage a backup without using the configured reserve")
			return 1
		}
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			fmt.Fprintln(diagnostic, "staging reservation was interrupted")
			return 1
		}
		fmt.Fprintln(diagnostic, "free disk space could not be checked")
		return 1
	}
	defer hold.Release()
	if ctx.Err() != nil {
		return 1
	}
	fmt.Fprintln(output, "reserved")
	if file, ok := output.(*os.File); ok {
		_ = file.Sync()
	}
	<-ctx.Done()
	return 0
}

// probeFromEnvironment is a test seam. Production and development ignore it.
// Tests set SPLOOT_DEPLOYMENT_ENV=test and SPLOOT_DISKRESERVE_PROBE=device=N,available=N
// so admission can be refused without filling a disk.
func probeFromEnvironment() diskreserve.Probe {
	if os.Getenv("SPLOOT_DEPLOYMENT_ENV") != "test" {
		return nil
	}
	raw := os.Getenv("SPLOOT_DISKRESERVE_PROBE")
	if raw == "" {
		return nil
	}
	var device uint64
	var available int64
	var sawDevice, sawAvailable bool
	for _, field := range splitComma(raw) {
		key, value, ok := splitOnce(field, "=")
		if !ok {
			return func(string) (uint64, int64, error) { return 0, 0, diskreserve.ErrSpaceUnknown }
		}
		switch key {
		case "device":
			parsed, err := strconv.ParseUint(value, 10, 64)
			if err != nil {
				return func(string) (uint64, int64, error) { return 0, 0, diskreserve.ErrSpaceUnknown }
			}
			device, sawDevice = parsed, true
		case "available":
			parsed, err := strconv.ParseInt(value, 10, 64)
			if err != nil || parsed < 0 {
				return func(string) (uint64, int64, error) { return 0, 0, diskreserve.ErrSpaceUnknown }
			}
			available, sawAvailable = parsed, true
		default:
			return func(string) (uint64, int64, error) { return 0, 0, diskreserve.ErrSpaceUnknown }
		}
	}
	if !sawDevice || !sawAvailable {
		return func(string) (uint64, int64, error) { return 0, 0, diskreserve.ErrSpaceUnknown }
	}
	return func(string) (uint64, int64, error) { return device, available, nil }
}

func splitComma(value string) []string {
	var fields []string
	start := 0
	for i := 0; i <= len(value); i++ {
		if i == len(value) || value[i] == ',' {
			fields = append(fields, value[start:i])
			start = i + 1
		}
	}
	return fields
}

func splitOnce(value, sep string) (string, string, bool) {
	for i := 0; i+len(sep) <= len(value); i++ {
		if value[i:i+len(sep)] == sep {
			return value[:i], value[i+len(sep):], true
		}
	}
	return "", "", false
}
