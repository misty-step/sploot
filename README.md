# Sploot 🏷️

> **A private library for your memes and screenshots.** Save from anywhere in
> one click, then find any of them by typing what's in the picture.

**[sploot.app](https://www.sploot.app)**

Type words. Get the picture — a stranger goes from the landing page to a real
semantic search in about half a minute (opt-in starter pile with precomputed
CLIP vectors; see `docs/design/lab-053-stranger-aha.html`):

![Stranger to aha: landing → starter pile → plain-words search locks the right meme](./docs/demo/stranger-to-aha.gif)

This monorepo contains the deployed Next.js app, its Go replacement candidate,
the TypeScript Chrome extension, MCP server, and shared contracts.

Sploot is a personal meme library with text→image semantic search: save a
meme once and later find it by describing what's in it — no remembering
filenames.

![Search results for "reaction face meme" returning four ranked matches with confidence scores](./docs/qa/evidence/2026-07-07-sploot-051-readme-frontdoor/app-search-in-action-1440x900.png)

*Historical, seeded-local search walkthrough from 2026-07-07, not current hosted
verification. This selected screenshot remains a public documentation asset;
its retained [source packet](./docs/qa/evidence/2026-07-07-sploot-051-readme-frontdoor/)
records the original exercise.*

## ✨ What it does today

- **Capture**: web upload and share-target support, plus a Chrome right-click
  capture candidate. The iPhone Shortcut is unsigned source, not an installable release.
- **Find by description**: type what's in the image — text→image semantic
  search (pgvector + CLIP embeddings), not keyword/tag matching.
- **Bangers and piles**: favorite the ones you'll reuse; automatic piles
  group your library by rough theme.

Sploot does not yet learn *your* taste or generate new memes.

The deployed predecessor remains `apps/web`. The personal replacement in
[`apps/server`](./apps/server) serves HTML/HTMX from Go against the existing
Postgres/pgvector, Clerk, Blob, Replicate, and Sentry authorities. **No production
cutover or current real-library backup is claimed.** Keep the predecessor and
schema until real acceptance and rollback-safe cutover; see
[deployment and recovery](./apps/web/docs/DEPLOYMENT.md).

The [iPhone Shortcut procedure](./apps/web/docs/shortcuts/save-to-sploot.md)
links the actual source and release script. Apple signing and real iPhone
saved/duplicate/failure verification remain required; there is no install link.
[VISION.md](./VISION.md) records optional product intent and economic constraints,
not a delivery roadmap or evidence that those ambitions shipped.

## 🧩 Browser extension

Chrome extension (WXT) for one-click "Save to Sploot" from a right-click
context menu. The candidate in `apps/extension/dist/` is **not submitted or
published** in the Chrome Web Store; no live listing URL or receipt is claimed.
Source: [`apps/extension`](./apps/extension).

## 🛠️ For developers

This is a Turborepo/pnpm workspace with a Go runtime candidate and retained
TypeScript clients and predecessor.

| Workspace | Path | Description |
|-----------|------|-------------|
| **Go Server** | [`apps/server`](./apps/server) | Candidate Go HTTP + server-rendered HTML/HTMX; existing storage, auth, and vector schema. |
| **Web Predecessor** | [`apps/web`](./apps/web) | Deployed Next.js 16 app and authoritative Prisma migrations/curated fixtures, retained until cutover. |
| **Extension** | [`apps/extension`](./apps/extension) | Chrome Extension (WXT) for one-click saving. |
| **MCP Server** | [`apps/mcp`](./apps/mcp) | `sploot-mcp` — save + search as agent tools over the [published API](./apps/web/docs/PUBLIC_API.md). |
| **Common** | [`packages/common`](./packages/common) | Shared constants, types, and utilities. |

## 🤖 Agent access

Agents (and the operator's agent fleet) save and search Sploot without a
browser: the **sploot MCP server** (`apps/mcp`) exposes `sploot_search` and
`sploot_save` as tools over a personal API token, and the
**`misty-sploot`** skill teaches the verbs. See
[`apps/web/docs/PUBLIC_API.md`](./apps/web/docs/PUBLIC_API.md) for the
published contract and [`docs/five-faces.md`](./docs/five-faces.md) for
Sploot's face-by-face status, including the distinction between historical
shipping evidence and unaccepted replacement surfaces (CLI remains waived).

![Sploot Architecture](https://img.shields.io/badge/Architecture-Monorepo-black?style=flat-square&logo=turborepo)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![WXT](https://img.shields.io/badge/Extension-WXT-blue?style=flat-square&logo=googlechrome)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)

### Quick Start

#### Prerequisites
- Node.js 22+ and the pinned pnpm 10.22.0 (via Corepack).
- Go 1.26+; local startup disables automatic Go toolchain downloads.
- FFmpeg and ffprobe on `PATH`.
- Linux/macOS and Docker Engine 28+ on a local Unix socket for the isolated loop.
- A C toolchain for the race-enabled Go integration command.

#### Installation

```bash
pnpm install
```

#### Local loop, no vendor credentials (recommended first run)

The default loop runs the **Go candidate**, not Next.js. It owns a fresh
loopback-only pgvector Postgres 15 container and private launch directory,
without Clerk/Neon/Blob/Replicate credentials:

```bash
pnpm dev:local
```

Startup applies the existing named Prisma migrations, seeds 24 curated
image/GIF/video fixtures, builds Go, and runs a real HTTP doctor covering auth,
media-byte delivery, save/replay/duplicate behavior, and cached search. Open the
printed URL, normally `http://127.0.0.1:3001/qa-auth/login`, to reach `/app`.
Use that exact origin rather than the predecessor's `/api/qa-auth/login`.

Search `reaction face meme` to exercise the seeded pgvector query. **New uploads
are saved locally but not indexed; uncached queries return `503`.** The launcher
rejects `.env` files, inherited database/provider authority, and provider opt-ins.
It is not a live Clerk, Blob, or Replicate check.

The printed `SESSION` directory under `/tmp/sploot-go-…` contains private logs,
`doctor.json`, media, and generated secrets. Ctrl-C or SIGTERM removes this
launch's database and directory. Do not put irreplaceable media there. To inspect
or stop it from another terminal, set `SESSION` to the exact printed path:

```bash
pnpm --filter server dev:local --status --session "$SESSION"
pnpm --filter server smoke --session "$SESSION"
pnpm dev:local:down --session "$SESSION"
```

For a self-contained check that boots and tears down its own database:

```bash
pnpm --filter server smoke
pnpm --filter server build
```

The build emits `apps/server/build/sploot` and
`apps/server/build/library-backup`. Database-backed regression coverage requires
a **separate, empty, exclusively owned, migrated loopback database** supplied as
`DATABASE_URL`, not the seeded dev session:

```bash
pnpm --filter server test:integration
```

See [deployment and recovery](./apps/web/docs/DEPLOYMENT.md) for isolated DB
preparation and private runtime/backup authority. Without that database evidence,
report **DB path unverified**. Retain only approved sanitized proof before
teardown; [QA ownership](./docs/qa/README.md) governs raw packets.

#### Development against real services

`pnpm dev` is an alias for the provider-free local loop above. For an intentional
live-provider candidate run, use a private mode-0600 environment file outside
the checkout and the built Go binary:

```bash
apps/server/build/sploot -env-file "$HOME/.config/sploot/server.env"
```

This path does not provision or migrate a database. It needs explicitly selected
Clerk, storage, and provider authority; the live-indexing requirements are in
[DEPLOYMENT.md](./apps/web/docs/DEPLOYMENT.md#go-candidate-runtime).

The retained Next.js development server and extension remain separate commands
(do not bind Next.js and Go to the same port):

```bash
pnpm dev:web
pnpm dev:extension
```

### Commands

We use **Turborepo** to orchestrate tasks.

- **Build**: `pnpm build` (Builds all apps/packages)
- **Lint**: `pnpm lint`
- **Type Check**: `pnpm type-check`
- **Test**: `pnpm test`
- **Clean**: `pnpm clean`

### Architecture

- **Monorepo Tooling**: Turborepo + pnpm workspaces.
- **Shared Code**: `@sploot/common` owns the web/extension contract; Go consumes generated constants and the existing pinned CLIP revision.
- **CI/CD**: GitHub Actions (Lint, Test, Type-check).
- **Deployment**: 
  - Deployed predecessor: DigitalOcean App Platform; changing the service to Go is a separate, unperformed cutover.
  - Extension: Manual submission to Chrome Web Store.
- **Details**: See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Configuration

Each app has its own env setup:
- Web app: see [`apps/web/README.md`](./apps/web/README.md)
- Go candidate: [runtime, deployment, and recovery](./apps/web/docs/DEPLOYMENT.md)
- Extension: see [`apps/extension/README.md`](./apps/extension/README.md)

### Documentation

The repository owns version-bound product/system knowledge, accepted decisions,
portable procedures, curated fixtures, and shipped assets. Linear owns current
work and prioritization; current requests authorize changes. Raw or sensitive
run output belongs in approved retained artifact storage, with a sanitized
revision/scope/verdict link in the work item. Runtime and release ledgers retain
their native authority; historical files are not an automatic intake queue.

- [QA procedure and evidence ownership](./docs/qa/README.md)
- [Design contract](./DESIGN.md)

- [Contributor instructions](./AGENTS.md) - Repository guidance for agents and developers.
- [Web App Docs](./apps/web/README.md)
- [Extension Docs](./apps/extension/README.md)
- [Architecture](./ARCHITECTURE.md)
- [ADRs](./docs/adr)
