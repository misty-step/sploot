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
- [ ] On desktop (where Web Share's file variant is unsupported in most
      browsers), a "copy image" action writes the actual pixels to the
      clipboard via `navigator.clipboard.write([new ClipboardItem(...)])`, so
      pasting into Slack/Discord/iMessage-on-Mac drops the image inline —
      today desktop only offers "copy link" (`share-button.tsx:94`).

## Notes

The vision's "share optimization → export to messaging apps" is unbuilt:
`components/library/share-button.tsx:38-47` shares only `{title, url}`, and
`hooks/use-web-share.ts:88` computes `canShareFiles` but never uses it. `/s/[slug]`
→ `/m/[id]` is an HTML landing page with recruiting OG copy, not the raw image.
Outbound share is the neglected half of the loop (inbound is ~solved by 026/033);
the capability check is already written and dead, so this is mostly wiring.
Evidence lane: groom 2026-06-21 "onboarding/delight/share".

Groom 2026-07-01: no `ClipboardItem` usage anywhere in `apps/web` (grep clean) —
there is no image-to-clipboard path at all, mobile or desktop. Given the vision's
"drop it anywhere" premise and that most desktop meme-dropping happens via paste
into an already-open chat window, the desktop clipboard-image action is likely
higher-leverage than the mobile `navigator.share({files})` branch and should not
be left for a "fast-follow" — added as its own oracle line above.
