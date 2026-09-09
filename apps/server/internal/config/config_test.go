package config

import (
	"os"
	"testing"
)

func TestRegistrationPolicyRequiresExplicitHostedEnrollment(t *testing.T) {
	for _, key := range []string{
		"SPLOOT_LISTEN_ADDR", "SPLOOT_BASE_URL", "SPLOOT_DEPLOYMENT_ENV",
		"SPLOOT_DEPLOYMENT_COMMIT", "SPLOOT_DATA_DIR", "SPLOOT_MODEL_DIR", "SENTRY_DSN",
		"SPLOOT_UPLOADS_ENABLED", "SPLOOT_EMBEDDINGS_ENABLED", "SPLOOT_REGISTRATION_OPEN", "PORT",
	} {
		t.Setenv(key, "")
	}
	for _, key := range []string{"SPLOOT_STORAGE_LIMIT_BYTES", "SPLOOT_STORAGE_RESERVE_BYTES"} {
		t.Setenv(key, "0")
	}
	for _, test := range []struct {
		name         string
		address      string
		baseURL      string
		environment  string
		registration string
		wantOpen     bool
		wantError    bool
	}{
		{name: "credential-free local development", wantOpen: true},
		{name: "local test over IPv6", address: "[::1]:3001", baseURL: "http://localhost:3001", environment: "test", wantOpen: true},
		{name: "local enrollment explicitly closed", registration: "false"},
		{name: "public reverse proxy in development", address: "127.0.0.1:3001", baseURL: "https://library.example", environment: "development", wantError: true},
		{name: "public reverse proxy in production", address: "127.0.0.1:3001", baseURL: "https://library.example", environment: "production", wantError: true},
		{name: "production with loopback origin", address: "127.0.0.1:3001", baseURL: "https://localhost:3001", environment: "production", wantError: true},
		{name: "staging with loopback origin", address: "127.0.0.1:3001", baseURL: "https://localhost:3001", environment: "staging", wantError: true},
		{name: "public listener with loopback origin", address: "0.0.0.0:3001", baseURL: "https://localhost:3001", environment: "development", wantError: true},
		{name: "hosted enrollment explicitly open", address: "127.0.0.1:3001", baseURL: "https://library.example", environment: "production", registration: "true", wantOpen: true},
		{name: "hosted enrollment explicitly closed", address: "127.0.0.1:3001", baseURL: "https://library.example", environment: "production", registration: "false"},
		{name: "hosted enrollment rejects invalid policy", address: "127.0.0.1:3001", baseURL: "https://library.example", environment: "production", registration: "enabled", wantError: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("SPLOOT_LISTEN_ADDR", test.address)
			t.Setenv("SPLOOT_BASE_URL", test.baseURL)
			t.Setenv("SPLOOT_DEPLOYMENT_ENV", test.environment)
			t.Setenv("SPLOOT_REGISTRATION_OPEN", test.registration)
			if test.registration == "" {
				if err := os.Unsetenv("SPLOOT_REGISTRATION_OPEN"); err != nil {
					t.Fatal(err)
				}
			}
			t.Setenv("SPLOOT_DATA_DIR", t.TempDir())
			t.Setenv("SPLOOT_MODEL_DIR", t.TempDir())
			cfg, err := Load("")
			if test.wantError {
				if err == nil {
					t.Fatalf("hosted exposure accepted an absent or invalid enrollment policy: registrationOpen=%t", cfg.RegistrationOpen)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if cfg.RegistrationOpen != test.wantOpen {
				t.Fatalf("registrationOpen=%t, want %t", cfg.RegistrationOpen, test.wantOpen)
			}
		})
	}
}

func TestStoragePolicyAcceptsExplicitZeroAndRejectsInvalidByteCounts(t *testing.T) {
	for _, key := range []string{"SPLOOT_LISTEN_ADDR", "SPLOOT_BASE_URL", "SPLOOT_DEPLOYMENT_ENV", "SPLOOT_UPLOADS_ENABLED", "SPLOOT_EMBEDDINGS_ENABLED", "SPLOOT_REGISTRATION_OPEN", "PORT"} {
		t.Setenv(key, "")
	}
	t.Setenv("SPLOOT_DATA_DIR", t.TempDir())
	t.Setenv("SPLOOT_MODEL_DIR", t.TempDir())
	for _, key := range []string{"SPLOOT_STORAGE_LIMIT_BYTES", "SPLOOT_STORAGE_RESERVE_BYTES"} {
		t.Setenv(key, "")
		if err := os.Unsetenv(key); err != nil {
			t.Fatal(err)
		}
	}
	cfg, err := Load("")
	if err != nil || cfg.StorageLimitBytes != 0 || cfg.StorageReserveBytes != 1<<30 {
		t.Fatalf("unset policy must have no account cap and retain the disk reserve: limit=%d reserve=%d error=%v", cfg.StorageLimitBytes, cfg.StorageReserveBytes, err)
	}
	t.Setenv("SPLOOT_STORAGE_LIMIT_BYTES", "2147483648")
	t.Setenv("SPLOOT_STORAGE_RESERVE_BYTES", "0")
	cfg, err = Load("")
	if err != nil || cfg.StorageLimitBytes != 2147483648 || cfg.StorageReserveBytes != 0 {
		t.Fatalf("explicit instance limit and zero reserve were not honored: limit=%d reserve=%d error=%v", cfg.StorageLimitBytes, cfg.StorageReserveBytes, err)
	}
	for _, key := range []string{"SPLOOT_STORAGE_LIMIT_BYTES", "SPLOOT_STORAGE_RESERVE_BYTES"} {
		for _, value := range []string{"-1", "9223372036854775808", "1GiB", ""} {
			t.Run(key+"/"+value, func(t *testing.T) {
				t.Setenv(key, value)
				if _, err := Load(""); err == nil {
					t.Fatalf("invalid storage policy %s=%q accepted", key, value)
				}
			})
		}
	}
}
