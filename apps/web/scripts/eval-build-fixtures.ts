/**
 * Build the retrieval-eval fixture library (sploot-073).
 *
 * Fetches the imgflip top-100 meme templates (public API,
 * https://imgflip.com/api — template names + image URLs), embeds each image
 * with the SAME Replicate CLIP model the production search path uses
 * (lib/embeddings.ts CLIP_MODEL), embeds every golden query from
 * eval/golden-queries.source.json, and writes both fixture files with
 * embeddings inline:
 *
 *   eval/fixtures/assets.json    — >=100 assets: imgflip id, name, source URL, 768-d embedding
 *   eval/fixtures/queries.json   — >=50 golden queries: text, expected ids, 768-d embedding
 *
 * The embeddings are COMMITTED so the eval itself (scripts/eval-search.ts) is
 * fully deterministic and needs no Replicate token — in CI or anywhere else.
 * Re-run this script only to regenerate the library (new model, new
 * templates, edited queries). Requires REPLICATE_API_TOKEN.
 *
 * Usage (from apps/web):
 *   pnpm eval:fixtures                 # rebuild both fixture files
 *   pnpm eval:fixtures --queries-only  # re-embed queries only (edited source)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Replicate from 'replicate';
import { CLIP_MODEL } from '../lib/embeddings';

const EVAL_DIR = join(process.cwd(), 'eval');
const FIXTURES_DIR = join(EVAL_DIR, 'fixtures');
const IMGFLIP_API = 'https://api.imgflip.com/get_memes';
const CONCURRENCY = 6;
const ROUND = 1e6; // 6 decimal places keeps files small; cosine ranking is unaffected

interface ImgflipMeme {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
}

function roundVec(v: number[]): number[] {
  return v.map((x) => Math.round(x * ROUND) / ROUND);
}

async function embed(
  replicate: Replicate,
  input: { text: string } | { image: string },
  label: string
): Promise<number[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const output = await replicate.run(
        CLIP_MODEL as `${string}/${string}:${string}`,
        { input }
      );
      const embedding = Array.isArray(output)
        ? output
        : (output as { embedding?: number[] }).embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error(`invalid embedding response for ${label}`);
      }
      return embedding as number[];
    } catch (error) {
      lastError = error;
      console.warn(`embed attempt ${attempt}/3 failed for ${label}:`, error);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const queriesOnly = process.argv.includes('--queries-only');
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN is required to build eval fixtures');
  }
  const replicate = new Replicate({ auth: token });
  await mkdir(FIXTURES_DIR, { recursive: true });

  if (!queriesOnly) {
    console.log(`Fetching template list from ${IMGFLIP_API} ...`);
    const res = await fetch(IMGFLIP_API);
    if (!res.ok) throw new Error(`imgflip API returned ${res.status}`);
    const payload = (await res.json()) as {
      success: boolean;
      data: { memes: ImgflipMeme[] };
    };
    if (!payload.success) throw new Error('imgflip API returned success=false');
    const memes = payload.data.memes;
    if (memes.length < 100) {
      throw new Error(`expected >=100 templates, got ${memes.length}`);
    }

    console.log(`Embedding ${memes.length} template images with ${CLIP_MODEL.split(':')[0]} ...`);
    let done = 0;
    const assets = await mapLimit(memes, CONCURRENCY, async (meme) => {
      const embedding = await embed(replicate, { image: meme.url }, meme.name);
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${memes.length}`);
      return {
        imgflipId: meme.id,
        name: meme.name,
        sourceUrl: meme.url,
        width: meme.width,
        height: meme.height,
        embedding: roundVec(embedding),
      };
    });

    const dims = new Set(assets.map((a) => a.embedding.length));
    if (dims.size !== 1) {
      throw new Error(`inconsistent embedding dimensions: ${[...dims].join(', ')}`);
    }

    await writeFile(
      join(FIXTURES_DIR, 'assets.json'),
      JSON.stringify(
        {
          provenance:
            'imgflip top-100 meme templates via the public https://api.imgflip.com/get_memes API. ' +
            'Only derived embeddings and metadata are committed; images stay at their imgflip source URLs. ' +
            'Embeddings computed by scripts/eval-build-fixtures.ts with the production search model.',
          model: CLIP_MODEL,
          dimension: [...dims][0],
          generatedAt: new Date().toISOString(),
          assets,
        },
        null,
        1
      )
    );
    console.log(`Wrote eval/fixtures/assets.json (${assets.length} assets)`);
  }

  const source = JSON.parse(
    await readFile(join(EVAL_DIR, 'golden-queries.source.json'), 'utf8')
  ) as { queries: Array<{ query: string; expected: string[] }> };
  if (source.queries.length < 50) {
    throw new Error(`golden set must hold >=50 queries, got ${source.queries.length}`);
  }

  // Every expected id must exist in the committed asset library.
  const assetsFile = JSON.parse(
    await readFile(join(FIXTURES_DIR, 'assets.json'), 'utf8')
  ) as { assets: Array<{ imgflipId: string }> };
  const known = new Set(assetsFile.assets.map((a) => a.imgflipId));
  for (const q of source.queries) {
    for (const id of q.expected) {
      if (!known.has(id)) {
        throw new Error(`query "${q.query}" expects unknown asset id ${id}`);
      }
    }
  }

  console.log(`Embedding ${source.queries.length} golden queries ...`);
  let qDone = 0;
  const queries = await mapLimit(source.queries, CONCURRENCY, async (q) => {
    const embedding = await embed(replicate, { text: q.query }, q.query);
    qDone++;
    if (qDone % 10 === 0) console.log(`  ${qDone}/${source.queries.length}`);
    return { query: q.query, expected: q.expected, embedding: roundVec(embedding) };
  });

  await writeFile(
    join(FIXTURES_DIR, 'queries.json'),
    JSON.stringify(
      {
        provenance:
          'Hand-written plain-words meme descriptions (eval/golden-queries.source.json) embedded by ' +
          'scripts/eval-build-fixtures.ts with the production search model.',
        model: CLIP_MODEL,
        generatedAt: new Date().toISOString(),
        queries,
      },
      null,
      1
    )
  );
  console.log(`Wrote eval/fixtures/queries.json (${queries.length} queries)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
