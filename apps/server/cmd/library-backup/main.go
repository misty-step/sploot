package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

const usage = `library-backup: private full-database and original/thumbnail recovery

  library-backup backup --directory NEW [media options]
  library-backup resume --directory SNAPSHOT [media options]
  library-backup verify --directory SNAPSHOT
  library-backup restore --directory SNAPSHOT --target-url-file PRIVATE_FILE --media-directory NEW
  library-backup verify --directory SNAPSHOT --target-url-file PRIVATE_FILE --media-directory RESTORED

Source authority: backup reads DATABASE_URL only. Supply a direct PostgreSQL URL
with permission to read every table. The source is always read-only; resume and
snapshot-only verify never connect to it. No Blob credentials are needed for
public delivery URLs. New directories must be outside every repository tree;
their parent must exist. Snapshots contain private account data and executable
SQL: retain them in approved private storage and restore only trusted archives.

Media options:
  --fixture-directory ROOT       Read reserved QA-host paths under ROOT; for
                                 Next QA seed use apps/web/public, for Go use
                                 its ingestion media directory.
  --allow-media-host HOST         Additional exact HTTPS delivery hostname;
                                 repeat for provider-neutral public replicas.
  --workers N                    Concurrent objects, 1..16 (default 4).
  --max-object-bytes N            Hard per-object byte ceiling (default 1 GiB).
  --object-timeout DURATION       Entire object deadline (default 5m).

All commands:
  --timeout DURATION              Overall deadline (default 2h).
  --allow-remote-target           Explicit opt-in for an isolated nonlocal
                                 restore/verification target; never the source.

Restore requires pg_restore and a fresh empty database with a DIFFERENT name
from the source, on loopback by default. Install pgvector on that PostgreSQL
server, but do not pre-create its extension in the empty target database.
PRIVATE_FILE must be a current-user-owned mode0600 regular file containing only
the explicit target URL. URLs and credentials are never printed or put in argv.
pg_dump/pg_restore must be compatible with the source archive/server version.

Recovery: failed media downloads resume from SHA-verified per-object receipts.
A failed database snapshot has no database-ready manifest: choose a NEW snapshot
directory. Restore never retries into a populated database, never drops objects,
and never uses --clean. If restore committed but proof was interrupted, the
verify command with target/media arguments rechecks it and writes the local
verified receipt. Otherwise use another new empty target and media directory.
`

type repeatedHosts []string

func (v *repeatedHosts) String() string         { return "" }
func (v *repeatedHosts) Set(value string) error { *v = append(*v, value); return nil }

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

func run(ctx context.Context, args []string, output, diagnostic io.Writer) int {
	if len(args) == 0 || args[0] == "--help" || args[0] == "help" {
		fmt.Fprint(output, usage)
		return 0
	}
	command := args[0]
	if command != "backup" && command != "resume" && command != "verify" && command != "restore" {
		fmt.Fprintln(diagnostic, "configuration: expected backup, resume, verify, or restore; use --help")
		return 2
	}
	flags := flag.NewFlagSet("library-backup", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	directory := flags.String("directory", "", "snapshot directory")
	fixtureDirectory := flags.String("fixture-directory", "", "local fixture media root")
	workers := flags.Int("workers", 4, "media concurrency")
	maxBytes := flags.Int64("max-object-bytes", 1<<30, "per-object byte bound")
	objectTimeout := flags.Duration("object-timeout", 5*time.Minute, "per-object deadline")
	timeout := flags.Duration("timeout", 2*time.Hour, "overall deadline")
	targetFile := flags.String("target-url-file", "", "private target URL file")
	mediaDirectory := flags.String("media-directory", "", "isolated restored media directory")
	allowRemote := flags.Bool("allow-remote-target", false, "allow explicit nonlocal target")
	var allowedHosts repeatedHosts
	flags.Var(&allowedHosts, "allow-media-host", "additional exact HTTPS delivery host")
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprint(output, usage)
			return 0
		}
		fmt.Fprintln(diagnostic, "configuration: invalid command flags; values withheld for privacy; use --help")
		return 2
	}
	if flags.NArg() != 0 || *directory == "" || *timeout <= 0 || *timeout > 7*24*time.Hour {
		fmt.Fprintln(diagnostic, "configuration: explicit --directory and a timeout greater than zero and at most 168h are required; no positional values accepted")
		return 2
	}
	if command == "backup" || command == "resume" {
		if *targetFile != "" || *mediaDirectory != "" || *allowRemote {
			fmt.Fprintln(diagnostic, "configuration: target flags are only valid for restore or target verification")
			return 2
		}
	} else if *fixtureDirectory != "" || len(allowedHosts) > 0 {
		fmt.Fprintln(diagnostic, "configuration: provider and fixture access is only valid for backup or resume")
		return 2
	}
	if command == "restore" && (*targetFile == "" || *mediaDirectory == "") || command == "verify" && ((*targetFile == "") != (*mediaDirectory == "")) || *allowRemote && *targetFile == "" {
		fmt.Fprintln(diagnostic, "configuration: target operations require both --target-url-file and --media-directory")
		return 2
	}
	ctx, cancel := context.WithTimeout(ctx, *timeout)
	defer cancel()
	var manifest recovery.Manifest
	var err error
	if command == "backup" || command == "resume" {
		options := recovery.Options{Directory: *directory, FixtureDirectory: *fixtureDirectory, AllowMediaHosts: allowedHosts, Workers: *workers, MaxObjectBytes: *maxBytes, ObjectTimeout: *objectTimeout}
		if command == "backup" {
			options.DatabaseURL = os.Getenv("DATABASE_URL")
			manifest, err = recovery.Backup(ctx, options)
		} else {
			manifest, err = recovery.Resume(ctx, options)
		}
	} else if *targetFile != "" {
		var target string
		target, err = readTargetURL(*targetFile)
		if err == nil {
			options := recovery.RestoreOptions{Directory: *directory, TargetURL: target, MediaDirectory: *mediaDirectory, AllowRemote: *allowRemote}
			if command == "restore" {
				manifest, err = recovery.Restore(ctx, options)
			} else {
				manifest, err = recovery.VerifyRestore(ctx, options)
			}
		}
	} else {
		manifest, err = recovery.Verify(ctx, *directory)
	}
	if err != nil {
		fmt.Fprintln(diagnostic, err)
		return 1
	}
	fmt.Fprintf(output, "%s verified: snapshot=%s assets=%d objects=%d media_bytes=%d\n", command, manifest.ID, manifest.AssetCount, manifest.ObjectCount, manifest.MediaBytes)
	return 0
}

func readTargetURL(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0600 || info.Size() > 64<<10 {
		return "", errors.New("restore-safety: target URL file must be a private mode0600 regular file no larger than 64 KiB")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(stat.Uid) != os.Geteuid() {
		return "", errors.New("restore-safety: target URL file must belong to the current user")
	}
	value, err := os.ReadFile(path)
	if err != nil {
		return "", errors.New("restore-safety: cannot read explicit target URL file")
	}
	return strings.TrimSpace(string(value)), nil
}
