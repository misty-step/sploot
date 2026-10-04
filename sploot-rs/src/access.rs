//! Access authenticates. This worker maps the JWT to one owner.
//!
//! The team JWKS is fetched from `{ACCESS_ISSUER}/cdn-cgi/access/certs` and kept
//! in isolate memory for one hour. An unknown `kid` refetches once per minute.

use std::cell::RefCell;

use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use worker::{Env, Fetch, Method, Request, Url};

use crate::GuardError;

const JWKS_TTL_MS: f64 = 3_600_000.0;
const JWKS_MISS_MS: f64 = 60_000.0;
const SKEW_SECS: i64 = 30;

type HmacSha256 = Hmac<Sha256>;

pub struct Identity {
    pub subject: String,
    pub owner_id: String,
    pub kind: &'static str,
}

struct JwksCache {
    keys: Vec<Value>,
    fetched_at_ms: f64,
    miss_refetch_at_ms: f64,
}

thread_local! {
    static JWKS: RefCell<Option<JwksCache>> = const { RefCell::new(None) };
}

pub async fn guard(req: &mut Request, env: &Env) -> Result<Identity, GuardError> {
    let token = header(req, "cf-access-jwt-assertion").ok_or(GuardError::Unauthorized)?;
    let claims = verify(env, &token).await?;
    let (subject, kind) = subject_kind(&claims).ok_or(GuardError::Unauthorized)?;
    let row = lookup(env, &subject).await?;
    let Some(row) = row else {
        return Err(GuardError::Forbidden);
    };
    if json_str(&row, "kind") != Some(kind) || revoked(row.get("revoked_at")) {
        return Err(GuardError::Forbidden);
    }
    let owner_id = json_str(&row, "owner_id")
        .filter(|owner| !owner.is_empty())
        .ok_or(GuardError::Forbidden)?
        .to_string();
    let identity = Identity {
        subject,
        owner_id,
        kind,
    };
    if identity.kind == "human" && !matches!(req.method(), Method::Get | Method::Head) {
        check_csrf(req, env, &identity.subject).await?;
    }
    Ok(identity)
}

pub fn csrf_token(env: &Env, subject: &str) -> Result<String, GuardError> {
    let key = secret(env, "CSRF_KEY")?;
    let mut mac =
        HmacSha256::new_from_slice(key.as_bytes()).map_err(|_| GuardError::Unavailable)?;
    mac.update(subject.as_bytes());
    Ok(hex(&mac.finalize().into_bytes()))
}

async fn check_csrf(req: &mut Request, env: &Env, subject: &str) -> Result<(), GuardError> {
    let origin = var(env, "APP_ORIGIN")?;
    if !site_ok(req, &origin) {
        return Err(GuardError::Csrf);
    }
    let presented = presented_token(req).await;
    let expected = csrf_token(env, subject)?;
    if ct_eq(&presented, &expected) {
        Ok(())
    } else {
        Err(GuardError::Csrf)
    }
}

fn site_ok(req: &Request, origin: &str) -> bool {
    match header(req, "sec-fetch-site").as_deref() {
        Some("same-origin") => true,
        Some(_) => false,
        None => header(req, "origin").as_deref() == Some(origin),
    }
}

async fn presented_token(req: &mut Request) -> String {
    if let Some(token) = header(req, "x-csrf-token") {
        return token;
    }
    let Ok(body) = req.text().await else {
        return String::new();
    };
    form_field(&body, "csrf")
}

fn form_field(body: &str, name: &str) -> String {
    body.split('&')
        .find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (percent_decode(key) == name).then(|| percent_decode(value))
        })
        .unwrap_or_default()
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = &input[index + 1..index + 3];
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    out.push(byte);
                    index += 3;
                } else {
                    out.push(b'%');
                    index += 1;
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn ct_eq(left: &str, right: &str) -> bool {
    let left = left.as_bytes();
    let right = right.as_bytes();
    let mut diff = left.len() ^ right.len();
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= (*a ^ *b) as usize;
    }
    diff == 0
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

async fn verify(env: &Env, token: &str) -> Result<Value, GuardError> {
    let mut parts = token.split('.');
    let header_b64 = parts.next().ok_or(GuardError::Unauthorized)?;
    let payload_b64 = parts.next().ok_or(GuardError::Unauthorized)?;
    let signature_b64 = parts.next().ok_or(GuardError::Unauthorized)?;
    if parts.next().is_some() {
        return Err(GuardError::Unauthorized);
    }
    let header: Value = decode_json(header_b64).ok_or(GuardError::Unauthorized)?;
    if header.get("alg").and_then(Value::as_str) != Some("RS256") {
        return Err(GuardError::Unauthorized);
    }
    let kid = header
        .get("kid")
        .and_then(Value::as_str)
        .filter(|kid| !kid.is_empty())
        .ok_or(GuardError::Unauthorized)?;
    let jwk = jwk_for(env, kid).await?;
    let signature = b64url(signature_b64).ok_or(GuardError::Unauthorized)?;
    let input = format!("{header_b64}.{payload_b64}");
    if !verify_signature(&jwk, &input, &signature).await? {
        return Err(GuardError::Unauthorized);
    }
    let payload: Value = decode_json(payload_b64).ok_or(GuardError::Unauthorized)?;
    if payload.get("iss").and_then(Value::as_str) != Some(var(env, "ACCESS_ISSUER")?.as_str()) {
        return Err(GuardError::Unauthorized);
    }
    if !audience_ok(payload.get("aud"), &var(env, "ACCESS_AUD")?) {
        return Err(GuardError::Unauthorized);
    }
    let now = (js_sys::Date::now() / 1000.0) as i64;
    let exp = json_i64(&payload, "exp").ok_or(GuardError::Unauthorized)?;
    let nbf = json_i64(&payload, "nbf").ok_or(GuardError::Unauthorized)?;
    if now > exp.saturating_add(SKEW_SECS) || now.saturating_add(SKEW_SECS) < nbf {
        return Err(GuardError::Unauthorized);
    }
    Ok(payload)
}

fn subject_kind(claims: &Value) -> Option<(String, &'static str)> {
    let email = claims
        .get("email")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !email.is_empty() {
        return Some((email.to_string(), "human"));
    }
    let common_name = claims
        .get("common_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !common_name.is_empty() {
        return Some((common_name.to_string(), "service"));
    }
    None
}

fn audience_ok(aud: Option<&Value>, expected: &str) -> bool {
    match aud {
        Some(Value::String(value)) => value == expected,
        Some(Value::Array(values)) => values.iter().any(|value| value.as_str() == Some(expected)),
        _ => false,
    }
}

async fn lookup(env: &Env, subject: &str) -> Result<Option<Value>, GuardError> {
    let db = env.d1("DB").map_err(|_| GuardError::Unavailable)?;
    db.prepare("SELECT owner_id, kind, scopes, revoked_at FROM identities WHERE subject = ?1")
        .bind(&[wasm_bindgen::JsValue::from_str(subject)])
        .map_err(|_| GuardError::Unavailable)?
        .first(None)
        .await
        .map_err(|_| GuardError::Unavailable)
}

fn revoked(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::String(text)) => !text.is_empty(),
        Some(_) => true,
    }
}

fn json_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn json_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|item| {
        item.as_i64()
            .or_else(|| item.as_f64().map(|number| number as i64))
    })
}

enum FetchJwks {
    Hit,
    Fetch,
    GiveUp,
}

async fn jwk_for(env: &Env, kid: &str) -> Result<Value, GuardError> {
    let now = js_sys::Date::now();
    let decision = JWKS.with(|slot| match slot.borrow().as_ref() {
        None => FetchJwks::Fetch,
        Some(cache) if now - cache.fetched_at_ms >= JWKS_TTL_MS => FetchJwks::Fetch,
        Some(cache) if find_key(&cache.keys, kid).is_some() => FetchJwks::Hit,
        Some(cache) if now - cache.miss_refetch_at_ms >= JWKS_MISS_MS => FetchJwks::Fetch,
        Some(_) => FetchJwks::GiveUp,
    });
    if matches!(decision, FetchJwks::Hit) {
        return JWKS.with(|slot| {
            find_key(
                &slot
                    .borrow()
                    .as_ref()
                    .map(|cache| cache.keys.clone())
                    .unwrap_or_default(),
                kid,
            )
            .ok_or(GuardError::Unauthorized)
        });
    }
    if matches!(decision, FetchJwks::GiveUp) {
        return Err(GuardError::Unauthorized);
    }
    let keys = fetch_jwks(env).await?;
    let found = find_key(&keys, kid);
    JWKS.with(|slot| {
        let previous_miss = slot
            .borrow()
            .as_ref()
            .map(|cache| cache.miss_refetch_at_ms)
            .unwrap_or(0.0);
        *slot.borrow_mut() = Some(JwksCache {
            keys,
            fetched_at_ms: now,
            miss_refetch_at_ms: if found.is_some() { previous_miss } else { now },
        });
    });
    found.ok_or(GuardError::Unauthorized)
}

fn find_key(keys: &[Value], kid: &str) -> Option<Value> {
    let key = keys
        .iter()
        .find(|key| key.get("kid").and_then(Value::as_str) == Some(kid))?
        .clone();
    if key.get("kty").and_then(Value::as_str) != Some("RSA") {
        return None;
    }
    if let Some(alg) = key.get("alg").and_then(Value::as_str) {
        if alg != "RS256" {
            return None;
        }
    }
    Some(key)
}

async fn fetch_jwks(env: &Env) -> Result<Vec<Value>, GuardError> {
    let issuer = var(env, "ACCESS_ISSUER")?;
    let url = Url::parse(&format!(
        "{}/cdn-cgi/access/certs",
        issuer.trim_end_matches('/')
    ))
    .map_err(|_| GuardError::Unavailable)?;
    let mut response = Fetch::Url(url)
        .send()
        .await
        .map_err(|_| GuardError::Unavailable)?;
    if response.status_code() != 200 {
        return Err(GuardError::Unavailable);
    }
    let body = response.text().await.map_err(|_| GuardError::Unavailable)?;
    let parsed: Value = serde_json::from_str(&body).map_err(|_| GuardError::Unavailable)?;
    parsed
        .get("keys")
        .and_then(Value::as_array)
        .cloned()
        .ok_or(GuardError::Unavailable)
}

async fn verify_signature(
    jwk: &Value,
    signing_input: &str,
    signature: &[u8],
) -> Result<bool, GuardError> {
    let crypto_val = js_sys::Reflect::get(
        &js_sys::global(),
        &wasm_bindgen::JsValue::from_str("crypto"),
    )
    .map_err(|_| GuardError::Unavailable)?;
    let crypto: web_sys::Crypto = crypto_val.dyn_into().map_err(|_| GuardError::Unavailable)?;
    let subtle = crypto.subtle();
    let algorithm = js_sys::Object::new();
    js_sys::Reflect::set(
        &algorithm,
        &wasm_bindgen::JsValue::from_str("name"),
        &wasm_bindgen::JsValue::from_str("RSASSA-PKCS1-v1_5"),
    )
    .map_err(|_| GuardError::Unavailable)?;
    js_sys::Reflect::set(
        &algorithm,
        &wasm_bindgen::JsValue::from_str("hash"),
        &wasm_bindgen::JsValue::from_str("SHA-256"),
    )
    .map_err(|_| GuardError::Unavailable)?;
    let jwk_val = js_sys::JSON::parse(&jwk.to_string()).map_err(|_| GuardError::Unauthorized)?;
    let jwk_obj: js_sys::Object = jwk_val.dyn_into().map_err(|_| GuardError::Unauthorized)?;
    let usages = js_sys::Array::of1(&wasm_bindgen::JsValue::from_str("verify"));
    let imported = JsFuture::from(
        subtle
            .import_key_with_object("jwk", &jwk_obj, &algorithm, false, &usages)
            .map_err(|_| GuardError::Unauthorized)?,
    )
    .await
    .map_err(|_| GuardError::Unauthorized)?;
    let key: web_sys::CryptoKey = imported.dyn_into().map_err(|_| GuardError::Unauthorized)?;
    let data = js_sys::Uint8Array::from(signing_input.as_bytes());
    let sig = js_sys::Uint8Array::from(signature);
    let verified = JsFuture::from(
        subtle
            .verify_with_object_and_js_u8_array_and_js_u8_array(&algorithm, &key, &sig, &data)
            .map_err(|_| GuardError::Unauthorized)?,
    )
    .await
    .map_err(|_| GuardError::Unauthorized)?;
    Ok(verified.as_bool() == Some(true))
}

fn header(req: &Request, name: &str) -> Option<String> {
    req.headers()
        .get(name)
        .ok()
        .flatten()
        .filter(|value| !value.is_empty())
}

fn var(env: &Env, name: &str) -> Result<String, GuardError> {
    env.var(name)
        .map(|value| value.to_string())
        .map_err(|_| GuardError::Unavailable)
}

fn secret(env: &Env, name: &str) -> Result<String, GuardError> {
    env.secret(name)
        .or_else(|_| env.var(name))
        .map(|value| value.to_string())
        .map_err(|_| GuardError::Unavailable)
}

fn b64url(input: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(input)
        .or_else(|_| URL_SAFE.decode(input))
        .ok()
}

fn decode_json(input: &str) -> Option<Value> {
    let bytes = b64url(input)?;
    serde_json::from_slice(&bytes).ok()
}
