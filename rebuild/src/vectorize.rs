//! Vectorize binding. workers-rs 0.8.7 has no Vectorize type (the Rust
//! binding is still an unmerged draft), so this is the small wasm-bindgen
//! extern the plan calls for. It calls whatever object is bound as
//! `VECTORIZE`: a real index, or the loopback stand-in in `local-entry.mjs`.

use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use worker::{Env, Error, Result};

#[wasm_bindgen]
extern "C" {
    type VectorizeIndex;

    #[wasm_bindgen(method, catch, js_name = upsert)]
    async fn upsert(this: &VectorizeIndex, vectors: JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = query)]
    async fn query(
        this: &VectorizeIndex,
        vector: JsValue,
        options: JsValue,
    ) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = getByIds)]
    async fn get_by_ids(this: &VectorizeIndex, ids: JsValue) -> Result<JsValue, JsValue>;
}

fn binding(env: &Env, name: &str) -> Result<VectorizeIndex> {
    let value = js_sys::Reflect::get(env.as_ref(), &JsValue::from_str(name))
        .map_err(|_| missing(name))?;
    if value.is_undefined() || value.is_null() {
        return Err(missing(name));
    }
    Ok(value.unchecked_into())
}

fn missing(name: &str) -> Error {
    Error::RustError(format!("vectorize binding {name} is missing"))
}

fn js_message(err: JsValue) -> String {
    if let Some(message) = err.as_string() {
        return message;
    }
    js_sys::Reflect::get(&err, &JsValue::from_str("message"))
        .ok()
        .and_then(|value| value.as_string())
        .or_else(|| js_sys::JSON::stringify(&err).ok().and_then(|value| value.as_string()))
        .unwrap_or_else(|| "vectorize call failed".into())
}

fn to_plain(value: &Value) -> JsValue {
    match value {
        Value::Null => JsValue::NULL,
        Value::Bool(bit) => JsValue::from_bool(*bit),
        Value::Number(number) => JsValue::from_f64(number.as_f64().unwrap_or(f64::NAN)),
        Value::String(text) => JsValue::from_str(text),
        Value::Array(items) => {
            let array = js_sys::Array::new();
            for item in items {
                array.push(&to_plain(item));
            }
            array.into()
        }
        Value::Object(map) => {
            let object = js_sys::Object::new();
            for (key, item) in map {
                let _ = js_sys::Reflect::set(&object, &JsValue::from_str(key), &to_plain(item));
            }
            object.into()
        }
    }
}

fn from_js(value: JsValue) -> std::result::Result<Value, String> {
    serde_wasm_bindgen::from_value(value).map_err(|err| err.to_string())
}

pub async fn upsert(env: &Env, vectors: &Value) -> std::result::Result<Value, String> {
    let index = binding(env, "VECTORIZE").map_err(|err| err.to_string())?;
    let result = index.upsert(to_plain(vectors)).await.map_err(js_message)?;
    from_js(result)
}

pub async fn query(
    env: &Env,
    vector: &Value,
    top_k: u32,
    owner: &str,
) -> std::result::Result<Value, String> {
    let index = binding(env, "VECTORIZE").map_err(|err| err.to_string())?;
    let options = serde_json::json!({
        "topK": top_k,
        "returnMetadata": "all",
        "filter": { "owner": owner }
    });
    let result = index
        .query(to_plain(vector), to_plain(&options))
        .await
        .map_err(js_message)?;
    from_js(result)
}

pub async fn get_by_ids(env: &Env, ids: &Value) -> std::result::Result<Value, String> {
    let index = binding(env, "VECTORIZE").map_err(|err| err.to_string())?;
    let result = index.get_by_ids(to_plain(ids)).await.map_err(js_message)?;
    from_js(result)
}

pub async fn missing_binding(env: &Env) -> std::result::Result<Value, String> {
    binding(env, "VECTORIZE_ABSENT")
        .map(|_| serde_json::json!({}))
        .map_err(|err| err.to_string())
}

pub fn match_ids(payload: &Value) -> Vec<String> {
    payload
        .get("matches")
        .and_then(Value::as_array)
        .map(|matches| {
            matches
                .iter()
                .filter_map(|hit| hit.get("id").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}
