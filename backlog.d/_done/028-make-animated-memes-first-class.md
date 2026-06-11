# Make animated memes first-class

Priority: P2 · Status: done · Estimate: L

## Goal

GIFs and short videos behave like memes, not frozen frames — the library
plays what the user saved.

## Oracle

- [x] A GIF in the library animates where it matters (grid hover-to-play or
      always-on, full animation on the detail page) instead of rendering its
      static thumbnail; perf stays acceptable on a 200-asset grid.
- [x] Short video upload (mp4/webm, size-capped) is accepted end-to-end:
      validation in `@sploot/common` constants, blob storage, poster-frame
      thumbnail extraction, playback on detail page, sensible grid tile.
- [x] Search/embedding pipeline handles animated assets without erroring
      (embed poster/first frame; documented as the chosen approach).
- [x] Extension right-click save works on a GIF and the result animates in
      the library.
- [x] Full web suite green; live render evidence (grid + detail, desktop +
      mobile) showing animation.

## What Was Built

- Added `video/mp4` and `video/webm` to the shared upload contract in
  `@sploot/common`, with media-kind helpers used by web ingestion/rendering.
- Preserved animated originals as the primary blob while generating poster
  thumbnails for GIF/video previews and embedding inputs.
- Added packaged ffmpeg poster extraction for video uploads, with
  `FFMPEG_BIN`/system fallback for operator overrides.
- Rendered GIF originals and video players in the library grid, preview modal,
  and meme detail page; QA seed now includes GIF/video fixtures for live
  desktop/mobile evidence.
- Synced API docs and extension architecture notes with the animated media
  contract.

Backlog: `backlog.d/028-make-animated-memes-first-class.md`
Ships-backlog: `028-make-animated-memes-first-class`

## Notes

Vision lists multimedia as near-term ("memes aren't just images anymore").
Today `image/gif` is in the upload allowlist but grid tiles render
`thumbnailUrl` (sharp-generated static frame) and there is no `video/*`
support anywhere. A user uploading 20 reaction GIFs sees a wall of frozen
frames — silent degradation of a core meme format.

## Children

1. Animate GIFs: serve original blob for GIF tiles/detail (or hover-swap),
   measure grid perf, pick always-on vs hover.
2. Video upload v1: MIME/size validation, poster-frame extraction, storage.
3. Video playback: detail-page player + grid tile treatment.
4. Embedding strategy for animated assets (poster frame) + tests.
