// Package ctxio stops Read and Write once the caller's context is done.
//
// A blocked underlying syscall is not interrupted; the next operation returns
// ctx.Err() before touching the wrapped stream. Copies, decoders, and archive
// writers share this identity so cancellation cannot finish as a truncated
// success.
package ctxio

import (
	"context"
	"io"
)

// Reader returns r, except each Read fails with ctx.Err() after ctx is done.
func Reader(ctx context.Context, r io.Reader) io.Reader {
	return reader{ctx: ctx, reader: r}
}

// Writer returns w, except each Write fails with ctx.Err() after ctx is done.
func Writer(ctx context.Context, w io.Writer) io.Writer {
	return writer{ctx: ctx, writer: w}
}

type reader struct {
	ctx    context.Context
	reader io.Reader
}

func (r reader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}

type writer struct {
	ctx    context.Context
	writer io.Writer
}

func (w writer) Write(buffer []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	return w.writer.Write(buffer)
}
