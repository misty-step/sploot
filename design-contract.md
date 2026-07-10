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
| `apps/web/components/sploot/*` | Sticker, banger, cluster, and atlas landing wrappers are the first implemented component grammar for the design system. | observed | high | keep | Added to turn docs/tokens into reusable product code. |
| `apps/web/app/page.tsx` | The first viewport now shows messy imports becoming automatic semantic piles. | observed | high | keep | Landing adoption point for No Folders Just Vibes plus Meme Atlas mechanics. |
| `scripts/check-design-system.mjs` | Design lint now requires docs, tokens, Sploot wrappers, and landing adoption. | observed | high | keep | Prevents doc-only design-system pass from satisfying `pnpm lint:design`. |
| `apps/extension/entrypoints/popup/*` | Extension popup is part of the Sploot design surface and now mirrors paper/ink/cyan/coral/violet square token grammar. | observed | high | keep | Added after critic found extension drift outside design lint. |
| `apps/web/components/chrome/navbar.tsx` | App chrome now uses `PileMark` instead of abstract overlapping circles. | observed | high | keep | Carries self-organizing pile metaphor into authenticated navigation. |
| `apps/web/components/library/image-tile.tsx` | Similarity and banger states now use Sploot cyan/violet/coral roles instead of generic green/yellow. | observed | high | keep | Aligns core image tile affordances with the semantic token system. |

| Live local screenshots, June 10, 2026 design pass (`/app` grid, search, upload, mobile dock at 1440px and 390px) | Core workbench surfaces verified rendered: motion utilities (`animate-sploot-stamp/pop/slide-up`), muted skeletons, context-aware empty states, capped tile cascade, keyboard-focusable tiles, compacted desktop header. | observed | high | keep | Captured against seeded local data via the qa-local auth harness. |
| User direction, June 10, 2026 | The design system voice is hypermaximalist, zoomer meme-culture brainrot — delightful, deadpan, terminally online. | provided | high | keep | Codified in DESIGN.md §7; applies to all surfaces going forward. |
| Code audit, June 10, 2026 | No clustering feature exists (no grouping API or code); "your saves sort themselves" and "automatic piles" overclaimed. Landing copy recast to feature-true: piles are search results ("piles on demand") until Meme Atlas clustering ships. | observed | high | keep | Feature-true copy rule added to DESIGN.md §7; auto-piles tracked as backlog 025. |
| Design lab 034 round 1, July 9, 2026 (`explorations/lab-034-hypermax/`) | 19-option blind-lane system lab; operator picked AFD-1 overprint and AFD-3 toybox as co-winners, AFD-2 kept, everything else killed. | provided | high | keep | Round-1 verdict recorded in `explorations/lab-034-hypermax/README.md`. |
| Design lab 034 round 3, July 9, 2026 | Operator locked AFD-3 toybox as the system winner ("I think we got to do toy box"); round 4 mutated only the compact icon-control grammar. | provided | high | keep | Standing operator rules named: compact icon buttons are a critical component; banger = heart filled/outline only; the hover-physics law. |
| Design lab 034 round 4, July 10, 2026 | FINAL LOCK: AFD-8 "toybox ink minis" is the production design system; AFD-9's candy-chip drop-height adopted for the 44px mobile dock only. Markers must move with the card on hover (render inside the transformed cell). | provided | high | keep | Supersedes the neo-brutalist visual system (square slabs, 8px diagonal ink shadows, mono-default chrome). DESIGN.md §§3-6, 8-9 and anti-patterns rewritten 2026-07-10; token VALUES in `apps/web/app/globals.css` moved to the toybox palette while token names stayed stable. |
| `apps/web/app/globals.css` + `apps/web/app/layout.tsx`, July 10, 2026 | Committed toybox tokens: ink `#1c1547`/`#fff3dc`, shelf `#cfe7ff`/`#19143d`, candy palette, radius scale 18/10/9/pill, drop heights 5/3/9px with hover/press states, motion 130/150/200/300ms; type is Bungee / Baloo 2 / Space Mono behind the stable font slots. | observed | high | keep | These committed values are the contract; the lab builder in `explorations/lab-034-hypermax/lanes/afd.js` (AFD-8 section) is the visual reference. |

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
