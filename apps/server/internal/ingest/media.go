package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/misty-step/sploot/apps/server/internal/contract"
)

const maxPosterBytes = 2 * 1024 * 1024
const maxDecodedPixels = 64 * 1024 * 1024

type mediaFile struct {
	path     string
	size     int64
	checksum string
	mime     string
}

type preparedMedia struct {
	poster         []byte
	posterChecksum string
	width          int
	height         int
}

func normalizeMIME(value string) string {
	value, _, _ = strings.Cut(value, ";")
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "image/jpg" {
		return "image/jpeg"
	}
	return value
}

func extension(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	}
	return ""
}

func safeFilename(value, mime string) string {
	value = filepath.Base(strings.ReplaceAll(value, "\\", "/"))
	value = strings.TrimSuffix(value, filepath.Ext(value))
	var name strings.Builder
	for _, r := range value {
		if name.Len() >= 96 {
			break
		}
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.' {
			name.WriteRune(r)
		} else {
			name.WriteByte('-')
		}
	}
	base := strings.Trim(name.String(), ".-_")
	if base == "" {
		base = "meme"
	}
	return base + extension(mime)
}

// spool hashes the original bytes; neither decoding nor poster creation ever
// replaces this file. HTTP callers must also set their request read deadline.
func spool(ctx context.Context, directory string, reader io.Reader, mime string) (mediaFile, error) {
	if reader == nil {
		return mediaFile{}, invalid("The upload has no file")
	}
	file, err := os.CreateTemp(directory, "original-*"+extension(mime))
	if err != nil {
		return mediaFile{}, err
	}
	defer file.Close()
	if closer, ok := reader.(io.ReadCloser); ok {
		stop := context.AfterFunc(ctx, func() { _ = closer.Close() })
		defer stop()
	}
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(contextReader{ctx, reader}, int64(contract.UploadMaxBytes)+1))
	if err != nil {
		return mediaFile{}, err
	}
	if n > int64(contract.UploadMaxBytes) {
		return mediaFile{}, tooLarge()
	}
	if n == 0 {
		return mediaFile{}, invalid("The upload is empty")
	}
	if err := ctx.Err(); err != nil {
		return mediaFile{}, err
	}
	var header [512]byte
	read, err := file.ReadAt(header[:], 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return mediaFile{}, err
	}
	if normalizeMIME(http.DetectContentType(header[:read])) != mime {
		return mediaFile{}, invalid("The file bytes do not match a supported media type")
	}
	return mediaFile{path: file.Name(), size: n, checksum: hex.EncodeToString(hash.Sum(nil)), mime: mime}, nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}

// FFmpeg is forced to a media demuxer, never a playlist or a network protocol.
// A byte limit alone cannot bound decompressed dimensions or decoder work.
func (s *Service) prepare(ctx context.Context, original mediaFile) (preparedMedia, error) {
	var format string
	switch original.mime {
	case "image/jpeg":
		format = "jpeg_pipe"
	case "image/png":
		format = "png_pipe"
	case "image/webp":
		format = "webp_pipe"
	case "image/gif":
		format = "gif"
	case "video/mp4":
		format = "mov"
	case "video/webm":
		format = "matroska"
	default:
		return preparedMedia{}, invalid("Unsupported media decoder")
	}
	input := []string{"-protocol_whitelist", "file,pipe", "-max_alloc", "67108864", "-threads", "1", "-f", format}
	if original.mime == "video/mp4" {
		input = append(input, "-enable_drefs", "0", "-use_absolute_path", "0")
	}
	probeArgs := append([]string{"-v", "error"}, input...)
	probeArgs = append(probeArgs, "-probesize", fmt.Sprint(contract.UploadMaxBytes), "-analyzeduration", "5000000", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", original.path)
	probe := exec.CommandContext(ctx, s.ffprobe, probeArgs...)
	probe.WaitDelay = processWaitDelay
	var output limitedBuffer
	output.limit = 16 * 1024
	probe.Stdout = &output
	if err := probe.Run(); err != nil {
		if ctx.Err() != nil {
			return preparedMedia{}, ctx.Err()
		}
		return preparedMedia{}, invalid("The media could not be decoded")
	}
	var metadata struct {
		Streams []struct {
			Width    int `json:"width"`
			Height   int `json:"height"`
			SideData []struct {
				Rotation int `json:"rotation"`
			} `json:"side_data_list"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(output.Bytes(), &metadata); err != nil || len(metadata.Streams) != 1 {
		return preparedMedia{}, invalid("The media has no readable image or video stream")
	}
	stream := metadata.Streams[0]
	width, height := stream.Width, stream.Height
	if width <= 0 || height <= 0 || width > 16384 || height > 16384 || int64(width)*int64(height) > maxDecodedPixels {
		return preparedMedia{}, invalid("The decoded media dimensions are too large or invalid")
	}
	for _, side := range stream.SideData {
		if side.Rotation%180 != 0 {
			width, height = height, width
			break
		}
	}
	posterWidth, posterHeight := width, height
	if width > 768 || height > 768 {
		if width >= height {
			posterWidth, posterHeight = 768, max(1, height*768/width)
		} else {
			posterWidth, posterHeight = max(1, width*768/height), 768
		}
	}
	args := append([]string{"-hide_banner", "-loglevel", "error", "-nostdin"}, input...)
	args = append(args, "-i", original.path, "-map", "0:v:0", "-an", "-sn", "-dn", "-frames:v", "1", "-filter_threads", "1", "-vf", fmt.Sprintf("scale=%d:%d,setsar=1", posterWidth, posterHeight), "-threads", "1", "-c:v", "mjpeg", "-q:v", "3", "-f", "image2pipe", "pipe:1")
	command := exec.CommandContext(ctx, s.ffmpeg, args...)
	command.WaitDelay = processWaitDelay
	var poster limitedBuffer
	poster.limit = maxPosterBytes
	command.Stdout = &poster
	if err := command.Run(); err != nil || poster.Len() == 0 {
		if ctx.Err() != nil {
			return preparedMedia{}, ctx.Err()
		}
		return preparedMedia{}, invalid("A reusable poster could not be generated from the media")
	}
	sum := sha256.Sum256(poster.Bytes())
	return preparedMedia{poster: poster.Bytes(), posterChecksum: hex.EncodeToString(sum[:]), width: width, height: height}, nil
}

type limitedBuffer struct {
	buffer bytes.Buffer
	limit  int
}

func (b *limitedBuffer) Bytes() []byte { return b.buffer.Bytes() }
func (b *limitedBuffer) Len() int      { return b.buffer.Len() }
func (b *limitedBuffer) Write(value []byte) (int, error) {
	if len(value) > b.limit-b.Len() {
		return 0, errors.New("media output exceeds its bound")
	}
	return b.buffer.Write(value)
}

func sanitizeTags(input []string) ([]string, error) {
	if len(input) > contract.TagMaxRequestItems {
		return nil, invalid("Too many tags")
	}
	tags := make([]string, 0, len(input))
	seen := make(map[string]bool, len(input))
	for _, value := range input {
		value = strings.TrimSpace(value)
		// JavaScript's shared length bound counts UTF-16 code units.
		length := 0
		for _, r := range value {
			length++
			if r > 0xffff {
				length++
			}
		}
		if !utf8.ValidString(value) || strings.ContainsRune(value, 0) || length == 0 || length > contract.TagMaxNameLength {
			return nil, invalid("A tag name is empty or too long")
		}
		if !seen[value] {
			tags = append(tags, value)
			seen[value] = true
		}
	}
	if len(tags) > contract.TagMaxPerAsset {
		return nil, invalid("Too many tags on this asset")
	}
	return tags, nil
}
