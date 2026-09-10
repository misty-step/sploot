package predecessor

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"time"
)

func RunCLI(ctx context.Context, args []string, output io.Writer) error {
	if len(args) == 0 {
		return errors.New("choose import-predecessor or invite-owner")
	}
	flags := flag.NewFlagSet("sploot "+args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	baseURL := flags.String("base-url", "", "Canonical HTTPS origin for private claim links")
	claimsFile := flags.String("claims-file", "", "New mode0600 claim-link file outside library/archive/repository")
	lifetime := flags.Duration("invitation-lifetime", 24*time.Hour, "Invitation validity, one minute to seven days")
	var options Options
	var dataDirectory, userID *string
	switch args[0] {
	case "import-predecessor":
		flags.StringVar(&options.CaptureDirectory, "capture-directory", "", "Complete private capture root containing capture.json")
		flags.StringVar(&options.BaseDirectory, "base-directory", "", "Offline native base clone; never mutated")
		flags.StringVar(&options.MappingFile, "mapping-file", "", "Explicit full source-owner mapping JSON")
		flags.StringVar(&options.TargetDirectory, "target-data-dir", "", "New isolated native library path")
		flags.StringVar(&options.ArchiveDirectory, "archive-directory", "", "New separate retained source archive path")
	case "invite-owner":
		dataDirectory = flags.String("data-dir", "", "Offline native library containing the unclaimed account")
		userID = flags.String("user-id", "", "Exact existing unclaimed native account ID")
	default:
		return errors.New("unknown predecessor operator command")
	}
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			flags.SetOutput(output)
			flags.PrintDefaults()
			return nil
		}
		return errors.New("invalid operator arguments; use --help")
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected operator arguments; use --help")
	}
	if args[0] == "invite-owner" {
		if err := InviteOwner(ctx, *dataDirectory, *userID, *baseURL, *claimsFile, *lifetime); err != nil {
			return err
		}
		_, err := fmt.Fprintln(output, "Invitation issued to the private claim-link file; no email was sent.")
		return err
	}
	options.BaseURL, options.ClaimsFile, options.InvitationLifetime = *baseURL, *claimsFile, *lifetime
	report, err := Import(ctx, options)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(output, "Import complete: %d source identities, %d new accounts, %d assets. Native library and separate source archive retained; invitation links are only in the private output file.\n", report.Owners, report.NewAccounts, len(report.Assets))
	return err
}
