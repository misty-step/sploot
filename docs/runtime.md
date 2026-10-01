# Runtime and retirement inventory

Canonical record of what serves Sploot and what is retained. The command
manual is [`docs/operations.md`](./operations.md). That manual used to live at
`apps/web/docs/DEPLOYMENT.md`; the old path is a pointer. `apps/web` is the
retained Next.js predecessor. It is not the serving authority.

An exit criterion is the condition that must already be true before a later,
separately authorized change may remove that item. This record does not
satisfy any exit criterion. It does not authorize a provider write, a DNS
change, a source deletion, or removal of a required gate.

## Live service

The production library is the Go server in `apps/server`, on the exe.dev VM
`sploot-pilot.exe.xyz`, behind `https://sploot.mistystep.io`.

Public read-only probes on 2026-10-01:

| Time (UTC) | Request | Result |
|---|---|---|
| 2026-10-01T17:50:06Z | `GET /api/version` | HTTP 200. `runtime` `go`, `version` `0.1.0`, `commit` `e975904b76f777147b7f2cd0c5831ba1644cf440`. |
| 2026-10-01T17:50:06Z | `GET /api/health/live` | HTTP 200. `status` `alive`, `service` `sploot-web`, same commit. |
| 2026-10-01T17:50:06Z | `GET /api/health` | HTTP 200. `runtime` `go`, `database` `sqlite`, `storage` `filesystem`, `status` `ok`, `libraryReady` true, `searchReady` true, `dependencies.database` `up`, `dependencies.search` `ready`, same commit. |
| 2026-10-01T17:52:45Z | `GET /api/health/enrollment` | HTTP 200. `configuration` `valid`, `mode` `closed`, `status` `ok`. |

`service: "sploot-web"` is the Go process label. It is not a Next.js
deployment. These probes did not open SSH, read the disk, or change DNS.

Host binding recorded on 2026-09-10, not re-checked from the VM on
2026-10-01. The public commit matches this binding:

- Binary `/opt/sploot/releases/e975904b/sploot`, deployment revision
  `e975904b76f777147b7f2cd0c5831ba1644cf440`, SHA-256
  `01ff3b40957073048b0fcbb6c819f01d53f6a1db36519f8f7a63e141b22bb90a`.
- Persistent library `/var/lib/sploot/production`. Registration closed.
  Uploads and local embeddings were enabled in that record.
- Code owner: `apps/server`. Host, production directory, and recovery
  decryption stay with the operator.

## Next writer

The old Next writer stays disabled. On 2026-09-10 the DigitalOcean app
`68a12c8a-282e-4f1a-84bb-e7c6f074aeaa` was retired after acceptance. There is
no remaining app to roll back to. Do not recreate it, restore its DNS, or
start `apps/web` as a writer against the live origin.

Predecessor Postgres and Blob state cannot absorb saves committed to the
native library after cutover. Restoring old DNS or restarting Next is not
rollback. If the current native epoch cannot preserve every committed save,
keep that epoch and serve maintenance until it is repaired. The procedure is
[controlled rollback after native writes](./operations.md#controlled-rollback-after-native-writes).
Hourly snapshots are a 60-minute recovery-point objective after total host
loss, not a zero-loss guarantee.

A stopped raw copy of the current production directory preserves credentials.
A portable restore does not. See below.

## Portable restore

Portable backup and restore apply to a Go SQLite library. They keep account
rows and password hashes, asset IDs, metadata, vectors, tags, favorites,
trash, public slugs, completed receipts, and indexing state. They
deliberately invalidate browser sessions, device sessions, pairing requests,
personal access tokens, account invitations, authentication attempts, and the
signing key on the restored copy. Restored users sign in with the retained
passwords, mint new tokens, and pair devices again. Unclaimed accounts need
new offline invitations. The source library's credentials stay valid.

Commands and the exact scrub list:
[snapshot contents and credential lifetime](./operations.md#snapshot-contents-and-credential-lifetime).

## Clients, publications, owners

| Surface | Code owner | Publication | Evidence |
|---|---|---|---|
| Go HTML/HTMX library | `apps/server`; operator runs the exe.dev host | Live production at `https://sploot.mistystep.io` | Public probes 2026-10-01, table above |
| WXT extension | `apps/extension` | Chrome Web Store publication **unverified**. Unpacked Chromium output is `apps/extension/dist/chrome-mv3`. No dashboard receipt is in this record. | Local pairing proof is separate from store publication |
| MCP server | `apps/mcp` (`@sploot/mcp`, bin `sploot-mcp`, `private: true`) | npm publication **unverified**. The in-repo client is the shipped surface. | Package metadata; sploot-071 on 2026-07-07 is a repository shipping record, not an npm receipt |
| Agent skill | `.agents/skills/misty-sploot` | In-repo skill, recorded 2026-07-07 | [`docs/five-faces.md`](./five-faces.md) |
| iPhone Shortcut | `apps/web/docs/shortcuts/save-to-sploot.md` | Physical iPhone acceptance **unverified**. Shortcut acceptance **unverified**. The file is unsigned source. No verified iCloud install link is claimed. | Shortcut procedure |
| Next.js app | `apps/web` | Not serving. DigitalOcean app retired 2026-09-10. Writer stays disabled. | Retirement record in [`docs/operations.md`](./operations.md#canonical-hosted-go-instance) |

Browser, extension, and MCP clients select one origin. The extension's hosted
selection is `https://sploot.mistystep.io`. Repository-built MCP defaults to
`https://sploot.mistystep.io/api` as of `9d0b34b69b937fba900e9438afb1ea9d56ba82e8`.
A local library is a different instance.

## Retained predecessor

Each row stays until its exit criterion is already true and a separate change
is authorized. None of these rows is a deletion task.

| Retained item | Why it stays | Exit criterion |
|---|---|---|
| Next.js source in `apps/web` | Predecessor route, auth, and UI record. Required jobs still compile and test it. | The same change that removes it has already replaced every merge-gate job that builds or browser-tests it (`web-build`, `test`, `auth-browser`, `queue-browser`, `gallery-browser`, `public-truth`, `public-truth-production-guard`) with a required successor, and an independent source archive exists. |
| Named Prisma migrations | Predecessor schema history. Two historical checksum differences are part of the recovery caveat. Rewriting them would hide that caveat. | `db-authority` and the predecessor migration tests no longer require this history, and the checksum record is preserved outside the removed files. |
| Neon Postgres with pgvector | Predecessor library state for independent source recovery. CI still migrates `pgvector/pgvector:pg15` (and pg16 in `db-authority`). | The complete predecessor archive is independently verified to cover the predecessor assets the operator still needs, and no required CI job still opens this database. It is not a target for native saves. |
| Vercel Blob objects | Predecessor stored bytes. The object capture records URL, pathname, size, and SHA-256. | The complete object archive is independently hash-verified, and no recovery procedure or required test still reads Blob. |
| Clerk | Predecessor identity source for the offline owner map. Live Go accounts are local passwords. | Identity disputes no longer need the Clerk user record, and no required predecessor auth test still calls Clerk. |
| Replicate | Predecessor embedding provider and the rate-limit contract those gates still describe. Go uses local CLIP. | No predecessor embedding route, budget gate, or recovery procedure still requires the Replicate token or model revision. |
| Sentry | Predecessor error reporting, plus optional Go diagnostics. The 2026-10-01 probes did not read whether a DSN is configured. | The predecessor reporting contract is no longer required, and any Go DSN is either unused or moved under a separate owner. The telemetry check stays until a required successor enforces the same omission rules. |
| Stripe ledger schema and sandbox check | Inert until webhook authorities are configured. Keeps billing fail-closed. | Enrollment is still closed under a required check, and either the sandbox check plus schema remain or a required successor still forbids live charges. |
| DigitalOcean app contract and scripts | App `68a12c8a-282e-4f1a-84bb-e7c6f074aeaa` was retired on 2026-09-10. `pnpm deployment:check` still encodes one migration-only pre-deploy job and a start-only web command so a Next writer cannot return with a weaker shape. | The retired app stays absent. The scripts leave only when a merge-gate-required check still forbids a second writer and a GitHub-owned production migration path. |
| Complete predecessor archive in private R2 bucket `sploot-recovery` | Indefinite source archive beside native snapshots. Decryption stays in operator custody, not on the VM. | Another independently verified copy exists, and a separate authorization names this archive as disposable. This record does not. |
| Native R2 snapshots | Hourly objects protected 72h and expired after 4d; daily objects protected 30d and expired after 31d. | The lifecycle above is the exit for aged snapshots. Shortening it requires a separate recovery-point decision. |
| Predecessor CI gates | Listed below. Hosted `merge-gate` is the ship gate. A skipped database path is `DB path unverified`, not a pass. | Each gate's own row. Removing a job from `merge-gate` is not an exit. |

### Required gates

These jobs are required by [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
`merge-gate`. Local command subsets are not hosted CI parity.

| Gate | Why it stays | Exit criterion |
|---|---|---|
| `secrets` | Fails committed secrets on the tree and on the event range. | A required successor fails the same secret patterns before merge. |
| `lint` | Runs the Stripe sandbox check, provider-retirement check, telemetry check, deployment-runtime check, and workspace lint. | Each of those scripts stays required until a required successor enforces the same prohibition. |
| `type-check` | Workspace type contract. | A required successor still type-checks the workspaces that remain. |
| `web-build` | Compiles the predecessor without runtime database or provider secrets and checks PWA assets. | Only in the same change that meets the Next.js source exit above. |
| `design` | Enforces the design contract on the diff. | A required successor still enforces that contract. |
| `economics` | Versioned rates, margins, budgets, and report reproducibility. Enrollment stays fail-closed. | A required successor still owns those budgets, or billing remains closed under a required check that replaces this one. |
| `test` | Predecessor tests against pgvector Postgres, including named migrations. | No retained predecessor schema remains under test, and the database path that remains still has a required job. A skip is not this exit. |
| `extension`, `verify-extension-dist` | WXT lint, tests, and unpacked packet. | The extension is removed, or a required job still builds and checks the packet. Store publication is not this exit. |
| `auth-browser`, `queue-browser`, `gallery-browser` | Predecessor browser contracts. | Same change as the Next.js source exit. |
| `public-truth`, `public-truth-production-guard` | Public copy and production omission. | Same change as the Next.js source exit, with a required successor if public pages remain. |
| `db-authority` | Restricted Postgres role on pg15 and pg16. | Predecessor migrations are no longer a required schema, and a required job still proves the database authority that remains. |
| `go-server` | Integration, isolated smoke, and image build for the serving runtime. | A required successor still runs those three against the serving runtime. |
| `merge-gate` | Aggregate of the jobs above. | No exit. Dropping a needed job is a weakened gate. |

`foundation` and `story-walk` run beside this aggregate. They are not a
substitute for it, and this record does not remove them.

## Evidence dates

| Date | What it supports | What it does not support |
|---|---|---|
| 2026-10-01 | Public Go runtime, commit `e975904b`, SQLite/filesystem health, closed registration | VM disk, R2 restore, store publication, npm publication, physical iPhone or Shortcut acceptance |
| 2026-09-10 | DigitalOcean app retirement and the host binding quoted above | A fresh SSH or provider readback |
| 2026-07-07 | Published save/search contract, in-repo MCP client, in-repo skill (sploot-071) | npm publication or a production migration receipt |
| Chrome Web Store | Unverified | Do not treat a listing packet as a publication |
| npm | Unverified | `private: true` is not a registry receipt |
| Physical iPhone / Shortcut | Unverified | Unsigned source is not device acceptance |
