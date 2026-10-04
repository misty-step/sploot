import { createHmac, createPrivateKey, createSign } from "node:crypto";
import fs from "node:fs";
import { b64url } from "../dev/jwt.mjs";

const worker = "http://127.0.0.1:8788";
const issuer = process.env.ACCESS_ISSUER || "http://127.0.0.1:8787";
const aud = process.env.ACCESS_AUD || "sploot-rs-local";
const origin = process.env.APP_ORIGIN || issuer;
const countPath = process.env.STUB_CERTS_COUNT || "/tmp/sploot-rs-certs-count";
const saved = JSON.parse(fs.readFileSync(new URL("../dev/.stub-key.json", import.meta.url), "utf8"));
const privateKey = createPrivateKey({ key: saved.pem, format: "pem" });

const now = () => Math.floor(Date.now() / 1000);

function csrf(subject) {
  return createHmac("sha256", process.env.CSRF_KEY).update(subject).digest("hex");
}

function sign(claims, { kid = "stub", alg = "RS256" } = {}) {
  const header = b64url(JSON.stringify({ alg, typ: "JWT", kid }));
  const payload = b64url(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  if (alg !== "RS256") return `${input}.${b64url("nope")}`;
  return `${input}.${b64url(createSign("RSA-SHA256").update(input).sign(privateKey))}`;
}

function human(overrides = {}) {
  return { iss: issuer, aud, exp: now() + 300, nbf: now() - 5, email: "demo@sploot.test", sub: "demo", ...overrides };
}

const failures = [];
function check(name, ok, detail = "") {
  if (ok) console.log(`ok ${name}`);
  else {
    failures.push(name);
    console.error(`FAIL ${name}${detail ? ` ${detail}` : ""}`);
  }
}

async function call(path, { token, method = "GET", headers = {}, body } = {}) {
  const sent = { ...headers };
  if (token) sent["cf-access-jwt-assertion"] = token;
  const response = await fetch(worker + path, { method, headers: sent, body, redirect: "manual" });
  return { status: response.status, location: response.headers.get("location"), text: await response.text(), headers: response.headers };
}

function loops(text) {
  return text.includes("location.reload") || /http-equiv=["']refresh/i.test(text);
}

async function follow(url, cookie) {
  const seen = [];
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    if (seen.includes(current)) throw new Error(`redirect loop ${seen.join(" -> ")} -> ${current}`);
    seen.push(current);
    const response = await fetch(current, { redirect: "manual", headers: cookie ? { cookie } : {} });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400) {
      if (!location) throw new Error(`redirect without location at ${current}`);
      current = new URL(location, current).href;
      continue;
    }
    return { status: response.status, location, text: await response.text(), hops: seen.length - 1, url: current };
  }
  throw new Error(`too many redirects from ${url}`);
}

const demo = sign(human());
const certs = () => Number(fs.readFileSync(countPath, "utf8"));

const warm = await call("/", { token: demo });
check("valid jwt", warm.status === 200 && warm.text.includes("signed in as demo@sploot.test"), String(warm.status));
const afterWarm = certs();
check("jwks fetched once", afterWarm === 1, String(afterWarm));
const again = await call("/api/me", { token: demo });
check("cached jwks", again.status === 200 && certs() === afterWarm && again.text.includes("demo@sploot.test"));

const unknown = await call("/", { token: sign(human(), { kid: "missing" }) });
check("unknown kid is 401", unknown.status === 401 && certs() === afterWarm + 1, `${unknown.status} certs=${certs()}`);
const unknownAgain = await call("/", { token: sign(human(), { kid: "missing" }) });
check("unknown kid does not refetch", unknownAgain.status === 401 && certs() === afterWarm + 1, String(certs()));

const missing = await call("/");
check("missing jwt is 401", missing.status === 401 && !missing.location && missing.text.includes("[ sign in ]") && !loops(missing.text));

const bad = demo.slice(0, -2) + (demo.endsWith("aa") ? "bb" : "aa");
check("bad signature", (await call("/", { token: bad })).status === 401);
check("alg none", (await call("/", { token: sign(human(), { alg: "none" }) })).status === 401);
check("alg HS256", (await call("/", { token: sign(human(), { alg: "HS256" }) })).status === 401);
check("wrong iss", (await call("/", { token: sign(human({ iss: "https://evil.example" })) })).status === 401);
check("wrong aud", (await call("/", { token: sign(human({ aud: "other" })) })).status === 401);
check("aud array", (await call("/", { token: sign(human({ aud: ["other", aud] })) })).status === 200);
check("exp inside skew", (await call("/", { token: sign(human({ exp: now() - 10 })) })).status === 200);
check("exp outside skew", (await call("/", { token: sign(human({ exp: now() - 120 })) })).status === 401);
check("nbf inside skew", (await call("/", { token: sign(human({ nbf: now() + 10 })) })).status === 200);
check("nbf outside skew", (await call("/", { token: sign(human({ nbf: now() + 120 })) })).status === 401);

const unmapped = await call("/", { token: sign(human({ email: "unmapped@sploot.test" })) });
check(
  "unmapped is 403 and stays",
  unmapped.status === 403 && !unmapped.location && unmapped.text.includes("This account isn't on the allowlist.") && !loops(unmapped.text),
  String(unmapped.status),
);
const unmappedApi = await call("/api/me", { token: sign(human({ email: "unmapped@sploot.test" })) });
check("unmapped api is 403 json", unmappedApi.status === 403 && unmappedApi.text.includes("forbidden") && !unmappedApi.location);
check("revoked is 403", (await call("/", { token: sign(human({ email: "revoked@sploot.test" })) })).status === 403);
const service = sign({ iss: issuer, aud, exp: now() + 300, nbf: now() - 5, common_name: "batch" });
check("service token is 403", (await call("/", { token: service })).status === 403);

const subject = "demo@sploot.test";
const form = `csrf=${csrf(subject)}`;
const noCsrf = await call("/logout", { method: "POST", token: demo, headers: { "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: "" });
check("logout without csrf is 403", noCsrf.status === 403 && noCsrf.text.includes("Rejected.") && !noCsrf.text.includes("allowlist"));
const cross = await call("/logout", { method: "POST", token: demo, headers: { "sec-fetch-site": "cross-site", "content-type": "application/x-www-form-urlencoded" }, body: form });
check("cross-site logout is 403", cross.status === 403 && cross.text.includes("Rejected."));
const same = await call("/logout", { method: "POST", token: demo, headers: { "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: form });
check("same-origin logout is 303", same.status === 303 && (same.location || "").includes("/cdn-cgi/access/logout"), `${same.status} ${same.location}`);
const originOk = await call("/logout", { method: "POST", token: demo, headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: form });
check("origin fallback logout is 303", originOk.status === 303);
const originBad = await call("/logout", { method: "POST", token: demo, headers: { origin: "http://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: form });
check("bad origin logout is 403", originBad.status === 403 && originBad.text.includes("Rejected."));

check("shell is private", warm.headers.get("cache-control") === "private, no-store" && (warm.headers.get("content-security-policy") || "").includes("default-src 'self'") && !warm.headers.get("access-control-allow-origin"));

const health = await call("/healthz");
check("healthz is public", health.status === 200 && health.text.includes('"status":"ok"') && health.text.includes('"db":"ok"') && health.text.includes('"version":"0.1.0"') && health.headers.get("cache-control") === "no-store");
const manifest = await call("/manifest.webmanifest");
check("manifest is public", manifest.status === 200 && manifest.text.includes('"display": "standalone"') && (manifest.headers.get("cache-control") || "").includes("public"));
const icon = await fetch(`${worker}/icons/icon-512.png`);
check("icon is public png", icon.status === 200 && icon.headers.get("content-type") === "image/png" && (icon.headers.get("cache-control") || "").includes("public"));

const signedOut = await follow(`${issuer}/`);
check("absent session redirects once", signedOut.hops === 1 && signedOut.status === 200 && signedOut.url.startsWith(`${issuer}/cdn-cgi/access/login`) && signedOut.text.includes("Sign in"), `${signedOut.hops} ${signedOut.status} ${signedOut.url}`);
const loginAgain = await fetch(signedOut.url, { redirect: "manual" });
check("login page does not bounce", loginAgain.status === 200 && !loginAgain.headers.get("location"));

const inherited = await follow(`${issuer}/`, `CF_Authorization=${demo}`);
check("inherited session skips login", inherited.hops === 0 && inherited.status === 200 && inherited.text.includes("signed in as demo@sploot.test"), `${inherited.hops} ${inherited.status}`);

const denied = await follow(`${issuer}/`, `CF_Authorization=${sign(human({ email: "unmapped@sploot.test" }))}`);
check("allowlist 403 does not redirect", denied.hops === 0 && denied.status === 403 && !denied.location && denied.text.includes("This account isn't on the allowlist.") && !loops(denied.text));
const deniedAgain = await follow(`${issuer}/`, `CF_Authorization=${sign(human({ email: "unmapped@sploot.test" }))}`);
check("allowlist 403 stays on repeat", deniedAgain.hops === 0 && deniedAgain.status === 403 && deniedAgain.url.startsWith(issuer));

const publicHealth = await follow(`${issuer}/healthz`);
check("stub healthz skips login", publicHealth.hops === 0 && publicHealth.status === 200);

if (failures.length) {
  console.error(`${failures.length} failed`);
  process.exit(1);
}
console.log("auth ok");
