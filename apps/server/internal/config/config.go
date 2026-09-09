package config

import (
	"bufio"
	"crypto/rand"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Address             string
	BaseURL             string
	Environment         string
	Revision            string
	DataDirectory       string
	MediaDirectory      string
	ModelDirectory      string
	CursorSecret        []byte
	SentryDSN           string
	UploadsEnabled      bool
	EmbeddingsEnabled   bool
	RegistrationOpen    bool
	StorageLimitBytes   int64
	StorageReserveBytes int64
}

func Load(envFile string) (Config, error) {
	if envFile != "" {
		if err := loadFile(envFile); err != nil {
			return Config{}, err
		}
	}
	c := Config{
		Address:        os.Getenv("SPLOOT_LISTEN_ADDR"),
		BaseURL:        os.Getenv("SPLOOT_BASE_URL"),
		Environment:    os.Getenv("SPLOOT_DEPLOYMENT_ENV"),
		Revision:       os.Getenv("SPLOOT_DEPLOYMENT_COMMIT"),
		DataDirectory:  os.Getenv("SPLOOT_DATA_DIR"),
		ModelDirectory: os.Getenv("SPLOOT_MODEL_DIR"),
		SentryDSN:      os.Getenv("SENTRY_DSN"),
	}
	if c.Environment == "" {
		c.Environment = "development"
	}
	switch c.Environment {
	case "development", "test", "staging", "production":
	default:
		return c, errors.New("SPLOOT_DEPLOYMENT_ENV must be development, test, staging or production")
	}
	if c.Address == "" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "3001"
		}
		c.Address = net.JoinHostPort("127.0.0.1", port)
	}
	host, port, err := net.SplitHostPort(c.Address)
	if err != nil {
		return c, errors.New("SPLOOT_LISTEN_ADDR must contain a host and port")
	}
	if number, err := strconv.Atoi(port); err != nil || number < 1 || number > 65535 {
		return c, errors.New("listen port must be between 1 and 65535")
	}
	local := loopback(host)
	if c.BaseURL == "" && local {
		c.BaseURL = "http://" + c.Address
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" || (base.Path != "" && base.Path != "/") || (base.Scheme != "http" && base.Scheme != "https") {
		return c, errors.New("SPLOOT_BASE_URL must be an HTTP(S) origin without credentials, path or query")
	}
	if base.Scheme != "https" && (!local || !loopback(base.Hostname())) {
		return c, errors.New("non-loopback access requires an explicit HTTPS SPLOOT_BASE_URL")
	}
	if (c.Environment == "production" || c.Environment == "staging") && base.Scheme != "https" {
		return c, errors.New("hosted SPLOOT_BASE_URL requires HTTPS")
	}
	localRegistration := local && loopback(base.Hostname()) && (c.Environment == "development" || c.Environment == "test")
	if !localRegistration && os.Getenv("SPLOOT_REGISTRATION_OPEN") == "" {
		return c, errors.New("hosted access requires an explicit SPLOOT_REGISTRATION_OPEN=true or false")
	}
	base.Host = strings.ToLower(base.Host)
	base.Path = ""
	c.BaseURL = base.String()
	for _, setting := range []struct {
		name     string
		target   *int64
		fallback int64
	}{
		{"SPLOOT_STORAGE_LIMIT_BYTES", &c.StorageLimitBytes, 0},
		{"SPLOOT_STORAGE_RESERVE_BYTES", &c.StorageReserveBytes, 1 << 30},
	} {
		value, present := os.LookupEnv(setting.name)
		if !present {
			*setting.target = setting.fallback
			continue
		}
		number, err := strconv.ParseInt(value, 10, 64)
		if err != nil || number < 0 {
			return c, fmt.Errorf("%s must be a nonnegative integer byte count", setting.name)
		}
		*setting.target = number
	}
	if c.DataDirectory == "" {
		c.DataDirectory = filepath.Join(".sploot-local", "library")
	}
	c.DataDirectory, err = filepath.Abs(c.DataDirectory)
	if err != nil {
		return c, fmt.Errorf("resolve data directory: %w", err)
	}
	if err := os.MkdirAll(c.DataDirectory, 0700); err != nil {
		return c, fmt.Errorf("create persistent data directory: %w", err)
	}
	c.MediaDirectory = filepath.Join(c.DataDirectory, "media")
	if err := os.MkdirAll(c.MediaDirectory, 0700); err != nil {
		return c, fmt.Errorf("create media directory: %w", err)
	}
	if c.ModelDirectory == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return c, fmt.Errorf("locate model cache: %w", err)
		}
		c.ModelDirectory = filepath.Join(cache, "sploot", "models")
	}
	c.ModelDirectory, err = filepath.Abs(c.ModelDirectory)
	if err != nil {
		return c, fmt.Errorf("resolve model directory: %w", err)
	}
	for _, setting := range []struct {
		name     string
		target   *bool
		fallback bool
	}{
		{"SPLOOT_UPLOADS_ENABLED", &c.UploadsEnabled, true},
		{"SPLOOT_EMBEDDINGS_ENABLED", &c.EmbeddingsEnabled, true},
		{"SPLOOT_REGISTRATION_OPEN", &c.RegistrationOpen, localRegistration},
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
	c.CursorSecret, err = persistentSecret(filepath.Join(c.DataDirectory, "signing.key"))
	if err != nil {
		return c, err
	}
	return c, nil
}

func loopback(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func persistentSecret(path string) ([]byte, error) {
	read := func() ([]byte, error) {
		info, err := os.Lstat(path)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
			return nil, errors.New("signing.key must be a private regular file (0600)")
		}
		key, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if len(key) != 32 {
			return nil, errors.New("signing.key must contain exactly 32 bytes; restore the existing key rather than replacing library identity")
		}
		return key, nil
	}
	key, err := read()
	if err == nil {
		return key, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read persistent signing authority: %w", err)
	}
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".signing-*")
	if err != nil {
		return nil, fmt.Errorf("create signing authority: %w", err)
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(key)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		return nil, fmt.Errorf("persist signing authority: %w", errors.Join(writeErr, closeErr))
	}
	if err := os.Link(file.Name(), path); err != nil {
		if errors.Is(err, os.ErrExist) {
			return read()
		}
		return nil, fmt.Errorf("publish signing authority: %w", err)
	}
	return key, nil
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
		switch key {
		case "SPLOOT_LISTEN_ADDR", "SPLOOT_BASE_URL", "SPLOOT_DEPLOYMENT_ENV", "SPLOOT_DEPLOYMENT_COMMIT",
			"SPLOOT_DATA_DIR", "SPLOOT_MODEL_DIR", "SPLOOT_UPLOADS_ENABLED", "SPLOOT_EMBEDDINGS_ENABLED",
			"SPLOOT_REGISTRATION_OPEN", "SENTRY_DSN", "PORT":
		default:
			return fmt.Errorf("unsupported local application setting on line %d", line)
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
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
