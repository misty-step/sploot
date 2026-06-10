# Clear open Dependabot vulnerabilities

Priority: P1 · Status: pending · Estimate: S

## Goal

Zero open critical/high Dependabot alerts, with the production-relevant Next.js
XSS advisory patched.

## Oracle

- [ ] `gh api repos/misty-step/sploot/dependabot/alerts --jq '[.[] | select(.state=="open" and (.security_advisory.severity=="critical" or .security_advisory.severity=="high"))] | length'`
      returns `0`.
- [ ] `next` is bumped past the App Router CSP-nonce XSS advisory; web app
      builds and the Vercel deploy succeeds.
- [ ] The bump lands through a green CI run (Dependabot's own attempt failed).

## Notes

Open alerts as of 2026-06-10 (13 alert entries, 7 unique package advisories):

| Severity | Package | Surface | Advisory |
|---|---|---|---|
| critical | shell-quote | extension lockfile | newline escaping in `quote()` |
| critical | vitest | web devDeps | Vitest UI server arbitrary file read/execute (dev-only exposure) |
| high | tmp | extension lockfile | path traversal via prefix/postfix |
| medium | next | web runtime | **XSS in App Router with CSP nonces — only production-runtime advisory here** |
| medium | postcss, turbo, ws | lockfiles | various |
| low | turbo | lockfile | Yarn Berry detection LCE |

Dependabot's bump run for shell-quote
(`actions/runs/27251498043`) concluded `failure` — likely pnpm workspace
lockfile handling. Bump via pnpm directly (overrides in root `package.json`
where the dep is transitive), one PR for the lot.
