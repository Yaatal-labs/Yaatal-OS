//! Typed local Studio boundary. Credentials, cookie jars and retained links stay native.
use crate::{http, sanitize_product_id, session, AppState, SidecarConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Command;
use tauri::{AppHandle, State};
use tauri_plugin_http::reqwest::{Client, Method, Url};

type Result<T> = std::result::Result<T, String>;

pub fn studio_origin(config: &SidecarConfig) -> Url {
    Url::parse(&format!(
        "http://{}/",
        std::net::SocketAddr::new(config.host, config.port)
    ))
    .expect("validated loopback config")
}

fn origin(state: &State<'_, AppState>) -> Result<Url> {
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

fn operator(state: &State<'_, AppState>) -> Result<(u64, Client)> {
    let current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.engine_token()?;
    Ok((
        current.generation,
        current
            .studio_client
            .clone()
            .ok_or("studio_authentication_required")?,
    ))
}

fn current(state: &State<'_, AppState>, generation: u64) -> Result<()> {
    state
        .session
        .lock()
        .map_err(|_| "session_unavailable")?
        .check_generation(generation)
}

fn studio_request(
    state: &State<'_, AppState>,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let (generation, client) = operator(state)?;
    let response = http::request(&client, method, endpoint(&origin(state)?, path)?, body)?;
    current(state, generation)?;
    Ok(response)
}

pub fn revoke(state: &State<'_, AppState>, client: &Client) -> Result<()> {
    http::request(
        client,
        Method::DELETE,
        endpoint(&origin(state)?, "api/studio/operator/session")?,
        None,
    )
    .map(|_| ())
}

pub fn invalidate_session(app: &AppHandle, state: &State<'_, AppState>) -> Result<()> {
    let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.invalidate_studio();
    let _ = session::emit_session(app, &current);
    Ok(())
}

pub fn invalidate_if_restart(app: &AppHandle, state: &State<'_, AppState>) -> Result<()> {
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

#[tauri::command]
pub fn studio_session_bootstrap(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Authenticated> {
    let (generation, token) = {
        let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
        let token = current.engine_token()?.to_owned();
        current.generation = current.generation.wrapping_add(1);
        current.studio_client = None;
        current.commerce_links.clear();
        (current.generation, token)
    };
    let client = http::client(true)?;
    let result = (|| {
        let body = session::engine_studio_bootstrap_start(&app, engine()?.as_str(), &token)?;
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

#[tauri::command]
pub fn studio_session_state(state: State<'_, AppState>) -> Result<StudioSession> {
    session_snapshot(&studio_request(
        &state,
        Method::GET,
        "api/studio/session-state",
        None,
    )?)
}

#[tauri::command]
pub fn studio_go_live(state: State<'_, AppState>) -> Result<StudioSession> {
    let name = state
        .session
        .lock()
        .map_err(|_| "session_unavailable")?
        .sanitized()
        .merchant_name
        .ok_or("authentication_required")?;
    studio_request(
        &state,
        Method::POST,
        "api/studio/go-live",
        Some(json!({"seller_name":name})),
    )?;
    studio_session_state(state)
}

#[tauri::command]
pub fn studio_stop_stream(state: State<'_, AppState>) -> Result<StudioSession> {
    studio_request(
        &state,
        Method::POST,
        "api/studio/stop-stream",
        Some(json!({})),
    )?;
    studio_session_state(state)
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

#[tauri::command]
#[allow(dead_code)]
pub fn studio_status(state: State<'_, AppState>) -> Result<StudioStatus> {
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

fn text(value: &Value, max: usize, empty: bool) -> Result<String> {
    value
        .as_str()
        .filter(|s| {
            s.len() <= max && (empty || !s.trim().is_empty()) && !s.chars().any(char::is_control)
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
        name: text(&value["name"], 200, false)?,
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

#[tauri::command]
#[allow(dead_code)]
pub fn catalog_list(page: Option<u64>, category: Option<String>) -> Result<CatalogPage> {
    let page = page.unwrap_or(1);
    if !(1..=10000).contains(&page) {
        return Err("page_invalid".into());
    }
    let mut url = endpoint(&engine()?, "api/catalog")?;
    url.query_pairs_mut()
        .append_pair("page", &page.to_string())
        .append_pair("per_page", "20");
    if let Some(category) = category {
        let category = text(&Value::String(category), 120, false)?;
        url.query_pairs_mut().append_pair("category", &category);
    }
    let value = http::request(&http::client(false)?, Method::GET, url, None)?;
    Ok(CatalogPage {
        products: array(&value["products"], 100)?
            .iter()
            .map(product)
            .collect::<Result<_>>()?,
        total: number(&value["total"], 10_000_000)?,
        page: number(&value["page"], 10000)?,
        per_page: number(&value["per_page"], 100)?,
    })
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
#[allow(dead_code)]
pub fn catalog_product(product_id: String) -> Result<CatalogProduct> {
    fetch_product(product_id)
}

#[derive(Serialize)]
#[allow(dead_code)]
pub struct ProductQueue {
    products: Vec<CatalogProduct>,
    source: String,
}
#[tauri::command]
#[allow(dead_code)]
pub fn studio_product_queue(state: State<'_, AppState>) -> Result<ProductQueue> {
    let value = http::request(
        &http::client(false)?,
        Method::GET,
        endpoint(&origin(&state)?, "api/studio/product-queue")?,
        None,
    )?;
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

#[allow(dead_code)]
fn public_base(state: &State<'_, AppState>) -> Result<Url> {
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

#[tauri::command]
#[allow(dead_code)]
pub fn studio_create_commerce_intent(
    state: State<'_, AppState>,
    product_id: String,
) -> Result<CommerceIntent> {
    let (generation, _) = operator(&state)?;
    let p = fetch_product(product_id)?;
    if p.stock == 0 || p.price_fcfa < 100 {
        return Err("product_unavailable".into());
    }
    // This is the authoritative Engine snapshot. Renderer-supplied prices/media are never accepted.
    let body = json!({"product":{"id":p.id,"name":p.name,"description":p.description.map(|s|s.chars().take(280).collect::<String>()),
        "price_fcfa":p.price_fcfa,"stock":p.stock,"category":p.category,"images":p.images,"variants":p.variants}});
    current(&state, generation)?;
    let value = studio_request(
        &state,
        Method::POST,
        "api/studio/poc/commerce-intents",
        Some(body),
    )?;
    let result = intent(&value, &public_base(&state)?, &p.id)?;
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
#[allow(dead_code)]
pub fn open_commerce_link(
    state: State<'_, AppState>,
    intent_id: String,
    channel: CommerceChannel,
) -> Result<()> {
    let intent_id = id(&Value::String(intent_id))?;
    let current = state.session.lock().map_err(|_| "session_unavailable")?;
    current.engine_token()?;
    let link = current
        .commerce_links
        .get(&intent_id)
        .ok_or("commerce_link_unknown")?;
    let url = match channel {
        CommerceChannel::Copy => &link.public_url,
        CommerceChannel::Livestream => &link.livestream_url,
        CommerceChannel::Telegram => &link.telegram_url,
        CommerceChannel::Whatsapp => &link.whatsapp_url,
    };
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
    command
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|_| "commerce_link_open_failed".into())
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
#[tauri::command]
#[allow(dead_code)]
pub fn studio_conversions(
    state: State<'_, AppState>,
    live_session_id: String,
) -> Result<Vec<Conversion>> {
    let session_id = id(&Value::String(live_session_id))?;
    let value = studio_request(
        &state,
        Method::GET,
        &format!("api/studio/poc/conversions?live_session_id={session_id}"),
        None,
    )?;
    if value["version"] != "yaatal.commerce-receipt.v1" || value["live_session_id"] != session_id {
        return Err("conversion_payload_invalid".into());
    }
    array(&value["conversions"], 1000)?
        .iter()
        .map(|v| conversion(v, &session_id))
        .collect()
}

#[allow(dead_code)] // Public event transport is deferred to UIR-01B.
const EVENT_VERSION: &str = "yaatal.studio.event.v1";
#[allow(dead_code)] // Public event transport is deferred to UIR-01B.
pub fn project_event(value: &Value) -> Option<Value> {
    let kind = value["type"].as_str()?;
    let mut event = json!({"version":EVENT_VERSION});
    match kind {
        "session_state" => {
            event["kind"] = json!("session-state");
            event["isLive"] = json!(value["is_live"].as_bool()?);
            if !value["session_id"].is_null() {
                event["sessionId"] = json!(id(&value["session_id"]).ok()?);
            }
        }
        "commerce_conversion" => {
            event["kind"] = json!("conversions-changed");
            event["liveSessionId"] = json!(id(&value["live_session_id"]).ok()?);
        }
        "commerce_intent_created" => {
            event["kind"] = json!("catalog-changed");
            event["productId"] = json!(id(&value["product_id"]).ok()?);
        }
        "governed_action" => {
            event["kind"] = json!("governed-action");
            let decision = value["decision"].as_str()?;
            if !matches!(decision, "allow" | "deny" | "noop") {
                return None;
            }
            event["decision"] = json!(decision);
            event["turnId"] = json!(id(&value["turn_id"]).ok()?);
            let action = value
                .get("action")
                .or_else(|| value["proposal"].get("tool"))?
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
        assert!(serde_json::from_str::<CommerceChannel>("\"shell\"").is_err());
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
        assert!(conversion(&value, "different").is_err());
    }
}
