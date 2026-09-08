package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/misty-step/sploot/apps/server/internal/config"
	"github.com/misty-step/sploot/apps/server/internal/httpapi"
	"github.com/misty-step/sploot/apps/server/internal/observability"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Sploot could not start or continue:", observability.ErrorKind(err))
		os.Exit(1)
	}
}

func run() error {
	envFile := flag.String("env-file", "", "Private (0600) environment file; values are never logged")
	flag.Parse()
	if flag.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	logger := observability.NewLogger()
	cfg, err := config.Load(*envFile)
	if err != nil {
		// Configuration errors name the missing setting, not its secret value.
		logger.Error("invalid configuration", "reason", err.Error())
		return err
	}
	if err := observability.Init(cfg.SentryDSN, cfg.Environment, cfg.Revision); err != nil {
		return errors.New("invalid Sentry configuration")
	}
	defer sentry.Flush(2 * time.Second)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return errors.New("invalid DATABASE_URL connection settings")
	}
	// Prisma requires this marker in pooled Neon URLs; it is not a PostgreSQL
	// startup parameter. Both runtimes continue to use the same DATABASE_URL.
	delete(poolConfig.ConnConfig.RuntimeParams, "pgbouncer")
	poolConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	poolConfig.ConnConfig.ConnectTimeout = 5 * time.Second
	poolConfig.ConnConfig.RuntimeParams["statement_timeout"] = "20000"
	poolConfig.ConnConfig.RuntimeParams["lock_timeout"] = "5000"
	poolConfig.MaxConns = 8
	poolConfig.MinConns = 0
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return err
	}
	defer pool.Close()
	app, err := httpapi.New(cfg, pool, logger)
	if err != nil {
		logger.Error("application initialization failed", "error", err)
		return err
	}
	defer app.Close()
	server := &http.Server{Addr: cfg.Address, Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	workerResult := make(chan error, 1)
	go func() { workerResult <- app.RunIndexing(ctx) }()
	serverResult := make(chan error, 1)
	go func() { serverResult <- server.ListenAndServe() }()
	logger.Info("Sploot listening", "address", cfg.Address, "environment", cfg.Environment, "commit", cfg.Revision)
	var failure error
	select {
	case <-ctx.Done():
	case err := <-serverResult:
		if !errors.Is(err, http.ErrServerClosed) {
			failure = err
		}
	case err := <-workerResult:
		if !errors.Is(err, context.Canceled) {
			failure = err
			if failure == nil {
				failure = errors.New("indexing executor stopped unexpectedly")
			}
		}
	}
	stop()
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdown); err != nil {
		server.Close()
		if failure == nil {
			failure = err
		}
	}
	if failure != nil {
		logger.Error("service stopped unexpectedly", "error", failure)
		observability.Capture(failure, "service_lifecycle")
	}
	return failure
}
