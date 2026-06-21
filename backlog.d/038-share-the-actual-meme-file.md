# Share the actual meme file, not a sploot link

Priority: P2 · Status: ready · Estimate: S

## Goal

Sharing a meme from sploot drops the image itself into the target app (group
chat, etc.), not a sploot.app link with a marketing CTA.

## Oracle

- [ ] Where `navigator.canShare({ files })` is true, the share button shares the
      image via `navigator.share({ files })`; the URL share is fallback only.
- [ ] Sharing into a messaging app shows the meme inline — no tap-through to a
      landing page.

## Notes

The vision's "share optimization → export to messaging apps" is unbuilt:
`components/library/share-button.tsx:38-47` shares only `{title, url}`, and
`hooks/use-web-share.ts:88` computes `canShareFiles` but never uses it. `/s/[slug]`
→ `/m/[id]` is an HTML landing page with recruiting OG copy, not the raw image.
Outbound share is the neglected half of the loop (inbound is ~solved by 026/033);
the capability check is already written and dead, so this is mostly wiring.
Evidence lane: groom 2026-06-21 "onboarding/delight/share".
