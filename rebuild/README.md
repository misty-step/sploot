# Sploot rebuild, M0 spike

A separate preview worker. It does not replace `apps/server` and it is not deployed. `sploot.mistystep.io` is untouched.

This directory is the workers-rs skeleton for milestone M0 of the rebuild plan (v2): R2, D1, a Workers AI call, a Vectorize call through a small JS bridge, and a Cloudflare Access JWT stub. Search quality is gate 1. Gates 2 and 3 are not built.

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were unset here. Nothing was created in a Cloudflare account: no R2 bucket, no D1 database, no Vectorize index, no Access app, no Workers Paid plan. Workers AI and Vectorize have no local simulator. On loopback only, `local-entry.mjs` stands in for both and fails closed: the AI class throws, and Vectorize is an in-memory 32-dimension index. A non-loopback request does not get those stand-ins. `wrangler.jsonc` has no `account_id`, no `remote`, no `ai` binding, and no `vectorize` binding.

## How to run

From this directory, outside the pnpm workspace:

```sh
pnpm install --ignore-workspace
pnpm test
```

`pnpm test` is `node test/run.mjs`. It generates an RSA key in memory, writes `ACCESS_JWKS_B64` to gitignored `.dev.vars`, deletes `.wrangler`, runs `worker-build --release`, starts `wrangler dev --local --ip 127.0.0.1 --port 8791`, applies `seed.local.sql`, and checks auth, R2, D1, the Vectorize bridge, FTS fallback, and the gate-1 scorer. It writes `harness/gate.json`.

Toolchain used for the recorded run:

- Rust 1.91.1 with `wasm32-unknown-unknown` (`rust-toolchain.toml`). `worker` 0.8.7 needs rustc 1.91 or newer.
- `worker-build` 0.8.7 (`cargo install worker-build --version 0.8.7`).
- wrangler 4.147.0, installed by the pnpm command above.

`pnpm dev` starts the same local worker without the assertions. It still needs `.dev.vars` with `ACCESS_JWKS_B64` (standard base64 of a JWKS JSON document) or every request is 401.

## Bindings a later preview would need

These names match `wrangler.jsonc` and the worker. They were not created.

| Binding | Resource | Notes |
|---|---|---|
| `DB` | D1 database `sploot-rebuild-preview` | The checked-in `database_id` is the nil UUID, a local placeholder. |
| `MEDIA` | R2 bucket `sploot-rebuild-preview` | Objects are `o/{owner}/{id}`. |
| `AI` | Workers AI | Remote. Needs an account credential. Models the spike calls: `@cf/google/gemma-4-26b-a4b-it`, `@cf/qwen/qwen3-embedding-0.6b`, `@cf/qwen/qwen3-vl-embedding-2b`. |
| `VECTORIZE` | Vectorize index | Dimension is undecided until a candidate passes. The local stand-in is 32. Metadata filter is `owner`. |
| Access | One Access app | `ACCESS_AUD=sploot-rebuild-preview`. `ACCESS_ISS` must be the team issuer. Replace `ACCESS_JWKS_B64` with the team JWKS. The stub does not fetch or cache JWKS. |

Do not attach those bindings to `sploot.mistystep.io`.

## Gate results

Library: synthetic. No Sploot library was on this machine. The set is 15 text phrases, 15 visual descriptions, 10 template pairs, and 10 note-backed placeholders. Pixels were not generated. A drawn bitmap would be a fake vision set, and copyrighted memes were not downloaded. Recorded in `harness/gate.json`.

| Gate | Result |
|---|---|
| 1 search quality | not-yet-measurable |
| 1 text-heavy (15, top 3 ≥ 90%) | not-yet-measurable. No embeddings. Rows are phrases, not library images. |
| 1 visual-only (15, top 5 ≥ 70% and ≥ CLIP) | not-yet-measurable. No visual embeddings and no CLIP baseline. |
| 1 similar-templates (10 pairs, correct above sibling ≥ 80%) | not-yet-measurable. Pairs were not embedded. |
| 1 refused-or-failed (10) | not-yet-measurable. Stored-and-listed, 0 silent drops, and the text-only notice passed against an injected AI failure. Model refusal rate was not measured. Rows are placeholders, not edgy images. |
| Candidate A `@cf/google/gemma-4-26b-a4b-it` | not-yet-measurable. Local stand-in refused the model. |
| Candidate B (OpenRouter or Voyage) | not-yet-measurable. No credential and no client. |
| qwen3-vl `@cf/qwen/qwen3-vl-embedding-2b` | not-yet-measurable. Local stand-in refused the model. |
| CLIP baseline | not-yet-measurable. No local CLIP bundle and no runner. |
| 2 capture across an expired login | not-yet-measurable. Not built. |
| 3 lossless rollback | not-yet-measurable. Not built. |

Local machinery that did run: Access JWT cases, R2 round trip, D1 owner fence, Vectorize bridge against the stand-in (bad dimensions, oversized metadata, missing binding), and the injected FTS fallback. Cloudflare's own Vectorize error strings were not measured.

## What this spike does

Routes are under `/spike`. They are not the product routes from the plan.

- `POST /spike/save` stores an `image/png` (10 MB max) in R2, then a D1 row. Duplicate sha256 for the same owner returns the existing id. The R2 key is never overwritten.
- `GET /spike/m/:id` and `GET /spike/assets` are owner-fenced.
- `POST /spike/search` embeds with `@cf/qwen/qwen3-embedding-0.6b` when AI is present, queries Vectorize top 30 with an owner filter, fuses with FTS5 (`k=60`), and drops stale or trashed hits in D1. AI or Vectorize failure returns FTS with the notice `Search is using text only.`
- `POST /spike/rank` is the bake-off entry. It accepts a harness vector. Product search does not.
- `POST /spike/ai` and `POST /spike/vectorize` are probes and require scope `*`.

Access: RS256 against `ACCESS_JWKS_B64`, checking `iss`, `aud`, `exp`, and `nbf`. Email maps to a human; otherwise `common_name` or `sub` maps to a service identity in D1. Unknown, revoked, or wrong scope is 403 `Access is not allowed.` A bad token is 401.

## What I deleted / didn't build

Product HTML, `GET /search`, `POST /save`, Cloudflare Images, thumbnails, the indexer state machine, cron, retries, reconcile, purge, migration, the freeze proxy, gate 2, gate 3, the extension, MCP, email-in, a PWA, JWKS fetch and cache, parallel embed and FTS, the full MIME allowlist, video, an OpenRouter or Voyage client, a CLIP runner, remote bindings, and any deploy. No change to `apps/server`, root CI, or an operator library.
