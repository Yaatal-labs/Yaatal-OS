//! Native-only bounded HTTP transport. No renderer accepts a URL or request body.
use std::time::Duration;
use tauri_plugin_http::reqwest::{self, Client, Method, Url};

pub const MAX_RESPONSE: usize = 512 * 1024;
/// All native JSON payloads are fixed-contract and must remain small.
pub const MAX_REQUEST: usize = 64 * 1024;

pub fn client(cookies: bool) -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .cookie_store(cookies)
        .build()
        .map_err(|_| "native_http_unavailable".into())
}

pub fn engine_base(value: &str) -> Result<Url, String> {
    let url = Url::parse(&format!("{}/", value.trim().trim_end_matches('/')))
        .map_err(|_| "engine_configuration_invalid")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("engine_configuration_invalid".into());
    }
    Ok(url)
}

pub fn request_text(
    client: &Client,
    method: Method,
    url: Url,
    body: Option<serde_json::Value>,
    bearer: Option<&str>,
) -> Result<String, String> {
    let mut request = client.request(method, url.clone());
    if let Some(value) = body {
        let body = serde_json::to_vec(&value).map_err(|_| "request_invalid")?;
        if body.len() > MAX_REQUEST {
            return Err("request_too_large".into());
        }
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    if let Some(token) = bearer {
        request = request.bearer_auth(token);
    }
    tauri::async_runtime::handle().block_on(async move {
        let mut response = request.send().await.map_err(|_| "service_unavailable")?;
        if response.url() != &url {
            return Err("response_origin_rejected".into());
        }
        if !response.status().is_success() {
            return Err(match response.status().as_u16() {
                401 | 403 => "authentication_required",
                404 => "not_found",
                409 => "state_conflict",
                300..=399 => "redirect_rejected",
                _ => "service_request_failed",
            }
            .into());
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_RESPONSE as u64)
        {
            return Err("response_too_large".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "response_unreadable")? {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err("response_too_large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        String::from_utf8(bytes).map_err(|_| "response_invalid".into())
    })
}

#[cfg_attr(not(feature = "unified-ui"), allow(dead_code))]
pub fn request(
    client: &Client,
    method: Method,
    url: Url,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    serde_json::from_str(&request_text(client, method, url, body, None)?)
        .map_err(|_| "response_invalid".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn serve(responses: Vec<&'static str>) -> Url {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let address = listener.local_addr().expect("listener address");
        thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("test request");
                let mut request = [0; 2048];
                let size = stream.read(&mut request).expect("read request");
                if response == "COOKIE" {
                    let request = std::str::from_utf8(&request[..size]).expect("utf8 request");
                    assert!(request
                        .to_ascii_lowercase()
                        .contains("cookie: studio_session=opaque"));
                    stream
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                        )
                        .expect("write cookie response");
                } else {
                    stream
                        .write_all(response.as_bytes())
                        .expect("write response");
                }
            }
        });
        Url::parse(&format!("http://{address}/")).expect("test URL")
    }

    #[test]
    fn native_cookie_client_reuses_the_studio_cookie() {
        let base = serve(vec![
            "HTTP/1.1 200 OK\r\nSet-Cookie: studio_session=opaque; HttpOnly; Path=/\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
            "COOKIE",
        ]);
        let client = client(true).expect("cookie client");
        request(&client, Method::POST, base.join("bootstrap").unwrap(), None).unwrap();
        request(&client, Method::GET, base.join("session").unwrap(), None).unwrap();
    }

    #[test]
    fn redirects_are_rejected_without_following_them() {
        let base = serve(vec![
            "HTTP/1.1 302 Found\r\nLocation: http://example.invalid/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        ]);
        let client = client(false).expect("native client");
        assert_eq!(
            request_text(&client, Method::GET, base, None, None),
            Err("redirect_rejected".into())
        );
    }

    #[test]
    fn oversized_json_body_is_rejected_before_network_io() {
        let client = client(false).expect("native client");
        let body = serde_json::json!({"password":"a".repeat(MAX_REQUEST)});
        assert_eq!(
            request_text(
                &client,
                Method::POST,
                Url::parse("http://127.0.0.1:9/login").unwrap(),
                Some(body),
                None,
            ),
            Err("request_too_large".into())
        );
    }
}
