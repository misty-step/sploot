# Sploot Web App 🌐

> **The core meme library experience.**

A Next.js 15 Progressive Web App (PWA) enabling semantic search over your personal meme collection.

## ✨ Key Features

- **Semantic Search**: Text-to-image search using SigLIP embeddings + pgvector.
- **PWA**: Installable, offline-capable.
- **Storage**: High-performance Vercel Blob storage.
- **Auth**: Clerk (Google, Apple, Magic Link).
- **Stack**: Next.js 15 (App Router), Tailwind CSS v4, Prisma, Neon Postgres.

## 🚀 Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env.local` and configure:

```env
# Database (Neon with pgvector + PgBouncer)
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true"

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_AUTHORIZED_PARTIES=https://sploot.app,https://www.sploot.app,http://localhost:3001,chrome-extension://<extension-id>

# Storage (Vercel Blob)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# AI (Replicate)
REPLICATE_API_TOKEN=r8_...

# Agent observability (Canary, optional but expected in production)
CANARY_ENDPOINT=https://canary-obs.fly.dev
CANARY_API_KEY=<ingest-scoped key>
CANARY_SERVICE_NAME=sploot-web
```

### 2. Development

```bash
pnpm dev
```
Runs on [http://localhost:3001](http://localhost:3001).

For extension QA, `CLERK_AUTHORIZED_PARTIES` must include the loaded Chrome
extension origin (`chrome-extension://<id>`) and the local web origin used by
`VITE_API_BASE_URL`.

### 3. Database Management

We use Prisma with Neon.

```bash
pnpm db:push        # Push schema changes
pnpm db:studio      # Open database GUI
pnpm db:seed        # Seed initial data
```

## 🧪 Testing

```bash
pnpm test           # Run Vitest
pnpm test:ui        # Open Test UI
```

## 📦 Deployment

Deployed automatically to Vercel on push to `master`.
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm turbo run build --filter=web`
