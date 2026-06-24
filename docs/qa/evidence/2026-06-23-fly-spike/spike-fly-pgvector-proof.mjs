/**
 * Fly substrate spike (backlog 044 child 6) — Layer B: prove pgvector semantic
 * search works on Fly Managed Postgres, using the app's EXACT cosine query.
 *
 * Run against the MPG cluster through `fly mpg proxy` (so the DB is reachable as
 * localhost). Seeds interpretable 512-dim "concept" vectors — cat / kitten / dog
 * / car / truck — then queries with a feline-ish vector. Because the vectors are
 * hand-built, the correct ranking (cat, kitten, dog, … car/truck last) is
 * self-evident in the output: opaque CLIP numbers would prove the same mechanism
 * but wouldn't be legible as evidence.
 *
 * Usage (from apps/web, with a `fly mpg proxy` running on :PORT):
 *   SPIKE_DATABASE_URL='postgres://user:pass@localhost:PORT/dbname' \
 *     node scripts/spike-fly-pgvector-proof.mjs
 */
import pg from 'pg';

const DIM = 512;
const USER_ID = 'spike-user';
const MODEL = 'clip-spike';

/** Build a 512-dim vector from a sparse {index: value} map (rest zero). */
function vec(parts) {
  const v = new Array(DIM).fill(0);
  for (const [i, x] of Object.entries(parts)) v[Number(i)] = x;
  return v;
}
const toVectorLiteral = (v) => `[${v.join(',')}]`;

// Leading dims encode a crude "concept space". dim0 = feline-ish axis, dim2 =
// canine, dim3 = vehicle. Similar concepts share direction → high cosine.
const ASSETS = [
  { slug: 'cat',    emb: vec({ 0: 1.0 }) },
  { slug: 'kitten', emb: vec({ 0: 0.94, 1: 0.34 }) },
  { slug: 'dog',    emb: vec({ 0: 0.55, 2: 0.84 }) },
  { slug: 'truck',  emb: vec({ 3: 0.94, 4: 0.34 }) },
  { slug: 'car',    emb: vec({ 3: 1.0 }) },
];
// "show me a feline" — points almost straight down dim0.
const QUERY = vec({ 0: 0.97, 1: 0.24 });

async function main() {
  const connectionString = process.env.SPIKE_DATABASE_URL;
  if (!connectionString) throw new Error('SPIKE_DATABASE_URL is required');

  // localhost (the fly mpg proxy) needs no TLS; a remote DB (Neon) requires it.
  const ssl = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
    ? false
    : { rejectUnauthorized: false };
  const client = new pg.Client({ connectionString, ssl });
  await client.connect();
  try {
    // pgvector + cosine operator must be present on MPG for any of this to run.
    const ext = await client.query(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );
    console.log(`pgvector on target DB: ${ext.rows[0] ? `installed (v${ext.rows[0].extversion})` : 'MISSING'}`);

    // Clean prior spike rows so the proof is idempotent.
    await client.query(`DELETE FROM asset_embeddings WHERE asset_id LIKE 'spike-%'`);
    await client.query(`DELETE FROM assets WHERE owner_user_id = $1`, [USER_ID]);
    // updatedAt has no DB default (Prisma's @updatedAt sets it app-side), so a
    // raw INSERT must supply it.
    await client.query(
      `INSERT INTO users (id, email, "updatedAt") VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID, 'spike@sploot.local']
    );

    for (const a of ASSETS) {
      const id = `spike-${a.slug}`;
      await client.query(
        `INSERT INTO assets
           (id, owner_user_id, blob_url, pathname, mime, size, checksum_sha256, "updatedAt")
         VALUES ($1, $2, $3, $4, 'image/png', 1024, $5, NOW())`,
        [
          id,
          USER_ID,
          // constraint: ^https://[a-z0-9-]+\.public\.blob\.vercel-storage\.com/.+$
          `https://spike.public.blob.vercel-storage.com/${a.slug}.png`,
          `${a.slug}.png`,
          `spike-checksum-${a.slug}`,
        ]
      );
      await client.query(
        `INSERT INTO asset_embeddings
           (asset_id, model_name, model_version, dim, image_embedding, "updatedAt")
         VALUES ($1, $2, 'v1', $3, $4::vector, NOW())`,
        [id, MODEL, DIM, toVectorLiteral(a.emb)]
      );
    }
    console.log(`seeded ${ASSETS.length} assets + 512-dim embeddings for ${USER_ID}\n`);

    // The app's EXACT query shape (lib/db.ts vectorSearch): cosine distance,
    // ordered by similarity, joined assets↔asset_embeddings with the owner +
    // not-deleted filter. `distance` here is 1-(<=>), i.e. cosine similarity.
    const queryLiteral = toVectorLiteral(QUERY);
    const { rows } = await client.query(
      `SELECT
         a.pathname,
         1 - (ae.image_embedding <=> $1::vector) AS similarity,
         (ae.image_embedding <=> $1::vector)     AS cosine_distance
       FROM "assets" a
       INNER JOIN "asset_embeddings" ae ON a.id = ae.asset_id
       WHERE a.owner_user_id = $2 AND a.deleted_at IS NULL
       ORDER BY ae.image_embedding <=> $1::vector
       LIMIT 30`,
      [queryLiteral, USER_ID]
    );

    console.log('query: "a feline" →  ranked by cosine similarity on the target DB:');
    console.log('  rank  asset        similarity  cosine_dist');
    rows.forEach((r, i) => {
      console.log(
        `  ${String(i + 1).padEnd(4)}  ${r.pathname.padEnd(11)}  ` +
        `${Number(r.similarity).toFixed(4).padStart(8)}  ${Number(r.cosine_distance).toFixed(4).padStart(8)}`
      );
    });

    // The semantic claim, order-robust: both felines rank above everything else,
    // and the orthogonal vehicles score ~0. (cat vs kitten order depends on the
    // query's exact tilt — both being on top is the real proof.)
    const top2 = new Set([rows[0]?.pathname, rows[1]?.pathname]);
    const felinesOnTop = top2.has('cat.png') && top2.has('kitten.png');
    const vehiclesOrthogonal =
      Number(rows[3]?.similarity) < 0.01 && Number(rows[4]?.similarity) < 0.01;
    const ok = felinesOnTop && vehiclesOrthogonal;
    console.log(
      `\nverdict: ${ok ? 'PASS' : 'FAIL'} — felines rank top (${[...top2].join(', ')}), ` +
      `vehicles orthogonal (~0). pgvector cosine ranking is correct.`
    );
    process.exitCode = ok ? 0 : 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
