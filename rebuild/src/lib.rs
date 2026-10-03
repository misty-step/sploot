mod access;
mod search;
mod vectorize;

use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use wasm_bindgen::JsValue;
use worker::*;

const SCHEMA: &str = include_str!("../schema.sql");
const MAX_BYTES: usize = 10 * 1024 * 1024;
const GEMMA: &str = "@cf/google/gemma-4-26b-a4b-it";
const QWEN_VL: &str = "@cf/qwen/qwen3-vl-embedding-2b";
const QWEN_TEXT: &str = "@cf/qwen/qwen3-embedding-0.6b";

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    if let Err(err) = ensure_schema(&env).await {
        return json_status(500, json!({"error": {"code": "schema", "message": err.to_string()}}));
    }
    Router::new()
        .get_async("/", |req, ctx| async move { status(&req, &ctx.env).await })
        .post_async("/spike/save", |mut req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "save").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            save(&mut req, &ctx.env, &identity).await
        })
        .get_async("/spike/m/:id", |req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "search").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            let id = ctx.param("id").ok_or_else(|| Error::RustError("missing id".into()))?;
            media(&ctx.env, &identity, id).await
        })
        .get_async("/spike/assets", |req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "search").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            list_assets(&ctx.env, &identity).await
        })
        .post_async("/spike/search", |mut req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "search").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            query_search(&mut req, &ctx.env, &identity, false).await
        })
        .post_async("/spike/rank", |mut req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "search").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            query_search(&mut req, &ctx.env, &identity, true).await
        })
        .post_async("/spike/ai", |mut req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "*").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            let _ = identity;
            probe_ai(&mut req, &ctx.env).await
        })
        .post_async("/spike/vectorize", |mut req, ctx| async move {
            let identity = match access::check(&req, &ctx.env, "*").await {
                Ok(identity) => identity,
                Err(response) => return Ok(response),
            };
            probe_vectorize(&mut req, &ctx.env, &identity).await
        })
        .run(req, env)
        .await
}

fn deny(status: u16, code: &str, message: &str) -> Response {
    json_status(status, json!({"error": {"code": code, "message": message}})).unwrap_or_else(|_| {
        Response::error(message, status).unwrap_or_else(|_| Response::ok("").unwrap())
    })
}

fn json_status(status: u16, body: Value) -> Result<Response> {
    Ok(Response::from_json(&body)?.with_status(status))
}

fn bad(status: u16, code: &str, message: &str) -> Result<Response> {
    json_status(status, json!({"error": {"code": code, "message": message}}))
}

pub(crate) fn open_db(env: &Env) -> Result<d1::D1Database> {
    env.d1("DB")
}

pub(crate) fn json_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

pub(crate) fn json_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|item| item.as_i64().or_else(|| item.as_f64().map(|number| number as i64)))
}

async fn ensure_schema(env: &Env) -> Result<()> {
    let db = open_db(env)?;
    for statement in sql_statements(SCHEMA) {
        db.exec(&statement).await?;
    }
    Ok(())
}

fn sql_statements(sql: &str) -> Vec<String> {
    let flat = sql.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = flat.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut statements = Vec::new();
    let mut start = 0;
    let mut depth = 0;
    let mut index = 0;
    while index < flat.len() {
        if depth == 0 && word_at(&lower, index, "begin") {
            depth += 1;
            index += 5;
            continue;
        }
        if depth > 0 && word_at(&lower, index, "end") {
            depth -= 1;
            index += 3;
            continue;
        }
        if bytes[index] == b';' && depth == 0 {
            let statement = flat[start..index].trim();
            if !statement.is_empty() {
                statements.push(statement.to_string());
            }
            start = index + 1;
        }
        index += 1;
    }
    statements
}

fn word_at(sql: &str, index: usize, word: &str) -> bool {
    let rest = sql.get(index..).unwrap_or("");
    if !rest.starts_with(word) {
        return false;
    }
    let before = index == 0 || !sql.as_bytes()[index - 1].is_ascii_alphanumeric();
    let after = sql.as_bytes().get(index + word.len()).is_none_or(|byte| !byte.is_ascii_alphanumeric());
    before && after
}

fn local_backend(env: &Env) -> bool {
    js_sys::Reflect::get(env.as_ref(), &JsValue::from_str("SPLOOT_LOCAL_BACKEND"))
        .ok()
        .and_then(|value| value.as_string())
        .as_deref()
        == Some("local-stand-in")
}

async fn status(req: &Request, env: &Env) -> Result<Response> {
    let identity = match access::check(req, env, "search").await {
        Ok(identity) => identity,
        Err(response) => return Ok(response),
    };
    json_status(
        200,
        json!({
            "service": "sploot-rebuild",
            "milestone": "M0",
            "owner_id": identity.owner_id,
            "local_backend": local_backend(env),
        }),
    )
}

async fn save(req: &mut Request, env: &Env, identity: &access::Identity) -> Result<Response> {
    let body: Value = match req.json().await {
        Ok(body) => body,
        Err(_) => return bad(400, "bad_request", "The body is not JSON."),
    };
    let Some(id) = body.get("id").and_then(Value::as_str).filter(|id| access::valid_id(id)) else {
        return bad(400, "bad_request", "The id is invalid.");
    };
    let note = match body.get("note") {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(note)) if note.chars().count() <= 2000 => note.clone(),
        Some(Value::String(_)) => return bad(400, "bad_request", "The note is too long."),
        _ => return bad(400, "bad_request", "The note must be text."),
    };
    if body.get("mime").and_then(Value::as_str) != Some("image/png") {
        return bad(400, "bad_request", "This spike stores image/png only.");
    }
    let Some(encoded) = body.get("data_base64").and_then(Value::as_str) else {
        return bad(400, "bad_request", "The image is missing.");
    };
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
        return bad(400, "bad_request", "The image is not base64.");
    };
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return bad(400, "bad_request", "The image must be between 1 byte and 10 MB.");
    }
    save_bytes(env, identity, id, &note, &bytes).await
}

async fn save_bytes(env: &Env, identity: &access::Identity, id: &str, note: &str, bytes: &[u8]) -> Result<Response> {
    let sha = hex(&Sha256::digest(bytes));
    let db = open_db(env)?;
    if let Some(existing) = db
        .prepare("SELECT id FROM assets WHERE owner_id = ?1 AND sha256 = ?2")
        .bind(&[JsValue::from_str(&identity.owner_id), JsValue::from_str(&sha)])?
        .first::<Value>(None)
        .await?
    {
        return json_status(
            200,
            json!({
                "id": json_str(&existing, "id").unwrap_or(""),
                "duplicate": true,
                "sha256": sha,
            }),
        );
    }
    if db
        .prepare("SELECT id FROM assets WHERE id = ?1")
        .bind(&[JsValue::from_str(id)])?
        .first::<Value>(None)
        .await?
        .is_some()
    {
        return bad(409, "id_taken", "That id is already stored.");
    }
    let key = format!("o/{}/{}", identity.owner_id, id);
    let bucket = env.bucket("MEDIA")?;
    if bucket.get(&key).execute().await?.is_some() {
        return bad(409, "partial_object", "That object already exists and was not overwritten.");
    }
    bucket.put(&key, bytes.to_vec()).execute().await?;
    let created = js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default();
    db.prepare(
        "INSERT INTO assets (
            id, owner_id, sha256, mime, bytes, note, caption, ocr_text,
            content_version, indexed_version, pipeline_version, attempts, created_at
         ) VALUES (?1, ?2, ?3, 'image/png', ?4, ?5, '', '', 1, 0, 0, 0, ?6)",
    )
    .bind(&[
        JsValue::from_str(id),
        JsValue::from_str(&identity.owner_id),
        JsValue::from_str(&sha),
        JsValue::from_f64(bytes.len() as f64),
        JsValue::from_str(note),
        JsValue::from_str(&created),
    ])?
    .run()
    .await?;
    json_status(
        201,
        json!({
            "id": id,
            "duplicate": false,
            "sha256": sha,
            "bytes": bytes.len(),
            "r2_key": key,
        }),
    )
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0xf) as usize] as char);
    }
    out
}

async fn media(env: &Env, identity: &access::Identity, id: &str) -> Result<Response> {
    if !access::valid_id(id) {
        return bad(404, "not_found", "That asset is not in this library.");
    }
    let db = open_db(env)?;
    let Some(row) = db
        .prepare("SELECT sha256, mime FROM assets WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL")
        .bind(&[JsValue::from_str(id), JsValue::from_str(&identity.owner_id)])?
        .first::<Value>(None)
        .await?
    else {
        return bad(404, "not_found", "That asset is not in this library.");
    };
    let key = format!("o/{}/{}", identity.owner_id, id);
    let Some(object) = env.bucket("MEDIA")?.get(&key).execute().await? else {
        return bad(404, "missing_object", "The original is missing.");
    };
    let bytes = object
        .body()
        .ok_or_else(|| Error::RustError("empty object".into()))?
        .bytes()
        .await?;
    if hex(&Sha256::digest(&bytes)) != json_str(&row, "sha256").unwrap_or("") {
        return bad(500, "checksum", "The stored original does not match its sha256.");
    }
    let mut response = Response::from_bytes(bytes)?;
    response.headers_mut().set("content-type", json_str(&row, "mime").unwrap_or("application/octet-stream"))?;
    Ok(response)
}

async fn list_assets(env: &Env, identity: &access::Identity) -> Result<Response> {
    let db = open_db(env)?;
    let result = db
        .prepare(
            "SELECT id, note, sha256 FROM assets
             WHERE owner_id = ?1 AND deleted_at IS NULL
             ORDER BY created_at, id",
        )
        .bind(&[JsValue::from_str(&identity.owner_id)])?
        .all()
        .await?;
    json_status(200, json!({"assets": result.results::<Value>()?}))
}

async fn query_search(req: &mut Request, env: &Env, identity: &access::Identity, allow_vector: bool) -> Result<Response> {
    let body = match req.json::<Value>().await {
        Ok(body) => body,
        Err(_) => return bad(400, "bad_request", "The body is not JSON."),
    };
    let query = body.get("q").and_then(Value::as_str).unwrap_or("").trim();
    if query.is_empty() {
        return bad(400, "bad_request", "Type a query.");
    }
    let supplied = if allow_vector {
        match body.get("vector") {
            None | Some(Value::Null) => None,
            Some(Value::Array(values)) if values.len() <= 1536 => values
                .iter()
                .map(|value| value.as_f64().map(|number| number as f32))
                .collect::<Option<Vec<_>>>(),
            _ => return bad(400, "bad_request", "The vector is not a list of numbers."),
        }
    } else {
        None
    };
    if allow_vector && body.get("vector").map(|value| value.is_array()).unwrap_or(false) && supplied.is_none() {
        return bad(400, "bad_request", "The vector is not a list of numbers.");
    }
    let outcome = search::search(env, &identity.owner_id, query, supplied).await?;
    json_status(
        200,
        json!({
            "results": outcome.results,
            "notice": outcome.notice,
            "degraded": outcome.degraded,
        }),
    )
}

async fn probe_ai(req: &mut Request, env: &Env) -> Result<Response> {
    let body = match req.json::<Value>().await {
        Ok(body) => body,
        Err(_) => return bad(400, "bad_request", "The body is not JSON."),
    };
    let candidate = body.get("candidate").and_then(Value::as_str).unwrap_or("");
    let local = local_backend(env);
    match candidate {
        "A" => probe_model(env, "A", GEMMA, json!({"messages": [{"role": "user", "content": "caption and visible text"}]}), local, true).await,
        "qwen3-vl" => {
            probe_model(
                env,
                "qwen3-vl",
                QWEN_VL,
                json!({"text": "red circle on a blue square"}),
                local,
                false,
            )
            .await
        }
        "B" => json_status(200, json!({
            "ok": false,
            "measurable": false,
            "candidate": "B",
            "cloudflare_reached": false,
            "reason": "No OpenRouter or Voyage credential, and no multimodal client was built."
        })),
        "clip" => json_status(200, json!({
            "ok": false,
            "measurable": false,
            "candidate": "clip",
            "cloudflare_reached": false,
            "reason": "No local CLIP bundle was on this machine, and the CLIP runner was not built."
        })),
        _ => bad(400, "bad_request", "Unknown candidate."),
    }
}

async fn probe_model(env: &Env, candidate: &str, model: &str, input: Value, local: bool, then_embed: bool) -> Result<Response> {
    let ai = match env.ai("AI") {
        Ok(ai) => ai,
        Err(err) => {
            return json_status(200, json!({
                "ok": false,
                "measurable": false,
                "candidate": candidate,
                "model": model,
                "backend": "missing",
                "cloudflare_reached": false,
                "error": err.to_string(),
            }));
        }
    };
    match ai.run::<_, Value>(model, input).await {
        Ok(value) if then_embed => match ai.run::<_, Value>(QWEN_TEXT, json!({"text": [value]})).await {
            Ok(embedded) => reached(candidate, QWEN_TEXT, local, Some(embedded)),
            Err(err) => unreachable_model(candidate, QWEN_TEXT, local, &err.to_string()),
        },
        Ok(value) => reached(candidate, model, local, Some(value)),
        Err(err) => unreachable_model(candidate, model, local, &err.to_string()),
    }
}

fn reached(candidate: &str, model: &str, local: bool, value: Option<Value>) -> Result<Response> {
    json_status(200, json!({
        "ok": !local,
        "measurable": !local,
        "candidate": candidate,
        "model": model,
        "backend": if local { "local-stand-in" } else { "binding" },
        "cloudflare_reached": !local,
        "value": value,
    }))
}

fn unreachable_model(candidate: &str, model: &str, local: bool, error: &str) -> Result<Response> {
    json_status(200, json!({
        "ok": false,
        "measurable": false,
        "candidate": candidate,
        "model": model,
        "backend": if local { "local-stand-in" } else { "binding" },
        "cloudflare_reached": false,
        "error": error,
    }))
}

async fn probe_vectorize(req: &mut Request, env: &Env, identity: &access::Identity) -> Result<Response> {
    let body = match req.json::<Value>().await {
        Ok(body) => body,
        Err(_) => return bad(400, "bad_request", "The body is not JSON."),
    };
    let op = body.get("op").and_then(Value::as_str).unwrap_or("");
    let result = match op {
        "upsert" => {
            let vector = json!([{
                "id": body.get("id").and_then(Value::as_str).unwrap_or(""),
                "values": body.get("values"),
                "metadata": body.get("metadata"),
            }]);
            vectorize::upsert(env, &vector).await
        }
        "query" => {
            let top_k = body.get("top_k").and_then(Value::as_u64).unwrap_or(30).min(50) as u32;
            vectorize::query(env, body.get("values").unwrap_or(&Value::Null), top_k, &identity.owner_id).await
        }
        "get" => vectorize::get_by_ids(env, body.get("ids").unwrap_or(&json!([]))).await,
        "missing" => vectorize::missing_binding(env).await,
        _ => return bad(400, "bad_request", "Unknown vectorize op."),
    };
    match result {
        Ok(value) => json_status(200, json!({"ok": true, "result": value})),
        Err(message) => json_status(400, json!({"ok": false, "error": message})),
    }
}
