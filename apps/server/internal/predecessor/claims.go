package predecessor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/database"
)

func claimOrigin(value string) (*url.URL, error) {
	uri, err := url.Parse(value)
	if err != nil || uri.Host == "" || uri.User != nil || uri.Path != "" || uri.RawQuery != "" || uri.Fragment != "" || uri.Scheme != "https" && uri.Scheme != "http" {
		return nil, reject("claim_origin")
	}
	if uri.Scheme == "http" {
		ip := net.ParseIP(uri.Hostname())
		if uri.Hostname() != "localhost" && (ip == nil || !ip.IsLoopback()) {
			return nil, reject("claim_origin_requires_https")
		}
	}
	return uri, nil
}

func writeClaims(baseURL, filename string, invitations []auth.Invitation) error {
	origin, err := claimOrigin(baseURL)
	if err != nil {
		return err
	}
	path, err := newOutputPath(filename)
	if err != nil {
		return err
	}
	root, _, err := privateDirectory(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer root.Close()
	type claimLink struct {
		UserID    string    `json:"userId"`
		Email     string    `json:"email"`
		URL       string    `json:"url"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	output := struct {
		Schema      string      `json:"schema"`
		Invitations []claimLink `json:"invitations"`
	}{Schema: "sploot.account-invitations.v1", Invitations: []claimLink{}}
	for _, invitation := range invitations {
		fragment := url.Values{"userId": {invitation.UserID}, "email": {invitation.Email}, "token": {invitation.Token}}.Encode()
		link := origin.String() + "/claim#" + fragment
		output.Invitations = append(output.Invitations, claimLink{UserID: invitation.UserID, Email: invitation.Email, URL: link, ExpiresAt: invitation.ExpiresAt})
	}
	encoded, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return reject("invitation_encoding")
	}
	_, _, err = writePrivate(root, filepath.Base(path), bytes.NewReader(append(encoded, '\n')))
	if err != nil {
		return reject("invitation_file")
	}
	return nil
}

// InviteOwner is an explicit offline operator action, not a registration or
// password-reset service. Existing activated users can never receive a claim.
func InviteOwner(ctx context.Context, directory, userID, baseURL, filename string, lifetime time.Duration) error {
	if _, err := claimOrigin(baseURL); err != nil {
		return err
	}
	if !safeID.MatchString(userID) {
		return reject("invitation_account")
	}
	root, path, err := privateDirectory(directory)
	if err != nil {
		return err
	}
	defer root.Close()
	if err := requireOfflineDatabase(root); err != nil {
		return err
	}
	output, err := newOutputPath(filename)
	if err != nil {
		return err
	}
	if output == path || within(output, path) {
		return reject("invitation_output_must_be_separate")
	}
	db, err := database.Open(ctx, path)
	if err != nil {
		return reject("invitation_database")
	}
	defer db.Close()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return reject("invitation_transaction")
	}
	defer tx.Rollback()
	invitation, err := auth.IssueInvitation(ctx, tx, userID, lifetime)
	if err != nil {
		return err
	}
	if err := writeClaims(baseURL, output, []auth.Invitation{invitation}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		_ = os.Remove(output)
		return errors.New("invitation transaction did not commit")
	}
	return nil
}

func within(path, root string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && filepath.IsLocal(relative)
}
