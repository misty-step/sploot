# Re-triage resurfaced Dependabot alerts

Priority: P2 · Status: pending · Estimate: S

## Goal

The default branch shows zero actionable open Dependabot alerts: real
vulnerabilities patched, stale alerts dismissed with reasons.

## Oracle

- [ ] vitest critical advisories resolved (bump or override past the
      affected range; suite still green).
- [ ] shell-quote and tmp alerts dismissed as stale if the lockfile-resolved
      versions (1.8.4 / 0.2.6 via #206 overrides) sit outside the affected
      ranges — with a dismissal reason — or actually fixed if not.
- [ ] ws, next, postcss, and turbo alerts each triaged: patched, overridden,
      or dismissed with a written reason.
- [ ] `gh api repos/misty-step/sploot/dependabot/alerts --jq
      '[.[] | select(.state=="open")] | length'` returns 0.

## Notes

Found during the 2026-06-10 groom: push output reported 13 open alerts
(4 critical) despite ticket 020 and PR #206 addressing this in early June.
Verified live: shell-quote/tmp overrides ARE in the lockfile, so those four
alerts are probably stale scans; the two vitest criticals (resolved 4.1.7)
are new and real until proven otherwise. Consider enabling a CI/audit gate
so resurfaced alerts surface in a PR check instead of a groom session.
