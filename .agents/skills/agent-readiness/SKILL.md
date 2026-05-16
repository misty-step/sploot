---
name: agent-readiness
description: |
  Assess Gradient's readiness for governed agent work across docs, schemas,
  profiles, harness, validation, evidence, and public-safe boundaries. Trigger:
  /agent-readiness, /readiness.
argument-hint: "[--assess-only] [--fix]"
---

# /agent-readiness

Readiness here is not framework setup. It is whether agents can safely move
Gradient work from intent to evidence without leaking private context or making
unsupported claims.

## Pillars

- Public-safe boundary clarity.
- Lifecycle and module contract consistency.
- Profile/schema validation path.
- Evidence packet and feedback readiness.
- Harness skill/agent availability.
- Work tracker and closure mechanics.
- Fleet/context/policy contract maturity.

## Current Baseline

Strong: architecture docs, decision log, profile examples, public-safe rules.

Weak: no automated gate, no evidence packet schema, no local Work adapter, no
Fleet run schema, no Context packet schema, no backlog lifecycle detector.

## Gate

The load-bearing ship gate is `./scripts/validate.sh`, plus reviewer
judgment for lifecycle semantics in `docs/architecture.md` and
`docs/module-contracts.md` when docs change.

## Output

Score each pillar, name the highest-impact fix, and implement it only when the
scope is bounded and public-safe.
