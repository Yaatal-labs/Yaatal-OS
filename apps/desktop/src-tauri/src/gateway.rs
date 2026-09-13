//! Typed local Studio boundary. Credentials, cookie jars and retained links stay native.
use crate::{http, sanitize_product_id, session, AppState, SidecarConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};
use tauri_plugin_http::reqwest::{Client, Method, Url};

type Result<T> = std::result::Result<T, String>;

fn owned_state(state: &State<'_, AppState>) -> AppState {
    AppState {
        supervisor: Arc::clone(&state.supervisor),
        session: Arc::clone(&state.session),
    }
}

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| "native_task_unavailable".to_string())?
}

pub fn studio_origin(config: &SidecarConfig) -> Url {
    Url::parse(&format!(
        "http://{}/",
        std::net::SocketAddr::new(config.host, config.port)
    ))
    .expect("validated loopback config")
}

fn origin(state: &AppState) -> Result<Url> {
    let supervisor = state.supervisor.lock().map_err(|_| "sidecar_unavailable")?;
    Ok(studio_origin(&supervisor.config))
}

fn endpoint(base: &Url, path: &str) -> Result<Url> {
    let url = base.join(path).map_err(|_| "endpoint_invalid")?;
    if url.origin() != base.origin() || !url.username().is_empty() || url.password().is_some() {
        return Err("endpoint_origin_rejected".into());
    }
    Ok(url)
}

fn engine() -> Result<Url> {
    http::engine_base(
        &std::env::var("ENGINE_API_URL").unwrap_or_else(|_| "https://engine.njooba.com".into()),
    )
}

fn session_operator(state: &Mutex<session::SessionState>) -> Result<(u64, Client)> {
    let current = state.lock().map_err(|_| "session_unavailable")?;
    current.engine_token()?;
    Ok((
        current.generation,
        current
            .studio_client
            .clone()
            .ok_or("studio_authentication_required")?,
    ))
}

fn operator(state: &AppState) -> Result<(u64, Client)> {
    session_operator(&state.session)
}

fn check_session_generation(state: &Mutex<session::SessionState>, generation: u64) -> Result<()> {
    state
        .lock()
        .map_err(|_| "session_unavailable")?
        .check_generation(generation)
}

fn current(state: &AppState, generation: u64) -> Result<()> {
    check_session_generation(&state.session, generation)
}

fn guarded_studio_transport<T, C>(
    state: &Mutex<session::SessionState>,
    generation: u64,
    client: C,
    transport: impl FnOnce(C) -> Result<T>,
) -> Result<T> {
    check_session_generation(state, generation)?;
    let response = transport(client)?;
    check_session_generation(state, generation)?;
    Ok(response)
}

fn studio_response<T>(
    state: &Mutex<session::SessionState>,
    transport: impl FnOnce(Client) -> Result<T>,
) -> Result<T> {
    let (generation, client) = session_operator(state)?;
    guarded_studio_transport(state, generation, client, transport)
}

fn guarded_studio_two_step<T, C: Clone>(
    state: &Mutex<session::SessionState>,
    generation: u64,
    client: C,
    first: impl FnOnce(C) -> Result<()>,
    between: impl FnOnce() -> Result<()>,
    second: impl FnOnce(C) -> Result<T>,
) -> Result<T> {
    guarded_studio_transport(state, generation, client.clone(), first)?;
    between()?;
    guarded_studio_transport(state, generation, client, second)
}

fn studio_request(
    state: &AppState,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let url = endpoint(&origin(state)?, path)?;
    studio_response(&state.session, move |client| {
        http::request(&client, method, url, body)
    })
}

fn studio_request_with_client(
    state: &AppState,
    generation: u64,
    client: Client,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let url = endpoint(&origin(state)?, path)?;
    guarded_studio_transport(&state.session, generation, client, move |client| {
        http::request(&client, method, url, body)
    })
}

pub fn revoke(state: &AppState, client: &Client) -> Result<()> {
    http::request(
        client,
        Method::DELETE,
        endpoint(&origin(state)?, "api/studio/operator/session")?,
        None,
    )
    .map(|_| ())
}

pub fn invalidate_session(app: &AppHandle, state: &AppState) -> Result<()> {
    let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.invalidate_studio();
    let _ = session::emit_session(app, &current);
    Ok(())
}

pub fn invalidate_if_restart(app: &AppHandle, state: &AppState) -> Result<()> {
    let restart = {
        let mut supervisor = state.supervisor.lock().map_err(|_| "sidecar_unavailable")?;
        supervisor.status();
        supervisor.child.is_none() && !supervisor.adopted
    };
    if restart {
        invalidate_session(app, state)?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Authenticated {
    authenticated: bool,
}

fn studio_session_bootstrap_blocking(app: &AppHandle, state: &AppState) -> Result<Authenticated> {
    let (generation, token) = {
        let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
        let token = current.engine_token()?.to_owned();
        current.invalidate_studio();
        (current.generation, token)
    };
    let client = http::client(true)?;
    let result = (|| {
        let body = session::engine_studio_bootstrap_start(app, engine()?.as_str(), &token)?;
        let grant = session::validate_studio_bootstrap_grant(&body)?;
        current(&state, generation)?;
        let response = http::request(
            &client,
            Method::POST,
            endpoint(&origin(&state)?, "api/studio/operator/bootstrap")?,
            Some(json!({"nonce":grant.nonce,"surface":grant.surface})),
        )?;
        if response["authenticated"] != true {
            return Err("studio_authentication_required".into());
        }
        // Verify that the cookie actually works; an authenticated body alone is insufficient.
        let status = http::request(
            &client,
            Method::GET,
            endpoint(&origin(&state)?, "api/studio/operator/session")?,
            None,
        )?;
        if status["authenticated"] != true {
            return Err("studio_cookie_unavailable".into());
        }
        let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
        current.check_generation(generation)?;
        current.studio_client = Some(client.clone());
        Ok(Authenticated {
            authenticated: true,
        })
    })();
    if result.is_err() {
        let _ = revoke(&state, &client);
    }
    result
}

#[tauri::command]
pub async fn studio_session_bootstrap(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Authenticated> {
    let state = owned_state(&state);
    run_blocking(move || studio_session_bootstrap_blocking(&app, &state)).await
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StudioSession {
    is_live: bool,
    session_id: Option<String>,
    started_at: f64,
    seller_name: String,
}

fn session_snapshot(value: &Value) -> Result<StudioSession> {
    let is_live = value["is_live"]
        .as_bool()
        .ok_or("session_payload_invalid")?;
    let session_id = if value["session_id"].is_null() {
        None
    } else {
        Some(id(&value["session_id"])?)
    };
    let started_at = value["started_at"]
        .as_f64()
        .filter(|v| v.is_finite() && *v >= 0.0)
        .ok_or("session_payload_invalid")?;
    if is_live && (session_id.is_none() || started_at == 0.0) {
        return Err("session_payload_invalid".into());
    }
    Ok(StudioSession {
        is_live,
        session_id,
        started_at,
        seller_name: text(&value["seller_name"], 200, true)?,
    })
}

fn studio_session_state_blocking(state: &AppState) -> Result<StudioSession> {
    session_snapshot(&studio_request(
        &state,
        Method::GET,
        "api/studio/session-state",
        None,
    )?)
}

fn studio_session_snapshot_url(state: &AppState) -> Result<Url> {
    endpoint(&origin(state)?, "api/studio/session-state")
}

fn studio_go_live_context(state: &AppState) -> Result<(u64, Client, String)> {
    let current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.engine_token()?;
    let client = current
        .studio_client
        .clone()
        .ok_or("studio_authentication_required")?;
    let name = current
        .sanitized()
        .merchant_name
        .ok_or("authentication_required")?;
    Ok((current.generation, client, name))
}

#[tauri::command]
pub async fn studio_session_state(state: State<'_, AppState>) -> Result<StudioSession> {
    let state = owned_state(&state);
    run_blocking(move || studio_session_state_blocking(&state)).await
}

fn studio_go_live_blocking(state: &AppState) -> Result<StudioSession> {
    let (generation, client, name) = studio_go_live_context(state)?;
    let post_url = endpoint(&origin(state)?, "api/studio/go-live")?;
    let session_url = studio_session_snapshot_url(state)?;
    guarded_studio_two_step(
        &state.session,
        generation,
        client,
        move |client| {
            http::request(
                &client,
                Method::POST,
                post_url,
                Some(json!({"seller_name":name})),
            )
            .map(|_| ())
        },
        || Ok(()),
        move |client| session_snapshot(&http::request(&client, Method::GET, session_url, None)?),
    )
}

#[tauri::command]
pub async fn studio_go_live(state: State<'_, AppState>) -> Result<StudioSession> {
    let state = owned_state(&state);
    run_blocking(move || studio_go_live_blocking(&state)).await
}

fn studio_stop_stream_blocking(state: &AppState) -> Result<StudioSession> {
    let (generation, client) = operator(state)?;
    let post_url = endpoint(&origin(state)?, "api/studio/stop-stream")?;
    let session_url = studio_session_snapshot_url(state)?;
    guarded_studio_two_step(
        &state.session,
        generation,
        client,
        move |client| http::request(&client, Method::POST, post_url, Some(json!({}))).map(|_| ()),
        || Ok(()),
        move |client| session_snapshot(&http::request(&client, Method::GET, session_url, None)?),
    )
}

#[tauri::command]
pub async fn studio_stop_stream(state: State<'_, AppState>) -> Result<StudioSession> {
    let state = owned_state(&state);
    run_blocking(move || studio_stop_stream_blocking(&state)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StudioStatus {
    health: &'static str,
    ledger_available: bool,
    readiness: Readiness,
}
#[derive(Serialize)]
#[allow(dead_code)]
pub struct Readiness {
    status: String,
    steps: Vec<ReadinessStep>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ReadinessStep {
    name: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
}
#[allow(dead_code)]
fn readiness_status(value: &Value) -> Result<String> {
    match value.as_str() {
        Some(s @ ("pending" | "running" | "passed" | "failed" | "skipped" | "not_run")) => {
            Ok(s.into())
        }
        _ => Err("readiness_payload_invalid".into()),
    }
}

fn studio_status_blocking(state: &AppState) -> Result<StudioStatus> {
    let value = http::request(
        &http::client(false)?,
        Method::GET,
        endpoint(&origin(&state)?, "api/os/status")?,
        None,
    )?;
    if value["version"] != "yaatal.studio.os.v1" || value["health"] != "ok" {
        return Err("status_payload_invalid".into());
    }
    let readiness = &value["readiness"];
    let mut steps = Vec::new();
    for step in array(&readiness["steps"], 32)? {
        steps.push(ReadinessStep {
            name: safe_metadata_id(&step["name"])?,
            status: readiness_status(&step["status"])?,
            duration_ms: step["duration_ms"].as_u64().filter(|v| *v <= 86_400_000),
        });
    }
    Ok(StudioStatus {
        health: "ok",
        ledger_available: value["ledger_available"]
            .as_bool()
            .ok_or("status_payload_invalid")?,
        readiness: Readiness {
            status: readiness_status(&readiness["status"])?,
            steps,
        },
    })
}

#[tauri::command]
pub async fn studio_status(state: State<'_, AppState>) -> Result<StudioStatus> {
    let state = owned_state(&state);
    run_blocking(move || studio_status_blocking(&state)).await
}

fn text(value: &Value, max: usize, empty: bool) -> Result<String> {
    value
        .as_str()
        .filter(|s| {
            s.len() <= max && (empty || !s.trim().is_empty()) && !s.chars().any(char::is_control)
        })
        .map(str::to_owned)
        .ok_or_else(|| "payload_text_invalid".into())
}

const CATALOG_PRODUCT_NAME_MAX_CHARS: usize = 200;
const CATALOG_PRODUCT_NAME_MAX_BYTES: usize = CATALOG_PRODUCT_NAME_MAX_CHARS * 4;
const STUDIO_PRODUCT_NAME_MAX_CHARS: usize = 120;

fn catalog_product_name(value: &Value) -> Result<String> {
    value
        .as_str()
        .filter(|name| {
            name.len() <= CATALOG_PRODUCT_NAME_MAX_BYTES
                && name.chars().count() <= CATALOG_PRODUCT_NAME_MAX_CHARS
                && !name.trim().is_empty()
                && !name.chars().any(char::is_control)
        })
        .map(str::to_owned)
        .ok_or_else(|| "payload_text_invalid".into())
}
fn id(value: &Value) -> Result<String> {
    let value = if let Some(n) = value.as_u64() {
        n.to_string()
    } else {
        text(value, 128, false)?
    };
    sanitize_product_id(&value)
        .filter(|v| v == &value)
        .ok_or_else(|| "identifier_invalid".into())
}
#[allow(dead_code)]
fn safe_metadata_id(value: &Value) -> Result<String> {
    text(value, 128, false).and_then(|s| {
        if s.bytes()
            .enumerate()
            .all(|(i, c)| c.is_ascii_alphanumeric() || i > 0 && b"_.:-".contains(&c))
        {
            Ok(s)
        } else {
            Err("metadata_invalid".into())
        }
    })
}
fn array(value: &Value, max: usize) -> Result<&Vec<Value>> {
    value
        .as_array()
        .filter(|v| v.len() <= max)
        .ok_or_else(|| "payload_collection_invalid".into())
}
fn number(value: &Value, max: u64) -> Result<u64> {
    value
        .as_u64()
        .filter(|v| *v <= max)
        .ok_or_else(|| "payload_number_invalid".into())
}
fn optional_text(value: &Value, max: usize) -> Result<Option<String>> {
    if value.is_null() {
        Ok(None)
    } else {
        text(value, max, true).map(Some)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogProduct {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    price_fcfa: u64,
    price_display: String,
    stock: u64,
    stock_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    category: Option<String>,
    images: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    variants: Option<Vec<String>>,
}

fn product(value: &Value) -> Result<CatalogProduct> {
    let price = value
        .get("price_fcfa")
        .or_else(|| value.get("price_cents"))
        .or_else(|| value.get("price"))
        .ok_or("price_missing")?;
    let price_fcfa = number(price, 100_000_000)?;
    let stock = number(&value["stock"], 1_000_000)?;
    let mut images = Vec::new();
    let parsed_images;
    let raw_images = if let Some(s) = value["images"].as_str() {
        parsed_images = serde_json::from_str(s).map_err(|_| "images_invalid")?;
        &parsed_images
    } else {
        &value["images"]
    };
    if !raw_images.is_null() {
        for image in array(raw_images, 20)? {
            let s = text(image, 2048, false)?;
            // Relative/demo media is resolved by the existing frontend mapping, never recreated here.
            if let Ok(url) = Url::parse(&s) {
                if matches!(url.scheme(), "http" | "https")
                    && url.username().is_empty()
                    && url.password().is_none()
                {
                    images.push(s);
                }
            }
        }
    }
    let variants = if value["variants"].is_null() {
        None
    } else {
        Some(
            array(&value["variants"], 12)?
                .iter()
                .map(|v| text(v, 48, false))
                .collect::<Result<Vec<_>>>()?,
        )
    };
    let stock_status = match value["stock_status"].as_str() {
        Some(s @ ("in_stock" | "low_stock" | "out_of_stock")) => s.into(),
        None => if stock == 0 {
            "out_of_stock"
        } else if stock <= 5 {
            "low_stock"
        } else {
            "in_stock"
        }
        .into(),
        _ => return Err("stock_status_invalid".into()),
    };
    Ok(CatalogProduct {
        id: id(&value["id"])?,
        name: catalog_product_name(&value["name"])?,
        description: optional_text(&value["description"], 4096)?,
        price_fcfa,
        price_display: value
            .get("price_display")
            .map(|v| text(v, 64, false))
            .transpose()?
            .unwrap_or_else(|| format!("{price_fcfa} FCFA")),
        stock,
        stock_status,
        category: optional_text(&value["category"], 120)?,
        images,
        variants,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CatalogPage {
    products: Vec<CatalogProduct>,
    total: u64,
    page: u64,
    per_page: u64,
}

const CATALOG_PAGE_SIZE: u64 = 20;
const CATALOG_PAGE_MAX: u64 = 10_000;

fn catalog_request(page: Option<u64>, category: Option<String>) -> Result<(u64, Option<String>)> {
    let page = page.unwrap_or(1);
    if !(1..=CATALOG_PAGE_MAX).contains(&page) {
        return Err("page_invalid".into());
    }
    let category = category
        .map(|value| text(&Value::String(value), 120, false))
        .transpose()?;
    Ok((page, category))
}

fn catalog_url(base: &Url, page: u64, category: Option<&str>) -> Result<Url> {
    let mut url = endpoint(base, "api/catalog")?;
    url.query_pairs_mut()
        .append_pair("page", &page.to_string())
        .append_pair("per_page", &CATALOG_PAGE_SIZE.to_string());
    if let Some(category) = category {
        url.query_pairs_mut().append_pair("category", category);
    }
    Ok(url)
}

fn catalog_page_response(value: &Value, requested_page: u64) -> Result<CatalogPage> {
    let page = number(&value["page"], CATALOG_PAGE_MAX)?;
    let per_page = number(&value["per_page"], CATALOG_PAGE_SIZE)?;
    if page == 0 || page != requested_page || per_page != CATALOG_PAGE_SIZE {
        return Err("catalog_pagination_invalid".into());
    }
    Ok(CatalogPage {
        products: array(&value["products"], CATALOG_PAGE_SIZE as usize)?
            .iter()
            .map(product)
            .collect::<Result<_>>()?,
        total: number(&value["total"], 10_000_000)?,
        page,
        per_page,
    })
}

fn catalog_list_blocking(page: Option<u64>, category: Option<String>) -> Result<CatalogPage> {
    let (page, category) = catalog_request(page, category)?;
    let url = catalog_url(&engine()?, page, category.as_deref())?;
    let value = http::request(&http::client(false)?, Method::GET, url, None)?;
    catalog_page_response(&value, page)
}

#[tauri::command]
pub async fn catalog_list(page: Option<u64>, category: Option<String>) -> Result<CatalogPage> {
    run_blocking(move || catalog_list_blocking(page, category)).await
}

#[allow(dead_code)]
fn fetch_product(product_id: String) -> Result<CatalogProduct> {
    let product_id = id(&Value::String(product_id))?;
    let value = http::request(
        &http::client(false)?,
        Method::GET,
        endpoint(&engine()?, &format!("api/catalog/{product_id}"))?,
        None,
    )?;
    let result = product(&value)?;
    if result.id != product_id {
        return Err("product_mismatch".into());
    }
    Ok(result)
}
#[tauri::command]
pub async fn catalog_product(product_id: String) -> Result<CatalogProduct> {
    run_blocking(move || fetch_product(product_id)).await
}

#[derive(Serialize)]
#[allow(dead_code)]
pub struct ProductQueue {
    products: Vec<CatalogProduct>,
    source: String,
}
fn studio_product_queue_blocking(state: &AppState) -> Result<ProductQueue> {
    let value = studio_request(&state, Method::GET, "api/studio/product-queue", None)?;
    let source = match value["source"].as_str() {
        Some(s @ ("engine_live_session" | "engine_catalog_fallback")) => s,
        Some("mock_fallback") if std::env::var("STUDIO_DEMO_MODE").as_deref() == Ok("1") => {
            "mock_fallback"
        }
        _ => return Err("catalog_unavailable".into()),
    }
    .into();
    Ok(ProductQueue {
        products: array(&value["products"], 100)?
            .iter()
            .map(product)
            .collect::<Result<_>>()?,
        source,
    })
}

#[tauri::command]
pub async fn studio_product_queue(state: State<'_, AppState>) -> Result<ProductQueue> {
    let state = owned_state(&state);
    run_blocking(move || studio_product_queue_blocking(&state)).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommerceIntent {
    intent_id: String,
    live_session_id: String,
    product_id: String,
    public_url: String,
    livestream_url: String,
    whatsapp_url: String,
    telegram_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommerceChannel {
    Copy,
    Livestream,
    Telegram,
    Whatsapp,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommerceLinkOpenResult {
    public_url: String,
    opened: bool,
}

#[allow(dead_code)]
fn public_base(state: &AppState) -> Result<Url> {
    let fallback = origin(state)?;
    let raw =
        std::env::var("YAATAL_COMMERCE_PUBLIC_BASE_URL").unwrap_or_else(|_| fallback.to_string());
    http::engine_base(&raw).map_err(|_| "commerce_configuration_invalid".into())
}
fn commerce_url(
    value: &str,
    base: &Url,
    token: Option<&str>,
    source: &str,
) -> Result<(Url, String)> {
    let url = Url::parse(value).map_err(|_| "commerce_url_invalid")?;
    if value.len() > 2048
        || url.origin() != base.origin()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("commerce_url_invalid".into());
    }
    let t = url
        .path()
        .strip_prefix("/b/")
        .and_then(sanitize_product_id)
        .ok_or("commerce_url_invalid")?;
    if url.path() != format!("/b/{t}") || token.is_some_and(|expected| t != expected) {
        return Err("commerce_url_invalid".into());
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    if pairs.len() != 1 || pairs[0].0 != "src" || pairs[0].1 != source {
        return Err("commerce_url_invalid".into());
    }
    Ok((url, t))
}
#[allow(dead_code)]
fn share_url(value: &Value, base: &Url, token: &str, channel: &str) -> Result<String> {
    let raw = text(value, 4096, false)?;
    let url = Url::parse(&raw).map_err(|_| "commerce_share_invalid")?;
    let (host, path) = if channel == "telegram" {
        ("t.me", "/share/url")
    } else {
        ("wa.me", "/")
    };
    if url.scheme() != "https"
        || url.host_str() != Some(host)
        || url.path() != path
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("commerce_share_invalid".into());
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    if channel == "telegram" {
        if pairs.len() != 2
            || pairs.iter().filter(|(k, _)| k == "url").count() != 1
            || pairs.iter().filter(|(k, _)| k == "text").count() != 1
        {
            return Err("commerce_share_invalid".into());
        }
        let link = &pairs
            .iter()
            .find(|(k, _)| k == "url")
            .ok_or("commerce_share_invalid")?
            .1;
        commerce_url(link, base, Some(token), channel)?;
    } else {
        if pairs.len() != 1 || pairs[0].0 != "text" {
            return Err("commerce_share_invalid".into());
        }
        let lines: Vec<_> = pairs[0].1.lines().collect();
        if lines.len() != 2 {
            return Err("commerce_share_invalid".into());
        }
        commerce_url(lines[1], base, Some(token), channel)?;
    }
    Ok(raw)
}
#[allow(dead_code)]
fn intent(value: &Value, base: &Url, product_id: &str) -> Result<CommerceIntent> {
    if value["version"] != "yaatal.commerce-intent.v1" || id(&value["product"]["id"])? != product_id
    {
        return Err("commerce_payload_invalid".into());
    }
    let public_url = text(&value["public_url"], 2048, false)?;
    let (_, token) = commerce_url(&public_url, base, None, "copy")?;
    let livestream_url = text(&value["livestream_url"], 2048, false)?;
    commerce_url(&livestream_url, base, Some(&token), "livestream")?;
    Ok(CommerceIntent {
        intent_id: id(&value["intent_id"])?,
        live_session_id: id(&value["live_session_id"])?,
        product_id: product_id.into(),
        public_url,
        livestream_url,
        whatsapp_url: share_url(&value["share"]["whatsapp"], base, &token, "whatsapp")?,
        telegram_url: share_url(&value["share"]["telegram"], base, &token, "telegram")?,
    })
}

fn commerce_intent_request(product: &CatalogProduct) -> Value {
    // This shape is deliberately derived exclusively from the current Engine
    // response. In particular, no renderer price, inventory, or media value
    // is accepted by the command.
    let studio_name: String = product
        .name
        .chars()
        .take(STUDIO_PRODUCT_NAME_MAX_CHARS)
        .collect();
    json!({"product":{
        "id": product.id,
        "name": studio_name,
        "description": product.description.as_ref().map(|s| s.chars().take(280).collect::<String>()),
        "price_fcfa": product.price_fcfa,
        "stock": product.stock,
        "category": product.category,
        "images": product.images,
        "variants": product.variants,
    }})
}

fn commerce_intent_workflow(
    product_id: String,
    fetch: impl FnOnce(&str) -> Result<CatalogProduct>,
    transport: impl FnOnce(Value) -> Result<Value>,
) -> Result<(CatalogProduct, Value)> {
    let product_id = id(&Value::String(product_id))?;
    let product = fetch(&product_id)?;
    if product.id != product_id {
        return Err("product_mismatch".into());
    }
    if product.stock == 0 || product.price_fcfa < 100 {
        return Err("product_unavailable".into());
    }
    let response = transport(commerce_intent_request(&product))?;
    Ok((product, response))
}

fn studio_create_commerce_intent_blocking(
    state: &AppState,
    product_id: String,
) -> Result<CommerceIntent> {
    let (generation, client) = operator(state)?;
    let (p, value) = commerce_intent_workflow(
        product_id,
        |requested_product_id| fetch_product(requested_product_id.to_owned()),
        |body| {
            studio_request_with_client(
                state,
                generation,
                client.clone(),
                Method::POST,
                "api/studio/poc/commerce-intents",
                Some(body),
            )
        },
    )?;
    let result = intent(&value, &public_base(state)?, &p.id)?;
    let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.check_generation(generation)?;
    if current.commerce_links.len() >= 128 {
        return Err("commerce_link_limit".into());
    }
    current
        .commerce_links
        .insert(result.intent_id.clone(), result.clone());
    Ok(result)
}

#[tauri::command]
pub async fn studio_create_commerce_intent(
    state: State<'_, AppState>,
    product_id: String,
) -> Result<CommerceIntent> {
    let state = owned_state(&state);
    run_blocking(move || studio_create_commerce_intent_blocking(&state, product_id)).await
}

fn selected_commerce_link(intent: &CommerceIntent, channel: CommerceChannel) -> (&str, bool) {
    match channel {
        // Copy is intentionally native-data-only: it never launches a program.
        CommerceChannel::Copy => (&intent.public_url, false),
        CommerceChannel::Livestream => (&intent.livestream_url, true),
        CommerceChannel::Telegram => (&intent.telegram_url, true),
        CommerceChannel::Whatsapp => (&intent.whatsapp_url, true),
    }
}

fn resolve_retained_commerce_link(
    links: &HashMap<String, CommerceIntent>,
    intent_id: &str,
    channel: CommerceChannel,
) -> Result<(String, String, bool)> {
    let link = links.get(intent_id).ok_or("commerce_link_unknown")?;
    let (url, opens) = selected_commerce_link(link, channel);
    Ok((link.public_url.clone(), url.to_owned(), opens))
}

fn commerce_open_result(
    public_url: String,
    selected_url: String,
    opens: bool,
    launch: impl FnOnce(&str) -> Result<()>,
) -> Result<CommerceLinkOpenResult> {
    if opens {
        launch(&selected_url)?;
    }
    Ok(CommerceLinkOpenResult {
        public_url,
        opened: opens,
    })
}

fn open_validated_url(url: &str) -> Result<()> {
    // Native process invocation with a single validated argument. No shell/URL permissions exposed to JS.
    #[cfg(target_os = "windows")]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler")
            .creation_flags(0x08000000);
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    let mut child = command
        .arg(url)
        .spawn()
        .map_err(|_| "commerce_link_open_failed".to_string())?;
    // Reap asynchronously: shell helper processes must not accumulate as
    // zombies and the renderer must never wait for a user-controlled app.
    tauri::async_runtime::spawn_blocking(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn open_commerce_link_blocking(
    state: &AppState,
    intent_id: String,
    channel: CommerceChannel,
) -> Result<CommerceLinkOpenResult> {
    let intent_id = id(&Value::String(intent_id))?;
    // Keep the session mutex for the short native spawn. That makes logout,
    // bootstrap, and sidecar restart unable to invalidate the account between
    // selecting a retained URL and handing it to the OS.
    let current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.engine_token()?;
    let (public_url, selected_url, opens) =
        resolve_retained_commerce_link(&current.commerce_links, &intent_id, channel)?;
    commerce_open_result(public_url, selected_url, opens, open_validated_url)
}

#[tauri::command]
pub async fn open_commerce_link(
    state: State<'_, AppState>,
    intent_id: String,
    channel: CommerceChannel,
) -> Result<CommerceLinkOpenResult> {
    let state = owned_state(&state);
    run_blocking(move || open_commerce_link_blocking(&state, intent_id, channel)).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversion {
    version: String,
    order_id: String,
    product_id: String,
    product_name: String,
    total_fcfa: u64,
    payment_provider: String,
    payment_status: String,
    live_session_id: String,
    source_channel: String,
    deduplicated: bool,
    quantity: u64,
    created_at: String,
}
fn conversion(value: &Value, session_id: &str) -> Result<Conversion> {
    if value["version"] != "yaatal.commerce-receipt.v1"
        || value["payment_status"] != "sandbox_paid"
        || value["live_session_id"] != session_id
    {
        return Err("conversion_payload_invalid".into());
    }
    let source = match value["source_channel"].as_str() {
        Some(s @ ("copy" | "livestream" | "telegram" | "whatsapp" | "bobo" | "unknown")) => s,
        _ => return Err("conversion_payload_invalid".into()),
    };
    let provider = match value["payment_provider"].as_str() {
        Some(s @ ("wave" | "orange_money" | "free_money" | "mixx" | "bank")) => s,
        _ => return Err("conversion_payload_invalid".into()),
    };
    let quantity = number(&value["quantity"], 10)?;
    if quantity == 0 {
        return Err("conversion_payload_invalid".into());
    }
    Ok(Conversion {
        version: "yaatal.commerce-receipt.v1".into(),
        order_id: id(&value["order_id"])?,
        product_id: id(&value["product_id"])?,
        product_name: text(&value["product_name"], 200, false)?,
        total_fcfa: number(&value["total_fcfa"], 1_000_000_000)?,
        payment_provider: provider.into(),
        payment_status: "sandbox_paid".into(),
        live_session_id: session_id.into(),
        source_channel: source.into(),
        deduplicated: value["deduplicated"]
            .as_bool()
            .ok_or("conversion_payload_invalid")?,
        quantity,
        created_at: text(&value["created_at"], 64, false)?,
    })
}
fn conversions_response(value: &Value, session_id: &str) -> Result<Vec<Conversion>> {
    if value["version"] != "yaatal.commerce-receipt.v1" || value["live_session_id"] != session_id {
        return Err("conversion_payload_invalid".into());
    }
    array(&value["conversions"], 1000)?
        .iter()
        .map(|v| conversion(v, session_id))
        .collect()
}
fn studio_conversions_blocking(
    state: &AppState,
    live_session_id: String,
) -> Result<Vec<Conversion>> {
    let session_id = id(&Value::String(live_session_id))?;
    let value = studio_request(
        &state,
        Method::GET,
        &format!("api/studio/poc/conversions?live_session_id={session_id}"),
        None,
    )?;
    conversions_response(&value, &session_id)
}

#[tauri::command]
pub async fn studio_conversions(
    state: State<'_, AppState>,
    live_session_id: String,
) -> Result<Vec<Conversion>> {
    let state = owned_state(&state);
    run_blocking(move || studio_conversions_blocking(&state, live_session_id)).await
}

const EVENT_VERSION: &str = "yaatal.studio.event.v1";
pub fn project_event(value: &Value) -> Option<Value> {
    let kind = value["type"].as_str()?;
    let mut event = json!({"version":EVENT_VERSION});
    match kind {
        "connected" => {
            event["kind"] = json!("studio-invalidated");
        }
        "session_state" => {
            event["kind"] = json!("session-state");
            let is_live = value["is_live"].as_bool()?;
            event["isLive"] = json!(is_live);
            let session_id = if value["session_id"].is_null() {
                None
            } else {
                Some(id(&value["session_id"]).ok()?)
            };
            if is_live && session_id.is_none() {
                return None;
            }
            if let Some(session_id) = session_id {
                event["sessionId"] = json!(session_id);
            }
        }
        "commerce_conversion" => {
            event["kind"] = json!("conversions-changed");
            event["liveSessionId"] = json!(id(&value["live_session_id"]).ok()?);
        }
        "commerce_intent_created" => {
            // Intent creation does not mutate the Engine catalog. It can still
            // invalidate Studio state, but must not claim a SHOP catalog change.
            id(&value["product_id"]).ok()?;
            event["kind"] = json!("studio-invalidated");
        }
        "governed_action" => {
            event["kind"] = json!("governed-action");
            let payload = value.get("result").unwrap_or(value);
            let decision = payload["decision"].as_str()?;
            if !matches!(decision, "allow" | "deny" | "noop") {
                return None;
            }
            event["decision"] = json!(decision);
            event["turnId"] = json!(id(&payload["turn_id"]).ok()?);
            let action = payload
                .get("action")
                .or_else(|| payload["proposal"].get("tool"))?
                .as_str()?;
            if !matches!(
                action,
                "studio.update_price_overlay"
                    | "studio.mark_sold_out_overlay"
                    | "studio.switch_product"
            ) {
                return None;
            }
            event["action"] = json!(action);
        }
        _ => return None,
    }
    Some(event)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn valid_intent() -> CommerceIntent {
        CommerceIntent {
            intent_id: "intent-1".into(),
            live_session_id: "live-1".into(),
            product_id: "robe-wax".into(),
            public_url: "https://commerce.example/b/token-1?src=copy".into(),
            livestream_url: "https://commerce.example/b/token-1?src=livestream".into(),
            whatsapp_url: "https://wa.me/?text=Buy%0Ahttps%3A%2F%2Fcommerce.example%2Fb%2Ftoken-1%3Fsrc%3Dwhatsapp".into(),
            telegram_url: "https://t.me/share/url?url=https%3A%2F%2Fcommerce.example%2Fb%2Ftoken-1%3Fsrc%3Dtelegram&text=Buy".into(),
        }
    }

    fn catalog_payload(page: u64, per_page: u64) -> Value {
        json!({"products":[],"total":0,"page":page,"per_page":per_page})
    }

    #[test]
    fn product_numbers_variants_and_aliases_are_authoritative() {
        let mut raw = json!({"id":42,"name":"Bazin","price_cents":75000,"stock":3,"variants":["S","M"],"images":[]});
        let p = product(&raw).unwrap();
        assert_eq!(p.price_fcfa, 75000);
        assert_eq!(p.variants, Some(vec!["S".into(), "M".into()]));
        raw["price_cents"] = json!(true);
        assert!(product(&raw).is_err());
        raw["price_cents"] = json!(-1);
        assert!(product(&raw).is_err());
        raw["price_cents"] = json!(10.5);
        assert!(product(&raw).is_err());
        raw["price_cents"] = json!(100);
        raw["stock"] = json!(-1);
        assert!(product(&raw).is_err());
        raw["stock"] = json!(1);
        raw["variants"] = json!([{"unknown":"M"}]);
        assert!(product(&raw).is_err());
    }

    #[test]
    fn catalog_payload_rejects_oversized_and_malformed_identifiers() {
        let mut raw =
            json!({"id":"robe-wax","name":"Robe","price_fcfa":75000,"stock":3,"images":[]});
        raw["id"] = json!("a".repeat(129));
        assert!(product(&raw).is_err());
        raw["id"] = json!("https://engine.example/api/catalog/1");
        assert!(product(&raw).is_err());
        raw["id"] = json!("robe-wax");
        raw["name"] = json!("a".repeat(201));
        assert!(product(&raw).is_err());
        raw["name"] = json!("Robe");
        raw["images"] = Value::Array(vec![json!("https://media.example/1.jpg"); 21]);
        assert!(product(&raw).is_err());
        raw["images"] = json!("not-json");
        assert!(product(&raw).is_err());
    }

    #[test]
    fn catalog_request_enforces_input_bounds_and_fixed_url_contract() {
        assert_eq!(catalog_request(None, None), Ok((1, None)));
        assert_eq!(catalog_request(Some(0), None), Err("page_invalid".into()));
        assert_eq!(
            catalog_request(Some(CATALOG_PAGE_MAX + 1), None),
            Err("page_invalid".into())
        );
        assert!(catalog_request(Some(2), Some("a".repeat(121))).is_err());
        assert!(catalog_request(Some(2), Some("fashion\n".into())).is_err());
        let (_, category) = catalog_request(Some(2), Some("fashion".into())).unwrap();
        let url = catalog_url(
            &Url::parse("https://engine.example/").unwrap(),
            2,
            category.as_deref(),
        )
        .unwrap();
        let pairs: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs.get("page"), Some(&"2".to_string()));
        assert_eq!(pairs.get("per_page"), Some(&CATALOG_PAGE_SIZE.to_string()));
        assert_eq!(pairs.get("category"), Some(&"fashion".to_string()));
    }

    #[test]
    fn catalog_response_requires_requested_page_and_fixed_page_size() {
        let page = catalog_page_response(&catalog_payload(2, CATALOG_PAGE_SIZE), 2).unwrap();
        assert_eq!(page.page, 2);
        assert_eq!(page.per_page, CATALOG_PAGE_SIZE);
        for (response_page, per_page) in [
            (0, CATALOG_PAGE_SIZE),
            (1, CATALOG_PAGE_SIZE),
            (2, 0),
            (2, 19),
            (2, 21),
        ] {
            assert!(
                catalog_page_response(&catalog_payload(response_page, per_page), 2).is_err(),
                "page={response_page}, per_page={per_page}"
            );
        }
        let malformed = json!({"products":[],"total":0,"page":2,"per_page":20.0});
        assert!(catalog_page_response(&malformed, 2).is_err());
    }

    #[test]
    fn commerce_intent_uses_only_the_authoritative_product_snapshot() {
        let fetched = RefCell::new(Vec::new());
        let sent = RefCell::new(None);
        let authoritative = product(&json!({
            "id":"robe-wax",
            "name":"Engine Robe",
            "price_fcfa":75000,
            "stock":3,
            "images":["https://media.example/engine.jpg"]
        }))
        .unwrap();
        let (product, response) = commerce_intent_workflow(
            "robe-wax".into(),
            |requested_product_id| {
                fetched.borrow_mut().push(requested_product_id.to_owned());
                Ok(authoritative.clone())
            },
            |body| {
                *sent.borrow_mut() = Some(body);
                Ok(json!({"transport":"called"}))
            },
        )
        .unwrap();
        assert_eq!(fetched.into_inner(), vec!["robe-wax"]);
        assert_eq!(product.name, "Engine Robe");
        assert_eq!(response, json!({"transport":"called"}));
        let body = sent.into_inner().expect("Studio request body");
        let nested = body["product"].as_object().expect("product object");
        assert_eq!(body.as_object().expect("request object").len(), 1);
        assert_eq!(nested["id"], "robe-wax");
        assert_eq!(nested["price_fcfa"], 75_000);
        assert_eq!(nested["stock"], 3);
        assert_eq!(
            nested["images"],
            json!(["https://media.example/engine.jpg"])
        );
        for renderer_field in ["priceFcfa", "renderer_media", "renderer_stock"] {
            assert!(!nested.contains_key(renderer_field));
        }
    }

    #[test]
    fn studio_intent_name_bound_is_unicode_safe_and_deterministic() {
        let mut raw = json!({
            "id":"robe-wax",
            "name":"é".repeat(120),
            "price_fcfa":75000,
            "stock":3,
            "images":[]
        });
        let catalog_product = product(&raw).expect("120 multibyte characters are catalog-valid");
        assert_eq!(
            commerce_intent_request(&catalog_product)["product"]["name"],
            "é".repeat(120)
        );
        raw["name"] = json!(format!("{}x", "é".repeat(120)));
        let catalog_product = product(&raw).expect("121 catalog characters are catalog-valid");
        let body = commerce_intent_request(&catalog_product);
        let name = body["product"]["name"].as_str().unwrap();
        assert_eq!(name, "é".repeat(120));
        assert_eq!(name.chars().count(), 120);
        raw["name"] = json!("é".repeat(CATALOG_PRODUCT_NAME_MAX_CHARS + 1));
        assert!(product(&raw).is_err());
    }

    #[test]
    fn studio_transport_rejects_a_response_after_account_generation_changes() {
        let session = Mutex::new(session::SessionState::default());
        {
            let mut current = session.lock().unwrap();
            session::apply_login(
                &mut current,
                r#"{"token":"old-token","pid":"old","name":"Seller","is_verified":true}"#,
            )
            .unwrap();
            current.studio_client = Some(http::client(true).unwrap());
        }
        let generation = session.lock().unwrap().generation;
        let captured_client = "client-a".to_string();
        let used_client = RefCell::new(None);
        assert_eq!(
            guarded_studio_transport(&session, generation, captured_client, |client| {
                *used_client.borrow_mut() = Some(client);
                let mut replacement = session.lock().unwrap();
                replacement.invalidate();
                session::apply_login(
                    &mut replacement,
                    r#"{"token":"new-token","pid":"new","name":"Other Seller","is_verified":true}"#,
                )
                .unwrap();
                replacement.studio_client = Some(http::client(true).unwrap());
                Ok(json!({"stale":"response"}))
            }),
            Err("session_changed".into())
        );
        assert_eq!(used_client.into_inner(), Some("client-a".into()));
    }

    #[test]
    fn multi_request_studio_operations_never_use_a_replacement_account() {
        for operation in ["go-live", "stop-stream"] {
            let session = Mutex::new(session::SessionState::default());
            {
                let mut current = session.lock().unwrap();
                session::apply_login(
                    &mut current,
                    r#"{"token":"old-token","pid":"old","name":"Seller","is_verified":true}"#,
                )
                .unwrap();
                current.studio_client = Some(http::client(true).unwrap());
            }
            let generation = session.lock().unwrap().generation;
            let used_clients = RefCell::new(Vec::new());
            assert_eq!(
                guarded_studio_two_step(
                    &session,
                    generation,
                    "client-a".to_string(),
                    |client| {
                        used_clients.borrow_mut().push(("post", client));
                        Ok(())
                    },
                    || {
                        let mut replacement = session.lock().unwrap();
                        replacement.invalidate();
                        session::apply_login(
                            &mut replacement,
                            r#"{"token":"new-token","pid":"new","name":"Other Seller","is_verified":true}"#,
                        )
                        .unwrap();
                        replacement.studio_client = Some(http::client(true).unwrap());
                        Ok(())
                    },
                    |client| {
                        used_clients.borrow_mut().push(("get", client));
                        Ok(())
                    },
                ),
                Err("session_changed".into()),
                "{operation} must reject the stale follow-up"
            );
            assert_eq!(
                used_clients.into_inner(),
                vec![("post", "client-a".to_string())],
                "{operation} must not issue an action using the replacement client"
            );
        }
    }

    #[test]
    fn urls_reject_wrong_origin_token_channel_and_credentials() {
        let base = Url::parse("https://commerce.example/").unwrap();
        assert!(commerce_url(
            "https://commerce.example/b/abc?src=copy",
            &base,
            None,
            "copy"
        )
        .is_ok());
        for raw in [
            "https://evil.example/b/abc?src=copy",
            "https://commerce.example/b/abc?src=telegram",
            "https://user@commerce.example/b/abc?src=copy",
            "https://commerce.example/b/abc?src=copy&other=1",
            "https://commerce.example/b/abc?src=copy#fragment",
            "https://commerce.example/b/../abc?src=copy",
        ] {
            assert!(commerce_url(raw, &base, None, "copy").is_err(), "{raw}");
        }
        assert!(endpoint(&base, "https://evil.example/").is_err());
        assert!(commerce_url(
            "https://commerce.example/b/abc?src=copy",
            &base,
            Some("other"),
            "copy"
        )
        .is_err());
        assert!(serde_json::from_str::<CommerceChannel>("\"copy\"").is_ok());
        assert!(serde_json::from_str::<CommerceChannel>("\"shell\"").is_err());
    }

    #[test]
    fn share_urls_reject_wrong_origin_credentials_fragments_and_redirects() {
        let base = Url::parse("https://commerce.example/").unwrap();
        let valid_telegram = json!("https://t.me/share/url?url=https%3A%2F%2Fcommerce.example%2Fb%2Fabc%3Fsrc%3Dtelegram&text=Buy");
        assert!(share_url(&valid_telegram, &base, "abc", "telegram").is_ok());
        let valid_whatsapp = json!(
            "https://wa.me/?text=Buy%0Ahttps%3A%2F%2Fcommerce.example%2Fb%2Fabc%3Fsrc%3Dwhatsapp"
        );
        assert!(share_url(&valid_whatsapp, &base, "abc", "whatsapp").is_ok());
        for raw in [
            "https://evil.example/share/url?url=https%3A%2F%2Fcommerce.example%2Fb%2Fabc%3Fsrc%3Dtelegram&text=Buy",
            "https://user@t.me/share/url?url=https%3A%2F%2Fcommerce.example%2Fb%2Fabc%3Fsrc%3Dtelegram&text=Buy",
            "https://t.me/share/url?url=https%3A%2F%2Fcommerce.example%2Fb%2Fabc%3Fsrc%3Dtelegram&text=Buy#fragment",
            "https://t.me/share/url?url=https%3A%2F%2Fevil.example%2Fb%2Fabc%3Fsrc%3Dtelegram&text=Buy",
        ] {
            assert!(share_url(&json!(raw), &base, "abc", "telegram").is_err(), "{raw}");
        }
        assert!(share_url(
            &json!(
                "https://wa.me/?text=Buy%0Ahttps%3A%2F%2Fevil.example%2Fb%2Fabc%3Fsrc%3Dwhatsapp"
            ),
            &base,
            "abc",
            "whatsapp"
        )
        .is_err());
    }

    #[test]
    fn retained_link_selection_and_open_results_cover_every_channel() {
        let intent = valid_intent();
        for (channel, expected, opens) in [
            (CommerceChannel::Copy, &intent.public_url, false),
            (CommerceChannel::Livestream, &intent.livestream_url, true),
            (CommerceChannel::Telegram, &intent.telegram_url, true),
            (CommerceChannel::Whatsapp, &intent.whatsapp_url, true),
        ] {
            let (selected, selected_opens) = selected_commerce_link(&intent, channel);
            assert_eq!(selected, expected);
            assert_eq!(selected_opens, opens);
        }

        let mut links = HashMap::new();
        links.insert(intent.intent_id.clone(), intent.clone());
        assert_eq!(
            resolve_retained_commerce_link(&links, "intent-1", CommerceChannel::Copy),
            Ok((intent.public_url.clone(), intent.public_url.clone(), false))
        );
        assert_eq!(
            resolve_retained_commerce_link(&links, "unknown", CommerceChannel::Copy),
            Err("commerce_link_unknown".into())
        );

        let copy = commerce_open_result(
            intent.public_url.clone(),
            intent.public_url.clone(),
            false,
            |_| Err("launcher_should_not_run".into()),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(copy).unwrap(),
            json!({"publicUrl":intent.public_url,"opened":false})
        );
        let opened = commerce_open_result(
            intent.public_url.clone(),
            intent.telegram_url.clone(),
            true,
            |url| {
                assert_eq!(url, intent.telegram_url);
                Ok(())
            },
        )
        .unwrap();
        assert!(opened.opened);
        assert_eq!(
            commerce_open_result(
                intent.public_url.clone(),
                intent.whatsapp_url.clone(),
                true,
                |_| { Err("commerce_link_open_failed".into()) }
            ),
            Err("commerce_link_open_failed".into())
        );
    }
    #[test]
    fn events_drop_speech_and_project_only_allowlisted_fields() {
        assert!(project_event(&json!({"type":"subtitle","text":"private"})).is_none());
        assert!(project_event(&json!({"type":"state","audio":"private"})).is_none());
        assert!(project_event(&json!({"type":"session_state","is_live":"true"})).is_none());
        let event=project_event(&json!({"type":"commerce_conversion","live_session_id":"live-1","audio":"private","buyer":"private"})).unwrap();
        assert_eq!(
            event,
            json!({"version":EVENT_VERSION,"kind":"conversions-changed","liveSessionId":"live-1"})
        );
    }
    #[test]
    fn conversion_preserves_dedup_and_rejects_wrong_session() {
        let value = json!({"version":"yaatal.commerce-receipt.v1","order_id":"order-1","product_id":"1","product_name":"Bazin","total_fcfa":1000,"payment_provider":"wave","payment_status":"sandbox_paid","live_session_id":"live-1","source_channel":"copy","deduplicated":true,"quantity":1,"created_at":"2026-09-10T00:00:00Z"});
        assert!(conversion(&value, "live-1").unwrap().deduplicated);
        let mut not_deduplicated = value.clone();
        not_deduplicated["deduplicated"] = json!(false);
        assert!(
            !conversion(&not_deduplicated, "live-1")
                .unwrap()
                .deduplicated
        );
        assert!(conversion(&value, "different").is_err());
        let response = json!({"version":"yaatal.commerce-receipt.v1","live_session_id":"live-1","conversions":[value]});
        assert!(conversions_response(&response, "live-1").unwrap()[0].deduplicated);
        assert!(conversions_response(&response, "different").is_err());
        assert!(conversions_response(
            &json!({"live_session_id":"live-1","conversions":[]}),
            "live-1"
        )
        .is_err());
        let mut malformed = value.clone();
        malformed["quantity"] = json!(11);
        assert!(conversion(&malformed, "live-1").is_err());
        malformed["quantity"] = json!(1);
        malformed["total_fcfa"] = json!(1_000_000_001u64);
        assert!(conversion(&malformed, "live-1").is_err());
        malformed["total_fcfa"] = json!(1000);
        malformed["payment_provider"] = json!("untrusted");
        assert!(conversion(&malformed, "live-1").is_err());
    }

    #[test]
    fn lifecycle_invalidation_clears_retained_intents_and_rejects_stale_generations() {
        let mut state = session::SessionState::default();
        state
            .commerce_links
            .insert("intent-1".into(), valid_intent());
        let restart_generation = state.generation;
        state.studio_client = Some(http::client(true).expect("cookie client"));
        state.invalidate_studio();
        assert_eq!(
            state.check_generation(restart_generation),
            Err("session_changed".into())
        );
        assert!(state.studio_client.is_none());
        assert!(state.commerce_links.is_empty());

        state
            .commerce_links
            .insert("intent-2".into(), valid_intent());
        let logout_generation = state.generation;
        state.invalidate();
        assert_eq!(
            state.check_generation(logout_generation),
            Err("session_changed".into())
        );
        assert!(state.commerce_links.is_empty());
    }
}
