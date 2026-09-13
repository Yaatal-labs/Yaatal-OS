//! Native-only bridge from Studio's public loopback WebSocket to the renderer.
//!
//! The socket is an invalidation signal, never an authoritative data source.
//! Every message crosses `gateway::project_event` before it can reach the
//! webview, and the renderer re-fetches the corresponding native snapshot.

use crate::gateway;
use serde_json::Value;
use std::{
    io::ErrorKind,
    net::{IpAddr, SocketAddr, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tungstenite::{
    client::client_with_config,
    error::Error,
    protocol::{Message, WebSocketConfig},
};

pub const EVENT_NAME: &str = "yaatal://studio-event";
const MAX_EVENT_BYTES: usize = 16 * 1024;
const READ_TIMEOUT: Duration = Duration::from_millis(250);
const STOP_POLL: Duration = Duration::from_millis(50);
const RECONNECT_DELAYS: [Duration; 5] = [
    Duration::from_millis(100),
    Duration::from_millis(250),
    Duration::from_millis(500),
    Duration::from_secs(1),
    Duration::from_secs(2),
];

pub struct StudioEventBridge {
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl StudioEventBridge {
    pub fn start(app: AppHandle, host: IpAddr, port: u16) -> Self {
        debug_assert!(
            host.is_loopback(),
            "Studio public events must stay loopback-only"
        );
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let worker = thread::spawn(move || run(app, host, port, worker_stop));
        Self {
            stop,
            worker: Mutex::new(Some(worker)),
        }
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}

impl Drop for StudioEventBridge {
    fn drop(&mut self) {
        self.stop();
    }
}

fn run(app: AppHandle, host: IpAddr, port: u16, stop: Arc<AtomicBool>) {
    if !host.is_loopback() || port == 0 {
        return;
    }
    let address = SocketAddr::new(host, port);
    let url = format!("ws://{address}/ws");
    let config = WebSocketConfig::default()
        .read_buffer_size(4 * 1024)
        .max_message_size(Some(MAX_EVENT_BYTES))
        .max_frame_size(Some(MAX_EVENT_BYTES));
    let mut failures = 0usize;

    while !stop.load(Ordering::Acquire) {
        // Open the exact validated loopback address ourselves. This prevents
        // redirects and applies a timeout before the WebSocket handshake, so
        // shutdown cannot hang on a listener that accepts but never responds.
        let connection = TcpStream::connect_timeout(&address, READ_TIMEOUT).and_then(|stream| {
            stream.set_read_timeout(Some(READ_TIMEOUT))?;
            stream.set_write_timeout(Some(READ_TIMEOUT))?;
            Ok(stream)
        });
        match connection
            .ok()
            .and_then(|stream| client_with_config(url.as_str(), stream, Some(config)).ok())
        {
            Some((mut socket, _)) => {
                failures = 0;
                while !stop.load(Ordering::Acquire) {
                    match socket.read() {
                        Ok(message) => {
                            if let Some(event) = project_message(message) {
                                let _ = app.emit_to(crate::MAIN_WINDOW, EVENT_NAME, event);
                            }
                        }
                        Err(Error::Io(error))
                            if matches!(
                                error.kind(),
                                ErrorKind::WouldBlock | ErrorKind::TimedOut
                            ) =>
                        {
                            continue;
                        }
                        Err(_) => break,
                    }
                }
                let _ = socket.close(None);
            }
            None => {
                failures = failures.saturating_add(1);
            }
        }
        if !interruptible_wait(&stop, reconnect_delay(failures)) {
            break;
        }
    }
}

fn project_message(message: Message) -> Option<Value> {
    let Message::Text(text) = message else {
        // Binary/audio, ping/pong, raw frames and close bodies never cross the
        // bridge. Tungstenite still handles protocol control frames internally.
        return None;
    };
    if text.len() > MAX_EVENT_BYTES {
        return None;
    }
    let value: Value = serde_json::from_str(text.as_str()).ok()?;
    gateway::project_event(&value)
}

fn reconnect_delay(failures: usize) -> Duration {
    RECONNECT_DELAYS[failures
        .saturating_sub(1)
        .min(RECONNECT_DELAYS.len().saturating_sub(1))]
}

fn interruptible_wait(stop: &AtomicBool, duration: Duration) -> bool {
    let mut remaining = duration;
    while remaining > Duration::ZERO {
        if stop.load(Ordering::Acquire) {
            return false;
        }
        let step = remaining.min(STOP_POLL);
        thread::sleep(step);
        remaining = remaining.saturating_sub(step);
    }
    !stop.load(Ordering::Acquire)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn projects_only_bounded_allowlisted_text() {
        let projected = project_message(Message::Text(
            serde_json::to_string(&json!({
                "type":"commerce_conversion",
                "live_session_id":"live-1",
                "buyer":"private",
                "audio":"private"
            }))
            .unwrap()
            .into(),
        ));
        assert_eq!(
            projected,
            Some(json!({
                "version":"yaatal.studio.event.v1",
                "kind":"conversions-changed",
                "liveSessionId":"live-1"
            }))
        );
        assert!(project_message(Message::Text("not json".into())).is_none());
        assert!(project_message(Message::Text(
            format!(
                "{{\"type\":\"connected\",\"pad\":\"{}\"}}",
                "x".repeat(MAX_EVENT_BYTES)
            )
            .into()
        ))
        .is_none());
    }

    #[test]
    fn drops_unknown_binary_audio_and_control_frames() {
        assert!(project_message(Message::Text(
            r#"{"type":"subtitle","text":"private speech"}"#.into()
        ))
        .is_none());
        assert!(project_message(Message::Binary(vec![1, 2, 3].into())).is_none());
        assert!(project_message(Message::Ping(vec![1].into())).is_none());
        assert!(project_message(Message::Pong(vec![1].into())).is_none());
    }

    #[test]
    fn reconnect_backoff_is_bounded() {
        assert_eq!(reconnect_delay(1), Duration::from_millis(100));
        assert_eq!(reconnect_delay(3), Duration::from_millis(500));
        assert_eq!(reconnect_delay(100), Duration::from_secs(2));
    }

    #[test]
    fn shutdown_interrupts_reconnect_wait() {
        let stop = AtomicBool::new(true);
        assert!(!interruptible_wait(&stop, Duration::from_secs(2)));
    }
}
