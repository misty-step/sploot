# Chrome Extension - Add to Sploot

## Location

The Chrome extension is developed in a **separate repository**:

```
/Users/phaedrus/Development/sploot-extension/
```

## Status

✅ **Phase 1 MVP Complete** (2025-11-08)

### Implemented Features

- Right-click image save from any website
- Clerk WebSSO authentication (syncs with sploot.app session)
- Upload to existing `/api/upload` endpoint
- Success/error notifications
- Extension popup with auth status

### Ready for Testing

See extension repo for:
- **TESTING.md**: Manual test scenarios
- **SUMMARY.md**: Complete feature list
- **README.md**: Development workflow

## Quick Start

```bash
cd /Users/phaedrus/Development/sploot-extension

# Build extension
pnpm install
pnpm build

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select .output/chrome-mv3 directory
```

## Architecture Decision

Extension kept as **separate repository** for:
- Deployment independence (Chrome Web Store vs Vercel)
- Build system isolation (WXT vs Next.js)
- Development velocity (no monorepo overhead)

See `sploot-extension/ARCHITECTURE.md` for full rationale.

## Integration Points

### API Endpoint
Extension calls existing:
- `POST /api/upload` (multipart form data)
- No server-side changes required

### Shared Constants
Extension duplicates these constants (validated by server):
- `MAX_FILE_SIZE`: 10MB (lib/blob.ts)
- `ALLOWED_FILE_TYPES`: jpeg, jpg, png, webp, gif (lib/blob.ts)

### Authentication
Uses `@clerk/chrome-extension` for WebSSO:
- Syncs with sploot.app session
- Shares same Clerk publishable key
- Requires `chrome-extension://` in Clerk allowed origins

## Next Steps

### User Action Required

1. **Configure Clerk**
   - Login to dashboard.clerk.com
   - Add `chrome-extension://` to allowed origins
   - Add specific extension ID after first install

2. **Run Tests**
   - Follow `sploot-extension/TESTING.md`
   - Test on 10+ sites
   - Verify upload performance <3s

### Future Phases

- **Phase 2**: Crop tool + offline queue (Week 2)
- **Phase 3**: Polish + Chrome Web Store (Week 3)

## Development

Extension development is independent from main app:
- Different build system (WXT vs Next.js)
- Different deployment (Chrome Web Store vs Vercel)
- Own git repository and commit history

## Documentation

All extension docs in `sploot-extension/`:
- README.md
- TESTING.md
- SUMMARY.md
- ARCHITECTURE.md
- PROGRESS.md
