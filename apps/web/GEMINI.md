# GEMINI.md

This file serves as a context guide for Gemini agents working in the `sploot-extension-auth` directory.

## Project Overview

**Sploot** is a Vercel-first, private meme library application that leverages AI for semantic search. Users can upload images, which are then processed to generate embeddings (using SigLIP via Replicate), allowing for natural language search (e.g., "distracted boyfriend"). It is built as a Progressive Web App (PWA).

### Key Features
*   **Semantic Search:** Text-to-image search using vector embeddings (`pgvector`).
*   **Storage:** Vercel Blob for high-performance image storage.
*   **Authentication:** Secure user management via Clerk.
*   **PWA:** Installable on devices with offline capabilities.
*   **Observability:** Comprehensive logging and analytics integration.

## Technology Stack

*   **Framework:** Next.js 15 (App Router, Turbopack)
*   **Language:** TypeScript 5+
*   **Styling:** Tailwind CSS v4 (Geist Sans, JetBrains Mono fonts)
*   **Database:** PostgreSQL (Vercel Postgres) with `pgvector` extension
*   **ORM:** Prisma
*   **Authentication:** Clerk
*   **AI Model:** Replicate (SigLIP)
*   **Testing:** Vitest

## Directory Structure

*   `app/`: Next.js App Router files (pages, layouts, API routes).
*   `components/`: Reusable React components (UI, features).
*   `lib/`: Core logic, utilities, and service integrations (DB, Auth, AI).
*   `prisma/`: Database schema (`schema.prisma`) and migrations.
*   `scripts/`: Utility scripts for maintenance, testing, and deployment validation.
*   `docs/`: detailed documentation on API, architecture, and observability.
*   `public/`: Static assets.

## Development Workflow

### Building and Running
*   **Install Dependencies:** `pnpm install`
*   **Start Dev Server:** `pnpm dev` (runs on `http://localhost:3000`)
*   **Build for Production:** `pnpm build`
*   **Start Production Server:** `pnpm start`

### Database Management
*   **Push Schema:** `pnpm db:push` (Fast schema prototyping)
*   **Run Migrations:** `pnpm db:migrate` (Production migrations)
*   **Generate Client:** `pnpm db:generate`
*   **Seed Data:** `pnpm db:seed`
*   **Studio:** `pnpm db:studio`

### Testing & Quality
*   **Run Tests:** `pnpm test` (Vitest)
*   **Test UI:** `pnpm test:ui`
*   **Type Check:** `pnpm type-check`
*   **Lint:** `pnpm lint`
*   **Validate Deployment:** `pnpm validate:deployment`

## Coding Conventions & Standards

### Observability
*   **Logging:** **Do not** use `console.log`. Use `lib/observability-logger.ts`.
    *   `logger.logInfo('Event', { metadata })`
    *   `logger.logError('Error', errorObj)`
*   **Analytics:** Use `lib/analytics.ts` for tracking user events.
*   **Performance:** Use `lib/performance-monitor.ts` for timing critical operations.

### Styling (Design System)
*   **Aesthetic:** "Minimal × Technical"
*   **Fonts:** Geist Sans (UI), JetBrains Mono (Data/Technical).
*   **Colors:** Dark mode only. Pure Black background. Accents: Neon Violet (`#7C5CFF`), Terminal Green/Red/Yellow for status.
*   **Spacing:** 4px base unit.

### Architecture
*   **API Routes:** Wrap handlers with `withObservability` from `lib/with-observability.ts`.
*   **Error Handling:** Failures in telemetry/observability should strictly catch errors and **never** block the main user flow.
*   **Security:** All API routes must be protected via Clerk middleware/auth checks.

### Git & Commits
*   Follow **Semantic Commit Messages**: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`.

## Critical Configuration Files
*   `next.config.ts`: Next.js configuration.
*   `prisma/schema.prisma`: Database models (User, Asset, AssetEmbedding, Tag).
*   `instrumentation.ts`: Observability setup (Sentry).
*   `middleware.ts`: Auth and routing middleware.
