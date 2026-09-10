# Sploot

> **A private library for your memes and screenshots.** Save from anywhere in
> one click, then find any of them by typing what's in the picture.

**[sploot.mistystep.io](https://sploot.mistystep.io)** — sign-in required; registration is closed.

The retained predecessor's historical starter-pile walkthrough uses precomputed
CLIP vectors (see `docs/design/lab-053-stranger-aha.html`); it is not the local
runtime's startup or acceptance path:

![Stranger to aha: landing → starter pile → plain-words search locks the right meme](./docs/demo/stranger-to-aha.gif)

This monorepo contains the self-contained Go product, the retained Next.js
predecessor source, the WXT Chrome extension, MCP server, and shared contracts.
The canonical hosted Go instance is separate from local development libraries.

Sploot is a personal meme library with text→image semantic search: save a
meme once and later find it by describing what's in it — no remembering
filenames.

![Search results for "reaction face meme" returning four ranked matches with confidence scores](./docs/qa/evidence/2026-07-07-sploot-051-readme-frontdoor/app-search-in-action-1440x900.png)

*Historical, seeded-local search walkthrough from 2026-07-07, not current hosted
verification. This selected screenshot remains a public documentation asset;
its retained [source packet](./docs/qa/evidence/2026-07-07-sploot-051-readme-frontdoor/)
records the original exercise.*

## What it does today

- **Capture originals**: upload JPEG, PNG, WebP, GIF, MP4, or WebM from a desktop
  or mobile browser; use the device-paired Chrome extension for right-click
  capture and visible-tab screenshots.
- **Find by description**: new captures and new queries use real local CPU
  CLIP inference and SQLite vector retrieval, not a seeded-only search cache.
- **Keep a private library**: real accounts, favorites, tags, shuffle, trash and
  restore, original downloads, explicit revocable sharing, and owner ZIP export.
- **Keep your data**: accounts, media, and indexing state survive shutdown and
  restart; an operator backup/verify/restore tool covers the full local library.

Sploot does not learn your taste or generate new memes. Automatic piles belong
to the Next.js predecessor, not the local Go route surface.

[`apps/server`](./apps/server) owns local accounts, SQLite, private filesystem
media, and pinned local inference. Starting it does not alter an existing
predecessor deployment. The explicit offline converter preserves captured stored
bytes, historical metadata and separate owners; it is not a Go-on-Postgres
deployment. See [runtime operations, migration and recovery](./apps/web/docs/DEPLOYMENT.md).

Responsive mobile-browser capture, playback, and download have been exercised;
that is not physical iPhone or Apple Shortcuts acceptance. The
[iPhone Shortcut procedure](./apps/web/docs/shortcuts/save-to-sploot.md) explains
instance-specific unsigned source, reachable HTTPS origins, and the separate
Apple signing/device requirements. There is no verified install link.
[VISION.md](./VISION.md) is optional product intent, not a delivery roadmap.

## Browser extension

The WXT extension pairs with the selected self-contained Sploot instance using
a revocable device credential. Passwords stay on the instance's browser sign-in
page; the extension does not use Clerk or inherit the browser's session.
See the [run/load procedure](./apps/extension/README.md).

For the hosted library, select `https://sploot.mistystep.io` in the extension.
Its development default remains loopback; instance selection is stored in that
browser profile. MCP's hosted default is `https://sploot.mistystep.io/api`;
an explicit override still selects a separate local or self-hosted instance.

An unpacked Chromium build and local pairing/capture proof are not a Chrome Web
Store release. No current submission, live listing, or publication receipt is
claimed.

## For developers

This is a Turborepo/pnpm workspace with a persistent Go runtime and retained
TypeScript clients and predecessor.

| Workspace | Path | Description |
|-----------|------|-------------|
| **Go Server** | [`apps/server`](./apps/server) | Persistent Go HTTP + HTML/HTMX, local accounts, SQLite/sqlite-vec, private media, CPU CLIP. |
| **Web Predecessor** | [`apps/web`](./apps/web) | Retained Next.js source and provider data; Prisma/pgvector and predecessor gates remain separate from native serving. |
| **Extension** | [`apps/extension`](./apps/extension) | Chrome Extension (WXT) for one-click saving. |
| **MCP Server** | [`apps/mcp`](./apps/mcp) | `sploot-mcp` — save + search as agent tools over the [published API](./apps/web/docs/PUBLIC_API.md). |
| **Common** | [`packages/common`](./packages/common) | Shared constants, types, and utilities. |

## Agent access

Agents (and the operator's agent fleet) save and search Sploot without a
browser: the **sploot MCP server** (`apps/mcp`) exposes `sploot_search` and
`sploot_save` as tools over a personal API token, and the
**`misty-sploot`** skill teaches the verbs. See
[`apps/web/docs/PUBLIC_API.md`](./apps/web/docs/PUBLIC_API.md) for the
published contract and [`docs/five-faces.md`](./docs/five-faces.md) for
Sploot's surface boundaries. Local clients must target the selected instance
origin; personal `splt_` tokens permit save/search, not private media or account
management. The operator `sploot` binary is not a consumer save/search CLI
(that face remains waived).

![Sploot Architecture](https://img.shields.io/badge/Architecture-Monorepo-black?style=flat-square&logo=turborepo)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![WXT](https://img.shields.io/badge/Extension-WXT-blue?style=flat-square&logo=googlechrome)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)

### Quick Start

#### Prerequisites

- Node.js 22+ and the pinned pnpm 10.22.0 (via Corepack).
- Go 1.26+ as declared in `apps/server/go.mod`, with CGO, a C compiler, and
  SQLite development headers (`sqlite` on Arch; `libsqlite3-dev` on Debian/Ubuntu).
- FFmpeg and ffprobe on `PATH`.
- glibc Linux or macOS on amd64/arm64 for the pinned native ONNX Runtime.
  Alpine/musl and Windows are not supported by the current model bundle.
- Internet access for the first model/runtime download; no SaaS credentials,
  GPU, external inference daemon, Docker, Postgres, or Prisma setup is required
  for the host runtime. A [container alternative](./apps/web/docs/DEPLOYMENT.md#container-runtime)
  supplies the Go build and media prerequisites.

#### Start a real local library

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev:local` is the same persistent launcher. Wait for **Sploot ready**, open
`http://127.0.0.1:3001`, and register a real account at `/sign-up` (passwords are
12–128 characters). No QA login, pre-created user, seeded media, or provider key
is required. Upload something new and search for it after indexing becomes ready.

The launcher stores the library in **`.sploot-local/library` at the repository
root**, including `library.sqlite`, private `media/`, and `signing.key`.
**Ctrl-C/SIGTERM stops the service and never deletes accounts or media.** Run the
same command to reopen that library. Model/runtime artifacts live separately in
the operating-system cache under `sploot/models`; the manifest in
[`bundle.json`](./apps/server/internal/inference/bundle.json) pins their sizes,
SHA-256 hashes, 512-D CLIP projections, and CPU runtime. Missing artifacts download
automatically on first startup; verified artifacts are reused offline.
The library opens while preparation runs. If inference cannot initialize, saves,
browsing, downloads and export remain available; search reports its actual
unavailable state. Repair the model installation and restart to resume indexing.

Choose a different persistent library or port explicitly:

```sh
pnpm dev:local --data-dir "$HOME/.local/share/sploot/library" --port 3002
```

Relative command-line paths are resolved by the server process, whose pnpm
launcher runs in `apps/server`; use absolute paths for overrides.
Storage admission is instance-wide, not a per-account plan: the default has no
artificial capacity ceiling and preserves 1 GiB of free disk. Operators can set
`SPLOOT_STORAGE_LIMIT_BYTES` and `SPLOOT_STORAGE_RESERVE_BYTES`. Settings shows
your retained bytes and lets you explicitly delete unwanted trash permanently;
ordinary trash still occupies disk.

#### Prepare, inspect, and build

In a second terminal while the app runs:

```sh
pnpm --filter server run doctor
pnpm --filter server run doctor --url http://127.0.0.1:3002
```

Doctor reads the selected running instance's readiness endpoint; it does not
create an account, perform a save, or prove retrieval quality.

Preparation is optional because startup does it automatically. To prepare the
default cache before starting, or build the two operator binaries:

```sh
pnpm --filter server models:prepare
pnpm --filter server build
apps/server/build/sploot serve --data-dir "$PWD/.sploot-local/library"
```

Stop the earlier instance before starting the binary on the same port. The
build emits `apps/server/build/sploot` and `apps/server/build/library-backup`.
The binary embeds the UI and initializes/migrates its SQLite schema itself.
Use [runtime configuration and backup/verify/restore](./apps/web/docs/DEPLOYMENT.md#self-contained-go-runtime)
for private-directory requirements, custom model caches, container persistence,
and recovery credential invalidation.

The finite `pnpm --filter server smoke` command owns a separate temporary
acceptance library and exercises the real app in Chromium; it does not reset
the ordinary library. Go integration tests use isolated SQLite state, not a
`DATABASE_URL`. The retained Next.js database paths still require their own
pgvector evidence and unchanged gates.

#### Other surfaces

Next.js development and extension development remain separate commands. Next.js
still needs its existing service configuration; it is not the default local
product. Do not bind it and Go to the same port:

```sh
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
- **Shared Code**: `@sploot/common` owns upload/MIME/API contracts; Go generates its bounds from common and takes model identity from its local inference bundle.
- **CI/CD**: GitHub Actions (Lint, Test, Type-check).
- **Deployment**: 
  - Local Go: persistent data directory and separate reusable model cache.
  - Retained Next.js predecessor: historical DigitalOcean App Platform runtime retired on 2026-09-10; source and provider contracts remain retained, not current serving authority.
  - Extension: Manual submission to Chrome Web Store.
- **Details**: See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Configuration

Each app has its own env setup:
- Web app: see [`apps/web/README.md`](./apps/web/README.md)
- Self-contained Go: [runtime, deployment, and recovery](./apps/web/docs/DEPLOYMENT.md)
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
