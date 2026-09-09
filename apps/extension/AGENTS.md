# Extension repository guidance

## Ownership and conventions

`entrypoints/background/` owns device authentication and durable capture; `entrypoints/popup/` owns React UI; `shared/` owns extension transport, URL and receipt helpers. `@sploot/common` owns shared MIME/upload/API contracts. Generated WXT output is `dist/`; do not edit it. Follow [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and [README.md](README.md) for exact run/load/release commands.

Use pnpm only. TypeScript is strict; match the surrounding two-space style. Keep original image/GIF/video bytes, immutable retry digests, owner fences, and explicit saved/duplicate/failure receipts intact. Never log tokens, passwords, private device codes, or another account's capture metadata.

## Device authority

The default instance is `http://127.0.0.1:3001`. The popup can select another origin; only HTTPS remote origins or loopback HTTP are accepted. Device pairing uses the real instance approval page and persisted bounded polling. Credentials stay in trusted local extension storage, never auth messages or Chrome sync storage. Account ownership includes the instance origin. API requests reject redirects, omit cookies, and obtain a token fenced to their already-selected destination.

Disconnect revokes the current device before changing instances. A failed revocation must remain visible. Same-account re-pairing can resume queued bytes; different accounts and instances cannot inspect or submit them. There is no hosted identity SDK, cookie synchronization, or E2E-only authentication bypass.

## Validation and shipping

Keep `lint`, unit tests, actual Chromium layout/lifecycle/update tests, build, manifest policy, release provenance and strict operator-evidence checks intact. `test:mv3` needs the actual Go app with local inference and creates unique accounts; `test:mv3:fixture` uses a controlled API and must never be labeled backend proof. Linux native browser actions require xdotool and a display or Xvfb.

`build:prod` produces the release-mode unpacked output; `zip:prod` creates the provenance-bound store packet. `release:structural` does not replace `release:check`. Device pairing in a local build proves neither predecessor deployment compatibility nor Web Store submission. Preserve the operator's manual upload and exact candidate/artifact evidence requirements. Private CRX keys and local environment values stay untracked.
