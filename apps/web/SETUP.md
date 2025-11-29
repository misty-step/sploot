# Sploot Setup Guide

This comprehensive guide covers all the external services and configurations needed to run Sploot.

## Table of Contents
1. [Quick Start](#quick-start)
2. [Clerk Authentication](#1-clerk-authentication)
3. [Vercel Deployment & Blob Storage](#2-vercel-deployment--blob-storage)
4. [PostgreSQL Database with pgvector](#3-postgresql-database-with-pgvector)
5. [Replicate API for Embeddings](#4-replicate-api-for-embeddings)
6. [Environment Variables Reference](#environment-variables-reference)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites
- Node.js 20+ and pnpm installed
- Vercel account (free tier works)
- Git repository created

### Setup Order
1. **Clerk** - Authentication (5 minutes)
2. **Vercel** - Deploy and enable Blob storage (10 minutes)
3. **Database** - Create Postgres with pgvector (10 minutes)
4. **Replicate** - Get API token for embeddings (5 minutes)

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd sploot

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local

# Start development server
pnpm dev
```

---

## 1. Clerk Authentication

### Create Clerk Account
1. Go to [clerk.com](https://clerk.com) and sign up
2. Create a new application with your app name

### Configure Authentication Methods
In Clerk Dashboard, enable:
- ✅ Google OAuth
- ✅ Apple OAuth (requires Apple Developer account)
- ✅ Email Magic Link
- Optional: Email/Password as fallback

### Get API Keys
From Clerk Dashboard → API Keys:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
```

### Test Authentication
```bash
pnpm dev
```
Visit http://localhost:3000 and test sign-in flow

### Production Notes
- Add environment variables to Vercel
- Update Clerk with production domain
- Configure allowed redirect URLs

---

## 2. Vercel Deployment & Blob Storage

### Deploy to Vercel
```bash
npx vercel
```
Follow prompts to link to your Vercel account and project.

### Enable Blob Storage
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your project → "Storage" tab
3. Click "Create Database" → Select "Blob"
4. Name it (e.g., "sploot-images")
5. Select your preferred region

### Get Blob Token
After creation, copy the `BLOB_READ_WRITE_TOKEN`:
```env
BLOB_READ_WRITE_TOKEN=vercel_blob_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### File Organization
Files are stored as:
```
{userId}/{timestamp}-{random}.{extension}

Example: user_123abc/1703123456789-x7b9k2.jpg
```

### Features
- ✅ File type validation (JPEG, PNG, WebP, GIF)
- ✅ File size validation (max 10MB)
- ✅ Unique filename generation
- ✅ User-scoped organization
- ✅ Pre-signed URLs for secure uploads

### Cost Considerations
- **Free tier**: 1GB storage, 1GB bandwidth/month
- **Pro tier**: Pay-as-you-go pricing
- **Tips**: Implement compression, set cache headers

---

## 3. PostgreSQL Database with pgvector

### Create Vercel Postgres
1. In Vercel Dashboard → Storage → Create Database
2. Select "Postgres"
3. Choose region (closest to users)
4. Name it (e.g., "sploot-db")

### Get Connection Strings
```env
POSTGRES_URL="postgres://default:xxxxx@xxx.neon.tech/verceldb?sslmode=require"
POSTGRES_URL_NON_POOLING="postgres://default:xxxxx@xxx.neon.tech/verceldb?sslmode=require"
```

### Enable pgvector Extension
In Vercel Postgres query console:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Run Migrations
```bash
# Generate Prisma Client
pnpm db:generate

# Push schema to database
pnpm db:push

# Or run migrations (production)
pnpm db:migrate
```

### Verify Setup
```bash
# Open Prisma Studio
pnpm db:studio
```

### Database Schema
- **users**: Synced with Clerk
- **assets**: Image metadata
- **asset_embeddings**: Vector embeddings
- **tags**: User-defined tags
- **asset_tags**: Many-to-many relationships

### pgvector Performance
HNSW index configuration:
```sql
CREATE INDEX ON asset_embeddings
USING hnsw (image_embedding vector_cosine_ops)
WITH (m = 24, ef_construction = 128);
```

### Scaling Limits
- Works well up to ~5M vectors
- Beyond that, consider Pinecone/Qdrant

---

## 4. Replicate API for Embeddings

### Create Replicate Account
1. Go to [replicate.com](https://replicate.com)
2. Sign up with GitHub, Google, or email

### Get API Token
1. Go to [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)
2. Create token named "sploot-embeddings"
3. Copy token (starts with `r8_`)

### Configure Environment
```env
REPLICATE_API_TOKEN=r8_your_actual_token_here
```

### Model Information
- **Model**: SigLIP Large Patch16-384
- **ID**: `daanelson/siglip-large-patch16-384`
- **Embedding dimension**: 1152
- **Supports**: Text and image inputs

### Pricing
- First $10/month free
- ~$0.0002 per embedding
- 5,000 images ≈ $1

### Performance Notes
- First request may be slow (cold start)
- Subsequent requests ~1-2 seconds
- Consider batch processing for multiple images

---

---

## Environment Variables Reference

Create `.env.local` with all required variables:

```env
# Clerk Authentication (Required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Vercel Blob Storage (Required)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# PostgreSQL Database (Required)
POSTGRES_URL=postgres://...
POSTGRES_URL_NON_POOLING=postgres://...

# Replicate API (Required for search)
REPLICATE_API_TOKEN=r8_...

# Optional: Prisma Studio
DATABASE_URL=${POSTGRES_URL_NON_POOLING}
```

### Deploy to Vercel
Add all environment variables in Vercel Dashboard:
1. Project Settings → Environment Variables
2. Add each variable
3. Select all environments (Production, Preview, Development)

---

## Troubleshooting

### Common Issues

#### Authentication Problems
- **Missing API keys**: Check `.env.local` has valid Clerk keys
- **Redirect loops**: Verify middleware.ts route matchers
- **OAuth not working**: Enable providers in Clerk Dashboard

#### Blob Storage Issues
- **"Not configured"**: Ensure `BLOB_READ_WRITE_TOKEN` is set
- **Upload fails**: Check authentication and file size/type
- **401 errors**: Verify you're signed in

#### Database Connection
- **Extension not found**: Run `CREATE EXTENSION vector;`
- **Connection errors**: Check environment variables and SSL mode
- **Slow searches**: Verify HNSW index exists

#### Embedding Service
- **Token not configured**: Add `REPLICATE_API_TOKEN`
- **Rate limiting**: Consider upgrading or implementing caching
- **Slow embeddings**: First requests have cold start

#### Cache Status
- **In-memory cache**: Always enabled, no configuration needed
- **Performance**: Automatically manages memory usage
- **Stats endpoint**: Check `/api/cache/stats` for metrics

### Performance Optimization

#### Upload Performance
- Resize images before upload
- Use WebP format when possible
- Implement client-side compression

#### Search Performance
- Ensure HNSW index is created
- Tune `ef_search` parameter
- Use Redis caching

#### Database Performance
```sql
-- Check index usage
SELECT * FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%hnsw%';

-- Vacuum for performance
VACUUM ANALYZE asset_embeddings;

-- Check table sizes
SELECT pg_size_pretty(pg_total_relation_size('asset_embeddings'));
```

### Getting Help

1. Check console logs for specific errors
2. Verify all environment variables
3. Test services individually
4. Review service dashboards for status

### Support Resources
- [Clerk Documentation](https://clerk.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Replicate Documentation](https://replicate.com/docs)
- [pgvector Documentation](https://github.com/pgvector/pgvector)

---

## Production Checklist

Before going to production:

- [ ] All environment variables configured in Vercel
- [ ] Database migrations run successfully
- [ ] Authentication providers enabled in Clerk
- [ ] Blob storage limits understood
- [ ] Monitoring and alerts configured
- [ ] Backup strategy in place
- [ ] Cost monitoring enabled for all services

---

## Next Steps

After completing setup:

1. **Test core functionality**:
   - Sign in/out flow
   - Upload an image
   - Search for content
   - Toggle favorites

2. **Performance testing**:
   - Upload multiple images
   - Test search speed
   - Monitor cache hit rates

3. **Production preparation**:
   - Set up monitoring
   - Configure backups
   - Plan scaling strategy

---

*For additional help, check the [README](./README.md) or open an issue on GitHub.*