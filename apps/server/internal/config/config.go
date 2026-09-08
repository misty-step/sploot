package config

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/misty-step/sploot/apps/server/internal/contract"
)

type Config struct {
	Address                  string
	BaseURL                  string
	Environment              string
	Revision                 string
	DatabaseURL              string
	ClerkSecretKey           string
	ClerkPublishableKey      string
	ClerkAuthorizedParties   []string
	QALocalSecret            string
	QALocalUserID            string
	CursorSecret             []byte
	BlobToken                string
	ReplicateToken           string
	MediaDirectory           string
	RestoredLibraryDirectory string
	SentryDSN                string
	UploadsEnabled           bool
	EmbeddingsEnabled        bool
	CostAdmissionHalted      bool
	StripeBootstrapRequired  bool
	EmbeddingDailyBudget     int
}

func Load(envFile string) (Config, error) {
	if envFile != "" {
		if err := loadFile(envFile); err != nil {
			return Config{}, err
		}
	}
	c := Config{
		Address: os.Getenv("SPLOOT_LISTEN_ADDR"), BaseURL: os.Getenv("NEXT_PUBLIC_BASE_URL"),
		Environment: os.Getenv("SPLOOT_DEPLOYMENT_ENV"), Revision: os.Getenv("SPLOOT_DEPLOYMENT_COMMIT"),
		DatabaseURL: os.Getenv("DATABASE_URL"), ClerkSecretKey: os.Getenv("CLERK_SECRET_KEY"),
		ClerkPublishableKey: os.Getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
		QALocalSecret:       os.Getenv("SPLOOT_QA_AUTH_SECRET"), QALocalUserID: os.Getenv("SPLOOT_QA_USER_ID"),
		BlobToken: os.Getenv("BLOB_READ_WRITE_TOKEN"), ReplicateToken: os.Getenv("REPLICATE_API_TOKEN"),
		MediaDirectory: os.Getenv("SPLOOT_MEDIA_DIRECTORY"), RestoredLibraryDirectory: os.Getenv("SPLOOT_RESTORED_LIBRARY_DIRECTORY"),
		SentryDSN: os.Getenv("SENTRY_DSN"),
	}
	if c.Environment == "" {
		c.Environment = "development"
	}
	if c.Environment != "development" && c.Environment != "test" && c.Environment != "staging" && c.Environment != "production" {
		return c, errors.New("SPLOOT_DEPLOYMENT_ENV must be development, test, staging or production")
	}
	hosted := c.Environment == "production" || c.Environment == "staging"
	if c.Address == "" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "3001"
		}
		host := "127.0.0.1"
		if hosted {
			host = "0.0.0.0"
		}
		c.Address = net.JoinHostPort(host, port)
	}
	if _, port, err := net.SplitHostPort(c.Address); err != nil {
		return c, errors.New("SPLOOT_LISTEN_ADDR must contain a host and port")
	} else if number, err := strconv.Atoi(port); err != nil || number < 1 || number > 65535 {
		return c, errors.New("listen port must be between 1 and 65535")
	}
	if c.BaseURL == "" && !hosted {
		c.BaseURL = "http://" + c.Address
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" || (base.Path != "" && base.Path != "/") || (base.Scheme != "http" && base.Scheme != "https") {
		return c, errors.New("NEXT_PUBLIC_BASE_URL must be an HTTP(S) origin without credentials, path or query")
	}
	c.BaseURL = strings.TrimSuffix(c.BaseURL, "/")
	if hosted && base.Scheme != "https" {
		return c, errors.New("hosted NEXT_PUBLIC_BASE_URL requires HTTPS")
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required; the server never derives database authority from another variable")
	}
	database, err := url.Parse(c.DatabaseURL)
	if err != nil || (database.Scheme != "postgres" && database.Scheme != "postgresql") || database.Hostname() == "" || database.Path == "" {
		return c, errors.New("DATABASE_URL must be an explicit Postgres connection URL")
	}
	if strings.Contains(database.Hostname(), "neon.tech") && strings.Contains(database.Hostname(), "-pooler") && database.Query().Get("pgbouncer") != "true" {
		return c, errors.New("pooled Neon DATABASE_URL requires pgbouncer=true")
	}
	if os.Getenv("SPLOOT_QA_AUTH_MODE") != "enabled" {
		c.QALocalSecret, c.QALocalUserID = "", ""
	}
	if hosted && (c.QALocalSecret != "" || c.QALocalUserID != "" || c.MediaDirectory != "" || c.RestoredLibraryDirectory != "") {
		return c, errors.New("hosted environments reject local QA auth and filesystem media modes")
	}
	if hosted && (c.ClerkSecretKey == "" || c.ClerkPublishableKey == "" || c.Revision == "" || c.SentryDSN == "") {
		return c, errors.New("hosted runtime requires Clerk keys, SPLOOT_DEPLOYMENT_COMMIT and SENTRY_DSN")
	}
	if c.Environment == "production" && (!strings.HasPrefix(c.ClerkSecretKey, "sk_live_") || !strings.HasPrefix(c.ClerkPublishableKey, "pk_live_")) {
		return c, errors.New("production requires matching live Clerk keys")
	}
	for _, party := range strings.Split(os.Getenv("CLERK_AUTHORIZED_PARTIES"), ",") {
		if party = strings.TrimSpace(party); party != "" {
			c.ClerkAuthorizedParties = append(c.ClerkAuthorizedParties, party)
		}
	}
	secret := os.Getenv("SEARCH_CURSOR_SECRET")
	if secret == "" {
		secret = c.ClerkSecretKey
	}
	if secret == "" && !hosted {
		secret = c.QALocalSecret
	}
	if len(secret) < 32 {
		return c, errors.New("a 32-byte cursor signing authority is required (SEARCH_CURSOR_SECRET, Clerk key or local QA secret)")
	}
	c.CursorSecret = []byte(secret)
	for _, setting := range []struct {
		name     string
		target   *bool
		fallback bool
	}{
		{"SPLOOT_UPLOADS_ENABLED", &c.UploadsEnabled, true}, {"SPLOOT_EMBEDDINGS_ENABLED", &c.EmbeddingsEnabled, true},
		{"SPLOOT_COST_ADMISSION_HALT", &c.CostAdmissionHalted, false}, {"STRIPE_LEDGER_BOOTSTRAP_REQUIRED", &c.StripeBootstrapRequired, false},
	} {
		value := os.Getenv(setting.name)
		if value == "" {
			*setting.target = setting.fallback
			continue
		}
		if value != "true" && value != "false" {
			return c, fmt.Errorf("%s must be true or false", setting.name)
		}
		*setting.target = value == "true"
	}
	c.EmbeddingDailyBudget = contract.EmbeddingGlobalDailyAttempts
	if value := os.Getenv("EMBEDDING_DAILY_BUDGET"); value != "" {
		budget, err := strconv.Atoi(value)
		if err != nil || budget < 1 || budget > contract.EmbeddingGlobalDailyAttempts {
			return c, errors.New("EMBEDDING_DAILY_BUDGET may only lower the versioned positive attempt ceiling")
		}
		c.EmbeddingDailyBudget = budget
	}
	return c, nil
}

func loadFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open environment file: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return errors.New("environment file must be a private regular file (0600)")
	}
	scanner := bufio.NewScanner(file)
	for line := 1; scanner.Scan(); line++ {
		text := strings.TrimSpace(scanner.Text())
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		key, value, ok := strings.Cut(strings.TrimPrefix(text, "export "), "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" || strings.ContainsAny(key, " \t\r\n") {
			return fmt.Errorf("invalid environment assignment on line %d", line)
		}
		value = strings.TrimSpace(value)
		if strings.HasPrefix(value, "\"") {
			value, err = strconv.Unquote(value)
			if err != nil {
				return fmt.Errorf("invalid quoted environment value on line %d", line)
			}
		} else if strings.HasPrefix(value, "'") {
			if len(value) < 2 || !strings.HasSuffix(value, "'") {
				return fmt.Errorf("unterminated environment value on line %d", line)
			}
			value = value[1 : len(value)-1]
		}
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("set environment assignment on line %d", line)
		}
	}
	return scanner.Err()
}
