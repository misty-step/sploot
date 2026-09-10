package auth

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"
)

func inviteAccount(t *testing.T, s *Service, id, email string) Invitation {
	t.Helper()
	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	if err := CreateInvitedAccount(context.Background(), tx, User{ID: id, Email: email}, now, now); err != nil {
		t.Fatal(err)
	}
	invitation, err := IssueInvitation(context.Background(), tx, id, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return invitation
}

func TestInvitationCannotCrossOwnersOrResetExistingAccount(t *testing.T) {
	s, _ := authDatabase(t)
	operator := registerAccount(t, s, "operator@example.invalid")
	first := inviteAccount(t, s, "first", "first@example.invalid")
	second := inviteAccount(t, s, "second", "second@example.invalid")
	s.registrationOpen = false
	request := authRequest(http.MethodPost, "/api/auth/claim")
	if _, err := s.ClaimInvitation(request, second.UserID, first.Token, testPassword); err == nil {
		t.Fatal("foreign account consumed another owner's invitation")
	}
	if _, err := s.ClaimInvitation(sessionRequest(http.MethodPost, "/api/auth/claim", operator), first.UserID, first.Token, testPassword); err == nil {
		t.Fatal("claim switched an authenticated different account")
	}
	foreignOrigin := authRequest(http.MethodPost, "/api/auth/claim")
	foreignOrigin.Header.Set("Origin", "https://foreign.example")
	if _, err := s.ClaimInvitation(foreignOrigin, first.UserID, first.Token, testPassword); err == nil {
		t.Fatal("cross-origin claim succeeded")
	}
	if _, err := s.Login(authRequest(http.MethodPost, "/api/auth/login"), first.Email, testPassword); err == nil {
		t.Fatal("unclaimed account had a usable password")
	}
	session, err := s.ClaimInvitation(request, first.UserID, first.Token, testPassword)
	if err != nil {
		t.Fatalf("closed registration blocked valid invitation: %v", err)
	}
	if principal := browserPrincipal(t, s, session); principal.UserID != first.UserID {
		t.Fatal("claim authenticated the wrong owner")
	}
	if principal := browserPrincipal(t, s, operator); principal.UserID != operator.User.ID {
		t.Fatal("claim revoked unrelated operator session")
	}
	if _, err := s.ClaimInvitation(request, first.UserID, first.Token, "a different valid password"); err == nil {
		t.Fatal("used invitation reset a password")
	}
	if _, err := s.Login(authRequest(http.MethodPost, "/api/auth/login"), first.Email, testPassword); err != nil {
		t.Fatal("claimed password did not authenticate")
	}
	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := IssueInvitation(context.Background(), tx, first.UserID, time.Hour); err == nil {
		t.Fatal("operator invitation reset an activated account")
	}
}

func TestInvitationRejectsConflictingExplicitCredentials(t *testing.T) {
	for _, test := range []struct {
		name   string
		header string
		value  string
		status int
	}{
		{"owner header", "X-Sploot-User-ID", "invited", http.StatusConflict},
		{"malformed bearer", "Authorization", "Bearer invalid", http.StatusUnauthorized},
	} {
		t.Run(test.name, func(t *testing.T) {
			s, _ := authDatabase(t)
			operator := registerAccount(t, s, "operator@example.invalid")
			invitation := inviteAccount(t, s, "invited", "invited@example.invalid")
			request := sessionRequest(http.MethodPost, "/api/auth/claim", operator)
			request.Header.Set(test.header, test.value)
			_, err := s.ClaimInvitation(request, invitation.UserID, invitation.Token, testPassword)
			requireAPIStatus(t, err, test.status)
			if principal := browserPrincipal(t, s, operator); principal.UserID != operator.User.ID {
				t.Fatal("rejected claim changed the original browser session")
			}
			session, err := s.ClaimInvitation(authRequest(http.MethodPost, "/api/auth/claim"), invitation.UserID, invitation.Token, testPassword)
			if err != nil || session.User.ID != invitation.UserID {
				t.Fatalf("rejected claim consumed the invitation: %v", err)
			}
		})
	}
}

func TestInvitationRotationExpiryAndSingleConsumer(t *testing.T) {
	s, _ := authDatabase(t)
	invitation := inviteAccount(t, s, "claim-owner", "claim@example.invalid")
	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	rotated, err := IssueInvitation(context.Background(), tx, invitation.UserID, time.Hour)
	if err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	request := authRequest(http.MethodPost, "/api/auth/claim")
	if _, err := s.ClaimInvitation(request, invitation.UserID, invitation.Token, testPassword); err == nil {
		t.Fatal("rotated invitation remained usable")
	}
	if _, err := s.db.Exec(`UPDATE account_invitations SET expires_at=? WHERE user_id=?`, time.Now().Add(-time.Second), rotated.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ClaimInvitation(request, rotated.UserID, rotated.Token, testPassword); err == nil {
		t.Fatal("expired invitation remained usable")
	}
	tx, err = s.db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	rotated, err = IssueInvitation(context.Background(), tx, invitation.UserID, time.Hour)
	if err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	results := make(chan bool, 2)
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := s.ClaimInvitation(authRequest(http.MethodPost, "/api/auth/claim"), rotated.UserID, rotated.Token, testPassword)
			results <- err == nil
		}()
	}
	group.Wait()
	close(results)
	successes := 0
	for success := range results {
		if success {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("one-use invitation had %d successful consumers", successes)
	}
	if _, err := s.Login(authRequest(http.MethodPost, "/api/auth/login"), rotated.Email, testPassword); err != nil {
		t.Fatal("winning claim did not establish a working password")
	}
}
