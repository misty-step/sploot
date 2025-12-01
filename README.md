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

### Development

Run all apps simultaneously (Web: localhost:3000, Extension: hot-reload):

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

## 📄 Documentation

- [Task Tracking](./TASK.md) - Current consolidation status.
- [Developer Guide](./CLAUDE.md) - Guidelines for AI agents and developers.
- [Web App Docs](./apps/web/README.md)
- [Extension Docs](./apps/extension/README.md)
