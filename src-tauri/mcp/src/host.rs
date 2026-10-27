//! The bridge server the app runs (design 018 E1/E3): listens on 127.0.0.1 on a random port,
//! writes the endpoint file with a fresh token, checks the token as the first line of every
//! connection and hands each request to a [`Handler`]. Stops on drop (port closed, file removed,
//! connections cut). Taken over from editlicious `src-tauri/src/mcp.rs` (`Server`, design 016) and
//! made generic, so it is testable without Tauri.

use crate::bridge::{
    self, BridgeError, Endpoint, Hello, HelloAnswer, MAX_LINE_BYTES, Request, Response,
};
use serde_json::Value;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

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
    streams: Arc<Mutex<Vec<TcpStream>>>,
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
        let streams = Arc::new(Mutex::new(Vec::new()));
        {
            let (stop, connections, streams) = (stop.clone(), connections.clone(), streams.clone());
            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    if stop.load(Ordering::SeqCst) {
                        break;
                    }
                    let Ok(stream) = stream else { continue };
                    if let Ok(c) = stream.try_clone() {
                        streams.lock().unwrap_or_else(|e| e.into_inner()).push(c);
                    }
                    let (handler, token, connections) =
                        (handler.clone(), token.clone(), connections.clone());
                    std::thread::spawn(move || serve(stream, &*handler, &token, &connections));
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
        for s in self
            .streams
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
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

/// One line, at most [`MAX_LINE_BYTES`]; a longer line is an error (the connection ends).
fn read_line(r: &mut BufReader<TcpStream>, line: &mut String) -> io::Result<usize> {
    line.clear();
    let n = r.by_ref().take(MAX_LINE_BYTES as u64 + 1).read_line(line)?;
    if n > MAX_LINE_BYTES {
        return Err(io::Error::other("line too long"));
    }
    Ok(n)
}

/// One connection: token first, then requests until it closes. Never logs contents.
fn serve(stream: TcpStream, handler: &dyn Handler, token: &str, connections: &AtomicUsize) {
    let Ok(mut w) = stream.try_clone() else {
        return;
    };
    let mut r = BufReader::new(stream);
    let mut line = String::new();
    if read_line(&mut r, &mut line).unwrap_or(0) == 0 {
        return;
    }
    let ok =
        serde_json::from_str::<Hello>(&line).is_ok_and(|h| bridge::same_token(&h.token, token));
    let answer = serde_json::to_string(&HelloAnswer { ok }).unwrap_or_default();
    if writeln!(w, "{answer}").is_err() || !ok {
        let _ = w.shutdown(Shutdown::Both);
        return;
    }
    let n = connections.fetch_add(1, Ordering::SeqCst) + 1;
    handler.status(n);
    while read_line(&mut r, &mut line).unwrap_or(0) > 0 {
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
    // the clone kept for `disconnect` would hold the socket open
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
}
