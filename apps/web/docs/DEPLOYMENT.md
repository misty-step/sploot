# Sploot Deployment Guide

This comprehensive guide walks you through deploying Sploot to Vercel with all services configured.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Vercel Deployment](#vercel-deployment)
4. [Service Configuration](#service-configuration)
5. [Database Setup](#database-setup)
6. [Post-Deployment](#post-deployment)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)
9. [Production Checklist](#production-checklist)

## Prerequisites

Before deploying, ensure you have:

- [ ] Node.js 20+ installed locally
- [ ] Git repository with your code
- [ ] GitHub, GitLab, or Bitbucket account
- [ ] Vercel account (free tier works)
- [ ] Accounts for external services:
  - Clerk (authentication)
  - Replicate (AI embeddings)
  - Upstash (caching - optional)

## Initial Setup

### 1. Prepare Your Repository

```bash
# Clone the repository
git clone https://github.com/yourusername/sploot.git
cd sploot

# Install dependencies
pnpm install

# Test locally
pnpm dev
```

### 2. Create Service Accounts

#### Clerk Authentication
1. Sign up at [clerk.com](https://clerk.com)
2. Create new application
3. Enable authentication methods:
   - Google OAuth
   - Apple OAuth
   - Email Magic Link
4. Note your API keys

#### Replicate AI
1. Sign up at [replicate.com](https://replicate.com)
2. Go to Account Settings
3. Generate API token
4. Save the token securely

#### Upstash Redis (Optional)
1. Sign up at [upstash.com](https://upstash.com)
2. Create Redis database
3. Choose your region
4. Copy REST URL and token

### 3. Environment Variables

Create a `.env.production` file with all required variables:

```env
# Clerk (Required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app

# Database (Will be added by Vercel)
# POSTGRES_URL=
# POSTGRES_URL_NON_POOLING=

# Blob Storage (Will be added by Vercel)
# BLOB_READ_WRITE_TOKEN=

# Replicate (Required)
REPLICATE_API_TOKEN=r8_...

# Upstash (Optional but recommended)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Feature Flags
NEXT_PUBLIC_ENABLE_PWA=true
MOCK_MODE=false
```

## Vercel Deployment

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Initial Deployment

```bash
# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# Answer the prompts:
# - Link to existing project? No (first time)
# - What's your project name? sploot
# - In which directory is your code? ./
# - Want to modify settings? No
```

### 3. Connect GitHub Repository

For automatic deployments:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Git
4. Connect your GitHub repository
5. Configure branch:
   - Production Branch: `main` or `master`
   - Preview Branches: All other branches

## Service Configuration

### 1. Enable Vercel Blob Storage

```bash
# Via CLI
vercel blob add

# Or via Dashboard:
# 1. Go to Storage tab
# 2. Click "Create Database"
# 3. Select "Blob"
# 4. Name: sploot-images
# 5. Select region closest to users
```

### 2. Create PostgreSQL Database

```bash
# Via CLI
vercel postgres create sploot-db

# Or via Dashboard:
# 1. Go to Storage tab
# 2. Click "Create Database"
# 3. Select "Postgres"
# 4. Name: sploot-db
# 5. Select region (same as Blob)
```

### 3. Configure Environment Variables

```bash
# Add all environment variables
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_SECRET_KEY production
vercel env add REPLICATE_API_TOKEN production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production

# Or via Dashboard:
# Settings → Environment Variables
# Add each variable for Production environment
```

## Database Setup

### 1. Connect to Database

```bash
# Get connection string
vercel env pull .env.local

# Connect to database
pnpm db:push
```

### 2. Enable pgvector Extension

```sql
-- Connect to your database using Vercel Dashboard or psql
-- Go to Storage → Your Database → Query

CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Run Migrations

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Verify connection
pnpm db:studio
```

### 4. Optimize pgvector Index

After initial deployment, optimize the HNSW index:

```sql
-- In Vercel Dashboard → Storage → Query
-- Adjust HNSW parameters for production
ALTER INDEX asset_embeddings_embedding_idx
SET (hnsw.m = 24, hnsw.ef_construction = 128);

-- Set runtime search parameter
SET hnsw.ef_search = 100;
```

## Post-Deployment

### 1. Verify Deployment

```bash
# Get deployment URL
vercel ls

# Open in browser
open https://sploot.vercel.app
```

### 2. Test Critical Features

- [ ] Sign up with email/Google
- [ ] Upload an image
- [ ] Search for content
- [ ] Toggle favorites
- [ ] Install as PWA

### 3. Configure Custom Domain (Optional)

```bash
# Add custom domain
vercel domains add yourdomain.com

# Or via Dashboard:
# Settings → Domains → Add Domain
```

### 4. Enable Analytics

1. Go to Analytics tab in Vercel Dashboard
2. Enable Web Analytics (free)
3. Optional: Enable Speed Insights

## Monitoring & Maintenance

### 1. Set Up Monitoring

#### Vercel Analytics
- Automatically enabled
- Check Analytics tab for metrics

#### Error Tracking (Optional)
```env
# Add to environment variables
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_AUTH_TOKEN=...
```

### 2. Database Maintenance

```bash
# Backup database (weekly)
vercel postgres backup sploot-db

# Monitor connections
vercel postgres info sploot-db
```

### 3. Performance Monitoring

Check regularly:
- Vercel Analytics → Web Vitals
- Function execution times
- Database query performance
- Blob storage usage

### 4. Cost Management

Monitor usage to stay within limits:
- Vercel: Function executions, bandwidth
- Clerk: Monthly active users
- Replicate: API calls
- Upstash: Commands and storage
- Database: Storage and compute

## Troubleshooting

### Common Issues and Solutions

#### Build Failures

```bash
# Clear cache and rebuild
vercel --force

# Check build logs
vercel logs
```

#### Database Connection Issues

```bash
# Verify environment variables
vercel env ls

# Test connection
pnpm db:push
```

#### Slow Performance

1. Check pgvector index:
```sql
SELECT * FROM pg_indexes
WHERE tablename = 'asset_embeddings';
```

2. Verify Redis cache:
```bash
# Check cache hit rates
curl https://yourdomain.com/api/cache/stats
```

3. Enable Turbopack for faster builds:
```json
// package.json
"build": "next build --turbopack"
```

#### Authentication Issues

1. Verify Clerk keys:
   - Production keys (pk_live_, sk_live_)
   - Redirect URLs configured
   - OAuth providers enabled

2. Check middleware:
```typescript
// middleware.ts should protect routes
```

#### Upload Failures

1. Check Blob token:
```bash
vercel env get BLOB_READ_WRITE_TOKEN
```

2. Verify file size limits (10MB max)
3. Check supported formats (JPEG, PNG, WebP, GIF)

## Production Checklist

Before going live, ensure:

### Security
- [ ] Production API keys configured
- [ ] Environment variables secured
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] Rate limiting configured
- [ ] Authentication required on all routes

### Performance
- [ ] pgvector index optimized
- [ ] Redis cache enabled
- [ ] Image optimization enabled
- [ ] Turbopack enabled for builds
- [ ] CDN caching configured

### Database
- [ ] pgvector extension enabled
- [ ] Indexes created and optimized
- [ ] Connection pooling enabled
- [ ] Backup schedule configured

### Monitoring
- [ ] Error tracking configured
- [ ] Analytics enabled
- [ ] Performance monitoring active
- [ ] Uptime monitoring configured

### Features
- [ ] PWA manifest valid
- [ ] Service worker registered
- [ ] Offline support working
- [ ] Search functioning correctly
- [ ] Upload pipeline tested

### Documentation
- [ ] API documentation current
- [ ] README updated
- [ ] Environment variables documented
- [ ] Deployment process documented

## Rollback Strategy

If issues arise after deployment:

### Quick Rollback

```bash
# List recent deployments
vercel ls

# Rollback to previous
vercel rollback [deployment-url]

# Or via Dashboard:
# Deployments → Select previous → Promote to Production
```

### Database Rollback

```bash
# Restore from backup
vercel postgres restore sploot-db --backup-id [id]
```

## Scaling Considerations

As your application grows:

### Database Scaling
- Move to Postgres Pro for larger databases
- Consider read replicas for search
- Implement connection pooling

### Vector Search Scaling
- Monitor pgvector performance
- Consider migration to Pinecone/Qdrant at >1M vectors
- Implement result caching aggressively

### Storage Scaling
- Monitor Blob storage usage
- Implement lifecycle policies
- Consider CDN for images

### Caching Strategy
- Increase Redis cache sizes
- Implement edge caching
- Use ISR for static content

## Support and Resources

### Documentation
- [Vercel Docs](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Clerk Docs](https://clerk.com/docs)
- [pgvector Guide](https://github.com/pgvector/pgvector)

### Getting Help
- [Vercel Support](https://vercel.com/support)
- [GitHub Issues](https://github.com/yourusername/sploot/issues)
- [Discord Community](https://discord.gg/vercel)

### Monitoring Tools
- [Vercel Status](https://www.vercel-status.com/)
- [Better Uptime](https://betteruptime.com/) (external monitoring)
- [Checkly](https://www.checklyhq.com/) (synthetic monitoring)

---

## Next Steps

After successful deployment:

1. **Test Everything**: Run through all user flows
2. **Monitor Metrics**: Watch performance for 24-48 hours
3. **Optimize**: Fine-tune based on real usage
4. **Document Issues**: Keep notes on any problems
5. **Share**: Get feedback from beta users

Congratulations! Your Sploot instance is now live on Vercel. 🎉

For updates and new features, check the [changelog](./CHANGELOG.md) and follow the [upgrade guide](./UPGRADE.md).