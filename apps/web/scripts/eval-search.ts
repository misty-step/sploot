/**
 * Retrieval-quality eval for the production search path (sploot-073).
 *
 * Seeds the committed real-embedding fixture library (eval/fixtures/) into a
 * local/CI pgvector Postgres under a dedicated eval user, then runs every
 * golden query through lib/db.ts vectorSearch — the exact function
 * /api/search calls — and reports:
 *
 *   - top-1 / top-5 hit rate and MRR against the golden expectations
 *   - p50 / p95 search latency (embedding-cache-hit path: pgvector query,
 *     threshold filter, ranking — HTTP/Next overhead excluded, covered by
 *     smoke:deployed)
 *   - the similarity-score distributions of correct hits vs irrelevant
 *     results, and the thresholds derived from them (lib/eval/metrics.ts)
 *
 * Quality metrics are DETERMINISTIC (committed embeddings, exact ranking) —
 * their noise floor is zero and any regression fails. Latency is compared
 * against the absolute budget stored in eval/baseline.json.
 *
 * Usage (from apps/web, DATABASE_URL at a local pgvector Postgres):
 *   pnpm eval:search                     # run + compare against eval/baseline.json
 *   pnpm eval:search --update-baseline   # ratchet: rewrite the stored baseline
 *   pnpm eval:search --threshold 0.2     # try a different similarity floor
 *   pnpm eval:search --teardown          # remove the seeded eval user + assets
 *
 * Exit codes: 0 pass, 1 regression or latency budget blown, 2 setup error.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { CLIP_MODEL } from '../lib/embeddings';
import { embeddingVectorSql } from '../lib/embedding-vector-sql';
import { QA_SEED_BLOB_HOST } from '../lib/qa/qa-image-loader';
import {
  computeRetrievalMetrics,
  deriveThresholds,
  percentile,
  rankOfFirstExpected,
} from '../lib/eval/metrics';
import { SEARCH_SIMILARITY_FLOOR } from '../lib/search-config';

const EVAL_USER_ID = 'eval-golden-user';
const EVAL_DIR = join(process.cwd(), 'eval');
const FIXTURES_DIR = join(EVAL_DIR, 'fixtures');
const BASELINE_PATH = join(EVAL_DIR, 'baseline.json');
const SEARCH_LIMIT = 50;
const LATENCY_REPS = 3;

interface FixtureAsset {
  imgflipId: string;
  name: string;
  sourceUrl: string;
  width: number;
  height: number;
  embedding: number[];
}

interface FixtureQuery {
  query: string;
  expected: string[];
  embedding: number[];
}

interface Baseline {
  model: string;
  threshold: number;
  assets: number;
  queries: number;
  top1: number;
  top5: number;
  mrr: number;
  latencyBudgetMs: number;
  generatedAt: string;
  note: string;
}

function parseArgs(argv: string[]) {
  const args = {
    teardown: false,
    updateBaseline: false,
    threshold: undefined as number | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--teardown') args.teardown = true;
    if (argv[i] === '--update-baseline') args.updateBaseline = true;
    if (argv[i] === '--threshold' && argv[i + 1]) args.threshold = Number(argv[++i]);
  }
  if (args.threshold !== undefined && !(args.threshold >= 0 && args.threshold <= 1)) {
    throw new Error(`--threshold must be in [0, 1], got ${args.threshold}`);
  }
  return args;
}

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (point it at a local pgvector Postgres)');
  const host = new URL(url).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal && process.env.SPLOOT_QA_SEED_FORCE !== '1') {
    throw new Error(`Refusing to run the eval against non-local database host "${host}".`);
  }
}

async function seed(prisma: PrismaClient, assets: FixtureAsset[]) {
  await prisma.user.upsert({
    where: { id: EVAL_USER_ID },
    update: {},
    create: { id: EVAL_USER_ID, email: `${EVAL_USER_ID}@qa.local` },
  });

  for (const fixture of assets) {
    const checksum = createHash('sha256')
      .update(`eval-fixture-${fixture.imgflipId}`)
      .digest('hex');
    const pathname = `eval-fixtures/${fixture.imgflipId}.jpg`;
    const asset = await prisma.asset.upsert({
      where: { unique_user_checksum: { ownerUserId: EVAL_USER_ID, checksumSha256: checksum } },
      update: { deletedAt: null },
      create: {
        ownerUserId: EVAL_USER_ID,
        blobUrl: `${QA_SEED_BLOB_HOST}/${pathname}`,
        thumbnailUrl: null,
        pathname,
        mime: 'image/jpeg',
        width: fixture.width,
        height: fixture.height,
        size: 1,
        checksumSha256: checksum,
        favorite: false,
      },
    });

    const vectorSql = embeddingVectorSql(fixture.embedding, 'eval fixture embedding');
    await prisma.$queryRaw(Prisma.sql`
      INSERT INTO "asset_embeddings" (
        "asset_id", "model_name", "model_version", "dim", "image_embedding",
        "status", "error", "completedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${asset.id}, ${CLIP_MODEL}, ${CLIP_MODEL}, ${fixture.embedding.length},
        ${vectorSql}, 'ready', NULL, NOW(), NOW(), NOW()
      )
      ON CONFLICT ("asset_id") DO UPDATE SET
        "model_name" = EXCLUDED."model_name",
        "model_version" = EXCLUDED."model_version",
        "dim" = EXCLUDED."dim",
        "image_embedding" = EXCLUDED."image_embedding",
        "status" = 'ready',
        "error" = NULL,
        "completedAt" = NOW(),
        "updatedAt" = NOW()
    `);
  }
}

async function teardown(prisma: PrismaClient) {
  const assets = await prisma.asset.findMany({
    where: { ownerUserId: EVAL_USER_ID },
    select: { id: true },
  });
  const ids = assets.map((a) => a.id);
  if (ids.length > 0) {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "asset_embeddings" WHERE "asset_id" IN (${Prisma.join(ids)})`
    );
    await prisma.asset.deleteMany({ where: { ownerUserId: EVAL_USER_ID } });
  }
  await prisma.searchLog.deleteMany({ where: { userId: EVAL_USER_ID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: EVAL_USER_ID } });
  console.log(`Removed eval user "${EVAL_USER_ID}" and ${ids.length} fixture assets.`);
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertLocalDatabase();
  const prisma = new PrismaClient();

  try {
    if (args.teardown) {
      await teardown(prisma);
      return;
    }

    const assetsFile = JSON.parse(
      await readFile(join(FIXTURES_DIR, 'assets.json'), 'utf8')
    ) as { model: string; assets: FixtureAsset[] };
    const queriesFile = JSON.parse(
      await readFile(join(FIXTURES_DIR, 'queries.json'), 'utf8')
    ) as { model: string; queries: FixtureQuery[] };

    if (assetsFile.model !== CLIP_MODEL || queriesFile.model !== CLIP_MODEL) {
      throw new Error(
        `fixture model mismatch: fixtures were built with ${assetsFile.model}, ` +
          `production uses ${CLIP_MODEL}. Re-run pnpm eval:fixtures.`
      );
    }
    if (assetsFile.assets.length < 100) {
      throw new Error(`fixture library must hold >=100 assets, got ${assetsFile.assets.length}`);
    }
    if (queriesFile.queries.length < 50) {
      throw new Error(`golden set must hold >=50 queries, got ${queriesFile.queries.length}`);
    }

    const threshold = args.threshold ?? SEARCH_SIMILARITY_FLOOR;
    console.log(
      `Eval: ${assetsFile.assets.length} assets, ${queriesFile.queries.length} queries, ` +
        `similarity floor ${threshold}, model ${CLIP_MODEL.split(':')[0]}`
    );

    await seed(prisma, assetsFile.assets);

    // vectorSearch imports lib/db.ts whose singleton reads DATABASE_URL at
    // import time; import lazily after the guard so setup errors are clear.
    const { vectorSearch } = await import('../lib/db');

    const idByPathname = new Map(
      assetsFile.assets.map((a) => [`eval-fixtures/${a.imgflipId}.jpg`, a.imgflipId])
    );

    const perQuery: Array<{ rank: number | null; query: string; topSim: number | null }> = [];
    const correctSims: number[] = [];
    const irrelevantSims: number[] = [];
    const latencies: number[] = [];

    for (const q of queriesFile.queries) {
      const expected = new Set(q.expected);

      // Latency: repeated measured runs of the production floor.
      let rows: Array<{ pathname: string; distance: number }> = [];
      for (let rep = 0; rep < LATENCY_REPS; rep++) {
        const start = performance.now();
        rows = (await vectorSearch(EVAL_USER_ID, q.embedding, {
          limit: SEARCH_LIMIT,
          threshold,
        })) as Array<{ pathname: string; distance: number }>;
        latencies.push(performance.now() - start);
      }

      const rankedIds = rows.map((r) => idByPathname.get(r.pathname) ?? r.pathname);
      const rank = rankOfFirstExpected(rankedIds, expected);
      perQuery.push({ rank, query: q.query, topSim: rows[0]?.distance ?? null });

      // Distributions come from an UNFILTERED pass so the derivation can see
      // below-floor scores.
      const rawRows = (await vectorSearch(EVAL_USER_ID, q.embedding, {
        limit: SEARCH_LIMIT,
        threshold: 0,
      })) as Array<{ pathname: string; distance: number }>;
      const firstExpectedRow = rawRows.find((row) =>
        expected.has(idByPathname.get(row.pathname) ?? row.pathname)
      );
      if (firstExpectedRow) correctSims.push(firstExpectedRow.distance);
      for (const row of rawRows.slice(0, 10)) {
        const id = idByPathname.get(row.pathname) ?? row.pathname;
        if (!expected.has(id)) irrelevantSims.push(row.distance);
      }
    }

    const metrics = computeRetrievalMetrics(perQuery);
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const derived = deriveThresholds(correctSims, irrelevantSims);

    console.log('\n== Retrieval quality (deterministic, noise floor = 0) ==');
    console.log(`  top-1  ${fmtPct(metrics.top1)}   (${Math.round(metrics.top1 * metrics.total)}/${metrics.total})`);
    console.log(`  top-5  ${fmtPct(metrics.top5)}   (${Math.round(metrics.top5 * metrics.total)}/${metrics.total})`);
    console.log(`  MRR    ${metrics.mrr.toFixed(4)}`);

    console.log(`\n== Latency (pgvector search path, ${latencies.length} samples) ==`);
    console.log(`  p50    ${p50.toFixed(1)}ms`);
    console.log(`  p95    ${p95.toFixed(1)}ms`);

    console.log('\n== Similarity distributions (unfiltered) ==');
    console.log(
      `  correct hits   min ${derived.stats.correctMin.toFixed(3)}  p25 ${derived.stats.correctP25.toFixed(3)}  ` +
        `p50 ${derived.stats.correctP50.toFixed(3)}  max ${derived.stats.correctMax.toFixed(3)}  (n=${correctSims.length})`
    );
    console.log(
      `  irrelevant     p50 ${derived.stats.irrelevantP50.toFixed(3)}  p95 ${derived.stats.irrelevantP95.toFixed(3)}  (n=${irrelevantSims.length})`
    );
    console.log(
      `  derived        floor ${derived.floor}  near ${derived.near}  match ${derived.match}`
    );

    const misses = perQuery.filter((q) => q.rank === null);
    if (misses.length > 0) {
      console.log(`\n== Misses (${misses.length}) ==`);
      for (const miss of misses) console.log(`  - "${miss.query}"`);
    }
    const beyondTop1 = perQuery.filter((q) => q.rank !== null && q.rank > 1);
    if (beyondTop1.length > 0) {
      console.log(`\n== Ranked but not first (${beyondTop1.length}) ==`);
      for (const q of beyondTop1) console.log(`  - rank ${q.rank}: "${q.query}"`);
    }

    if (args.updateBaseline) {
      const baseline: Baseline = {
        model: CLIP_MODEL,
        threshold,
        assets: assetsFile.assets.length,
        queries: queriesFile.queries.length,
        top1: metrics.top1,
        top5: metrics.top5,
        mrr: Number(metrics.mrr.toFixed(6)),
        latencyBudgetMs: Math.max(250, Math.ceil(p95 * 3)),
        generatedAt: new Date().toISOString(),
        note:
          'Ratcheted baseline for scripts/eval-search.ts. Quality metrics are deterministic ' +
          '(committed embeddings): any drop below these values fails CI. latencyBudgetMs is an ' +
          'absolute p95 budget (3x observed p95 at generation time, min 250ms) — the explicit ' +
          'noise floor for CI-runner latency variance. Update only via --update-baseline in a ' +
          'reviewed commit.',
      };
      await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`\nBaseline updated: ${BASELINE_PATH}`);
      return;
    }

    const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as Baseline;
    console.log(
      `\n== Baseline comparison (${baseline.generatedAt}, threshold ${baseline.threshold}) ==`
    );
    const EPS = 1e-9; // quality is deterministic; tolerance is float representation only
    const failures: string[] = [];
    if (baseline.model !== CLIP_MODEL) {
      failures.push(
        `model changed (${baseline.model} -> ${CLIP_MODEL}); re-run eval:fixtures and --update-baseline`
      );
    }
    for (const key of ['top1', 'top5', 'mrr'] as const) {
      const cur = metrics[key];
      const base = baseline[key];
      const delta = cur - base;
      const status = delta < -EPS ? 'REGRESSION' : 'ok';
      console.log(`  ${key.padEnd(5)} ${base.toFixed(4)} -> ${cur.toFixed(4)}  (${delta >= 0 ? '+' : ''}${delta.toFixed(4)}) ${status}`);
      if (delta < -EPS) failures.push(`${key} regressed: ${base.toFixed(4)} -> ${cur.toFixed(4)}`);
    }
    console.log(`  p95   budget ${baseline.latencyBudgetMs}ms, observed ${p95.toFixed(1)}ms ${p95 > baseline.latencyBudgetMs ? 'OVER BUDGET' : 'ok'}`);
    if (p95 > baseline.latencyBudgetMs) {
      failures.push(`p95 latency ${p95.toFixed(1)}ms exceeds budget ${baseline.latencyBudgetMs}ms`);
    }

    if (failures.length > 0) {
      console.error('\nEVAL FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nEVAL PASSED.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
