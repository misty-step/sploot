# Architecture Decision: Separate Repository

> **Status**: Superseded (2025-12-01). The extension now lives in this monorepo at
> `apps/extension` with shared code in `packages/common`. See
> `docs/adr/0002-move-extension-into-monorepo.md` and `ARCHITECTURE.md` at the repo root.

## Decision: Keep Extension Separate from Main App

**Date**: 2025-11-08
**Status**: Accepted
**Context**: Phase 1 MVP (3-week timeline)

### Rationale

**Separate repository wins because:**
1. **Deployment Independence**: Chrome Web Store (1-3 day review) vs Vercel (instant)
2. **Code Duplication Minimal**: Only ~10 lines (constants + 1 interface)
3. **Build Isolation**: WXT + Chrome extension build vs Next.js App Router
4. **Development Velocity**: No monorepo setup overhead (saves 1 day)
5. **Team Size**: Single developer (monorepo shines with 3+ engineers)

### Code Shared with Main App

**Shared Constants**:
```typescript
// Source of truth: @sploot/common
MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]
```

**Duplicated Types** (intentional):
```typescript
// Keep synced with API response from /api/upload
interface UploadResult {
  assetId: string;
  blobUrl: string;
  thumbnailUrl: string;
}
```

**Validation**: Extension calls existing `/api/upload` endpoint - server validates inputs. Client-side validation is defensive but non-authoritative.

### When to Migrate to Monorepo

**Trigger conditions:**
1. Adding mobile app (React Native) → 3+ apps benefit from shared packages
2. Shared code exceeds 500 LOC → ROI of monorepo setup positive
3. Constants drift causes bugs → Type safety across boundary needed
4. Team grows to 2+ full-time devs → Shared workspace reduces duplication pain

**Migration effort**: ~1 day (pnpm workspaces + Turborepo setup)

### Mitigation: Preventing Drift

1. **Documentation**: Constants documented in both repos
2. **Integration Tests**: Extension tests hit real `/api/upload` (catches mismatches)
3. **Code Review**: PR template reminds to check constant sync
4. **Version Pinning**: Extension version tracks compatible server version

### Future Architecture (If Monorepo Needed)

```
sploot-monorepo/
├── apps/
│   ├── web/              # Next.js (current sploot/)
│   ├── extension/        # Chrome extension (current sploot-extension/)
│   └── mobile/           # React Native (future)
├── packages/
│   ├── shared-types/     # UploadResult, constants
│   ├── shared-ui/        # React components
│   └── shared-utils/     # Validation, formatting
└── pnpm-workspace.yaml
```

**Estimated migration time**: 4-6 hours setup + 2-3 hours migration + 2 hours testing

### References

- Main app: `/Users/phaedrus/Development/sploot/`
- Extension: `/Users/phaedrus/Development/sploot-extension/`
- Server constants: `sploot/lib/blob.ts`
- Extension constants: `sploot-extension/entrypoints/background/image-fetcher.ts`

### Reviewers

This decision documented after thorough analysis of:
- Current code duplication (7 occurrences)
- Build system complexity (WXT vs Next.js)
- Deployment constraints (Chrome Web Store process)
- Team size and velocity needs
- Future mobile app timeline (6+ months)
