# Extension

Canonical repo instructions are `../../AGENTS.md`.

## Auth and identity

The background owns device pairing and durable capture; the popup owns instance selection and React UI. `shared/` owns transport, URL and receipt helpers. See `ARCHITECTURE.md` for boundaries and `README.md` for commands.

The popup selects HTTPS remote origins or loopback HTTP (default `http://127.0.0.1:3001`). Device approval uses the real instance page and persisted bounded polling. Credentials stay in trusted local extension storage, never runtime messages or Chrome sync. Account ownership includes the instance origin; requests reject redirects, omit cookies and use destination-fenced tokens.

Disconnect revokes the device before changing instances; a failed revocation stays visible. Same-account re-pairing can resume queued bytes. Different accounts/instances cannot inspect or submit them. Preserve original bytes, immutable retry digests and explicit saved/duplicate/failure receipts. There is no Clerk client, cookie synchronization or E2E authentication bypass.

## Release

WXT writes `dist/` (`dist/chrome-mv3` unpacked). `build:prod` produces release-mode output; `zip:prod` creates the provenance-bound packet. `release:structural` does not replace `release:check`, the dashboard receipt or hosted `merge-gate`. Private CRX keys stay untracked; rotation is an explicit compatibility decision.

Keep lint, unit tests, actual Chromium layout/lifecycle/update checks, manifest policy, release provenance and operator-evidence checks intact. `test:mv3` uses a real Go instance with local inference and unique accounts. `test:mv3:fixture` uses a controlled API, not backend acceptance. Linux native controls require xdotool and a display or Xvfb.
