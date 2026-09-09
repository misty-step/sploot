package recovery

import (
	"context"
	"flag"
	"fmt"
	"io"
	"time"
)

const Usage = `library-backup: private SQLite and original/poster recovery

  backup --data-dir LIVE --directory NEW_SNAPSHOT
  resume --data-dir LIVE --directory SNAPSHOT
  verify --directory SNAPSHOT
  restore --directory SNAPSHOT --target-data-dir SEPARATE_EMPTY_TARGET
  verify --directory SNAPSHOT --target-data-dir RESTORED_TARGET

The same commands are available as sploot backup/resume/verify/restore.
No ambient DATABASE_URL or remote storage credentials are used.
Snapshot destinations must be new private directories outside Git repositories;
their parent must exist. Restore targets must be absent or empty mode0700
directories, separate from the live library and snapshot, outside Git repositories.
Restore is staged and published atomically, never over an existing library.

Backup uses SQLite's online snapshot API, then copies immutable originals and
posters with byte-count/SHA-256 checks. Resume keeps that frozen database and
reuses verified objects, repairing missing or corrupt copies from LIVE/media.
Original filenames, all accounts, password hashes, tags, trash, receipts and
indexing metadata are retained. Browser/device sessions, pairing requests,
upload tokens and auth attempts are removed from the portable copy; the signing
secret is excluded. Restored users sign in with their passwords and pair again.
Protect snapshots like the live library; restore only trusted snapshots.

Options:
  --max-object-bytes N   Per-object bound for backup/resume (default upload limit + poster bound).
  --object-timeout D     Per-object copy deadline (default 5m, range 1s..1h).
  --timeout D            Whole operation deadline (default 2h, maximum 7 days).

verify --target-data-dir checks exact parity before starting the restored server.
Once that server accepts new writes it is intentionally no longer a snapshot.
`

// RunCLI is shared by library-backup and the primary sploot executable. It never
// prints raw SQLite errors or private source paths from driver diagnostics.
func RunCLI(ctx context.Context, args []string, output, diagnostic io.Writer) int {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" {
		fmt.Fprint(output, Usage)
		return 0
	}
	command := args[0]
	if command != "backup" && command != "resume" && command != "verify" && command != "restore" {
		fmt.Fprintln(diagnostic, "Choose backup, resume, verify or restore. Use --help for usage.")
		return 2
	}
	flags := flag.NewFlagSet("library-backup", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	directory := flags.String("directory", "", "snapshot directory")
	dataDirectory := flags.String("data-dir", "", "live library directory")
	target := flags.String("target-data-dir", "", "separate restored data directory")
	maxBytes := flags.Int64("max-object-bytes", 0, "per-object byte bound")
	objectTimeout := flags.Duration("object-timeout", 5*time.Minute, "per-object copy deadline")
	timeout := flags.Duration("timeout", 2*time.Hour, "overall deadline")
	parseErr := flags.Parse(args[1:])
	if parseErr == flag.ErrHelp {
		fmt.Fprint(output, Usage)
		return 0
	}
	if parseErr != nil || flags.NArg() != 0 || *directory == "" || *timeout <= 0 || *timeout > 7*24*time.Hour {
		fmt.Fprintln(diagnostic, "Invalid arguments. Use --help for required paths and bounds.")
		return 2
	}
	if (command == "backup" || command == "resume") && (*dataDirectory == "" || *target != "") || (command == "restore" || command == "verify") && *dataDirectory != "" || command == "restore" && *target == "" {
		fmt.Fprintln(diagnostic, "Supply an explicit live directory for backup/resume, or a separate target for restore.")
		return 2
	}
	ctx, cancel := context.WithTimeout(ctx, *timeout)
	defer cancel()
	var manifest Manifest
	var err error
	switch command {
	case "backup", "resume":
		options := Options{DataDirectory: *dataDirectory, Directory: *directory, MaxObjectBytes: *maxBytes, ObjectTimeout: *objectTimeout}
		if command == "backup" {
			manifest, err = Backup(ctx, options)
		} else {
			manifest, err = Resume(ctx, options)
		}
	case "restore":
		manifest, err = Restore(ctx, RestoreOptions{Directory: *directory, TargetDataDirectory: *target})
	case "verify":
		if *target == "" {
			manifest, err = Verify(ctx, *directory)
		} else {
			manifest, err = VerifyRestore(ctx, RestoreOptions{Directory: *directory, TargetDataDirectory: *target})
		}
	}
	if err != nil {
		if phase, ok := err.(*PhaseError); ok {
			fmt.Fprintln(diagnostic, phase.Error())
		} else {
			fmt.Fprintln(diagnostic, "Recovery stopped: operation failed or was interrupted; no successful verification was recorded.")
		}
		return 1
	}
	fmt.Fprintf(output, "%s verified: snapshot=%s assets=%d objects=%d media_bytes=%d\n", command, manifest.ID, manifest.AssetCount, manifest.ObjectCount, manifest.MediaBytes)
	return 0
}
