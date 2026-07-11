# web agent context

the canonical instructions are `../../AGENTS.md`, `AGENTS.md`, and
`../../VISION.md`. read `docs/adr/010-digitalocean-runtime-controls.md` before
changing hosting or provider boundaries.

the web service runs on DigitalOcean App Platform with Neon Postgres + pgvector.
Vercel Blob is the sole intentional Vercel dependency. the provider-retirement
gate rejects any new compute-provider runtime surface.
