import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { join } from 'node:path';

const KNOWN_QUERY = 'reaction face meme';
const QA_BLOB_HOST = 'sploot-qa-seed.public.blob.vercel-storage.com';
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

type Asset = { id: string; pathname: string; checksum: string; mime: string; thumbnailUrl: string | null };
type Reply = { status: number; headers: IncomingHttpHeaders; body: Buffer };

type DoctorOptions = {
  baseURL: string;
  revision: string;
  mediaDirectory: string;
  runtimeDirectory: string;
  signal: AbortSignal;
  run: (label: string, command: string, args: string[]) => Promise<string>;
  report: (message: string) => void;
};

function requireThat(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// node:http goes directly to the owned origin: no proxy environment, redirects,
// browser credentials, or ambient cookie jar can change the doctor authority.
function localRequest(options: DoctorOptions, path: string, method = 'GET', cookie = '', body?: Buffer, contentType?: string, idempotencyKey?: string): Promise<Reply> {
  const { promise, resolve, reject } = Promise.withResolvers<Reply>();
  const headers: Record<string, string | number> = {};
  if (cookie) headers.Cookie = cookie;
  if (method !== 'GET') headers.Origin = options.baseURL;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body) {
    headers['Content-Length'] = body.length;
    headers['Content-Type'] = contentType ?? 'application/json';
  }
  const req = request(new URL(path, options.baseURL), {
    method, headers, agent: false,
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]),
  }, (response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        response.destroy(new Error('doctor response exceeded its byte limit'));
      } else chunks.push(chunk);
    });
    response.once('error', reject);
    response.once('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
  });
  req.once('error', reject);
  req.end(body);
  return promise;
}

export async function runDoctor(options: DoctorOptions): Promise<string[]> {
  const checks: string[] = [];
  async function check(name: string, verify: () => Promise<void>) {
    try { await verify(); } catch (error) {
      throw new Error(`doctor ${name}: ${error instanceof Error ? error.message : 'failed'}`);
    }
    checks.push(name);
    options.report(`PASS ${name}`);
  }
  let cookie = '';
  let assets: Asset[] = [];

  await check('owned Go liveness and migrated pgvector readiness', async () => {
    const live = await localRequest(options, '/api/health/live');
    requireThat(live.status === 200, `liveness returned HTTP ${live.status}`);
    const identity = JSON.parse(live.body.toString()) as { status: string; commit: string };
    requireThat(identity.status === 'alive' && identity.commit === options.revision, 'listener is not this launch');
    const health = await localRequest(options, '/api/health');
    const result = JSON.parse(health.body.toString()) as { diagnostics?: { database_connection_test?: boolean; embedding_limiter_schema?: boolean } };
    requireThat(health.status === 200 && result.diagnostics?.database_connection_test && result.diagnostics.embedding_limiter_schema, `database/schema readiness returned HTTP ${health.status}`);
  });

  await check('anonymous denial and exact-origin QA sign-in', async () => {
    const anonymous = await localRequest(options, '/api/assets');
    requireThat(anonymous.status === 401, `anonymous assets returned HTTP ${anonymous.status}`);
    const login = await localRequest(options, '/qa-auth/login');
    requireThat(login.status === 303 && login.headers.location === '/app', `QA login returned HTTP ${login.status}, not a redirect to /app`);
    const signedCookie = login.headers['set-cookie']?.find((value) => value.startsWith('sploot_qa_auth='));
    requireThat(signedCookie && /;\s*HttpOnly/i.test(signedCookie) && /;\s*SameSite=Lax/i.test(signedCookie), 'private QA cookie was not issued');
    cookie = signedCookie.split(';', 1)[0];
    const app = await localRequest(options, '/app', 'GET', cookie);
    requireThat(app.status === 200 && app.headers['content-type']?.includes('text/html') && /<html[\s>]/i.test(app.body.toString()), `signed-in /app returned HTTP ${app.status}, not an HTML library`);
  });

  await check('seeded originals and GIF/video posters match local bytes', async () => {
    const listing = await localRequest(options, '/api/assets?limit=100', 'GET', cookie);
    requireThat(listing.status === 200, `asset listing returned HTTP ${listing.status}`);
    const page = JSON.parse(listing.body.toString()) as { assets: Asset[]; total: number };
    requireThat(Array.isArray(page.assets), 'missing asset list');
    assets = page.assets.filter((asset) => asset.pathname?.startsWith('qa-blob-seed/'));
    requireThat(assets.length === 24, `expected 24 curated QA fixtures, received ${assets.length}`);
    requireThat(assets.some((asset) => asset.mime === 'image/gif') && assets.some((asset) => asset.mime === 'video/mp4'), 'animated fixtures are missing');
    for (const asset of assets) {
      requireThat(/^qa-blob-seed\/[A-Za-z0-9._-]+$/.test(asset.pathname), 'seed media path is not confined');
      const expected = await readFile(join(options.mediaDirectory, asset.pathname));
      const original = await localRequest(options, `/media/${encodeURIComponent(asset.id)}`, 'GET', cookie);
      requireThat(original.status === 200 && sha256(original.body) === sha256(expected) && sha256(expected) === asset.checksum, `original checksum mismatch for ${asset.pathname}`);
      if (asset.thumbnailUrl) {
        const thumbnailURL = new URL(asset.thumbnailUrl);
        requireThat(thumbnailURL.hostname === QA_BLOB_HOST && /^\/qa-blob-seed\/[A-Za-z0-9._-]+$/.test(thumbnailURL.pathname), 'seed poster path is not confined');
        const poster = await readFile(join(options.mediaDirectory, thumbnailURL.pathname.slice(1)));
        const delivered = await localRequest(options, `/media/${encodeURIComponent(asset.id)}?thumbnail=1`, 'GET', cookie);
        requireThat(delivered.status === 200 && sha256(delivered.body) === sha256(poster), `poster checksum mismatch for ${asset.pathname}`);
      }
    }
  });

  await check('durable local save, receipt replay, original download, and duplicate', async () => {
    const imagePath = join(options.runtimeDirectory, `doctor-${randomUUID()}.png`);
    const pixelsPath = `${imagePath}.ppm`;
    let savedID: string | undefined;
    try {
      await writeFile(pixelsPath, Buffer.concat([Buffer.from('P6\n64 64\n255\n'), randomBytes(64 * 64 * 3)]), { mode: 0o600, flag: 'wx' });
      await options.run('doctor-image', 'ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', pixelsPath, '-frames:v', '1', '-threads', '1', imagePath]);
      const image = await readFile(imagePath);
      const boundary = `sploot-${randomUUID()}`;
      const multipart = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="local-doctor.png"\r\nContent-Type: image/png\r\n\r\n`),
        image, Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const idempotencyKey = randomUUID();
      const saved = await localRequest(options, '/api/upload', 'POST', cookie, multipart, `multipart/form-data; boundary=${boundary}`, idempotencyKey);
      const receipt = JSON.parse(saved.body.toString()) as { success: boolean; isDuplicate: boolean; asset?: { id: string; checksum: string; pathname: string } };
      requireThat(saved.status === 201 && receipt.success && !receipt.isDuplicate && receipt.asset?.id, `new save returned HTTP ${saved.status}`);
      savedID = receipt.asset.id;
      requireThat(receipt.asset.checksum === sha256(image), 'save receipt checksum differs from uploaded bytes');
      const replay = await localRequest(options, '/api/upload', 'POST', cookie, multipart, `multipart/form-data; boundary=${boundary}`, idempotencyKey);
      const replayReceipt = JSON.parse(replay.body.toString()) as { success: boolean; isDuplicate: boolean; asset?: { id: string } };
      requireThat(replay.status === 201 && replayReceipt.success && !replayReceipt.isDuplicate && replayReceipt.asset?.id === savedID, 'retry did not replay the original saved receipt');
      const download = await localRequest(options, `/media/${encodeURIComponent(savedID)}?download=1`, 'GET', cookie);
      requireThat(download.status === 200 && sha256(download.body) === sha256(image) && download.headers['content-disposition']?.includes('attachment'), 'saved original download did not preserve the bytes');
      const duplicate = await localRequest(options, '/api/upload', 'POST', cookie, multipart, `multipart/form-data; boundary=${boundary}`);
      const duplicateReceipt = JSON.parse(duplicate.body.toString()) as { isDuplicate: boolean; asset?: { id: string } };
      requireThat(duplicate.status === 409 && duplicateReceipt.isDuplicate && duplicateReceipt.asset?.id === savedID, `duplicate returned HTTP ${duplicate.status} or a different asset`);
    } finally {
      await rm(imagePath, { force: true });
      await rm(pixelsPath, { force: true });
      if (savedID && !options.signal.aborted) {
        const removed = await localRequest(options, `/api/assets/${encodeURIComponent(savedID)}`, 'DELETE', cookie);
        requireThat(removed.status === 200, `doctor asset cleanup returned HTTP ${removed.status}`);
      }
    }
  });

  await check('cached QA query succeeds; uncached provider work fails closed', async () => {
    const known = await localRequest(options, '/api/search', 'POST', cookie, Buffer.from(JSON.stringify({ query: KNOWN_QUERY, limit: 10 })));
    requireThat(known.status === 200, `cached query returned HTTP ${known.status}`);
    const result = JSON.parse(known.body.toString()) as { results: Array<{ id: string }>; total: number };
    const seededIDs = new Set(assets.map((asset) => asset.id));
    requireThat(result.total > 0 && Array.isArray(result.results) && result.results.some((asset) => seededIDs.has(asset.id)), 'cached query did not retrieve a seeded fixture');
    const novel = await localRequest(options, '/api/search', 'POST', cookie, Buffer.from(JSON.stringify({ query: `uncached local doctor ${randomUUID()}`, limit: 10 })));
    const failure = JSON.parse(novel.body.toString()) as { code?: string };
    requireThat(novel.status === 503 && failure.code === 'embeddings_disabled', `uncached query returned HTTP ${novel.status}/${failure.code ?? 'missing code'}, not the configured provider-free refusal`);
  });
  return checks;
}
