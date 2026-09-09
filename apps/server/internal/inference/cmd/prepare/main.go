// Command prepare provisions Sploot's pinned, account-free local model bundle.
// From apps/server: go run ./internal/inference/cmd/prepare -directory /path/to/models
// Optional -text and -image run real CPU inference and report cosine similarity.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"math"
	"os"
	"os/signal"
	"syscall"

	"github.com/misty-step/sploot/apps/server/internal/inference"
)

type vectorSummary struct {
	Dimension int       `json:"dimension"`
	Norm      float64   `json:"norm"`
	Preview   []float32 `json:"preview"`
}

type result struct {
	ModelVersion string         `json:"modelVersion"`
	Directory    string         `json:"directory,omitempty"`
	Prepared     bool           `json:"prepared"`
	Provider     string         `json:"provider,omitempty"`
	Text         *vectorSummary `json:"text,omitempty"`
	Image        *vectorSummary `json:"image,omitempty"`
	Cosine       *float64       `json:"cosine,omitempty"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Local inference preparation failed:", err)
		os.Exit(1)
	}
}

func run() error {
	directory := flag.String("directory", "", "model cache root (default: operating-system cache/sploot/models)")
	text := flag.String("text", "", "run a fresh text embedding after preparation")
	image := flag.String("image", "", "run an image embedding from a local JPEG/PNG/GIF/WebP poster")
	flag.Parse()
	if flag.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments; use -directory, -text, or -image")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	opts := inference.Options{Directory: *directory, Logger: slog.New(slog.NewJSONHandler(os.Stderr, nil))}
	output := result{ModelVersion: inference.ModelVersion}
	if *text == "" && *image == "" {
		path, err := inference.Prepare(ctx, opts)
		if err != nil {
			return err
		}
		output.Directory, output.Prepared = path, true
		return json.NewEncoder(os.Stdout).Encode(output)
	}
	engine, err := inference.New(ctx, opts)
	if err != nil {
		return err
	}
	defer engine.Close()
	output.Prepared, output.Provider = true, "CPUExecutionProvider"
	var textVector, imageVector []float32
	if *text != "" {
		textVector, err = engine.Text(ctx, *text)
		if err != nil {
			return err
		}
		output.Text = summarize(textVector)
	}
	if *image != "" {
		imageVector, err = engine.Image(ctx, *image)
		if err != nil {
			return err
		}
		output.Image = summarize(imageVector)
	}
	if textVector != nil && imageVector != nil {
		cosine := 0.0
		for i, value := range textVector {
			cosine += float64(value) * float64(imageVector[i])
		}
		output.Cosine = &cosine
	}
	if err := engine.Close(); err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(output)
}

func summarize(vector []float32) *vectorSummary {
	norm := 0.0
	for _, value := range vector {
		norm += float64(value) * float64(value)
	}
	return &vectorSummary{Dimension: len(vector), Norm: math.Sqrt(norm), Preview: vector[:min(8, len(vector))]}
}
