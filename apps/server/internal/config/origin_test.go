package config

import (
	"errors"
	"testing"
)

func TestParseOriginIsTheCanonicalApplicationOrigin(t *testing.T) {
	for _, test := range []struct {
		name    string
		value   string
		want    string
		wantErr error
	}{
		{name: "https origin", value: "https://library.example", want: "https://library.example"},
		{name: "trailing slash is the origin", value: "https://Library.EXAMPLE/", want: "https://library.example"},
		{name: "loopback http", value: "http://127.0.0.1:3001", want: "http://127.0.0.1:3001"},
		{name: "localhost http is loopback", value: "HTTP://LOCALHOST:3001", want: "http://localhost:3001"},
		{name: "ipv6 loopback", value: "http://[::1]:3001", want: "http://[::1]:3001"},
		{name: "public http", value: "http://library.example", wantErr: ErrOriginRequiresHTTPS},
		{name: "credentials", value: "https://user:pass@library.example", wantErr: ErrOrigin},
		{name: "path", value: "https://library.example/app", wantErr: ErrOrigin},
		{name: "query", value: "https://library.example?next=/app", wantErr: ErrOrigin},
		{name: "empty query", value: "https://library.example?", wantErr: ErrOrigin},
		{name: "fragment", value: "https://library.example#claim", wantErr: ErrOrigin},
		{name: "missing host", value: "https://:443", wantErr: ErrOrigin},
		{name: "empty", value: "", wantErr: ErrOrigin},
	} {
		t.Run(test.name, func(t *testing.T) {
			origin, err := ParseOrigin(test.value)
			if test.wantErr != nil {
				if !errors.Is(err, test.wantErr) {
					t.Fatalf("ParseOrigin(%q)=%v, %v; want %v", test.value, origin, err, test.wantErr)
				}
				return
			}
			if err != nil || origin.String() != test.want {
				t.Fatalf("ParseOrigin(%q)=%q, %v; want %q", test.value, origin, err, test.want)
			}
		})
	}
}

func TestIsLoopbackHostMatchesListenAndOriginPolicy(t *testing.T) {
	for host, want := range map[string]bool{
		"localhost":       true,
		"LOCALHOST":       true,
		"127.0.0.1":       true,
		"::1":             true,
		"library.example": false,
		"8.8.8.8":         false,
		"foo.localhost":   false,
		"":                false,
	} {
		if got := IsLoopbackHost(host); got != want {
			t.Fatalf("IsLoopbackHost(%q)=%t, want %t", host, got, want)
		}
	}
}

func TestLoadNormalizesCanonicalOrigin(t *testing.T) {
	for _, key := range []string{
		"SPLOOT_LISTEN_ADDR", "SPLOOT_REDIRECT_HOSTS", "SPLOOT_DEPLOYMENT_ENV",
		"SPLOOT_UPLOADS_ENABLED", "SPLOOT_EMBEDDINGS_ENABLED", "SPLOOT_REGISTRATION_OPEN", "PORT",
	} {
		t.Setenv(key, "")
	}
	t.Setenv("SPLOOT_DATA_DIR", t.TempDir())
	t.Setenv("SPLOOT_MODEL_DIR", t.TempDir())
	t.Setenv("SPLOOT_BASE_URL", "http://127.0.0.1:3001/")
	cfg, err := Load("")
	if err != nil || cfg.BaseURL != "http://127.0.0.1:3001" {
		t.Fatalf("loopback origin slash was not stripped: baseURL=%q error=%v", cfg.BaseURL, err)
	}
	t.Setenv("SPLOOT_BASE_URL", "https://Library.EXAMPLE/")
	t.Setenv("SPLOOT_REGISTRATION_OPEN", "false")
	cfg, err = Load("")
	if err != nil || cfg.BaseURL != "https://library.example" {
		t.Fatalf("canonical origin was not normalized: baseURL=%q error=%v", cfg.BaseURL, err)
	}
}
