---
name: gradient-contracts
description: |
  Change Gradient's module contracts, profile schema, profiles, and evidence
  artifacts without drifting from the public-safe lifecycle invariant. Use when
  editing docs/module-contracts.md, docs/architecture.md,
  schemas/gradient.schema.json, profiles/*.yaml, or evidence packet fixtures.
  Trigger: /gradient-contracts.
argument-hint: "[contract|schema|profile|evidence] [paths]"
---

# /gradient-contracts

This is the repo-specific workflow for Gradient's public contract surface. Use
it when a change touches the semantics that future Harness, Work, Fleet, Policy,
or Context adapters must satisfy.

## Scope

In scope:

- `docs/architecture.md`
- `docs/module-contracts.md`
- `docs/decision-log.md`
- `docs/context-engine.md`
- `docs/evals.md`
- `docs/feedback-loop.md`
- `schemas/*.schema.json`
- `profiles/*.yaml`
- synthetic examples and evidence fixtures

Out of scope:

- private deployment config;
- customer-specific policy;
- reference-repo implementation details copied wholesale;
- runtime code that belongs in Spellbook, Orbital, or Olympus.

## Procedure

1. Name the lifecycle stage strengthened.
2. Decide whether the change belongs in core semantics, profile config, or an
   adapter.
3. Update the authoritative doc or schema first.
4. Update examples/profiles only after the contract is clear.
5. Add or update synthetic evidence fixtures when the change affects evidence,
   policy, context, or profiles.
6. Run the current manual gate.
7. Record accepted semantic changes in `docs/decision-log.md`.

## Gate

The load-bearing ship gate is `./scripts/validate.sh`, plus reviewer
judgment for lifecycle semantics in `docs/architecture.md` and
`docs/module-contracts.md` when docs change.

## Output

Return contract changed, lifecycle stage, authority file, validation evidence,
and public-safe risk.
