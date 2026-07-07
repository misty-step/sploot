# Sploot Monorepo 🏷️

> **A Vercel-first meme library with text→image semantic search.**

This monorepo consolidates the Sploot web application, browser extension, and shared packages.

![Sploot Architecture](https://img.shields.io/badge/Architecture-Monorepo-black?style=flat-square&logo=turborepo)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)
![WXT](https://img.shields.io/badge/Extension-WXT-blue?style=flat-square&logo=googlechrome)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)

## 📦 Workspaces

| Workspace | Path | Description |
|-----------|------|-------------|
| **Web App** | [`apps/web`](./apps/web) | Next.js 15 App Router, Vercel Blob, pgvector, Clerk Auth. |
| **Extension** | [`apps/extension`](./apps/extension) | Chrome Extension (WXT) for one-click saving. |
| **Common** | [`packages/common`](./packages/common) | Shared constants, types, and utilities. |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 10+ (`npm i -g pnpm`)

### Installation

```bash
pnpm install
```

### Local loop, no vendor credentials (recommended first run)

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

### Development against real services

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

## 🛠️ Commands

We use **Turborepo** to orchestrate tasks.

- **Build**: `pnpm build` (Builds all apps/packages)
- **Lint**: `pnpm lint`
- **Type Check**: `pnpm type-check`
- **Test**: `pnpm test`
- **Clean**: `pnpm clean`

## 🏗️ Architecture

- **Monorepo Tooling**: Turborepo + pnpm workspaces.
- **Shared Code**: `@sploot/common` is consumed by both `web` and `extension`.
- **CI/CD**: GitHub Actions (Lint, Test, Type-check).
- **Deployment**: 
  - Web: Automatic via Vercel.
  - Extension: Manual submission to Chrome Web Store.
- **Details**: See [ARCHITECTURE.md](./ARCHITECTURE.md).

## 🔐 Configuration

Each app has its own env setup:
- Web app: see [`apps/web/README.md`](./apps/web/README.md)
- Extension: see [`apps/extension/README.md`](./apps/extension/README.md)

## 📄 Documentation

- [Developer Guide](./CLAUDE.md) - Guidelines for AI agents and developers.
- [Web App Docs](./apps/web/README.md)
- [Extension Docs](./apps/extension/README.md)
- [Architecture](./ARCHITECTURE.md)
- [ADRs](./docs/adr)
