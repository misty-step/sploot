# API Route Test Coverage Analysis

**Generated**: 2025-11-08
**Test Run**: All 713 tests passing
**Overall Coverage**: 18.32% statements

## Executive Summary

Current API route test coverage is **31.8%** (7/22 routes tested). High-priority routes (health, cron jobs, caching) are well-covered. User-facing API routes (assets, search, tags) need test coverage.

## Coverage by Route

### ✅ Tested Routes (7/22 - 31.8%)

| Route | Coverage | Tests | Priority |
|-------|----------|-------|----------|
| `/api/health` | 58.06% | health.test.ts | Critical ✓ |
| `/api/assets/[id]/share` | 80% | share-flow.test.ts | High ✓ |
| `/api/cache/stats` | 87.91% | cache-stats.test.ts | Medium ✓ |
| `/api/cron/audit-assets` | 98.6% | audit-assets.test.ts | High ✓ |
| `/api/cron/process-embeddings` | 96.2% | process-embeddings.test.ts | High ✓ |
| `/api/cron/prune-deleted-assets` | 98.55% | purge-deleted-assets.test.ts | High ✓ |
| Telemetry integration | N/A | telemetry.integration.test.ts | Medium ✓ |

### ❌ Untested Routes (15/22 - 68.2%)

**Critical Priority** (user-facing, high traffic):
- `/api/assets` - List/create assets (0% coverage)
- `/api/assets/[id]` - CRUD operations (0% coverage)
- `/api/search` - Semantic search (0% coverage)
- `/api/tags` - Tag management (0% coverage)

**High Priority** (core functionality):
- `/api/assets/[id]/generate-embedding` - Embedding generation (0% coverage)
- `/api/assets/[id]/embedding-status` - Embedding status (0% coverage)
- `/api/assets/[id]/tags` - Asset tagging (0% coverage)
- `/api/embeddings/text` - Text embedding API (0% coverage)
- `/api/embeddings/image` - Image embedding API (0% coverage)

**Medium Priority** (operational):
- `/api/assets/audit` - Asset audit (0% coverage)
- `/api/assets/batch/embedding-status` - Batch status (0% coverage)
- `/api/sse/embedding-updates` - SSE endpoint (0% coverage)
- `/api/health/services` - Service health (0% coverage)

**Low Priority** (advanced features):
- `/api/search/advanced` - Advanced search (0% coverage)
- `/api/analytics/usage` - Usage analytics (0% coverage)

## Test Quality Metrics

### High-Quality Tests (>90% coverage)
- ✅ `cron/audit-assets.test.ts` - 98.6% coverage
- ✅ `cron/prune-deleted-assets.test.ts` - 98.55% coverage
- ✅ `cron/process-embeddings.test.ts` - 96.2% coverage

### Good Tests (80-90% coverage)
- ✅ `cache-stats.test.ts` - 87.91% coverage
- ✅ `share-flow.test.ts` - 80% coverage

### Needs Improvement (<80% coverage)
- ⚠️ `health.test.ts` - 58.06% coverage (improved from 0%)

## Recommendations

### Phase 1: Critical User-Facing Routes (ETA: 8-12 hours)
Priority routes that handle user interactions and data:

1. **`/api/assets` (POST, GET)**
   - Test asset creation with file upload
   - Test asset listing with pagination, sorting, filtering
   - Test authentication/authorization
   - Mock: Vercel Blob, Prisma, Replicate API

2. **`/api/assets/[id]` (GET, PATCH, DELETE)**
   - Test individual asset retrieval
   - Test metadata updates (favoriting, etc.)
   - Test asset deletion
   - Mock: Prisma, Vercel Blob

3. **`/api/search` (POST)**
   - Test semantic search with text queries
   - Test result ranking and thresholding
   - Test cache behavior
   - Mock: Embeddings API, Prisma pgvector

4. **`/api/tags` (GET, POST, DELETE)**
   - Test tag CRUD operations
   - Test tag association with assets
   - Mock: Prisma

### Phase 2: Embedding Routes (ETA: 4-6 hours)
Routes handling AI/ML operations:

5. **`/api/assets/[id]/generate-embedding`**
   - Test embedding generation flow
   - Test error handling (API failures, rate limits)
   - Mock: Replicate API

6. **`/api/embeddings/text` & `/api/embeddings/image`**
   - Test embedding creation
   - Test input validation
   - Mock: Replicate API

### Phase 3: Operational Routes (ETA: 2-4 hours)
Support and monitoring routes:

7. **`/api/health/services`**
   - Test service health checks
   - Test degraded state handling

8. **`/api/sse/embedding-updates`**
   - Test SSE connection lifecycle
   - Test update broadcasting
   - Mock: Prisma, SSE clients

## Testing Patterns

### Established Patterns (from existing tests)
```typescript
// 1. Route handler mocking
import { GET, POST } from '@/app/api/route/route';
import { createMockRequest } from '@/utils/test-helpers';

// 2. Database mocking
vi.mock('@/lib/db', () => ({
  prisma: {
    asset: { findMany: vi.fn(), create: vi.fn() },
  },
}));

// 3. External API mocking
vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'mock-url' }),
}));

// 4. Auth mocking
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'test-user' }),
}));
```

### Test Structure Template
```typescript
describe('/api/route-name', () => {
  // Setup mocks
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Success cases', () => {
    it('should handle happy path', async () => {
      // Arrange: Set up mocks
      // Act: Call route handler
      // Assert: Verify response and side effects
    });
  });

  describe('Error cases', () => {
    it('should handle auth failure', async () => { });
    it('should handle database errors', async () => { });
    it('should handle validation errors', async () => { });
  });

  describe('Edge cases', () => {
    it('should handle empty results', async () => { });
    it('should handle pagination boundaries', async () => { });
  });
});
```

## Coverage Goals

### Short-term (Sprint 1)
- **Target**: 60% route coverage (13/22 routes)
- **Focus**: Critical user-facing routes
- **Timeline**: 2-3 weeks

### Medium-term (Q1 2025)
- **Target**: 85% route coverage (19/22 routes)
- **Focus**: All core functionality
- **Timeline**: 2-3 months

### Long-term (Q2 2025)
- **Target**: 100% route coverage (22/22 routes)
- **Focus**: Advanced features and edge cases
- **Timeline**: 6 months

## Current Test Infrastructure

### Strengths
✅ Vitest configured with coverage reporting
✅ Mock helper utilities in place
✅ High-quality cron job tests as examples
✅ Integration test patterns established

### Gaps
❌ No tests for main asset CRUD operations
❌ No tests for search functionality
❌ No tests for embedding generation
❌ Limited error scenario coverage

## Next Steps

1. **Immediate** (This sprint):
   - Add tests for `/api/assets` (POST, GET)
   - Add tests for `/api/search` (POST)
   - Target: Bring coverage to 40%+

2. **Short-term** (Next 2-3 sprints):
   - Complete Phase 1 recommendations
   - Add error scenario tests
   - Target: 60%+ coverage

3. **Ongoing**:
   - Add tests for new features as they're developed
   - Maintain >80% coverage for new code
   - Refactor untested legacy code with tests

## Notes

- **Test execution**: All 713 tests passing (0 failures)
- **Performance**: Test suite runs in ~6 seconds
- **CI/CD**: Tests run on every PR via GitHub Actions
- **Coverage tracking**: V8 coverage reporting enabled
- **Mock quality**: Well-structured mocks using Vitest

---

*Last updated: 2025-11-08*
*Next review: Sprint planning*
