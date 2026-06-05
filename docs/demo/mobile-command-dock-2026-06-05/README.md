# Mobile Command Dock Demo

Representative demo artifacts for the shipped mobile meme-scrolling UI:

- Full-width mobile meme feed with zero horizontal gutter.
- Collapsed search affordance that expands from the dock.
- Upload, search, filter, sort, and shuffle in one mobile command dock.
- Shuffle as a standalone action, not a sort option.
- Direct delete in the meme action bar with larger touch targets.

These are generated demo renders, not live authenticated screenshots. Live
headless QA for the authenticated feed is blocked by Clerk, while signed-out
route evidence lives in `docs/qa/mobile-command-dock-2026-06-05.md`.

Regenerate:

```bash
NODE_PATH=/Users/phaedrus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  /Users/phaedrus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  docs/demo/mobile-command-dock-2026-06-05/capture-demo.cjs
```
