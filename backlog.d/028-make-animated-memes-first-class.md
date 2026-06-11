# Make animated memes first-class

Priority: P2 · Status: pending · Estimate: L

## Goal

GIFs and short videos behave like memes, not frozen frames — the library
plays what the user saved.

## Oracle

- [ ] A GIF in the library animates where it matters (grid hover-to-play or
      always-on, full animation on the detail page) instead of rendering its
      static thumbnail; perf stays acceptable on a 200-asset grid.
- [ ] Short video upload (mp4/webm, size-capped) is accepted end-to-end:
      validation in `@sploot/common` constants, blob storage, poster-frame
      thumbnail extraction, playback on detail page, sensible grid tile.
- [ ] Search/embedding pipeline handles animated assets without erroring
      (embed poster/first frame; documented as the chosen approach).
- [ ] Extension right-click save works on a GIF and the result animates in
      the library.
- [ ] Full web suite green; live render evidence (grid + detail, desktop +
      mobile) showing animation.

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
