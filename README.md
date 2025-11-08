# Add to Sploot - Chrome Extension

Chrome extension for saving memes from any website to your Sploot library with one click.

## Features

- Right-click any image to save to Sploot
- Screenshot crop tool (Cmd/Ctrl+Shift+S)
- Offline upload queue
- Seamless authentication with Clerk WebSSO

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Create distribution zip
pnpm zip
```

## Loading in Chrome

1. Run `pnpm build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `.output/chrome-mv3` directory

## Configuration

Copy `.env.example` to `.env` and configure:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_SYNC_HOST=https://sploot.app
```

## Architecture

- **WXT Framework**: Modern extension development with HMR
- **React + TypeScript**: Type-safe UI components
- **Clerk**: Authentication with WebSSO session sync
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
