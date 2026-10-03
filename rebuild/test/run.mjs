import { createSign, generateKeyPairSync, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { golden } from "../harness/golden.js";
import { gateResult, selfCheck } from "../harness/score.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 8791;
const base = `http://127.0.0.1:${port}`;
const config = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
const iss = config.vars.ACCESS_ISS;
const aud = config.vars.ACCESS_AUD;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
jwk.kid = "rebuild-test";
jwk.alg = "RS256";
jwk.use = "sig";
const jwksB64 = Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64");

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(claims, { kid = "rebuild-test", alg = "RS256" } = {}) {
  const header = b64url(JSON.stringify({ alg, typ: "JWT", kid }));
  const payload = b64url(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  if (alg !== "RS256") return `${input}.${b64url("nope")}`;
  const signature = createSign("RSA-SHA256").update(input).sign(privateKey);
  return `${input}.${b64url(signature)}`;
}

function claims(extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss,
    aud,
    exp: now + 300,
    nbf: now - 5,
    email: "human-a@rebuild.test",
    sub: "user-a",
    type: "app",
    ...extra,
  };
}

const tokens = {
  humanA: () => sign(claims()),
  humanB: () => sign(claims({ email: "human-b@rebuild.test", sub: "user-b" })),
  save: () => sign(claims({ email: undefined, common_name: "service-save", sub: "" })),
  revoked: () => sign(claims({ email: undefined, common_name: "service-revoked", sub: "" })),
  unknown: () => sign(claims({ email: "nobody@rebuild.test" })),
  expired: () => sign(claims({ exp: Math.floor(Date.now() / 1000) - 10 })),
  notYet: () => sign(claims({ nbf: Math.floor(Date.now() / 1000) + 3600, exp: Math.floor(Date.now() / 1000) + 7200 })),
  wrongAud: () => sign(claims({ aud: "other-app" })),
  wrongIss: () => sign(claims({ iss: "https://other.example" })),
  noneAlg: () => sign(claims(), { alg: "none" }),
};

function vec(hot) {
  const values = Array(32).fill(0);
  values[hot] = 1;
  return values;
}

async function api(urlPath, { token, method = "GET", body, raw = false } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      ...(token ? { "cf-access-jwt-assertion": token } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") };
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

function pngBody(id, note, bytes = png) {
  return { id, mime: "image/png", note, data_base64: Buffer.from(bytes).toString("base64") };
}

async function d1(file) {
  const child = spawn("pnpm", ["exec", "wrangler", "d1", "execute", "sploot-rebuild-preview", "--local", "--file", file], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`d1 execute ${file} failed\n${stderr}`);
}

async function waitUntilUp(child) {
  const started = Date.now();
  let last = "no response";
  while (Date.now() - started < 90_000) {
    if (child.exitCode !== null) throw new Error(`wrangler exited ${child.exitCode}`);
    try {
      const response = await api("/");
      if (response.status === 401 || response.status === 200) return;
      if (response.status >= 500) throw new Error(`worker returned ${response.status}: ${response.text}`);
      last = `${response.status} ${response.text}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler did not start: ${last}`);
}

function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

async function main() {
  const scorer = selfCheck();
  console.log(`scorer self-check: ${scorer}`);
  fs.writeFileSync(path.join(root, ".dev.vars"), `ACCESS_JWKS_B64=${jwksB64}\n`);
  fs.rmSync(path.join(root, ".wrangler"), { recursive: true, force: true });
  console.log("building worker");
  await run("worker-build", ["--release"]);

  const log = fs.createWriteStream("/tmp/sploot-rebuild-wrangler.log");
  const child = spawn("pnpm", ["exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--show-interactive-dev-session=false"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  process.on("exit", stop);

  try {
    await waitUntilUp(child);
    await d1("seed.local.sql");
    const machinery = await spike();
    const gate = report(machinery, scorer);
    const out = path.join(root, "harness", "gate.json");
    fs.writeFileSync(out, `${JSON.stringify(gate, null, 2)}\n`);
    console.log(JSON.stringify(gate.gates, null, 2));
    console.log(`wrote ${out}`);
  } finally {
    stop();
    await once(child, "exit").catch(() => {});
  }
}

async function spike() {
  const human = tokens.humanA();
  const other = tokens.humanB();
  const saveToken = tokens.save();

  assert.equal((await api("/")).status, 401);
  assert.equal((await api("/", { token: tokens.expired() })).status, 401);
  assert.equal((await api("/", { token: tokens.notYet() })).status, 401);
  assert.equal((await api("/", { token: tokens.wrongAud() })).status, 401);
  assert.equal((await api("/", { token: tokens.wrongIss() })).status, 401);
  assert.equal((await api("/", { token: tokens.noneAlg() })).status, 401);
  assert.equal((await api("/", { token: `${human.slice(0, -4)}abcd` })).status, 401);
  assert.equal((await api("/", { token: tokens.unknown() })).status, 403);
  assert.equal((await api("/", { token: tokens.revoked() })).status, 403);
  assert.equal((await api("/", { token: saveToken })).status, 403);

  const home = await api("/", { token: human });
  assert.equal(home.status, 200);
  assert.equal(home.json.owner_id, "owner-a");
  assert.equal(home.json.local_backend, true);
  assert.equal((await api("/", { token: other })).json.owner_id, "owner-b");

  const saved = await api("/spike/save", { token: human, method: "POST", body: pngBody("pic-a", "attention note 01") });
  assert.equal(saved.status, 201, saved.text);
  assert.equal(saved.json.duplicate, false);
  assert.equal(saved.json.sha256, createHash("sha256").update(png).digest("hex"));
  assert.equal(saved.json.r2_key, "o/owner-a/pic-a");
  const again = await api("/spike/save", { token: human, method: "POST", body: pngBody("pic-a-copy", "other note") });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.json.duplicate, true);
  assert.equal(again.json.id, "pic-a");
  const otherBytes = Buffer.concat([png, Buffer.from([1])]);
  const taken = await api("/spike/save", { token: human, method: "POST", body: pngBody("pic-a", "nope", otherBytes) });
  assert.equal(taken.status, 409, taken.text);

  const owned = await api("/spike/save", { token: other, method: "POST", body: pngBody("pic-b", "attention note 01", otherBytes) });
  assert.equal(owned.status, 201, owned.text);
  const hidden = await api("/spike/m/pic-a", { token: other, raw: true });
  assert.equal(hidden.status, 404);
  const media = await api("/spike/m/pic-a", { token: human, raw: true });
  assert.equal(media.status, 200);
  assert.equal(media.type, "image/png");
  assert.deepEqual(media.bytes, png);
  assert.equal((await api("/spike/m/pic-a", { token: saveToken, raw: true })).status, 403);

  const serviceSave = await api("/spike/save", {
    token: saveToken,
    method: "POST",
    body: pngBody("pic-service", "service note", Buffer.concat([png, Buffer.from([2])])),
  });
  assert.equal(serviceSave.status, 201, serviceSave.text);
  assert.equal((await api("/spike/ai", { token: saveToken, method: "POST", body: { candidate: "A" } })).status, 403);

  for (const item of golden.refused) {
    const bytes = Buffer.concat([png, Buffer.from(item.id)]);
    const response = await api("/spike/save", { token: human, method: "POST", body: pngBody(item.id, item.note, bytes) });
    assert.equal(response.status, 201, response.text);
  }
  const listed = await api("/spike/assets", { token: human });
  const ids = listed.json.assets.map((asset) => asset.id);
  for (const item of golden.refused) assert.ok(ids.includes(item.id), item.id);
  assert.ok(!ids.includes("pic-b"));
  let silentDrops = 0;
  for (const item of golden.refused) {
    const found = await api("/spike/search", { token: human, method: "POST", body: { q: item.query } });
    assert.equal(found.status, 200, found.text);
    assert.equal(found.json.degraded, true);
    assert.equal(found.json.notice, "Search is using text only.");
    if (!found.json.results.some((hit) => hit.id === item.id)) silentDrops += 1;
    const foreign = await api("/spike/search", { token: other, method: "POST", body: { q: item.query } });
    assert.ok(!foreign.json.results.some((hit) => hit.id === item.id));
  }

  const probes = {};
  for (const candidate of ["A", "qwen3-vl", "B", "clip"]) {
    const response = await api("/spike/ai", { token: human, method: "POST", body: { candidate } });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.measurable, false);
    assert.equal(response.json.cloudflare_reached, false);
    probes[candidate] = response.json;
  }
  assert.match(probes.A.error, /@cf\/google\/gemma-4-26b-a4b-it/);
  assert.match(probes["qwen3-vl"].error, /@cf\/qwen\/qwen3-vl-embedding-2b/);
  assert.equal(probes.A.backend, "local-stand-in");

  const upsert = await api("/spike/vectorize", {
    token: human,
    method: "POST",
    body: { op: "upsert", id: "rank-a", values: vec(0), metadata: { owner: "owner-a", v: 1 } },
  });
  if (upsert.status !== 200) process.stderr.write(`upsert failed: ${upsert.text}\n`);
  assert.equal(upsert.status, 200, upsert.text);
  assert.ok(upsert.json.result.mutationId);
  const badDim = await api("/spike/vectorize", {
    token: human,
    method: "POST",
    body: { op: "upsert", id: "bad", values: [1, 2, 3], metadata: { owner: "owner-a" } },
  });
  assert.equal(badDim.status, 400);
  assert.match(badDim.json.error, /VECTOR_DIMENSION_MISMATCH/);
  const oversized = await api("/spike/vectorize", {
    token: human,
    method: "POST",
    body: { op: "upsert", id: "big", values: vec(0), metadata: { owner: "owner-a", blob: "x".repeat(11000) } },
  });
  assert.equal(oversized.status, 400);
  assert.match(oversized.json.error, /METADATA_TOO_LARGE/);
  const missing = await api("/spike/vectorize", { token: human, method: "POST", body: { op: "missing" } });
  assert.equal(missing.status, 400);
  assert.match(missing.json.error, /VECTORIZE_ABSENT/);

  await api("/spike/vectorize", {
    token: human,
    method: "POST",
    body: { op: "upsert", id: "rank-b", values: vec(1), metadata: { owner: "owner-a", v: 1 } },
  });
  await api("/spike/vectorize", {
    token: human,
    method: "POST",
    body: { op: "upsert", id: "rank-stale", values: vec(0), metadata: { owner: "owner-a", v: 9 } },
  });
  await api("/spike/vectorize", {
    token: human,
    method: "POST",
    body: { op: "upsert", id: "foreign-vec", values: vec(0), metadata: { owner: "owner-b", v: 1 } },
  });
  const queried = await api("/spike/vectorize", { token: human, method: "POST", body: { op: "query", values: vec(0), top_k: 5 } });
  assert.equal(queried.status, 200, queried.text);
  const queryIds = queried.json.result.matches.map((hit) => hit.id);
  assert.ok(queryIds.includes("rank-a"));
  assert.ok(!queryIds.includes("foreign-vec"));
  const fetched = await api("/spike/vectorize", { token: human, method: "POST", body: { op: "get", ids: ["rank-a", "missing-id"] } });
  assert.equal(fetched.json.result.length, 1);
  assert.equal(fetched.json.result[0].metadata.owner, "owner-a");

  const rankBytes = {
    "rank-a": Buffer.concat([png, Buffer.from("rank-a")]),
    "rank-b": Buffer.concat([png, Buffer.from("rank-b")]),
    "rank-stale": Buffer.concat([png, Buffer.from("rank-stale")]),
  };
  assert.equal((await api("/spike/save", { token: human, method: "POST", body: pngBody("rank-a", "red plankton", rankBytes["rank-a"]) })).status, 201);
  assert.equal((await api("/spike/save", { token: human, method: "POST", body: pngBody("rank-b", "blue plankton", rankBytes["rank-b"]) })).status, 201);
  assert.equal((await api("/spike/save", { token: human, method: "POST", body: pngBody("rank-stale", "unindexed relic", rankBytes["rank-stale"]) })).status, 201);
  await d1("test/index-ready.sql");

  const fused = await api("/spike/rank", { token: human, method: "POST", body: { q: "plankton", vector: vec(0) } });
  assert.equal(fused.status, 200, fused.text);
  assert.equal(fused.json.degraded, false);
  const fusedIds = fused.json.results.map((hit) => hit.id);
  assert.ok(fusedIds.indexOf("rank-a") !== -1 && fusedIds.indexOf("rank-a") < fusedIds.indexOf("rank-b"));
  assert.ok(!fusedIds.includes("rank-stale"));
  const byNote = await api("/spike/rank", { token: human, method: "POST", body: { q: "unindexed relic", vector: vec(0) } });
  assert.ok(byNote.json.results.some((hit) => hit.id === "rank-stale"));
  const otherRank = await api("/spike/rank", { token: other, method: "POST", body: { q: "plankton", vector: vec(0) } });
  assert.ok(!otherRank.json.results.some((hit) => hit.id === "rank-a" || hit.id === "rank-b"));

  return {
    silentDrops,
    stored: golden.refused.length,
    probes,
    vectorize: {
      bad_dimensions: badDim.json.error,
      oversized_metadata: oversized.json.error,
      missing_binding: missing.json.error,
    },
  };
}

function report(machinery, scorer) {
  const refusedMeasured = machinery.silentDrops === 0;
  const buckets = [
    {
      bucket: "text-heavy",
      set: golden.text.length,
      threshold: "target in top 3 >= 90%",
      result: "not-yet-measurable",
      reason: "No candidate embedded this set. Workers AI was not reached, and these rows are phrases, not library images.",
    },
    {
      bucket: "visual-only",
      set: golden.visual.length,
      threshold: "target in top 5 >= 70% and >= CLIP baseline",
      result: "not-yet-measurable",
      reason: "No visual embeddings and no CLIP baseline were produced.",
    },
    {
      bucket: "similar-templates",
      set: golden.templates.length,
      threshold: "correct one ranked above its sibling >= 80%",
      result: "not-yet-measurable",
      reason: "Template pairs were not embedded.",
    },
    {
      bucket: "refused-or-failed",
      set: golden.refused.length,
      threshold: "100% stored and listed; 0 silent drops; findable by note/FTS; refusal rate reported; search degrades to FTS with a notice",
      stored_and_listed: refusedMeasured ? "pass" : "fail",
      silent_drops: machinery.silentDrops,
      fts_notice: refusedMeasured ? "pass" : "fail",
      model_refusal_rate: "not-yet-measurable",
      result: refusedMeasured ? "not-yet-measurable" : "fail",
      reason: refusedMeasured
        ? "Injected AI failure stored every refused-bucket row and found it by note with a text-only notice. No vision model ran, so the refusal rate is unknown. The rows are gray placeholders, not edgy images."
        : "A saved row was missing from FTS.",
    },
  ];
  return {
    milestone: "M0",
    library: "synthetic",
    library_note: "No real Sploot library was on this machine. The golden set is 15 text phrases, 15 visual descriptions, 10 template pairs, and 10 note-backed placeholders. Pixels were not generated.",
    credentials: {
      cloudflare: false,
      workers_ai_reached: false,
      vectorize_reached: false,
      vectorize_backend: "local-stand-in",
    },
    gates: {
      "1_search_quality": {
        result: gateResult(buckets.map((bucket) => bucket.result)),
        buckets,
        candidates: {
          A: { model: machinery.probes.A.model, result: "not-yet-measurable", error: machinery.probes.A.error },
          B: { result: "not-yet-measurable", reason: machinery.probes.B.reason },
          "qwen3-vl": { model: machinery.probes["qwen3-vl"].model, result: "not-yet-measurable", error: machinery.probes["qwen3-vl"].error },
          clip: { result: "not-yet-measurable", reason: machinery.probes.clip.reason },
        },
      },
      "2_capture_across_expired_login": {
        result: "not-yet-measurable",
        reason: "Not built. Gate 2 needs a signed-out browser and a capture client.",
      },
      "3_lossless_rollback": {
        result: "not-yet-measurable",
        reason: "Not built. Gate 3 needs a restored library snapshot and a rehearsed route reversal.",
      },
    },
    machinery: {
      scorer_self_check: scorer,
      access_jwt: "pass",
      r2_roundtrip: "pass",
      d1_owner_fence: "pass",
      vectorize_bridge_local_stand_in: "pass",
      vectorize_cloudflare_errors: "not-yet-measurable",
      injected_failure: refusedMeasured ? "pass" : "fail",
      vectorize_errors_seen: machinery.vectorize,
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
