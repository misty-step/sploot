# AGENTS

Gradient is the public-safe product boundary for governed AI-assisted work.
This repo currently contains docs, YAML profiles, JSON Schema, synthetic
examples/evals, repo-local harness assets, and a small CLI-backed solo loop.

## Stack & Boundaries

Gradient defines five swappable modules:

- **Harness**: models, providers, tools, skills, prompts, runtime defaults.
- **Work**: task sources, work graphs, leases, acceptance criteria.
- **Fleet**: agent execution, runs, status, artifacts, retries.
- **Policy**: approvals, evidence, evals, telemetry, feedback, rollout gates.
- **Context**: typed memory, retrieval, provenance, freshness, permissions,
  citations.

The architecture invariant is:

```text
Intent -> Work Graph -> Fleet Run -> Evidence -> Policy/Eval -> Feedback
```

Every feature should name which part of that lifecycle it strengthens.

## Public-Safe Boundary

This repo may contain generic schemas, public-safe profiles, architecture docs,
adapter interfaces, repo-local harness assets, and synthetic fixtures.

This repo must not contain customer names, private repo names, credentials,
access tokens, meeting transcripts, proprietary implementation details,
company-specific configs, real customer backlogs, private prompts copied from
customer systems, secrets, or raw telemetry from real client runs.

Deployment-specific details belong in private profile repositories or ignored
local files such as `.gradient/sources.local.yaml`.

## Ground Truth

- [README.md](README.md): repository overview and cold-start read order.
- [docs/decision-log.md](docs/decision-log.md): accepted product and
  architecture decisions.
- [docs/architecture.md](docs/architecture.md): lifecycle and module boundary.
- [docs/module-contracts.md](docs/module-contracts.md): stable module
  responsibilities and minimum contracts.
- [schemas/gradient.schema.json](schemas/gradient.schema.json): profile schema.
- [profiles/](profiles/): public-safe deployment profiles.
- [gradient.yaml](gradient.yaml): this repo's self-profile.
- [.spellbook/repo-brief.md](.spellbook/repo-brief.md): tailored harness spine.

When these conflict, accepted decisions and explicit schemas beat exploratory
docs. Do not silently change lifecycle semantics without updating
`docs/decision-log.md`.

## Gate Contract

The load-bearing ship gate is `./scripts/validate.sh`, plus reviewer judgment
for lifecycle semantics in `docs/architecture.md` and `docs/module-contracts.md`
when docs change.

Do not claim tests, CI, deployment, or runtime verification exists unless the
exact command or artifact was actually exercised.

## Invariants

- Base branch is `master`.
- Keep the repo public-safe unless an explicit decision changes that.
- Deployments vary by profiles, adapters, and policy packs; do not fork module
  semantics per customer.
- Prefer schemas, interfaces, and adapters over deployment-specific logic.
- Keep provider, task-system, runtime, telemetry, and retrieval quirks behind
  module adapters.
- Telemetry and evidence must share run IDs across the lifecycle.
- Do not hard-code private local paths in committed files.
- Any future implementation should strengthen one lifecycle stage without
  collapsing the module boundary into a pass-through wrapper.

## Known Debt

- `P0-WORK-CLOSURE`: add a tracker and closure detector. There is no backlog or
  closure detector beyond the current `backlog.d` fixture. Until a closure
  detector exists, preserve work references manually and mark closure mechanics
  unverified.

P1:

- `P1-WORK-ADAPTER-HARDENING`: harden the `backlog.d` Work adapter into a
  reusable parser/validator and closure detector.
- `P1-FLEET-CAPTURE`: add a tiny capture command for local supervised Codex or
  Claude Code runs.
- `P1-TEAM-PROFILES`: turn the solo loop into a repeatable team/org rollout
  profile with owners, shared evidence requirements, and retention policy.

## Harness Index

Shared skill root: `.agent/skills/`.

Harness bridges:

- `.claude/skills/`
- `.codex/skills/`
- `.pi/skills/`

Installed agents: `.claude/agents/`.

| Skill | What It Does Here |
|---|---|
| `/research` | Grounds Gradient product, architecture, model/provider, and reference-system questions in public-safe sources. |
| `/groom` | Turns ideas and debt into lifecycle-scoped, public-safe work. |
| `/shape` | Writes buildable context packets for docs, schemas, profiles, adapters, policy, context, and harness work. |
| `/implement` | Makes scoped docs/YAML/JSON Schema/synthetic fixture/harness changes without inventing app commands. |
| `/qa` | Verifies the changed artifact itself: public-safe, lifecycle-consistent, schema-valid when possible. |
| `/demo` | Produces evidence artifacts for docs/schema/profile changes: transcripts, fixtures, or walkthroughs. |
| `/code-review` | Reviews for leaks, module-boundary drift, profile-fork semantics, and missing evidence. |
| `/refactor` | Simplifies touched docs/schema/profile/harness surfaces without changing semantics. |
| `/ci` | Runs or reports the current manual gate; names missing automation as debt. |
| `/diagnose` | Finds contradictions across docs, schemas, profiles, harness, and validation assumptions. |
| `/monitor` | Watches for contract drift, public-safe regressions, profile/schema mismatch, and validation debt. |
| `/deliver` | Takes one shaped Gradient task to merge-ready evidence, then stops. |
| `/settle` | Polishes a branch through review, gate, QA, and simplification; does not merge. |
| `/ship` | Final-mile merge workflow for `master`; preserves work references and invokes reflection. |
| `/yeet` | Groups local changes into coherent public-safe commits. |
| `/flywheel` | Runs repeated Gradient improvement cycles while `/ship` owns closure and reflection. |
| `/harness` | Maintains repo-local skills, agents, settings, markers, and gate alignment. |
| `/agent-readiness` | Assesses readiness for governed agent work across docs, schemas, profiles, evidence, and harness. |
| `/gradient-contracts` | Repo-specific workflow for changing module contracts, schemas, profiles, and evidence artifacts. |
| `/office-hours` | Universal ideation interrogation before shaping fuzzy ideas. |
| `/ceo-review` | Universal premise and alternatives audit for plans/specs. |
| `/reflect` | Universal retrospective and harness learning loop. |
| `/karpathy-guidelines` | Universal assumptions, simplicity, surgical scope, and verification guidance. |
| `/model-research` | Universal current-model research and selection workflow. |

## Agents

| Agent | Use |
|---|---|
| `planner` | Decompose Gradient work into executable context packets. |
| `builder` | Implement shaped specs with tests/evidence where applicable. |
| `critic` | Review builder output against correctness, depth, simplicity, and craft. |
| `ousterhout` | Evaluate module depth and information hiding. |
| `carmack` | Check shippability and remove speculative scope. |
| `beck` | Enforce small-step TDD and simple design. |
| `cooper` | Review test boundaries and reject internal mocks when code is added. |
| `grug` | Hunt unnecessary complexity. |

## Solo MVP Commands

Use these for local work:

```sh
./scripts/gradient.sh validate
./scripts/gradient.sh resolve
./scripts/gradient.sh capture backlog.d/<work-item>.md
./scripts/gradient.sh eval
./scripts/gradient.sh close backlog.d/<work-item>.md
./scripts/gradient.sh status --check
./scripts/gradient.sh init --profile solo-frontier /path/to/repo
./scripts/gradient.sh install-global
```

The capture command writes Fleet, Context, Evidence, Policy, and Feedback
artifacts under `.gradient/`. The close command moves work into
`backlog.d/_done/` only after linked evidence and policy pass.
The init command seeds another git repository with a profile-selected solo loop
while preserving existing files.
The resolve command derives `.gradient/harness/resolution.json` from
`gradient.yaml`; validation fails if the resolution is stale.
After global install, use `gradient resolve`, `gradient validate`,
`gradient capture`, `gradient eval`, and `gradient close` inside any initialized
repo. `gradient init`, `gradient install-global`, and `gradient config` are
served from the core Gradient checkout.
The global install also writes `~/.gradient/AGENTS.md` and managed snippets into
global Claude, Codex, OpenCode, and Pi harness guidance so agents can rediscover
Gradient in future sessions.
