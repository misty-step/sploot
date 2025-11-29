# Add to Sploot - Chrome Extension

Chrome extension for saving memes from any website to your Sploot library with one click.

## Features

- Right-click any image to save to Sploot
- Screenshot crop tool (Cmd/Ctrl+Shift+S)
- Offline upload queue
- Inline authentication via Clerk popup sign-in

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build against test Clerk instance (local/dev)
pnpm build

# Build against production Clerk instance (uses .env.production)
pnpm build:prod

# Create distribution zip
pnpm zip
```

## Loading in Chrome

1. Run `pnpm build:prod` when targeting https://www.sploot.app (use `pnpm build` only with local/test Clerk)
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `dist/chrome-mv3` directory

## Configuration

Copy `.env.example` to `.env` for local/test runs, then create `.env.production` with your `pk_live_*` values. Production builds automatically read `.env.production`. Override `VITE_API_BASE_URL` only if the Sploot API is not running at the default host.

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
# Optional: VITE_API_BASE_URL=http://localhost:3000
```

## Architecture

- **WXT Framework**: Modern extension development with HMR
- **React + TypeScript**: Type-safe UI components
- **Clerk**: Inline authentication entirely inside the extension
- **IndexedDB**: Offline upload queue with retry logic

## Project Structure

```
sploot-extension/
├── entrypoints/
│   ├── background.ts       # Background service worker
│   └── popup/              # Extension popup UI
├── components/             # Shared React components
├── shared/                 # Shared utilities
└── public/                 # Static assets (icons)
```
