package inference

import (
	"context"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"os"

	_ "golang.org/x/image/webp"
)

const imageSide = 224
const imagePlane = imageSide * imageSide
const maxImageBytes = 100 * 1024 * 1024
const maxImagePixels = 64 * 1024 * 1024

var imageMean = [3]float32{0.48145466, 0.4578275, 0.40821073}
var imageStd = [3]float32{0.26862954, 0.26130258, 0.27577711}

// imageProcessor reuses the intermediate scanlines, coefficients, and RGB row.
// Only the center crop is computed, avoiding arbitrarily wide/tall intermediate
// resizes. Input decoding and this workspace are serialized with native runs.
// Sampling matches Pillow RGB BICUBIC (a=-0.5, antialiased, 22-bit coefficients,
// round/clamp after each pass), as required by the pinned preprocessor config.
// Algorithm reference: Pillow 11.3.0 src/libImaging/Resample.c (MIT-CMU).
// This does not apply EXIF transforms: callers supply the upright media poster.
// Like CLIP's RGB conversion, alpha is dropped, not composited against black.
type imageProcessor struct {
	horizontal []uint8
	row        []uint8
	xWeights   []int32
	yWeights   []int32
	xBounds    [imageSide]sampleBounds
	yBounds    [imageSide]sampleBounds
}

type sampleBounds struct {
	start int
	count int
}

func (p *imageProcessor) load(ctx context.Context, path string, destination []float32) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open inference image: %w", err)
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return fmt.Errorf("stat inference image: %w", err)
	}
	if !stat.Mode().IsRegular() || stat.Size() > maxImageBytes {
		return fmt.Errorf("inference image must be a regular file no larger than %d bytes", maxImageBytes)
	}
	config, _, err := image.DecodeConfig(&contextReader{ctx: ctx, reader: file})
	if err != nil {
		return fmt.Errorf("read inference image dimensions: %w", err)
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > 16384 || config.Height > 16384 || int64(config.Width)*int64(config.Height) > maxImagePixels {
		return fmt.Errorf("inference image dimensions %dx%d exceed safe decoding limits", config.Width, config.Height)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	decoded, _, err := image.Decode(&contextReader{ctx: ctx, reader: file})
	if err != nil {
		return fmt.Errorf("decode inference image (JPEG/PNG/GIF/WebP poster required): %w", err)
	}
	return p.process(ctx, decoded, destination)
}

func (p *imageProcessor) process(ctx context.Context, source image.Image, destination []float32) error {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	short := min(width, height)
	resizedWidth, resizedHeight := width*imageSide/short, height*imageSide/short
	xStride := p.coefficients(width, resizedWidth, (resizedWidth-imageSide)/2, &p.xBounds, &p.xWeights)
	yStride := p.coefficients(height, resizedHeight, (resizedHeight-imageSide)/2, &p.yBounds, &p.yWeights)
	firstRow := p.yBounds[0].start
	last := p.yBounds[imageSide-1]
	lastRow := last.start + last.count
	p.horizontal = resizeBytes(p.horizontal, (lastRow-firstRow)*imageSide*3)
	p.row = resizeBytes(p.row, width*3)
	for y := firstRow; y < lastRow; y++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		readRGBRow(source, y+bounds.Min.Y, p.row)
		for x, sample := range p.xBounds {
			weights := p.xWeights[x*xStride:]
			accumulator := [3]int64{1 << 21, 1 << 21, 1 << 21}
			for k := range sample.count {
				pixel := p.row[(sample.start+k)*3:]
				for channel := range 3 {
					accumulator[channel] += int64(pixel[channel]) * int64(weights[k])
				}
			}
			for channel := range 3 {
				p.horizontal[((y-firstRow)*imageSide+x)*3+channel] = clipByte(accumulator[channel])
			}
		}
	}
	for y, sample := range p.yBounds {
		if err := ctx.Err(); err != nil {
			return err
		}
		weights := p.yWeights[y*yStride:]
		for x := range imageSide {
			accumulator := [3]int64{1 << 21, 1 << 21, 1 << 21}
			for k := range sample.count {
				pixel := p.horizontal[((sample.start+k-firstRow)*imageSide+x)*3:]
				for channel := range 3 {
					accumulator[channel] += int64(pixel[channel]) * int64(weights[k])
				}
			}
			for channel := range 3 {
				value := float32(float64(clipByte(accumulator[channel])) / 255)
				destination[channel*imagePlane+y*imageSide+x] = (value - imageMean[channel]) / imageStd[channel]
			}
		}
	}
	return nil
}

func resizeBytes(buffer []byte, size int) []byte {
	if cap(buffer) < size {
		return make([]byte, size)
	}
	return buffer[:size]
}

func clipByte(value int64) byte {
	return byte(max(int64(0), min(int64(255), value>>22)))
}

func (p *imageProcessor) coefficients(input, output, offset int, bounds *[imageSide]sampleBounds, buffer *[]int32) int {
	scale := float64(input) / float64(output)
	filterScale := max(1.0, scale)
	support := 2 * filterScale
	stride := int(math.Ceil(support))*2 + 1
	if cap(*buffer) < imageSide*stride {
		*buffer = make([]int32, imageSide*stride)
	} else {
		*buffer = (*buffer)[:imageSide*stride]
	}
	for i := range imageSide {
		center := (float64(i+offset) + 0.5) * scale
		start := max(0, int(center-support+0.5))
		end := min(input, int(center+support+0.5))
		bounds[i] = sampleBounds{start: start, count: end - start}
		sum := 0.0
		for j := start; j < end; j++ {
			sum += cubic((float64(j) - center + 0.5) / filterScale)
		}
		for j := start; j < end; j++ {
			weight := cubic((float64(j)-center+0.5)/filterScale) / sum
			(*buffer)[i*stride+j-start] = int32(math.Round(weight * (1 << 22)))
		}
	}
	return stride
}

func cubic(x float64) float64 {
	x = math.Abs(x)
	if x < 1 {
		return (1.5*x-2.5)*x*x + 1
	}
	if x < 2 {
		return ((-0.5*x+2.5)*x-4)*x + 2
	}
	return 0
}

func readRGBRow(source image.Image, y int, destination []byte) {
	bounds := source.Bounds()
	// Common decoded formats avoid image.At's boxed color allocation per pixel.
	for x := range bounds.Dx() {
		var r, g, b byte
		switch typed := source.(type) {
		case *image.NRGBA:
			pixel := typed.NRGBAAt(x+bounds.Min.X, y)
			r, g, b = pixel.R, pixel.G, pixel.B
		case *image.YCbCr:
			pixel := typed.YCbCrAt(x+bounds.Min.X, y)
			r, g, b = color.YCbCrToRGB(pixel.Y, pixel.Cb, pixel.Cr)
		case *image.Gray:
			pixel := typed.GrayAt(x+bounds.Min.X, y).Y
			r, g, b = pixel, pixel, pixel
		default:
			pixel := color.NRGBAModel.Convert(source.At(x+bounds.Min.X, y)).(color.NRGBA)
			r, g, b = pixel.R, pixel.G, pixel.B
		}
		destination[x*3], destination[x*3+1], destination[x*3+2] = r, g, b
	}
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(destination []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(destination)
}
