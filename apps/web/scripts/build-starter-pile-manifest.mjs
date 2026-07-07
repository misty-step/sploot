#!/usr/bin/env node
/**
 * Build the starter-pile manifest: real CLIP embeddings for the bundled
 * starter images (public/starter-pile/*.jpg) plus the suggested first
 * queries, computed once against the production embedding model
 * (lib/embeddings.ts CLIP_MODEL) and committed to
 * lib/starter-pile/manifest.json.
 *
 * Run manually when the starter images or captions change:
 *   REPLICATE_API_TOKEN=... node scripts/build-starter-pile-manifest.mjs
 *
 * Committing the vectors keeps the seed endpoint deterministic and free of
 * Replicate calls: a new user's "load the starter pile" never waits on (or
 * gets throttled by) the embedding provider.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Replicate from 'replicate';

const CLIP_MODEL =
  'krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4';

// Captions double as the alt-ish description of each starter meme. Files live
// in public/starter-pile/ and are fetched by the seed route at runtime.
const ITEMS = [
  { file: 'cats-arguing.jpg', caption: 'two cats arguing at a dinner table, one yelling' },
  { file: 'dog-burning-room.jpg', caption: 'calm dog drinking coffee in a burning room' },
  { file: 'skeleton-bench.jpg', caption: 'skeleton still waiting on a park bench' },
  { file: 'galaxy-brain.jpg', caption: 'galaxy brain glowing in space, cosmic genius' },
  { file: 'crying-thumbs-up.jpg', caption: 'crying but thumbs up, it is fine' },
  { file: 'group-chat-phone.jpg', caption: 'group chat blowing up with notifications' },
  { file: 'hundred-points.jpg', caption: 'a perfect hundred, no notes' },
  { file: 'side-eye-cat.jpg', caption: 'judgmental cat giving side-eye' },
];

// The chips the empty state / post-seed search offers. Embedding them here
// warms the Postgres text-embedding cache at seed time, so the first search
// needs no Replicate call either.
const SUGGESTED_QUERIES = [
  'two cats arguing at a table',
  'dog drinking coffee in a burning room',
  'skeleton still waiting',
  'galaxy brain',
];

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(dirname, '..');
const imagesDir = path.join(webRoot, 'public', 'starter-pile');
const outFile = path.join(webRoot, 'lib', 'starter-pile', 'manifest.json');

const token = process.env.REPLICATE_API_TOKEN;
if (!token) {
  console.error('REPLICATE_API_TOKEN is required');
  process.exit(1);
}
const replicate = new Replicate({ auth: token });

async function embed(input) {
  const output = await replicate.run(CLIP_MODEL, { input });
  const embedding = Array.isArray(output) ? output : output?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error(`Unexpected embedding output shape: ${JSON.stringify(output).slice(0, 200)}`);
  }
  return embedding.map((v) => Number(v));
}

const images = [];
for (const item of ITEMS) {
  const bytes = await readFile(path.join(imagesDir, item.file));
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const dataUri = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  const embedding = await embed({ image: dataUri });
  console.log(`${item.file}: dim=${embedding.length} sha256=${checksum.slice(0, 12)}…`);
  images.push({ ...item, checksum, dim: embedding.length, embedding });
}

const queries = [];
for (const text of SUGGESTED_QUERIES) {
  const embedding = await embed({ text });
  console.log(`"${text}": dim=${embedding.length}`);
  queries.push({ text, dim: embedding.length, embedding });
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  JSON.stringify({ model: CLIP_MODEL, generatedAt: new Date().toISOString(), images, queries })
);
console.log(`wrote ${outFile}`);
