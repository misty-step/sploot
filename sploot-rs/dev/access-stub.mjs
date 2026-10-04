import { createServer } from "node:http";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { request as forward } from "node:http";
import fs from "node:fs";
import { signJwt } from "./jwt.mjs";

const appPort = 8787;
const upstream = 8788;
const loginPort = 8789;
const issuer = `http://127.0.0.1:${appPort}`;
const aud = process.env.ACCESS_AUD || "sploot-rs-local";
const ttl = Number(process.env.STUB_SESSION_SECONDS || 3600);
const keyPath = new URL(".stub-key.json", import.meta.url);
const countPath = process.env.STUB_CERTS_COUNT || "/tmp/sploot-rs-certs-count";
const publicPaths = new Set(["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/apple-touch-icon.png", "/healthz"]);

const saved = fs.existsSync(keyPath) ? JSON.parse(fs.readFileSync(keyPath, "utf8")) : null;
const pair = saved ? null : generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = saved ? createPrivateKey({ key: saved.pem, format: "pem" }) : pair.privateKey;
const jwk = saved ? saved.jwk : Object.assign(pair.publicKey.export({ format: "jwk" }), { kid: "stub", alg: "RS256", use: "sig" });
if (!saved) fs.writeFileSync(keyPath, JSON.stringify({ pem: pair.privateKey.export({ type: "pkcs8", format: "pem" }), jwk }));
let certHits = 0;
fs.writeFileSync(countPath, "0");

function cookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function expired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return !payload.exp || payload.exp <= Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}

function proxy(req, res, token) {
  const headers = { ...req.headers, host: `127.0.0.1:${upstream}` };
  delete headers["transfer-encoding"];
  if (token) headers["cf-access-jwt-assertion"] = token;
  else delete headers["cf-access-jwt-assertion"];
  const up = forward({ hostname: "127.0.0.1", port: upstream, method: req.method, path: req.url, headers }, (upRes) => {
    const out = { ...upRes.headers };
    delete out["transfer-encoding"];
    res.writeHead(upRes.statusCode || 502, out);
    upRes.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
}

function loginLink(email, redirect) {
  return `${issuer}/cdn-cgi/access/authorized?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`;
}

const login = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${loginPort}`);
  if (url.pathname === "/evil") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>evil</title><form id="f" method="post" action="${issuer}/logout"><input name="csrf" value="nope"></form><script>document.getElementById("f").submit()</script>`);
    return;
  }
  const redirect = url.searchParams.get("redirect") || `${issuer}/`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title><style>body{margin:0;background:#121212;color:#bebebe;font:16px ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px}a{display:flex;align-items:center;min-height:44px;color:#e68e0d}p.dim{color:#8a8a8d}</style><p>SPLOOT</p><p class="dim">Sign in</p><p><a href="${loginLink("demo@sploot.test", redirect)}">demo@sploot.test</a></p><p><a href="${loginLink("unmapped@sploot.test", redirect)}">unmapped@sploot.test</a></p>`);
});

const app = createServer((req, res) => {
  const url = new URL(req.url, issuer);
  if (url.pathname === "/cdn-cgi/access/certs") {
    certHits += 1;
    fs.writeFileSync(countPath, String(certHits));
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  if (url.pathname === "/cdn-cgi/access/logout") {
    res.writeHead(302, { location: `${issuer}/`, "set-cookie": "CF_Authorization=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });
    res.end();
    return;
  }
  if (url.pathname === "/cdn-cgi/access/authorized") {
    const redirect = url.searchParams.get("redirect") || `${issuer}/`;
    const next = redirect === issuer || redirect.startsWith(`${issuer}/`) ? redirect : `${issuer}/`;
    const jwt = signJwt(privateKey, jwk, { iss: issuer, aud, email: url.searchParams.get("email") || "", seconds: ttl });
    res.writeHead(302, { location: next, "set-cookie": `CF_Authorization=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}` });
    res.end();
    return;
  }
  if (req.method === "GET" && publicPaths.has(url.pathname)) {
    proxy(req, res, "");
    return;
  }
  const token = cookie(req, "CF_Authorization");
  if (!token || expired(token)) {
    const here = issuer + url.pathname + url.search;
    res.writeHead(302, { location: `http://127.0.0.1:${loginPort}/?redirect=${encodeURIComponent(here)}` });
    res.end();
    return;
  }
  proxy(req, res, token);
});

login.listen(loginPort, "127.0.0.1");
app.listen(appPort, "127.0.0.1");
console.log(`access stub ${issuer}`);
