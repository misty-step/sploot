//! Access authenticates; the app authorizes.
//!
//! This stub checks the `Cf-Access-Jwt-Assertion` signature against the JWKS
//! in `ACCESS_JWKS_B64`, then `iss`, `aud`, `exp`, and `nbf`. It does not
//! fetch or cache the team JWKS. The verified subject maps through `identities`.

use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use serde_json::Value;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use worker::{Env, Request, Response, Result};

use crate::{deny, json_i64, json_str, open_db};

pub struct Identity {
    pub owner_id: String,
}

pub async fn check(req: &Request, env: &Env, scope: &str) -> std::result::Result<Identity, Response> {
    let token = header(req, "Cf-Access-Jwt-Assertion")
        .or_else(|| header(req, "cf-access-jwt-assertion"))
        .ok_or_else(|| deny(401, "unauthorized", "Sign in."))?;
    let claims = verify(env, &token).await.map_err(|message| deny(401, "unauthorized", &message))?;
    let (subject, kind) = subject_kind(&claims).ok_or_else(|| deny(401, "unauthorized", "The token has no subject."))?;
    let row = lookup(env, &subject).await.map_err(|err| deny(500, "unavailable", &err.to_string()))?;
    let Some(row) = row else {
        return Err(deny(403, "forbidden", "Access is not allowed."));
    };
    if json_str(&row, "kind") != Some(kind) || revoked(row.get("revoked_at")) {
        return Err(deny(403, "forbidden", "Access is not allowed."));
    }
    let scopes = json_str(&row, "scopes").unwrap_or("");
    if !allows(scopes, scope) {
        return Err(deny(403, "forbidden", "Access is not allowed."));
    }
    let owner_id = json_str(&row, "owner_id")
        .filter(|owner| valid_id(owner))
        .ok_or_else(|| deny(403, "forbidden", "Access is not allowed."))?;
    Ok(Identity {
        owner_id: owner_id.to_string(),
    })
}

fn header(req: &Request, name: &str) -> Option<String> {
    req.headers().get(name).ok().flatten().filter(|value| !value.is_empty())
}

fn allows(scopes: &str, need: &str) -> bool {
    scopes.split(',').map(str::trim).any(|scope| scope == "*" || scope == need)
}

fn revoked(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::String(text)) => !text.is_empty(),
        Some(_) => true,
    }
}

pub fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

async fn lookup(env: &Env, subject: &str) -> Result<Option<Value>> {
    let db = open_db(env)?;
    db.prepare("SELECT kind, owner_id, scopes, revoked_at FROM identities WHERE subject = ?1")
        .bind(&[wasm_bindgen::JsValue::from_str(subject)])?
        .first(None)
        .await
}

async fn verify(env: &Env, token: &str) -> std::result::Result<Value, String> {
    let mut parts = token.split('.');
    let header_b64 = parts.next().ok_or("The token is malformed.")?;
    let payload_b64 = parts.next().ok_or("The token is malformed.")?;
    let signature_b64 = parts.next().ok_or("The token is malformed.")?;
    if parts.next().is_some() {
        return Err("The token is malformed.".into());
    }
    let header: Value = decode_json(header_b64).ok_or("The token is malformed.")?;
    let payload: Value = decode_json(payload_b64).ok_or("The token is malformed.")?;
    let alg = header.get("alg").and_then(Value::as_str).unwrap_or("");
    if alg != "RS256" {
        return Err("The token algorithm is not RS256.".into());
    }
    if let Some(typ) = header.get("typ").and_then(Value::as_str) {
        if typ != "JWT" {
            return Err("The token type is not JWT.".into());
        }
    }
    let signature = b64url(signature_b64).ok_or("The token is malformed.")?;
    let jwk = jwk_for(env, header.get("kid").and_then(Value::as_str))?;
    let input = format!("{header_b64}.{payload_b64}");
    if !verify_signature(&jwk, &input, &signature).await? {
        return Err("The token signature is invalid.".into());
    }
    let iss = env_var(env, "ACCESS_ISS")?;
    let aud = env_var(env, "ACCESS_AUD")?;
    if payload.get("iss").and_then(Value::as_str) != Some(iss.as_str()) {
        return Err("The token issuer is not accepted.".into());
    }
    if !audience_matches(payload.get("aud"), &aud) {
        return Err("The token audience is not accepted.".into());
    }
    let now = (js_sys::Date::now() / 1000.0) as i64;
    let exp = json_i64(&payload, "exp").ok_or("The token has no expiry.")?;
    let nbf = json_i64(&payload, "nbf").ok_or("The token has no not-before.")?;
    if now >= exp {
        return Err("The token is expired.".into());
    }
    if now < nbf {
        return Err("The token is not valid yet.".into());
    }
    Ok(payload)
}

fn subject_kind(claims: &Value) -> Option<(String, &'static str)> {
    let email = claims.get("email").and_then(Value::as_str).unwrap_or("").trim();
    if !email.is_empty() {
        return Some((email.to_string(), "human"));
    }
    let common_name = claims.get("common_name").and_then(Value::as_str).unwrap_or("").trim();
    if !common_name.is_empty() {
        return Some((common_name.to_string(), "service"));
    }
    let sub = claims.get("sub").and_then(Value::as_str).unwrap_or("").trim();
    if !sub.is_empty() {
        return Some((sub.to_string(), "service"));
    }
    None
}

fn audience_matches(aud: Option<&Value>, expected: &str) -> bool {
    match aud {
        Some(Value::String(value)) => value == expected,
        Some(Value::Array(values)) => values.iter().any(|value| value.as_str() == Some(expected)),
        _ => false,
    }
}

fn env_var(env: &Env, name: &str) -> std::result::Result<String, String> {
    env.var(name)
        .map(|value| value.to_string())
        .map_err(|_| format!("{name} is not configured"))
}

fn jwks(env: &Env) -> std::result::Result<Value, String> {
    let encoded = env_var(env, "ACCESS_JWKS_B64")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|_| "ACCESS_JWKS_B64 is not base64.".to_string())?;
    serde_json::from_slice(&bytes).map_err(|_| "ACCESS_JWKS_B64 is not a JWKS.".to_string())
}

fn jwk_for(env: &Env, kid: Option<&str>) -> std::result::Result<Value, String> {
    let keys = jwks(env)?
        .get("keys")
        .and_then(Value::as_array)
        .cloned()
        .ok_or("The JWKS has no keys.")?;
    let key = match kid {
        Some(kid) => keys.into_iter().find(|key| key.get("kid").and_then(Value::as_str) == Some(kid)),
        None if keys.len() == 1 => keys.into_iter().next(),
        None => None,
    };
    let key = key.ok_or("The token key id is not in the JWKS.")?;
    if key.get("kty").and_then(Value::as_str) != Some("RSA") {
        return Err("The JWKS key is not RSA.".into());
    }
    Ok(key)
}

async fn verify_signature(jwk: &Value, signing_input: &str, signature: &[u8]) -> std::result::Result<bool, String> {
    let crypto_val = js_sys::Reflect::get(&js_sys::global(), &wasm_bindgen::JsValue::from_str("crypto"))
        .map_err(|_| "crypto is unavailable".to_string())?;
    let crypto: web_sys::Crypto = crypto_val.dyn_into().map_err(|_| "crypto is unavailable".to_string())?;
    let subtle = crypto.subtle();
    let algorithm = js_sys::Object::new();
    js_sys::Reflect::set(
        &algorithm,
        &wasm_bindgen::JsValue::from_str("name"),
        &wasm_bindgen::JsValue::from_str("RSASSA-PKCS1-v1_5"),
    )
    .map_err(|_| "could not set the signature algorithm".to_string())?;
    js_sys::Reflect::set(
        &algorithm,
        &wasm_bindgen::JsValue::from_str("hash"),
        &wasm_bindgen::JsValue::from_str("SHA-256"),
    )
    .map_err(|_| "could not set the signature hash".to_string())?;
    let jwk_val = js_sys::JSON::parse(&jwk.to_string()).map_err(|_| "could not read the JWK".to_string())?;
    let jwk_obj: js_sys::Object = jwk_val.dyn_into().map_err(|_| "could not read the JWK".to_string())?;
    let usages = js_sys::Array::of1(&wasm_bindgen::JsValue::from_str("verify"));
    let imported = JsFuture::from(
        subtle
            .import_key_with_object("jwk", &jwk_obj, &algorithm, false, &usages)
            .map_err(|err| format!("could not import the JWK: {}", js_err(err)))?,
    )
    .await
    .map_err(|err| format!("could not import the JWK: {}", js_err(err)))?;
    let key: web_sys::CryptoKey = imported.dyn_into().map_err(|_| "could not import the JWK".to_string())?;
    let data = js_sys::Uint8Array::from(signing_input.as_bytes());
    let sig = js_sys::Uint8Array::from(signature);
    let verified = JsFuture::from(
        subtle
            .verify_with_object_and_js_u8_array_and_js_u8_array(&algorithm, &key, &sig, &data)
            .map_err(|err| format!("could not verify the token: {}", js_err(err)))?,
    )
    .await
    .map_err(|err| format!("could not verify the token: {}", js_err(err)))?;
    Ok(verified.as_bool() == Some(true))
}

fn js_err(err: wasm_bindgen::JsValue) -> String {
    err.as_string().unwrap_or_else(|| "crypto error".into())
}

fn b64url(input: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(input).or_else(|_| URL_SAFE.decode(input)).ok()
}

fn decode_json(input: &str) -> Option<Value> {
    let bytes = b64url(input)?;
    serde_json::from_slice(&bytes).ok()
}
