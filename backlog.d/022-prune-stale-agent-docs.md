# Prune stale agent docs

Priority: P2 · Status: pending · Estimate: S

## Goal

Agent-facing docs describe the current repo: no references to missing files,
dead milestones, or styling guidance that contradicts DESIGN.md and design
lint.

## Oracle

- [ ] Root `CLAUDE.md` no longer references `TASK.md` (the file does not
      exist).
- [ ] `apps/web/CLAUDE.md` no longer documents `electric-lime`/`hot-pink`/
      `cyber-blue` as the color system (design lint bans those names in
      landing code), and drops the pre-monorepo "when implemented" command
      lists and M0–M4 milestone section.
- [ ] `PROMPT.md` is deleted — the Sentry health-route fix it describes
      shipped (`apps/web/app/api/health/route.ts:79-84` has the
      disconnect/reconnect retry). **Deletion pending user ratification.**
- [ ] `AGENTS.md` Known Debt Map paths resolve (007 ticket reference points
      into `_done/`).

## Notes

Stale harness prose is an agent hazard: a cold agent reading
`apps/web/CLAUDE.md` today gets the pre-design-system color guidance that the
design lint now rejects, and a pointer to a tracker file that doesn't exist.
Keep the database/observability sections — those are accurate and
load-bearing.
