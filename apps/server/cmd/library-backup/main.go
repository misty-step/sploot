package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/misty-step/sploot/apps/server/internal/recovery"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	os.Exit(recovery.RunCLI(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
