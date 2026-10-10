//! Retrieval for the bake-off: embed, Vectorize, FTS, reciprocal-rank fusion,
//! then a D1 re-check. A failure in AI or Vectorize degrades to FTS.

use serde_json::{json, Value};
use wasm_bindgen::JsValue;
use worker::{Env, Result};

use crate::vectorize;
use crate::{json_i64, json_str, open_db};

const TEXT_MODEL: &str = "@cf/qwen/qwen3-embedding-0.6b";
const TOP_K: u32 = 30;
const RRF_K: f64 = 60.0;
pub const TEXT_ONLY: &str = "Search is using text only.";

pub struct Outcome {
    pub results: Vec<Value>,
    pub notice: Option<String>,
    pub degraded: bool,
}

pub async fn search(env: &Env, owner: &str, query: &str, supplied: Option<Vec<f32>>) -> Result<Outcome> {
    let mut degraded = false;
    let mut notice = None;
    let vector = match supplied {
        Some(vector) => Some(vector),
        None => match embed_query(env, query).await {
            Ok(vector) => Some(vector),
            Err(_) => {
                degraded = true;
                notice = Some(TEXT_ONLY.to_string());
                None
            }
        },
    };

    let mut vector_ids = Vec::new();
    if let Some(vector) = vector {
        match vectorize::query(env, &json!(vector), TOP_K, owner).await {
            Ok(payload) => vector_ids = vectorize::match_ids(&payload),
            Err(_) => {
                degraded = true;
                notice = Some(TEXT_ONLY.to_string());
            }
        }
    }

    let fts_ids = fts(env, owner, query).await?;
    let fused = rrf(&[vector_ids.clone(), fts_ids.clone()]);
    let mut results = Vec::new();
    for id in fused {
        let Some(row) = load(env, owner, &id).await? else {
            continue;
        };
        let from_fts = fts_ids.iter().any(|hit| hit == &id);
        let versions_match = json_i64(&row, "content_version") == json_i64(&row, "indexed_version");
        if !from_fts && !versions_match {
            continue;
        }
        results.push(json!({
            "id": id,
            "note": json_str(&row, "note").unwrap_or(""),
        }));
    }
    Ok(Outcome {
        results,
        notice,
        degraded,
    })
}

pub async fn embed_query(env: &Env, query: &str) -> std::result::Result<Vec<f32>, String> {
    let ai = env.ai("AI").map_err(|err| err.to_string())?;
    let value: Value = ai
        .run(TEXT_MODEL, json!({ "text": [query] }))
        .await
        .map_err(|err| err.to_string())?;
    embedding_vector(&value).ok_or_else(|| "embedding response had no vector".into())
}

fn embedding_vector(value: &Value) -> Option<Vec<f32>> {
    value
        .get("data")
        .and_then(number_row)
        .or_else(|| value.pointer("/result/data").and_then(number_row))
}

fn number_row(value: &Value) -> Option<Vec<f32>> {
    let items = value.as_array()?;
    let row = if items.first()?.is_array() { items.first()? } else { value };
    row.as_array()?
        .iter()
        .map(|item| item.as_f64().map(|number| number as f32))
        .collect()
}

async fn fts(env: &Env, owner: &str, query: &str) -> Result<Vec<String>> {
    let Some(phrase) = fts_phrase(query) else {
        return Ok(Vec::new());
    };
    let db = open_db(env)?;
    let result = db
        .prepare(
            "SELECT a.id AS id
             FROM assets_fts
             JOIN assets a ON a.rowid = assets_fts.rowid
             WHERE assets_fts MATCH ?1 AND a.owner_id = ?2 AND a.deleted_at IS NULL
             ORDER BY bm25(assets_fts)
             LIMIT 30",
        )
        .bind(&[JsValue::from_str(&phrase), JsValue::from_str(owner)])?
        .all()
        .await?;
    let rows = result.results::<Value>()?;
    Ok(rows
        .iter()
        .filter_map(|row| json_str(row, "id").map(str::to_string))
        .collect())
}

fn fts_phrase(query: &str) -> Option<String> {
    let cleaned: String = query
        .chars()
        .filter(|ch| *ch != '"' && *ch != '*' && !ch.is_control())
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() || cleaned.chars().count() > 500 {
        return None;
    }
    Some(format!("\"{cleaned}\""))
}

async fn load(env: &Env, owner: &str, id: &str) -> Result<Option<Value>> {
    let db = open_db(env)?;
    db.prepare(
        "SELECT id, note, content_version, indexed_version
         FROM assets
         WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
    )
    .bind(&[JsValue::from_str(id), JsValue::from_str(owner)])?
    .first(None)
    .await
}

pub fn rrf(lists: &[Vec<String>]) -> Vec<String> {
    let mut scores: Vec<(String, f64)> = Vec::new();
    for list in lists {
        for (index, id) in list.iter().enumerate() {
            let delta = 1.0 / (RRF_K + (index + 1) as f64);
            if let Some(existing) = scores.iter_mut().find(|(hit, _)| hit == id) {
                existing.1 += delta;
            } else {
                scores.push((id.clone(), delta));
            }
        }
    }
    scores.sort_by(|left, right| {
        right
            .1
            .partial_cmp(&left.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.0.cmp(&right.0))
    });
    scores.into_iter().map(|(id, _)| id).collect()
}
