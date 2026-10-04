import { createSign } from "node:crypto";

export function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function signJwt(privateKey, jwk, { iss, aud, email, seconds }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid }));
  const payload = b64url(JSON.stringify({
    iss,
    aud,
    exp: now + seconds,
    nbf: now - 5,
    email,
    sub: email,
  }));
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(input).sign(privateKey);
  return `${input}.${b64url(signature)}`;
}
