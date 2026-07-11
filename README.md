# Sploot 🏷️

> **A private library for your memes and screenshots.** Save from anywhere in
> one click, then find any of them by typing what's in the picture.

**[sploot.app](https://www.sploot.app)**

Type words. Get the picture — a stranger goes from the landing page to a real
semantic search in about half a minute (opt-in starter pile with precomputed
CLIP vectors; see `docs/design/lab-053-stranger-aha.html`):

![Stranger to aha: landing → starter pile → plain-words search locks the right meme](./docs/demo/stranger-to-aha.gif)

This monorepo consolidates the Sploot web application, browser extension, and shared packages.

Sploot is a personal meme library with text→image semantic search: save a
meme once (right-click, share sheet, or iOS shortcut) and later find it by
describing what's in it — no tags, no folders, no remembering filenames.

![Search results for "reaction face meme" returning four ranked matches with confidence scores](./docs/qa/evidence/2026-07-07-sploot-051-readme-frontdoor/app-search-in-action-1440x900.png)

*Search-in-action against a seeded local library — type a description, get
ranked matches with confidence scores. Full walk:
[QA evidence](./docs/qa/evidence/2026-07-07-sploot-051-readme-frontdoor/).*

## ✨ What it does today

- **Save from anywhere**: right-click → "Save to Sploot" (Chrome extension),
  iOS share sheet / shortcut, or drag-and-drop upload on the web app.
- **Find by description**: type what's in the image — text→image semantic
  search (pgvector + CLIP embeddings), not keyword/tag matching.
- **Bangers and piles**: favorite the ones you'll reuse; automatic piles
  group your library by rough theme.

Sploot does not yet learn *your* taste or generate new memes — see
[VISION.md](./VISION.md) for what's shipped versus what's ahead.

## 🧩 Browser extension

Chrome extension (WXT) for one-click "Save to Sploot" from a right-click
context menu. Published listing:
[Chrome Web Store](https://chromewebstore.google.com/detail/sploot/fbhkflbcnllfogefckablkafjknmcfnd).
Source: [`apps/extension`](./apps/extension).

## 🛠️ For developers

This is a Turborepo/pnpm monorepo: web app, browser extension, and shared
packages.

| Workspace | Path | Description |
|-----------|------|-------------|
| **Web App** | [`apps/web`](./apps/web) | Next.js 16 App Router on DigitalOcean, Vercel Blob, pgvector, Clerk Auth. |
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
Sploot's face-by-face status (UI/API/MCP/skill shipped; CLI explicitly
waived, rationale in that doc).

![Sploot Architecture](https://img.shields.io/badge/Architecture-Monorepo-black?style=flat-square&logo=turborepo)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![WXT](https://img.shields.io/badge/Extension-WXT-blue?style=flat-square&logo=googlechrome)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)

### Quick Start

#### Prerequisites
- Node.js 20+
- pnpm 10+ (`npm i -g pnpm`)

#### Installation

```bash
pnpm install
```

#### Local loop, no vendor credentials (recommended first run)

One command from clone to a signed-in, seeded, searchable library — no
Clerk/Neon/Blob/Replicate keys. Requires Docker for the local pgvector
Postgres:

```bash
pnpm dev:local
```

It provisions the database, applies migrations, seeds 24 browsable assets,
boots the web app with qa-local auth (see `apps/web/docs/AUTH.md`), and runs a
doctor pass that writes an evidence packet (health, signed-in `/app`, seeded
grid, search response) to `.sploot-local/doctor/`. When it finishes, open
`http://localhost:3001/api/qa-auth/login` to land signed-in on `/app`.

Teardown (removes the database container and generated files):

```bash
pnpm dev:local:down
```

#### Development against real services

Run all apps simultaneously (Web: localhost:3001, Extension: hot-reload) —
requires `apps/web/.env.local` with real vendor credentials
(`apps/web/.env.example`):

```bash
pnpm dev
```

Or run specific apps:

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
- **Shared Code**: `@sploot/common` is consumed by both `web` and `extension`.
- **CI/CD**: GitHub Actions (Lint, Test, Type-check).
- **Deployment**: 
  - Web: Automatic via DigitalOcean App Platform.
  - Extension: Manual submission to Chrome Web Store.
- **Details**: See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Configuration

Each app has its own env setup:
- Web app: see [`apps/web/README.md`](./apps/web/README.md)
- Extension: see [`apps/extension/README.md`](./apps/extension/README.md)

### Documentation

- [Developer Guide](./CLAUDE.md) - Guidelines for AI agents and developers.
- [Web App Docs](./apps/web/README.md)
- [Extension Docs](./apps/extension/README.md)
- [Architecture](./ARCHITECTURE.md)
- [ADRs](./docs/adr)
