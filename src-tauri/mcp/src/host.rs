//! The bridge server the app runs (design 018 E1/E3): listens on 127.0.0.1 on a random port,
//! writes the endpoint file with a fresh token, checks the token as the first line of every
//! connection and hands each request to a [`Handler`]. Stops on drop (port closed, file removed,
//! connections cut). Taken over from editlicious `src-tauri/src/mcp.rs` (`Server`, design 016) and
//! made generic, so it is testable without Tauri.

use crate::bridge::{
    self, BridgeError, Endpoint, Hello, HelloAnswer, MAX_LINE_BYTES, Request, Response,
};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Most open sockets at a time (connected clients and ones still saying hello; prompt 031).
pub const MAX_OPEN: usize = 16;
/// Time a new connection has for its hello line.
pub const HELLO_TIMEOUT: Duration = Duration::from_secs(5);
/// Longest hello line (a token is 64 hex digits).
pub const MAX_HELLO_BYTES: usize = 1024;

/// The authenticated connections, by id (for `disconnect`); removed when they end.
type Streams = Arc<Mutex<HashMap<u64, TcpStream>>>;

/// What runs the tools in the app.
pub trait Handler: Send + Sync + 'static {
    fn call(&self, tool: &str, args: &Value) -> Result<Value, BridgeError>;
    /// The number of connected clients changed.
    fn status(&self, _connections: usize) {}
}

/// The running bridge.
pub struct Host {
    pub port: u16,
    endpoint_file: PathBuf,
    stop: Arc<AtomicBool>,
    connections: Arc<AtomicUsize>,
    streams: Streams,
}

impl Host {
    pub fn start(handler: Arc<dyn Handler>, endpoint_file: &Path) -> io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        let token = bridge::new_token();
        bridge::write_endpoint(
            endpoint_file,
            &Endpoint {
                port,
                token: token.clone(),
                pid: std::process::id(),
            },
        )?;
        let stop = Arc::new(AtomicBool::new(false));
        let connections = Arc::new(AtomicUsize::new(0));
        let streams: Streams = Arc::new(Mutex::new(HashMap::new()));
        {
            let (stop, connections, streams) = (stop.clone(), connections.clone(), streams.clone());
            let open = Arc::new(AtomicUsize::new(0));
            let ids = AtomicU64::new(0);
            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    if stop.load(Ordering::SeqCst) {
                        break;
                    }
                    let Ok(stream) = stream else { continue };
                    // a cap on open sockets: a flood of connections cannot use up the app's
                    // file descriptors or threads (prompt 031)
                    if open.fetch_add(1, Ordering::SeqCst) >= MAX_OPEN {
                        open.fetch_sub(1, Ordering::SeqCst);
                        let _ = stream.shutdown(Shutdown::Both);
                        continue;
                    }
                    let id = ids.fetch_add(1, Ordering::SeqCst);
                    let (handler, token, connections, streams, open) = (
                        handler.clone(),
                        token.clone(),
                        connections.clone(),
                        streams.clone(),
                        open.clone(),
                    );
                    std::thread::spawn(move || {
                        serve(stream, id, &*handler, &token, &connections, &streams);
                        open.fetch_sub(1, Ordering::SeqCst);
                    });
                }
            });
        }
        Ok(Self {
            port,
            endpoint_file: endpoint_file.to_path_buf(),
            stop,
            connections,
            streams,
        })
    }

    pub fn connections(&self) -> usize {
        self.connections.load(Ordering::SeqCst)
    }

    /// Closes every connection (the listener stays).
    pub fn disconnect(&self) {
        for (_, s) in self
            .streams
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain()
        {
            let _ = s.shutdown(Shutdown::Both);
        }
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.disconnect();
        // wake the accept loop so it sees `stop`
        let _ = TcpStream::connect(("127.0.0.1", self.port));
        let _ = std::fs::remove_file(&self.endpoint_file);
    }
}

/// One line, at most `max` bytes; a longer line is an error (the connection ends).
fn read_line(r: &mut BufReader<TcpStream>, line: &mut String, max: usize) -> io::Result<usize> {
    line.clear();
    let n = r.by_ref().take(max as u64 + 1).read_line(line)?;
    if n > max {
        return Err(io::Error::other("line too long"));
    }
    Ok(n)
}

/// One connection: token first (short line, short time), then requests until it closes. Never
/// logs contents.
fn serve(
    stream: TcpStream,
    id: u64,
    handler: &dyn Handler,
    token: &str,
    connections: &AtomicUsize,
    streams: &Streams,
) {
    let Ok(mut w) = stream.try_clone() else {
        return;
    };
    let _ = stream.set_read_timeout(Some(HELLO_TIMEOUT));
    let mut r = BufReader::new(stream);
    let mut line = String::new();
    if read_line(&mut r, &mut line, MAX_HELLO_BYTES).unwrap_or(0) == 0 {
        let _ = w.shutdown(Shutdown::Both);
        return;
    }
    let ok =
        serde_json::from_str::<Hello>(&line).is_ok_and(|h| bridge::same_token(&h.token, token));
    let answer = serde_json::to_string(&HelloAnswer { ok }).unwrap_or_default();
    if writeln!(w, "{answer}").is_err() || !ok {
        let _ = w.shutdown(Shutdown::Both);
        return;
    }
    let _ = r.get_ref().set_read_timeout(None);
    if let Ok(c) = w.try_clone() {
        streams
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, c);
    }
    let n = connections.fetch_add(1, Ordering::SeqCst) + 1;
    handler.status(n);
    while read_line(&mut r, &mut line, MAX_LINE_BYTES).unwrap_or(0) > 0 {
        let resp = match serde_json::from_str::<Request>(&line) {
            Ok(req) => match handler.call(&req.tool, &req.args) {
                Ok(v) => Response {
                    id: req.id,
                    result: Some(v),
                    error: None,
                },
                Err(e) => Response {
                    id: req.id,
                    result: None,
                    error: Some(e),
                },
            },
            Err(e) => Response {
                id: 0,
                result: None,
                error: Some(BridgeError::new("invalid_request", e.to_string())),
            },
        };
        let text = serde_json::to_string(&resp).unwrap_or_default();
        if writeln!(w, "{text}").is_err() {
            break;
        }
    }
    // the clone kept for `disconnect` goes with the connection (no descriptor left behind)
    streams
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id);
    let _ = w.shutdown(Shutdown::Both);
    let n = connections.fetch_sub(1, Ordering::SeqCst) - 1;
    handler.status(n);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::BridgeClient;
    use crate::server::Tools as _;
    use serde_json::json;

    #[derive(Default)]
    struct Echo(Mutex<Vec<usize>>);

    impl Handler for Echo {
        fn call(&self, tool: &str, args: &Value) -> Result<Value, BridgeError> {
            match tool {
                "fail" => Err(BridgeError::new("revision_conflict", "changed")),
                _ => Ok(json!({"tool": tool, "args": args})),
            }
        }
        fn status(&self, n: usize) {
            self.0.lock().unwrap().push(n);
        }
    }

    #[test]
    fn the_sidecar_client_talks_to_the_host() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let echo = Arc::new(Echo::default());
        let host = Host::start(echo.clone(), &file).unwrap();
        let mut c = BridgeClient::new(Some(file.clone()));
        let r = c.call("get_tree", json!({"max_nodes": 3})).unwrap();
        assert_eq!(r, json!({"tool": "get_tree", "args": {"max_nodes": 3}}));
        let e = c.call("fail", json!({})).unwrap_err();
        assert_eq!(e.code, "revision_conflict");
        assert_eq!(host.connections(), 1);
        // a wrong token is turned away
        let mut ep = bridge::read_endpoint(&file).unwrap();
        ep.token = bridge::new_token();
        let other = dir.path().join("other.json");
        bridge::write_endpoint(&other, &ep).unwrap();
        let e = BridgeClient::new(Some(other))
            .call("get_tree", json!({}))
            .unwrap_err();
        assert!(e.message.contains("refused"));
        host.disconnect();
        drop(host);
        assert!(!file.exists(), "the endpoint file goes with the host");
        assert_eq!(echo.0.lock().unwrap()[0], 1);
        // nothing listens any more
        let e = BridgeClient::new(Some(file))
            .call("x", json!({}))
            .unwrap_err();
        assert_eq!(e.code, "not_running");
    }

    #[test]
    fn a_line_over_the_limit_ends_the_connection() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let _host = Host::start(Arc::new(Echo::default()), &file).unwrap();
        let ep = bridge::read_endpoint(&file).unwrap();
        let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
        let mut w = s.try_clone().unwrap();
        let mut r = BufReader::new(s);
        writeln!(
            w,
            "{}",
            serde_json::to_string(&Hello { token: ep.token }).unwrap()
        )
        .unwrap();
        let mut line = String::new();
        r.read_line(&mut line).unwrap();
        assert!(line.contains("true"));
        // more than the limit without a newline: the host stops reading and closes
        let chunk = vec![b'x'; 1 << 20];
        let mut written = 0;
        while written <= MAX_LINE_BYTES + (1 << 20) {
            if w.write_all(&chunk).is_err() {
                break;
            }
            written += chunk.len();
        }
        line.clear();
        assert_eq!(r.read_line(&mut line).unwrap_or(0), 0, "closed");
    }

    #[test]
    fn a_bad_request_line_gets_an_error_answer() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let _host = Host::start(Arc::new(Echo::default()), &file).unwrap();
        let ep = bridge::read_endpoint(&file).unwrap();
        let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
        let mut w = s.try_clone().unwrap();
        let mut r = BufReader::new(s);
        writeln!(
            w,
            "{}",
            serde_json::to_string(&Hello { token: ep.token }).unwrap()
        )
        .unwrap();
        let mut line = String::new();
        r.read_line(&mut line).unwrap();
        writeln!(w, "not json").unwrap();
        line.clear();
        r.read_line(&mut line).unwrap();
        let resp: Response = serde_json::from_str(&line).unwrap();
        assert_eq!(resp.error.unwrap().code, "invalid_request");
    }

    fn hello(w: &mut TcpStream, r: &mut BufReader<TcpStream>, token: &str) -> String {
        writeln!(
            w,
            "{}",
            serde_json::to_string(&Hello {
                token: token.into()
            })
            .unwrap()
        )
        .unwrap();
        let mut line = String::new();
        r.read_line(&mut line).unwrap_or(0);
        line
    }

    fn open_fds() -> Option<usize> {
        std::fs::read_dir("/proc/self/fd").ok().map(|d| d.count())
    }

    fn wait_until(mut f: impl FnMut() -> bool) -> bool {
        for _ in 0..200 {
            if f() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        f()
    }

    #[test]
    fn closed_connections_leave_no_descriptors_behind() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let host = Host::start(Arc::new(Echo::default()), &file).unwrap();
        let ep = bridge::read_endpoint(&file).unwrap();
        let before = open_fds();
        for i in 0..50 {
            let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
            let mut w = s.try_clone().unwrap();
            let mut r = BufReader::new(s);
            // every other one with a wrong token
            let token = if i % 2 == 0 {
                ep.token.clone()
            } else {
                "x".repeat(64)
            };
            hello(&mut w, &mut r, &token);
        }
        let streams = host.streams.clone();
        assert!(
            wait_until(|| streams.lock().unwrap().is_empty()),
            "no kept clones"
        );
        assert!(wait_until(|| host.connections() == 0));
        if let Some(before) = before {
            // sockets close asynchronously; allow a little slack
            assert!(
                wait_until(|| open_fds().unwrap() <= before + 2),
                "descriptors leak"
            );
        }
    }

    #[test]
    fn a_long_hello_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let _host = Host::start(Arc::new(Echo::default()), &file).unwrap();
        let ep = bridge::read_endpoint(&file).unwrap();
        let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
        let mut w = s.try_clone().unwrap();
        let mut r = BufReader::new(s);
        let _ = w.write_all(&vec![b'x'; MAX_HELLO_BYTES + 10]);
        let _ = writeln!(w);
        let mut line = String::new();
        assert_eq!(
            r.read_line(&mut line).unwrap_or(0),
            0,
            "closed without an answer"
        );
    }

    #[test]
    fn a_silent_client_is_dropped_after_the_hello_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let _host = Host::start(Arc::new(Echo::default()), &file).unwrap();
        let ep = bridge::read_endpoint(&file).unwrap();
        let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
        s.set_read_timeout(Some(HELLO_TIMEOUT * 3)).unwrap();
        let t = std::time::Instant::now();
        let mut line = String::new();
        let n = BufReader::new(s).read_line(&mut line).unwrap_or(0);
        assert_eq!(n, 0);
        assert!(t.elapsed() < HELLO_TIMEOUT * 2);
    }

    #[test]
    fn too_many_open_sockets_are_turned_away() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mcp.json");
        let _host = Host::start(Arc::new(Echo::default()), &file).unwrap();
        let ep = bridge::read_endpoint(&file).unwrap();
        // MAX_OPEN silent sockets hold every place
        let held: Vec<_> = (0..MAX_OPEN)
            .map(|_| TcpStream::connect(("127.0.0.1", ep.port)).unwrap())
            .collect();
        std::thread::sleep(Duration::from_millis(100));
        let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let mut line = String::new();
        let n = BufReader::new(s).read_line(&mut line).unwrap_or(0);
        assert_eq!(n, 0, "closed at once");
        drop(held);
        // places free up again
        let ok = wait_until(|| {
            let s = TcpStream::connect(("127.0.0.1", ep.port)).unwrap();
            let mut w = s.try_clone().unwrap();
            let mut r = BufReader::new(s);
            hello(&mut w, &mut r, &ep.token).contains("true")
        });
        assert!(ok);
    }
}
