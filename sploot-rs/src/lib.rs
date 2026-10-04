mod access;

use std::sync::OnceLock;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use worker::*;

use access::Identity;

const CSS: &str = include_str!("../static/app.css");
const JS: &str = include_str!("../static/app.js");
const MANIFEST: &str = include_str!("../static/manifest.webmanifest");
const ICON_192: &[u8] = include_bytes!("../static/icons/icon-192.png");
const ICON_512: &[u8] = include_bytes!("../static/icons/icon-512.png");
const ICON_MASKABLE: &[u8] = include_bytes!("../static/icons/maskable-512.png");
const ICON_APPLE: &[u8] = include_bytes!("../static/apple-touch-icon.png");

pub enum GuardError {
    Unauthorized,
    Forbidden,
    Csrf,
    Unavailable,
}

#[event(fetch)]
async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    if req.method() == Method::Get && is_public(&path) {
        return public(&path, &env).await;
    }
    let identity = match access::guard(&mut req, &env).await {
        Ok(identity) => identity,
        Err(err) => return render_error(err, &path),
    };
    match (req.method(), path.as_str()) {
        (Method::Get, "/") => shell(&identity, &env),
        (Method::Get, "/api/me") => me(&identity, &env),
        (Method::Post, "/logout") => logout(&env),
        (Method::Get, "/app.css") => private_text(CSS, "text/css; charset=utf-8"),
        (Method::Get, "/app.js") => private_text(JS, "text/javascript; charset=utf-8"),
        _ => not_found(),
    }
}

fn is_public(path: &str) -> bool {
    matches!(
        path,
        "/healthz"
            | "/manifest.webmanifest"
            | "/apple-touch-icon.png"
            | "/icons/icon-192.png"
            | "/icons/icon-512.png"
            | "/icons/maskable-512.png"
    )
}

async fn public(path: &str, env: &Env) -> Result<Response> {
    match path {
        "/healthz" => health(env).await,
        "/manifest.webmanifest" => cached(
            MANIFEST.as_bytes(),
            "application/manifest+json; charset=utf-8",
        ),
        "/apple-touch-icon.png" => cached(ICON_APPLE, "image/png"),
        "/icons/icon-192.png" => cached(ICON_192, "image/png"),
        "/icons/icon-512.png" => cached(ICON_512, "image/png"),
        "/icons/maskable-512.png" => cached(ICON_MASKABLE, "image/png"),
        _ => not_found(),
    }
}

async fn health(env: &Env) -> Result<Response> {
    let db = if db_ok(env).await { "ok" } else { "error" };
    let body = json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "commit": var(env, "GIT_SHA").unwrap_or_else(|_| "unknown".into()),
        "env": var(env, "APP_ENV").unwrap_or_else(|_| "prod".into()),
        "db": db,
    });
    let response = Response::from_json(&body)?;
    response.headers().set("cache-control", "no-store")?;
    Ok(response)
}

async fn db_ok(env: &Env) -> bool {
    let Ok(db) = env.d1("DB") else {
        return false;
    };
    matches!(
        db.prepare("SELECT 1 AS ok").first::<Value>(None).await,
        Ok(Some(_))
    )
}

fn shell(identity: &Identity, env: &Env) -> Result<Response> {
    let token = match access::csrf_token(env, &identity.subject) {
        Ok(token) => token,
        Err(err) => return render_error(err, "/"),
    };
    let app_env = var(env, "APP_ENV").unwrap_or_else(|_| "prod".into());
    let sha = var(env, "GIT_SHA").unwrap_or_else(|_| "unknown".into());
    let short: String = sha.chars().take(7).collect();
    let tag = if app_env == "prod" {
        String::new()
    } else {
        format!(
            r#"<span class="tag">{}</span>"#,
            escape(&app_env.to_ascii_uppercase())
        )
    };
    let body = format!(
        r#"<header class="top">
<div class="bar"><p class="word">SPLOOT</p>{tag}</div>
<div class="identity">
<p class="who">signed in as {email}</p>
<form method="post" action="/logout"><input type="hidden" name="csrf" value="{token}"><button type="submit">[ sign out ]</button></form>
</div>
</header>
<p id="expired" class="banner" hidden>Session expired — <button type="button" class="primary" id="sign-in">[ sign in ]</button></p>
<p id="offline" class="banner" hidden>offline</p>
<p id="denied" class="banner" hidden>This account isn't on the allowlist. <a class="btn" href="/cdn-cgi/access/logout">[ sign out ]</a></p>
<section class="panel"><h2><span aria-hidden="true">┌─ </span>LIBRARY<span aria-hidden="true"> ─</span></h2><p>Nothing saved yet.</p></section>
<footer><p>v{version} · {short} · {app_env} <span class="cursor" aria-hidden="true">▌</span></p></footer>"#,
        email = escape(&identity.subject),
        token = escape(&token),
        version = env!("CARGO_PKG_VERSION"),
    );
    let head = format!(r#"<meta name="csrf" content="{}">"#, escape(&token));
    html(200, document(&body, true, &head))
}

fn me(identity: &Identity, env: &Env) -> Result<Response> {
    json_private(
        200,
        json!({
            "email": identity.subject,
            "owner": identity.owner_id,
            "env": var(env, "APP_ENV").unwrap_or_else(|_| "prod".into()),
        }),
    )
}

fn logout(env: &Env) -> Result<Response> {
    let origin = var(env, "APP_ORIGIN")?;
    let target = format!("{}/cdn-cgi/access/logout", origin.trim_end_matches('/'));
    let url = Url::parse(&target)?;
    let response = Response::redirect_with_status(url, 303)?;
    seal(&response)?;
    Ok(response)
}

fn render_error(err: GuardError, path: &str) -> Result<Response> {
    let (status, code, text) = match err {
        GuardError::Unauthorized => (401, "unauthorized", "Sign in."),
        GuardError::Forbidden => (403, "forbidden", "This account isn't on the allowlist."),
        GuardError::Csrf => (403, "csrf", "Rejected."),
        GuardError::Unavailable => (500, "unavailable", "The library is unavailable."),
    };
    if path.starts_with("/api/") {
        return json_private(status, json!({ "error": code }));
    }
    let extra = match err {
        GuardError::Unauthorized => {
            format!(
                r#"<p><a class="btn primary" href="{}">[ sign in ]</a></p>"#,
                escape(path)
            )
        }
        GuardError::Forbidden => {
            r#"<p><a class="btn" href="/cdn-cgi/access/logout">[ sign out ]</a></p>"#.to_string()
        }
        _ => String::new(),
    };
    let body = format!(r#"<main><p class="word">SPLOOT</p><p>{text}</p>{extra}</main>"#);
    html(status, document(&body, false, ""))
}

fn not_found() -> Result<Response> {
    let body = r#"<main><p class="word">SPLOOT</p><p>Not found.</p></main>"#;
    html(404, document(body, false, ""))
}

fn document(body: &str, linked: bool, head_extra: &str) -> String {
    let style = if linked {
        r#"<link rel="stylesheet" href="/app.css">"#.to_string()
    } else {
        format!("<style>{CSS}</style>")
    };
    let script = if linked {
        r#"<script src="/app.js"></script>"#
    } else {
        ""
    };
    format!(
        r##"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#121212">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Sploot">
<title>Sploot</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{head_extra}
{style}
</head>
<body>
{body}
{script}
</body>
</html>"##
    )
}

fn html(status: u16, body: String) -> Result<Response> {
    let response = Response::from_html(body)?.with_status(status);
    seal(&response)?;
    Ok(response)
}

fn json_private(status: u16, body: Value) -> Result<Response> {
    let response = Response::from_json(&body)?.with_status(status);
    seal(&response)?;
    Ok(response)
}

fn private_text(body: &str, content_type: &str) -> Result<Response> {
    let response = Response::from_bytes(body.as_bytes().to_vec())?;
    response.headers().set("content-type", content_type)?;
    seal(&response)?;
    Ok(response)
}

fn cached(bytes: &[u8], content_type: &str) -> Result<Response> {
    let response = Response::from_bytes(bytes.to_vec())?;
    response.headers().set("content-type", content_type)?;
    response
        .headers()
        .set("cache-control", "public, max-age=3600")?;
    Ok(response)
}

fn seal(response: &Response) -> Result<()> {
    let headers = response.headers();
    headers.set("content-security-policy", &csp())?;
    headers.set("x-content-type-options", "nosniff")?;
    headers.set("referrer-policy", "same-origin")?;
    headers.set("cache-control", "private, no-store")?;
    Ok(())
}

fn csp() -> String {
    format!(
        "default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self' 'sha256-{hash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://*.cloudflareaccess.com",
        hash = style_hash()
    )
}

fn style_hash() -> &'static str {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| STANDARD.encode(Sha256::digest(CSS.as_bytes())))
}

fn var(env: &Env, name: &str) -> Result<String> {
    Ok(env.var(name)?.to_string())
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
