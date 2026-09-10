package ingest

import (
	"bytes"
	"context"
	"errors"
	"image/jpeg"
	"os/exec"
	"time"
)

// PrepareImportedPoster runs the same constrained decoder as uploads against an
// already privately staged original. It never modifies that original. Importers
// must independently validate and retain its byte receipt before calling this.
func PrepareImportedPoster(ctx context.Context, filename, mime string) ([]byte, int, int, error) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		return nil, 0, 0, errors.New("FFmpeg is required for predecessor posters")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		return nil, 0, 0, errors.New("ffprobe is required for predecessor posters")
	}
	bounded, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	service := &Service{ffmpeg: ffmpeg, ffprobe: ffprobe}
	prepared, err := service.prepare(bounded, mediaFile{path: filename, mime: mime})
	if err != nil {
		return nil, 0, 0, err
	}
	if _, err := jpeg.DecodeConfig(bytes.NewReader(prepared.poster)); err != nil {
		return nil, 0, 0, errors.New("poster decoder did not produce a valid JPEG")
	}
	return prepared.poster, prepared.width, prepared.height, nil
}
