# Sploot 🏷️

> **A Vercel-first meme library with text→image semantic search**

Sploot is a blazing-fast, private meme collection tool that lets you store, browse, and semantically search your images using natural language queries. Built for the modern web with Next.js 15, Vercel's ecosystem, and AI-powered embeddings.

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square&logo=pwa)

## ✨ Features

- **🔍 Semantic Search**: Find memes with natural language queries like "distracted boyfriend" or "this is fine"
- **⚡ Lightning Fast**: Sub-500ms search with multi-layer caching
- **🎯 Smart Upload**: Drag-drop, paste, or click to upload with automatic deduplication
- **📱 PWA Support**: Install as an app on any device with offline browsing
- **🔒 Private by Design**: Your meme collection stays yours with Clerk authentication
- **🏷️ Organization**: Favorite and tag your memes for easy filtering
- **🌐 Vercel Native**: Built on Vercel's platform for optimal performance

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) with App Router & Turbopack
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5+
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **Database**: [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) with pgvector
- **Storage**: [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- **Auth**: [Clerk](https://clerk.com) (Google, Apple, Magic Link)
- **Embeddings**: [Replicate](https://replicate.com) (SigLIP model)
- **Cache**: [Upstash Redis](https://upstash.com) (optional)
- **PWA**: [@ducanh2912/next-pwa](https://github.com/DucanH2912/next-pwa)

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 20.0+ installed
- **pnpm** 10.15+ (install with `npm install -g pnpm`)
- **Git** for version control
- **Vercel account** for deployment
- **External service accounts** (see Setup section)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/sploot.git
cd sploot
pnpm install
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
# Edit .env.local with your actual API keys and credentials
```

**Note:** Only `.env.example` is committed to git. All other `.env*` files are gitignored for security.

### 3. Configure External Services

Follow these guides in order:

1. **[Clerk Authentication](./SETUP.md#1-clerk-authentication)** - User authentication
2. **[Vercel Deployment](./SETUP.md#2-vercel-deployment--blob-storage)** - Deploy and enable Blob storage
3. **[Database Setup](./SETUP.md#3-postgresql-database-with-pgvector)** - PostgreSQL with pgvector
4. **[Replicate API](./SETUP.md#4-replicate-api-for-embeddings)** - AI embeddings
5. **[Redis Cache](./SETUP.md#5-upstash-redis-for-caching-optional)** - Performance optimization (optional)

### 4. Initialize Database

```bash
pnpm db:push        # Push schema to database
pnpm db:seed        # Optional: Add sample data
```

### 5. Start Development Server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your app!

## 📁 Project Structure

```
sploot/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── assets/        # Asset management
│   │   ├── search/        # Search endpoints
│   │   └── upload-url/    # Upload handling
│   ├── app/               # Protected app pages
│   ├── sign-in/           # Auth pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── upload/           # Upload components
│   ├── search/           # Search interface
│   └── navigation/       # Nav components
├── lib/                   # Core utilities
│   ├── auth/             # Authentication
│   ├── db.ts             # Database utilities
│   ├── embeddings.ts     # AI embeddings
│   └── blob.ts           # Storage utilities
├── prisma/               # Database schema
├── public/               # Static assets
│   ├── icons/           # PWA icons
│   └── manifest.json    # PWA manifest
├── styles/              # Global styles
└── docs/                # Documentation
```

## 🔧 Development Commands

```bash
# Development
pnpm dev              # Start dev server with Turbopack
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm type-check       # TypeScript checking

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed sample data

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Generate coverage report

# Assets
pnpm generate-icons   # Generate PWA icons
pnpm generate-og      # Generate OG image
```

## 🔐 Environment Variables

Create a `.env.local` file with these variables:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database (CRITICAL: Use DATABASE_URL, not POSTGRES_URL)
# Must use pooler endpoint (-pooler hostname) with pgbouncer=true parameter
# See docs/architecture/database-connection.md for details
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Replicate API (Embeddings)
REPLICATE_API_TOKEN=r8_...

# Upstash Redis (Optional)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Development Options
MOCK_MODE=true        # Use mock data (no external services)
```

**Important:** Always use `DATABASE_URL` (Prisma standard), not custom env var names like `POSTGRES_URL`. For serverless deployment, the connection string MUST use the pooler endpoint with `pgbouncer=true` parameter. See [Database Connection Architecture](./docs/architecture/database-connection.md) for detailed explanation.

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test api          # API endpoint tests
pnpm test integration  # Integration tests
pnpm test components   # Component tests

# Generate coverage report
pnpm test:coverage
```

### Mock Mode

For local development without external services:

```bash
MOCK_MODE=true pnpm dev
```

Mock mode provides:
- Simulated authentication
- In-memory storage
- Fake embeddings
- Sample search results

## 🚢 Deployment

### Deploy to Vercel

1. **Push to GitHub**:
   ```bash
   git push origin main
   ```

2. **Import to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Configure environment variables (see below)
   - Deploy!

3. **Configure Environment Variables in Vercel**:
   ```bash
   # CRITICAL: Use printf to avoid trailing newlines
   # Get DATABASE_URL from Neon Console (pooler endpoint)
   printf '%s' "postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true" | \
     vercel env add DATABASE_URL production

   # Add other required variables
   vercel env add CLERK_SECRET_KEY production
   vercel env add BLOB_READ_WRITE_TOKEN production
   vercel env add REPLICATE_API_TOKEN production
   ```

   See [Database Connection Architecture](./docs/architecture/database-connection.md) for DATABASE_URL requirements.

4. **Post-Deployment**:
   - Enable Blob Storage in Vercel Dashboard
   - Create Postgres database (Neon recommended)
   - Run database migrations
   - Test all features

### Production Checklist

- [ ] All environment variables configured
- [ ] Database migrations run
- [ ] pgvector extension enabled
- [ ] Blob storage active
- [ ] Clerk production keys set
- [ ] Redis cache configured
- [ ] PWA manifest updated
- [ ] OG images generated

## 📊 Performance

### Service Level Objectives (SLOs)

- **Upload Processing**: < 2.5s p95
- **Search Response**: < 500ms p95
- **Initial Page Load**: < 1.5s
- **Image Grid Render**: < 300ms for 100 images

### Optimization Tips

1. **Enable Turbopack** for faster builds:
   ```json
   "scripts": {
     "dev": "next dev --turbopack",
     "build": "next build --turbopack"
   }
   ```

2. **Use Redis caching** for frequently searched queries
3. **Enable CDN** for blob storage URLs
4. **Optimize images** with Next.js Image component

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit with semantic messages (`git commit -m 'feat: add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Commit Convention

We use semantic commit messages:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/config changes

## 📚 Documentation

- [API Documentation](docs/API.md) - Complete API reference
- [Architecture](docs/ARCHITECTURE.md) - System design and decisions
- [Local Development](docs/LOCAL_DEV_MOCK_MODE.md) - Development without external services
- [Design System](AESTHETIC.md) - UI/UX guidelines

## 🐛 Troubleshooting

### Common Issues

**Database connection errors:**
```bash
# Verify connection
pnpm db:push

# Reset database
pnpm db:reset
```

**Upload failures:**
- Check Blob token is valid
- Verify file size < 10MB
- Ensure supported format (JPEG, PNG, WebP, GIF)

**Search not working:**
- Confirm Replicate API token is set
- Check pgvector extension is enabled
- Verify embeddings are generated

**PWA not installing:**
- Must be served over HTTPS
- Check manifest.json is valid
- Verify service worker registration

## 📈 Roadmap

### Current Version (v1.0)
- ✅ Core upload and search
- ✅ Semantic search with SigLIP
- ✅ PWA support
- ✅ Multi-layer caching
- ✅ Favorites and tags

### Planned Features (v2.0)
- [ ] Batch upload operations
- [ ] OCR text extraction
- [ ] GIF/video support
- [ ] Public sharing links
- [ ] Advanced search filters
- [ ] Team workspaces

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Vercel](https://vercel.com) for the amazing platform
- [Clerk](https://clerk.com) for authentication
- [Replicate](https://replicate.com) for AI embeddings
- [Next.js](https://nextjs.org) team for the framework
- All contributors and meme enthusiasts!

---

Built with ❤️ by the Sploot team. Happy meme searching! 🎉