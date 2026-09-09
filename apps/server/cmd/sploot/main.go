package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/misty-step/sploot/apps/server/internal/config"
	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/embedding"
	"github.com/misty-step/sploot/apps/server/internal/httpapi"
	"github.com/misty-step/sploot/apps/server/internal/inference"
	"github.com/misty-step/sploot/apps/server/internal/observability"
	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "Sploot:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) > 0 {
		switch args[0] {
		case "serve":
			args = args[1:]
		case "doctor":
			return doctor(args[1:])
		case "backup", "resume", "verify", "restore":
			if recovery.RunCLI(context.Background(), args, os.Stdout, os.Stderr) != 0 {
				return errors.New("recovery operation failed; existing library data was not replaced")
			}
			return nil
		}
	}
	flags := flag.NewFlagSet("sploot serve", flag.ContinueOnError)
	envFile := flags.String("env-file", "", "Optional private environment file (0600); process settings take precedence")
	dataDir := flags.String("data-dir", "", "Persistent library directory; never deleted on exit")
	modelDir := flags.String("model-dir", "", "Cache directory for pinned local model/runtime files")
	address := flags.String("listen", "", "Listen address (default 127.0.0.1:3001)")
	baseURL := flags.String("base-url", "", "Canonical browser/API origin; HTTPS required off loopback")
	port := flags.String("port", "", "Loopback port, an alternative to --listen")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments; use serve, doctor, backup, verify or restore")
	}
	if *port != "" && *address != "" {
		return errors.New("choose --port or --listen, not both")
	}
	if *port != "" {
		*address = net.JoinHostPort("127.0.0.1", *port)
	}
	for name, value := range map[string]string{
		"SPLOOT_DATA_DIR": *dataDir, "SPLOOT_MODEL_DIR": *modelDir,
		"SPLOOT_LISTEN_ADDR": *address, "SPLOOT_BASE_URL": *baseURL,
	} {
		if value != "" {
			if err := os.Setenv(name, value); err != nil {
				return err
			}
		}
	}
	cfg, err := config.Load(*envFile)
	if err != nil {
		return err
	}
	if cfg.Revision == "" {
		cfg.Revision = revision()
	}
	logger := observability.NewLogger()
	if err := observability.Init(cfg.SentryDSN, cfg.Environment, cfg.Revision); err != nil {
		return errors.New("invalid optional Sentry configuration")
	}
	defer sentry.Flush(2 * time.Second)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	listener, err := net.Listen("tcp", cfg.Address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w; choose another --port or stop the service already using it", cfg.Address, err)
	}
	defer listener.Close()
	db, err := database.Open(ctx, cfg.DataDirectory)
	if err != nil {
		return fmt.Errorf("open persistent library: %w", err)
	}
	defer db.Close()
	app, err := httpapi.New(cfg, db, logger, nil)
	if err != nil {
		return fmt.Errorf("initialize application: %w", err)
	}
	defer app.Close()
	return serve(ctx, listener, app, cfg, logger, func(ctx context.Context) (nativeEngine, error) {
		engine, err := inference.New(ctx, inference.Options{Directory: cfg.ModelDirectory, Logger: logger})
		if err != nil {
			return nil, err
		}
		return engine, nil
	})
}

type nativeEngine interface {
	embedding.Engine
	Close() error
}

type preparationResult struct {
	engine nativeEngine
	err    error
}

// serve owns the preparation/executor/HTTP lifetime. Its caller closes the
// application and database only after every task and request has been joined.
func serve(ctx context.Context, listener net.Listener, app *httpapi.Server, cfg config.Config, logger *slog.Logger, prepare func(context.Context) (nativeEngine, error)) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var requests sync.WaitGroup
	var requestsMu sync.Mutex
	accepting := true
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestsMu.Lock()
		if !accepting {
			requestsMu.Unlock()
			http.Error(w, "Sploot is shutting down", http.StatusServiceUnavailable)
			return
		}
		requests.Add(1)
		requestsMu.Unlock()
		defer requests.Done()
		app.ServeHTTP(w, r)
	})
	server := &http.Server{
		Handler: handler, BaseContext: func(net.Listener) context.Context { return ctx },
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second,
		IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10,
	}
	serverResult := make(chan error, 1)
	go func() { serverResult <- server.Serve(listener) }()
	var prepared chan preparationResult
	if cfg.EmbeddingsEnabled {
		prepared = make(chan preparationResult, 1)
		logger.Info("preparing local search", "model_directory", cfg.ModelDirectory, "first_start", "missing pinned artifacts download automatically; the saved library is available while preparation runs")
		go func() {
			engine, err := prepare(ctx)
			prepared <- preparationResult{engine: engine, err: err}
		}()
	}
	logger.Info("Sploot library ready", "url", cfg.BaseURL, "data_directory", cfg.DataDirectory, "registration_open", cfg.RegistrationOpen, "commit", cfg.Revision)
	fmt.Printf("\nSploot: %s\nLibrary: %s\nAccounts and media persist after stopping this process.\n\n", cfg.BaseURL, cfg.DataDirectory)
	var engine nativeEngine
	var workerResult chan error
	var failure error
serveLoop:
	for {
		select {
		case <-ctx.Done():
			break serveLoop
		case err := <-serverResult:
			serverResult = nil
			if !errors.Is(err, http.ErrServerClosed) {
				failure = err
			}
			break serveLoop
		case result := <-prepared:
			prepared = nil
			engine = result.engine
			if ctx.Err() != nil {
				break serveLoop
			}
			if result.err == nil {
				result.err = app.SetInferenceEngine(engine)
			}
			if result.err != nil {
				app.MarkInferenceUnavailable()
				logger.Error("local search unavailable; saved library remains available; repair the model installation and restart Sploot (no automatic preparation retry)", "error", result.err)
				observability.Capture(result.err, "inference_preparation")
				continue
			}
			workerResult = make(chan error, 1)
			go func() { workerResult <- app.RunIndexing(ctx) }()
			logger.Info("local search ready; resuming saved indexing work")
		case err := <-workerResult:
			workerResult = nil
			if ctx.Err() != nil {
				break serveLoop
			}
			if err == nil {
				err = errors.New("indexing executor stopped unexpectedly")
			}
			app.MarkInferenceUnavailable()
			logger.Error("local search stopped; saved library remains available; repair the reported failure and restart Sploot", "error", err)
			observability.Capture(err, "indexing_lifecycle")
		}
	}
	cancel()
	// Seal request admission before Wait: Server.Close does not join handlers,
	// and a canceled native session.Run may still own buffers after the deadline.
	requestsMu.Lock()
	accepting = false
	requestsMu.Unlock()
	shutdown, stopShutdown := context.WithTimeout(context.Background(), 20*time.Second)
	if err := server.Shutdown(shutdown); err != nil {
		_ = server.Close()
		failure = errors.Join(failure, err)
	}
	stopShutdown()
	if serverResult != nil {
		if err := <-serverResult; err != nil && !errors.Is(err, http.ErrServerClosed) {
			failure = errors.Join(failure, err)
		}
	}
	if prepared != nil {
		result := <-prepared
		engine = result.engine
	}
	if workerResult != nil {
		if err := <-workerResult; err != nil && !errors.Is(err, context.Canceled) {
			failure = errors.Join(failure, err)
		}
	}
	requests.Wait()
	if engine != nil {
		failure = errors.Join(failure, engine.Close())
	}
	if failure != nil {
		logger.Error("service stopped unexpectedly", "error", failure)
		observability.Capture(failure, "service_lifecycle")
	}
	return failure
}

func revision() string {
	value := "development"
	modified := false
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				value = setting.Value
			case "vcs.modified":
				modified = setting.Value == "true"
			}
		}
	}
	if modified {
		value += "-modified"
	}
	return value
}

func doctor(args []string) error {
	flags := flag.NewFlagSet("sploot doctor", flag.ContinueOnError)
	origin := flags.String("url", "http://127.0.0.1:3001", "Running Sploot origin")
	asJSON := flags.Bool("json", false, "Emit machine-readable readiness without credentials or private library data")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	base, err := url.Parse(*origin)
	if err != nil || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" || (base.Path != "" && base.Path != "/") || (base.Scheme != "http" && base.Scheme != "https") {
		return errors.New("--url must be an HTTP(S) origin without credentials")
	}
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Get(strings.TrimSuffix(base.String(), "/") + "/api/health/services")
	if err != nil {
		return fmt.Errorf("local application is unreachable at %s; start pnpm dev or select --url", base.Host)
	}
	defer response.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result); err != nil {
		return errors.New("application readiness returned an invalid response")
	}
	if *asJSON {
		if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
			return err
		}
	} else {
		fmt.Printf("Sploot at %s: %v\n", base.Host, result["status"])
	}
	if response.StatusCode != http.StatusOK || result["status"] != "ok" {
		return errors.New("application readiness failed")
	}
	return nil
}
