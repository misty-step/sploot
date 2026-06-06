# Sploot Design Contract

This file records where durable design facts came from. `DESIGN.md` is the
usable contract; this file is the provenance ledger.

| Source | Fact | Provenance | Confidence | Use | Evidence / Notes |
|---|---|---|---|---|---|
| `vision.md` | Sploot is a personal meme library for semantic search, shuffle, bangers, related items, and future taste-based generation. | observed | high | keep | Product vision names the core jobs and target user. |
| `vision.md` | The product vibe is goofy, fun, personal, and not too serious. | observed | high | keep | This is the strongest product-owned voice signal. |
| `apps/web/app/globals.css` | Existing visual base uses square radius, off-white/black, cyan primary accent, coral/violet secondary accents, grid/stripe patterns, and Bebas/Geist/JetBrains font roles. | observed | high | keep | Current CSS token layer and utility classes already encode most of this. |
| `apps/web/components.json` | The component base is shadcn New York with CSS variables and lucide icons. | observed | high | keep | Keep the primitive library; adapt component grammar through local wrappers and tokens. |
| Live screenshot `/var/folders/jr/0kj0xfdd4s1ggs921sr2d7f80000gn/T/sploot-landing-desktop.png` | Current landing is clean and legible but structurally close to a centered SaaS hero. | observed | medium | change | Future landing should show the product mechanism in the first viewport. |
| Live screenshot `/var/folders/jr/0kj0xfdd4s1ggs921sr2d7f80000gn/T/sploot-landing-mobile.png` | Mobile landing preserves the current hierarchy, but the product object is still abstract circles/search rather than visible collection organization. | observed | medium | change | Mobile onboarding should show upload/search/cluster states sooner. |
| Live screenshot `/var/folders/jr/0kj0xfdd4s1ggs921sr2d7f80000gn/T/sploot-signin-mobile.png` | Clerk auth surfaces currently carry external rounded-card styling and dark gradient background. | observed | high | change | Treat as an integration exception until wrapped or themed. |
| Generated image `ig_03417fb7d499a6b3016a24461f89448191aa58f6fad7035b99.png` | Automatic semantic groups can be a desktop navigation surface, not only a background illustration. | inferred | medium | change | Use as direction, not implementation spec. |
| Generated image `ig_03417fb7d499a6b3016a2447ef0bf881918029925406f454c8.png` | Mobile cluster navigation should be sheet/dock driven and thumb-first. | inferred | medium | change | Use as direction for mobile UX exploration. |
| Generated image `ig_03417fb7d499a6b3016a24484d9d4c81919c6c69cf412ce9ee.png` | The landing metaphor should be "no folders. just vibes": messy saves becoming automatic semantic piles. | provided | high | keep | User explicitly preferred No Folders Just Vibes aesthetics with Meme Atlas mechanics. |
| User direction in this thread | Combine unsupervised clustering from Meme Atlas with No Folders Just Vibes aesthetics. | provided | high | keep | This is the current north-star art direction. |
| Harness design references | Anti-slop rules: no gradient text, generic AI gradients, decorative glass/blobs, meta-copy, or one-note template styling. | observed | high | keep | Use as lint and review criteria, not copied prose. |

## Migration Exceptions

These are known places where the current repo does not yet satisfy the full
design contract. They are allowed for now, but new work should not copy them.

| Path / Pattern | Exception | Exit Criteria |
|---|---|---|
| `apps/web/app/sign-in/[[...sign-in]]/page.tsx` | Clerk-hosted auth card uses rounded/glass/gradient integration styling. | Wrap or theme auth to use Sploot paper/ink/sticker grammar. |
| `apps/web/app/sign-up/[[...sign-up]]/page.tsx` | Same Clerk integration exception as sign-in. | Same as sign-in. |
| `apps/web/components/ui/*` | Upstream shadcn primitives include rounded radii and shadows. | Convert through local variants only when product surfaces require it. |
| `apps/web/app/not-found.tsx` | Existing `bg-clip-text` treatment is outside the future anti-gradient rule. | Redesign error pages with sticker/stamp language. |
| Existing image lightboxes | Some overlays use `backdrop-blur` for readability over images. | Keep only when it improves media legibility; avoid as decorative chrome. |
| `apps/web/components/chrome/navbar.tsx` | Existing fixed navbar uses blur to preserve legibility over scrolling content. | Replace with paper/ink workbench chrome when the app shell is redesigned. |
