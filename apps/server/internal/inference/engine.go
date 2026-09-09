// Package inference runs pinned, account-free CLIP encoders on the local CPU.
// No user text or media leaves the process. Only immutable artifact preparation
// uses the network, and a prepared installation can run entirely offline.
package inference

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"path/filepath"
	"runtime"

	ort "github.com/yalue/onnxruntime_go"
)

const Dimension = 512

// ModelVersion identifies both exact encoder files and their preprocessing.
// Change it whenever weights, quantization, tokenizer, or preprocessing change;
// persisted image/query vectors of different versions must never be compared.
const ModelVersion = "xenova-clip-vit-base-patch32-d15189d7028b43f1d3e65039190477f6af591c2a-quantized-clip-v1"

type Options struct {
	Directory string
	Logger    *slog.Logger
}

// The binding owns one process-global ONNX environment. One cancellable gate
// protects its lifecycle and serializes ALL native execution across engines.
// This also bounds decoding memory and native work to one request at a time.
var nativeGate = make(chan struct{}, 1)
var nativeUsers int

type Engine struct {
	text      *ort.AdvancedSession
	vision    *ort.AdvancedSession
	input     *ort.Tensor[int64]
	pixels    *ort.Tensor[float32]
	output    *ort.Tensor[float32]
	values    []ort.Value
	pins      runtime.Pinner
	tokenizer *tokenizer
	processor imageProcessor
	closed    bool
}

func New(ctx context.Context, opts Options) (*Engine, error) {
	bundle, err := prepare(ctx, opts)
	if err != nil {
		return nil, err
	}
	tokenizer, err := loadTokenizer(filepath.Join(bundle.directory, "tokenizer.json"))
	if err != nil {
		return nil, err
	}
	if err := enterNative(ctx); err != nil {
		return nil, err
	}
	defer leaveNative()
	if nativeUsers == 0 {
		ort.SetSharedLibraryPath(bundle.library)
		if err := ort.InitializeEnvironment(ort.WithLogLevelWarning()); err != nil {
			return nil, fmt.Errorf("initialize local ONNX Runtime %s at %s (Linux requires glibc, libstdc++, libgcc; no GPU installation is needed): %w", bundle.runtimeVersion, bundle.library, err)
		}
		if ort.GetVersion() != bundle.runtimeVersion {
			actual := ort.GetVersion()
			ort.DestroyEnvironment()
			return nil, fmt.Errorf("ONNX Runtime ABI mismatch: loaded %s, expected %s", actual, bundle.runtimeVersion)
		}
		if err := ort.DisableTelemetry(); err != nil {
			ort.DestroyEnvironment()
			return nil, fmt.Errorf("disable ONNX Runtime telemetry: %w", err)
		}
	}
	nativeUsers++
	engine := &Engine{tokenizer: tokenizer}
	complete := false
	defer func() {
		if !complete {
			engine.closeNative()
		}
	}()
	options, err := ort.NewSessionOptions()
	if err != nil {
		return nil, fmt.Errorf("create CPU inference session options: %w", err)
	}
	defer options.Destroy()
	threads := max(1, min(4, runtime.GOMAXPROCS(0)))
	for _, err := range []error{
		options.SetIntraOpNumThreads(threads),
		options.SetInterOpNumThreads(1),
		options.SetExecutionMode(ort.ExecutionModeSequential),
		options.SetGraphOptimizationLevel(ort.GraphOptimizationLevelEnableAll),
		options.AddSessionConfigEntry("session.intra_op.allow_spinning", "0"),
		options.AddSessionConfigEntry("session.inter_op.allow_spinning", "0"),
	} {
		if err != nil {
			return nil, fmt.Errorf("configure bounded CPU inference: %w", err)
		}
	}
	if engine.input, err = allocateTensor[int64](engine, ort.NewShape(1, contextLength)); err != nil {
		return nil, err
	}
	if engine.pixels, err = allocateTensor[float32](engine, ort.NewShape(1, 3, imageSide, imageSide)); err != nil {
		return nil, err
	}
	if engine.output, err = allocateTensor[float32](engine, ort.NewShape(1, Dimension)); err != nil {
		return nil, err
	}
	if engine.text, err = ort.NewAdvancedSession(filepath.Join(bundle.directory, "text_model_quantized.onnx"), []string{"input_ids"}, []string{"text_embeds"}, []ort.Value{engine.input}, []ort.Value{engine.output}, options); err != nil {
		return nil, fmt.Errorf("load pinned CLIP text encoder: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if engine.vision, err = ort.NewAdvancedSession(filepath.Join(bundle.directory, "vision_model_quantized.onnx"), []string{"pixel_values"}, []string{"image_embeds"}, []ort.Value{engine.pixels}, []ort.Value{engine.output}, options); err != nil {
		return nil, fmt.Errorf("load pinned CLIP vision encoder: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.Info("local inference ready", "model", ModelVersion, "dimension", Dimension, "runtime", bundle.runtimeVersion, "provider", "CPUExecutionProvider", "threads", threads, "directory", bundle.directory)
	complete = true
	return engine, nil
}

func allocateTensor[T ort.TensorData](engine *Engine, shape ort.Shape) (*ort.Tensor[T], error) {
	data := make([]T, shape.FlattenedSize())
	// ONNX retains this Go allocation after the C call returns. Pin it until
	// every referring session and tensor has been destroyed, not just per Run.
	engine.pins.Pin(&data[0])
	tensor, err := ort.NewTensor(shape, data)
	if err != nil {
		return nil, fmt.Errorf("allocate reusable CLIP tensor: %w", err)
	}
	engine.values = append(engine.values, tensor)
	return tensor, nil
}

func (e *Engine) Text(ctx context.Context, text string) ([]float32, error) {
	if err := enterNative(ctx); err != nil {
		return nil, err
	}
	defer leaveNative()
	if e.closed {
		return nil, fmt.Errorf("local inference engine is closed")
	}
	if err := e.tokenizer.encode(text, e.input.GetData()); err != nil {
		return nil, err
	}
	return e.run(ctx, e.text)
}

func (e *Engine) Image(ctx context.Context, path string) ([]float32, error) {
	if err := enterNative(ctx); err != nil {
		return nil, err
	}
	defer leaveNative()
	if e.closed {
		return nil, fmt.Errorf("local inference engine is closed")
	}
	if err := e.processor.load(ctx, path, e.pixels.GetData()); err != nil {
		return nil, err
	}
	return e.run(ctx, e.vision)
}

func (e *Engine) run(ctx context.Context, session *ort.AdvancedSession) ([]float32, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	// The pinned Go binding has no RunOptions/terminate API. Do not detach an
	// uninterruptible C call or release its tensors on cancellation. Finish the
	// one fixed-size, thread-bounded run, then discard canceled output. Waiting
	// requests and image decoding are cancellable without starting native work.
	err := session.Run()
	if canceled := ctx.Err(); canceled != nil {
		return nil, canceled
	}
	if err != nil {
		return nil, fmt.Errorf("local CLIP inference: %w", err)
	}
	data := e.output.GetData()
	norm := 0.0
	for _, value := range data {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
			return nil, fmt.Errorf("local CLIP returned a non-finite embedding")
		}
		norm += float64(value) * float64(value)
	}
	if norm < 1e-20 {
		return nil, fmt.Errorf("local CLIP returned a zero embedding")
	}
	inverse := 1 / math.Sqrt(norm)
	result := make([]float32, Dimension)
	for i, value := range data {
		result[i] = float32(float64(value) * inverse)
	}
	return result, nil
}

func enterNative(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case nativeGate <- struct{}{}:
		if err := ctx.Err(); err != nil {
			leaveNative()
			return err
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func leaveNative() {
	<-nativeGate
}

// Close waits for in-flight native work before freeing buffers and sessions.
// It is safe to call repeatedly or concurrently with Text/Image/another Close.
func (e *Engine) Close() error {
	nativeGate <- struct{}{}
	defer leaveNative()
	return e.closeNative()
}

func (e *Engine) closeNative() error {
	if e.closed {
		return nil
	}
	e.closed = true
	var failures []error
	if e.text != nil {
		failures = append(failures, e.text.Destroy())
	}
	if e.vision != nil {
		failures = append(failures, e.vision.Destroy())
	}
	for _, value := range e.values {
		failures = append(failures, value.Destroy())
	}
	e.pins.Unpin()
	e.values = nil
	e.tokenizer = nil
	e.processor = imageProcessor{}
	nativeUsers--
	if nativeUsers == 0 {
		failures = append(failures, ort.DestroyEnvironment())
	}
	return errors.Join(failures...)
}
