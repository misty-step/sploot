import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

for (const dir of [".wrangler", "evidence-out", "test-results"]) fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync("dev/.stub-key.json", { force: true });
fs.mkdirSync("evidence-out", { recursive: true });

let sha = "local";
try {
  sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
} catch {
  sha = "local";
}
const csrf = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  ACCESS_ISSUER: "http://127.0.0.1:8787",
  ACCESS_AUD: "sploot-rs-local",
  APP_ORIGIN: "http://127.0.0.1:8787",
  APP_ENV: "local",
  GIT_SHA: sha,
  CSRF_KEY: csrf,
  STUB_CERTS_COUNT: "/tmp/sploot-rs-certs-count",
};
fs.writeFileSync(
  ".dev.vars",
  `CSRF_KEY=${csrf}\nACCESS_ISSUER=http://127.0.0.1:8787\nACCESS_AUD=sploot-rs-local\nAPP_ORIGIN=http://127.0.0.1:8787\nAPP_ENV=local\nGIT_SHA=${sha}\n`,
);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

const children = [];
function start(command, args, log) {
  const handle = fs.openSync(log, "w");
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ["ignore", handle, handle] });
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function waitFor(url, accept) {
  const deadline = Date.now() + 90_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      last = await response.text();
      if (accept(response, last)) return;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${url}: ${last.slice(0, 400)}`);
}

try {
  await run("worker-build", ["--release"]);
  const wrangler = ["exec", "wrangler"];
  const persist = ["--persist-to", ".wrangler/state"];
  await run("pnpm", [...wrangler, "d1", "migrations", "apply", "sploot-rs", "--local", ...persist]);
  await run("pnpm", [...wrangler, "d1", "execute", "sploot-rs", "--local", ...persist, "--file", "seed.demo.sql"]);
  await run("pnpm", [
    ...wrangler,
    "d1",
    "execute",
    "sploot-rs",
    "--local",
    ...persist,
    "--command",
    "INSERT INTO identities (subject, kind, owner_id, scopes, created_at, revoked_at) VALUES ('revoked@sploot.test', 'human', 'demo', '', '2026-10-04T00:00:00Z', '2026-10-04T00:00:01Z')",
  ]);
  start("pnpm", [...wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", "8788", "--persist-to", ".wrangler/state", "--show-interactive-dev-session=false"], "/tmp/sploot-rs-wrangler.log");
  start("node", ["dev/access-stub.mjs"], "/tmp/sploot-rs-stub.log");
  await waitFor("http://127.0.0.1:8788/healthz", (_response, body) => body.includes('"db":"ok"'));
  await waitFor("http://127.0.0.1:8789/", (response) => response.status === 200);
  await run("node", ["test/auth.mjs"]);
  await run("pnpm", ["exec", "playwright", "install", "webkit"]);
  await run("pnpm", ["exec", "playwright", "test"]);
  const webm = fs.readdirSync("evidence-out").find((name) => name.endsWith(".webm") && name !== "walkthrough.webm");
  const source = webm ? path.join("evidence-out", webm) : "evidence-out/walkthrough.webm";
  if (fs.existsSync(source)) {
    await run("ffmpeg", ["-y", "-i", source, "-an", "evidence-out/walkthrough.mp4"]).catch((error) => {
      console.error(String(error));
    });
  }
} finally {
  stop();
}
