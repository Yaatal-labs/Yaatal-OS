//! A best-effort "is Kairmel up" check used once at startup to decide
//! whether to point the window at the Kairmel origin or at the local
//! offline page. Deliberately just a TCP connect (no HTTP client
//! dependency) - enough to tell "no network" / "DNS failure" / "nothing
//! listening" apart from "probably fine", which is all a thin shell needs.

use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use url::Url;

pub fn is_reachable(url: &Url, timeout: Duration) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let port = url.port_or_known_default().unwrap_or(443);

    match (host, port).to_socket_addrs() {
        Ok(addrs) => addrs
            .take(4)
            .any(|addr| TcpStream::connect_timeout(&addr, timeout).is_ok()),
        Err(_) => false,
    }
}
