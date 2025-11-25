
### [Infrastructure] Add Pre-commit Quality Gates
**Perspectives**: architecture-guardian
**Impact**: Quality checks only run in CI after push - broken builds pushed to remote
**Fix**: Add Lefthook configuration
```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx}"
      run: pnpm eslint {staged_files}
    typecheck:
      run: pnpm type-check
pre-push:
  commands:
    test:
      run: pnpm test --run
```
**Effort**: 1h | **Impact**: Catches 80% of issues before push
**Acceptance**: Lefthook installed, pre-commit runs lint+typecheck, pre-push runs tests

---

### [Testing] Add Integration Tests for Upload Pipeline
**File**: `app/api/upload/route.ts`
**Perspectives**: maintainability-maven
**Impact**: Upload orchestration untested - race conditions and cleanup flow unverified
**Test Scenarios**:
1. Happy path: upload → dedupe → blob → db → embedding
2. Duplicate detection flow
3. Race condition handling (P2002 unique constraint)
4. Cleanup on failure (blob deletion)
**Effort**: 4-6h | **Priority**: CRITICAL
**Acceptance**: Integration tests pass, cover 6-service pipeline, catch regressions

---

### [Testing] Add Tests for Search Route
**File**: `app/api/search/route.ts`
**Perspectives**: maintainability-maven
**Impact**: Core feature completely untested
**Test Scenarios**:
1. Search with valid query
2. Empty query handling
3. Cache hit/miss behavior
4. Threshold fallback logic
5. Tag fetching for results
**Effort**: 3-4h | **Priority**: CRITICAL
**Acceptance**: Tests cover happy path and edge cases

---

### [Testing] Add Integration Tests for Shuffle Feature
**Source**: PR #11 review feedback
**Files**: `__tests__/api/shuffle-integration.test.ts` (new)
**Test Scenarios**:
1. Pagination stability - same seed produces identical order
2. Search shuffle - results relevant AND randomized
3. Shuffle with filters - favorites-only and tag filters work
4. Edge cases - empty library, single asset, invalid seed
**Effort**: 4-6h | **Priority**: HIGH
**Acceptance**: Integration tests pass, catch connection pooling regressions

---

### [Testing] Add Tests for Auth Layer
**Files**: `lib/auth/server.ts` (11% coverage), `lib/auth/verify-bearer.ts` (0%)
**Perspectives**: security-sentinel, maintainability-maven
**Impact**: Authentication layer has 8% test coverage - security-critical code completely unverified
**Test Scenarios**:
1. User sync success/failure
2. Bearer token validation
3. Database sync error handling
**Effort**: 3-4h | **Priority**: CRITICAL
**Acceptance**: Auth modules >80% coverage, all auth flows tested

---

### [Testing] Add Tests for Database Layer
**Files**: `lib/db.ts` (5% coverage)
**Perspectives**: maintainability-maven, architecture-guardian
**Impact**: Core data layer at 5% coverage - data integrity unverified
**Test Scenarios**:
1. User creation/retrieval
2. Asset CRUD operations
3. Embedding storage/retrieval
4. Transaction rollback on failure
**Effort**: 4-6h | **Priority**: CRITICAL
**Acceptance**: lib/db.ts >60% coverage, critical paths tested

---

### [Infrastructure] Add Type Check and Lint to CI
**Files**: `.github/workflows/test.yml`
**Perspectives**: architecture-guardian
**Impact**: CI only runs tests - type errors and lint violations caught after merge
**Fix**: Add steps before test:
- `pnpm type-check`
- `pnpm lint`
**Effort**: 15m | **Impact**: Catches 80% of issues in CI
**Acceptance**: CI fails on type errors and lint violations

---

### [Security] Add Trufflehog Secrets Scanning
**Perspectives**: security-sentinel
**Impact**: No automated detection of accidentally committed secrets
**Implementation**:
- Add Trufflehog to Lefthook pre-commit (when installed)
- Add Trufflehog GitHub Action as backup
**Effort**: 30m | **Risk**: HIGH
**Acceptance**: Pre-commit blocks commits with secrets, CI alerts on violations

---

### [Security] Configure Dependabot for Dependency Updates
**Files**: `.github/dependabot.yml` (new)
**Perspectives**: security-sentinel
**Impact**: No automated dependency vulnerability alerts or updates
**Implementation**:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```
**Effort**: 15m | **Impact**: Automated security patches
**Acceptance**: Dependabot PRs appear for outdated deps

---

