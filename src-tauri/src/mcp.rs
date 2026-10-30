//! AI control over MCP, the app's side (design 018 E4–E15): the tools of the `app-iconic-mcp`
//! sidecar arrive here over the bridge ([`ai_mcp::host`]). The [`Router`] checks and bounds the
//! arguments, finds the window of the document and hands the call to that window's frontend,
//! which runs it on its document (001 E8: the document lives in the WebView) and answers.
//! Pure apart from the [`WindowHost`] – the Tauri one is in `mcp_commands.rs`, tests use a fake.
//! The idea of the tool layer comes from editlicious `src-tauri/src/mcp.rs` (design 016).

pub use crate::mcp_args::{absolute, check_args};
use crate::mcp_args::{bound, file_paths, timeout_of};
use ai_mcp::bridge::BridgeError;
use ai_mcp::tools;
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

/// How long a window may take for a call (design 018 E4).
pub const CALL_TIMEOUT: Duration = Duration::from_secs(30);
/// Saving and exporting may ask the user first (E13).
pub const FILE_TIMEOUT: Duration = Duration::from_secs(300);
/// A short question to every window (`list_documents`).
pub const DESCRIBE_TIMEOUT: Duration = Duration::from_secs(3);
/// How long a new window may take until its frontend listens (E5).
pub const READY_TIMEOUT: Duration = Duration::from_secs(20);
/// Largest answer of a window (E15).
pub const MAX_REPLY_BYTES: usize = 8 << 20;

pub type CallResult = Result<Value, BridgeError>;

pub fn err(code: &str, message: impl Into<String>) -> BridgeError {
    BridgeError::new(code, message)
}

/// What the router needs from the app: the windows and their frontends.
pub trait WindowHost: Send + Sync + 'static {
    /// Labels of the document windows (`main`, `doc-<n>`).
    fn labels(&self) -> Vec<String>;
    /// The last active document window.
    fn active(&self) -> Option<String>;
    /// Runs `tool` in the frontend of window `label` and waits for its answer.
    fn call(&self, label: &str, tool: &str, args: Value, timeout: Duration) -> CallResult;
    /// Opens a new, empty document window; returns once its frontend listens.
    fn open_window(&self) -> Result<String, BridgeError>;
    /// Brings a window to the front (and makes it the active one).
    fn focus(&self, label: &str) -> bool;
    /// The window that shows `path`.
    fn showing(&self, path: &str) -> Option<String>;
    /// A path the AI hands over counts as trusted from now on (prompt 033 E1, `UserPaths`).
    fn allow_path(&self, path: &str);
    /// `svg` as a base64 PNG of `size` px (+ transparency), design 018 E8.
    fn render(&self, svg: &str, size: u32) -> Result<(String, bool), BridgeError>;
}

/// Open calls to window frontends and which windows listen (design 018 E4/E5).
#[derive(Default)]
pub struct Calls {
    next: AtomicU64,
    pending: Mutex<HashMap<u64, (String, Sender<CallResult>)>>,
    ready: Mutex<HashSet<String>>,
    ready_changed: Condvar,
}

impl Calls {
    /// A new call to `label`: its id and where the answer arrives.
    pub fn begin(&self, label: &str) -> (u64, Receiver<CallResult>) {
        let id = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = channel();
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, (label.to_owned(), tx));
        (id, rx)
    }

    /// The answer of a window; `false` if the call is unknown (timed out, or someone else's).
    pub fn complete(&self, id: u64, from: &str, result: CallResult) -> bool {
        let mut p = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        match p.get(&id) {
            Some((label, _)) if label == from => {}
            _ => return false,
        }
        let (_, tx) = p.remove(&id).expect("checked above");
        let result = result.and_then(|v| {
            let n = serde_json::to_string(&v).map_or(0, |s| s.len());
            if n > MAX_REPLY_BYTES {
                Err(err(
                    "too_large",
                    format!("the answer has {n} bytes, limit {MAX_REPLY_BYTES}"),
                ))
            } else {
                Ok(v)
            }
        });
        tx.send(result).is_ok()
    }

    /// Forgets a call (timed out).
    pub fn cancel(&self, id: u64) {
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
    }

    /// Waits for the answer of call `id`.
    pub fn wait(&self, id: u64, rx: &Receiver<CallResult>, timeout: Duration) -> CallResult {
        match rx.recv_timeout(timeout) {
            Ok(r) => r,
            Err(_) => {
                self.cancel(id);
                Err(err(
                    "timeout",
                    format!("the window did not answer within {} s", timeout.as_secs()),
                ))
            }
        }
    }

    pub fn mark_ready(&self, label: &str) {
        self.ready
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(label.to_owned());
        self.ready_changed.notify_all();
    }

    pub fn is_ready(&self, label: &str) -> bool {
        self.ready
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains(label)
    }

    /// Waits until `label` reported ready; `false` after `timeout`.
    pub fn wait_ready(&self, label: &str, timeout: Duration) -> bool {
        let end = Instant::now() + timeout;
        let mut ready = self.ready.lock().unwrap_or_else(|e| e.into_inner());
        while !ready.contains(label) {
            let left = end.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return false;
            }
            ready = self
                .ready_changed
                .wait_timeout(ready, left)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        true
    }

    /// A window closed: it is no longer ready, its open calls fail.
    pub fn window_gone(&self, label: &str) {
        self.ready
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(label);
        let mut p = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        let ids: Vec<u64> = p
            .iter()
            .filter(|(_, (l, _))| l == label)
            .map(|(id, _)| *id)
            .collect();
        for id in ids {
            if let Some((_, tx)) = p.remove(&id) {
                let _ = tx.send(Err(err("unknown_document", "the window was closed")));
            }
        }
    }
}

// ------------------------------------------------------------------ router

/// The tools, run on the windows of the app.
pub struct Router<H: WindowHost> {
    pub host: H,
}

impl<H: WindowHost> Router<H> {
    pub fn new(host: H) -> Self {
        Self { host }
    }

    /// The window of `id` – or the active one, or the first.
    fn label_of(&self, args: &Map<String, Value>) -> Result<String, BridgeError> {
        let labels = self.host.labels();
        if let Some(id) = args.get("id").and_then(Value::as_str) {
            return if labels.iter().any(|l| l == id) {
                Ok(id.to_owned())
            } else {
                Err(err("unknown_document", format!("no open document {id}")))
            };
        }
        self.host
            .active()
            .filter(|a| labels.contains(a))
            .or_else(|| labels.first().cloned())
            .ok_or_else(|| err("unknown_document", "no document is open – use new_document"))
    }

    fn describe(&self, label: &str, timeout: Duration) -> CallResult {
        let mut d = self.host.call(label, "describe", json!({}), timeout)?;
        if let Some(o) = d.as_object_mut() {
            o.insert("id".into(), json!(label));
            o.insert(
                "active".into(),
                json!(self.host.active().as_deref() == Some(label)),
            );
        }
        Ok(d)
    }

    fn pristine_window(&self) -> Option<String> {
        self.host.labels().into_iter().find(|l| {
            self.host
                .call(l, "describe", json!({}), DESCRIBE_TIMEOUT)
                .is_ok_and(|d| d["pristine"] == true)
        })
    }

    /// Runs one tool of the MCP server.
    pub fn call(&self, tool: &str, args: &Value) -> CallResult {
        let mut a = check_args(tool, args)?;
        bound(tool, &mut a)?;
        // the user switched the bridge on (and is asked before file access, 018 E13): the paths
        // of the AI may reach the file commands (prompt 033 E1)
        for p in file_paths(tool, &a) {
            self.host.allow_path(&p);
        }
        match tool {
            "list_documents" => {
                let docs: Vec<Value> = self
                    .host
                    .labels()
                    .iter()
                    .filter_map(|l| self.describe(l, DESCRIBE_TIMEOUT).ok())
                    .collect();
                Ok(json!({ "documents": docs }))
            }
            "new_document" => {
                let label = match self.pristine_window() {
                    Some(l) => l,
                    None => self.host.open_window()?,
                };
                self.host.focus(&label);
                self.describe(&label, CALL_TIMEOUT)
            }
            "open_document" => {
                let path = a["path"].as_str().unwrap_or("").to_owned();
                absolute(&path)?;
                if let Some(label) = self.host.showing(&path) {
                    self.host.focus(&label);
                    return self.describe(&label, CALL_TIMEOUT);
                }
                let (label, fresh) = match self.pristine_window() {
                    Some(l) => (l, false),
                    None => (self.host.open_window()?, true),
                };
                if let Err(e) =
                    self.host
                        .call(&label, "open", json!({ "path": path }), FILE_TIMEOUT)
                {
                    if fresh {
                        let _ = self
                            .host
                            .call(&label, "discard", json!({}), DESCRIBE_TIMEOUT);
                    }
                    return Err(e);
                }
                self.host.focus(&label);
                self.describe(&label, CALL_TIMEOUT)
            }
            "activate_document" => {
                let label = self.label_of(&a)?;
                self.host.focus(&label);
                self.describe(&label, CALL_TIMEOUT)
            }
            "render_preview" => {
                let label = self.label_of(&a)?;
                let size = a
                    .get("size")
                    .and_then(Value::as_u64)
                    .unwrap_or(tools::PREVIEW_DEFAULT) as u32;
                let appearance = a
                    .get("appearance")
                    .and_then(Value::as_str)
                    .unwrap_or("light")
                    .to_owned();
                let mask = a
                    .get("mask")
                    .and_then(Value::as_str)
                    .unwrap_or("squircle")
                    .to_owned();
                // the tint of the tinted approximation (prompt 077), checked by the window
                let tint = a.get("tint").cloned().unwrap_or(Value::Null);
                let out = self.host.call(
                    &label,
                    "preview_svg",
                    json!({ "appearance": appearance, "mask": mask, "tint": tint }),
                    CALL_TIMEOUT,
                )?;
                let svg = out["svg"]
                    .as_str()
                    .ok_or_else(|| err("io", "the window sent no SVG"))?;
                let (data, transparent) = self.host.render(svg, size)?;
                Ok(json!({
                    "image": { "mimeType": "image/png", "data": data },
                    "id": label,
                    "size": size,
                    "appearance": appearance,
                    "mask": mask,
                    "transparent": transparent,
                    "revision": out["revision"],
                }))
            }
            _ => {
                let label = self.label_of(&a)?;
                a.remove("id");
                self.host
                    .call(&label, tool, Value::Object(a), timeout_of(tool))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// Windows with a fake frontend: `describe` from a table, everything else recorded.
    #[derive(Default)]
    struct Fake {
        windows: Mutex<Vec<(String, Value)>>,
        active: Mutex<Option<String>>,
        log: Mutex<Vec<String>>,
        allowed: Mutex<Vec<String>>,
        fail_open: bool,
    }

    impl Fake {
        fn with(windows: &[(&str, Value)]) -> Self {
            let f = Self::default();
            *f.windows.lock().unwrap() = windows
                .iter()
                .map(|(l, d)| ((*l).to_owned(), d.clone()))
                .collect();
            f
        }
        fn log(&self) -> Vec<String> {
            self.log.lock().unwrap().clone()
        }
    }

    impl WindowHost for Fake {
        fn labels(&self) -> Vec<String> {
            self.windows
                .lock()
                .unwrap()
                .iter()
                .map(|(l, _)| l.clone())
                .collect()
        }
        fn active(&self) -> Option<String> {
            self.active.lock().unwrap().clone()
        }
        fn call(&self, label: &str, tool: &str, args: Value, _: Duration) -> CallResult {
            self.log
                .lock()
                .unwrap()
                .push(format!("{label}:{tool}:{args}"));
            let w = self.windows.lock().unwrap();
            let d = &w.iter().find(|(l, _)| l == label).expect("window").1;
            match tool {
                "describe" => Ok(d.clone()),
                "open" if self.fail_open => Err(err("not_found", "no such file")),
                "preview_svg" => Ok(json!({
                    "svg": r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#f00"/></svg>"##,
                    "revision": 3
                })),
                _ => Ok(json!({ "ran": tool, "args": args })),
            }
        }
        fn open_window(&self) -> Result<String, BridgeError> {
            let mut w = self.windows.lock().unwrap();
            let label = format!("doc-{}", w.len());
            w.push((label.clone(), json!({"pristine": true, "name": "Untitled"})));
            self.log
                .lock()
                .unwrap()
                .push(format!("open_window:{label}"));
            Ok(label)
        }
        fn focus(&self, label: &str) -> bool {
            *self.active.lock().unwrap() = Some(label.to_owned());
            true
        }
        fn showing(&self, path: &str) -> Option<String> {
            self.windows
                .lock()
                .unwrap()
                .iter()
                .find(|(_, d)| d["path"] == path)
                .map(|(l, _)| l.clone())
        }
        fn allow_path(&self, path: &str) {
            self.allowed.lock().unwrap().push(path.to_owned());
        }
        fn render(&self, svg: &str, size: u32) -> Result<(String, bool), BridgeError> {
            let fonts = ai_core::export::fonts::system_fonts();
            ai_core::export::png::preview_base64(svg, size, fonts).map_err(|e| err("io", e.message))
        }
    }

    fn doc(path: Option<&str>, pristine: bool) -> Value {
        json!({"name": "x.icon", "path": path, "pristine": pristine, "revision": 1})
    }

    #[test]
    fn calls_go_to_the_window_of_the_id_or_the_active_one() {
        let r = Router::new(Fake::with(&[
            ("main", doc(None, false)),
            ("doc-1", doc(Some("a.icon"), false)),
        ]));
        r.call("get_tree", &json!({"id": "doc-1"})).unwrap();
        r.call("get_selection", &json!({})).unwrap();
        *r.host.active.lock().unwrap() = Some("doc-1".into());
        r.call("get_document", &json!({})).unwrap();
        let log = r.host.log();
        assert_eq!(
            log[0], r#"doc-1:get_tree:{"max_nodes":500}"#,
            "id gone, default set"
        );
        assert_eq!(
            log[1], "main:get_selection:{}",
            "no active window: the first"
        );
        assert_eq!(log[2], "doc-1:get_document:{}");
        let e = r.call("get_tree", &json!({"id": "doc-9"})).unwrap_err();
        assert_eq!(e.code, "unknown_document");
        let e = Router::new(Fake::default())
            .call("get_tree", &json!({}))
            .unwrap_err();
        assert_eq!(e.code, "unknown_document");
    }

    #[test]
    fn arguments_are_checked_and_bounded() {
        let r = Router::new(Fake::with(&[("main", doc(None, true))]));
        for (tool, args) in [
            ("get_tree", json!({"max_nodes": 0})),
            ("get_tree", json!({"max_nodes": 9000})),
            ("get_asset_svg", json!({})),
            (
                "get_asset_svg",
                json!({"asset": "a.svg", "max_chars": 300000}),
            ),
            ("get_node", json!({"node": {"asset": "a.svg"}})),
            (
                "get_node",
                json!({"node": {"asset": "a.svg", "id": "n1", "x": 1}}),
            ),
            ("select", json!({"nodes": "n1"})),
            ("run_command", json!({"command": "remove everything"})),
            ("run_action", json!({"action": "add.circle", "evil": true})),
            ("render_preview", json!({"size": 8})),
            ("export_png", json!({"dir": "/tmp", "sizes": [100]})),
            ("save_document", json!({"format": "rar"})),
            ("get_document", json!([1, 2])),
        ] {
            let e = r.call(tool, &args).unwrap_err();
            assert_eq!(e.code, "invalid_request", "{tool} {args}");
        }
        for (tool, args) in [
            ("export_png", json!({"dir": "relative/out"})),
            ("export_svg", json!({"dir": ""})),
            ("save_document", json!({"path": "x.icon"})),
            ("open_document", json!({"path": "a.icon"})),
        ] {
            assert_eq!(r.call(tool, &args).unwrap_err().code, "invalid_path");
        }
        let big = "x".repeat(tools::MARKUP_MAX + 1);
        let e = r.call("insert_svg", &json!({"markup": big})).unwrap_err();
        assert_eq!(e.code, "too_large");
        // in range: forwarded with the default
        r.call("get_asset_svg", &json!({"asset": "a.svg"})).unwrap();
        assert!(
            r.host
                .log()
                .last()
                .unwrap()
                .contains(r#""max_chars":20000"#)
        );
        let ok = r
            .call(
                "run_action",
                &json!({"action": "add.circle", "args": {"r": 100}, "expected_revision": 4}),
            )
            .unwrap();
        assert_eq!(ok["args"]["expected_revision"], 4);
    }

    #[test]
    fn list_documents_asks_every_window() {
        let r = Router::new(Fake::with(&[
            ("main", doc(None, true)),
            ("doc-1", doc(Some("a.icon"), false)),
        ]));
        *r.host.active.lock().unwrap() = Some("doc-1".into());
        let l = r.call("list_documents", &json!({})).unwrap();
        let docs = l["documents"].as_array().unwrap();
        assert_eq!(docs.len(), 2);
        assert_eq!(
            (docs[0]["id"].clone(), docs[0]["active"].clone()),
            (json!("main"), json!(false))
        );
        assert_eq!(
            (docs[1]["id"].clone(), docs[1]["active"].clone()),
            (json!("doc-1"), json!(true))
        );
    }

    #[test]
    fn new_document_reuses_an_untouched_window() {
        let r = Router::new(Fake::with(&[("main", doc(None, true))]));
        let d = r.call("new_document", &json!({})).unwrap();
        assert_eq!(
            (d["id"].clone(), d["active"].clone()),
            (json!("main"), json!(true))
        );
        r.host.windows.lock().unwrap()[0].1 = doc(None, false);
        let d = r.call("new_document", &json!({})).unwrap();
        assert_eq!(d["id"], "doc-1");
        assert!(r.host.log().contains(&"open_window:doc-1".to_string()));
    }

    #[test]
    fn open_document_shows_reuses_or_opens_a_window() {
        // absolute on every OS (Windows: `C:\…`)
        let abs = |n: &str| std::env::temp_dir().join(n).to_string_lossy().into_owned();
        let (pa, pb, pc) = (abs("a.icon"), abs("b.icon"), abs("c.icon"));
        let r = Router::new(Fake::with(&[
            ("main", doc(Some(&pa), false)),
            ("doc-1", doc(None, true)),
        ]));
        // already open: to the front, nothing loaded
        let d = r.call("open_document", &json!({ "path": pa })).unwrap();
        assert_eq!(d["id"], "main");
        assert!(!r.host.log().iter().any(|l| l.contains(":open:")));
        // an untouched window loads it
        let d = r.call("open_document", &json!({ "path": pb })).unwrap();
        assert_eq!(d["id"], "doc-1");
        let opened = format!("doc-1:open:{}", json!({ "path": pb }));
        assert!(r.host.log().contains(&opened));
        // the paths of the AI count as trusted for the file commands (prompt 033 E1)
        assert_eq!(
            *r.host.allowed.lock().unwrap(),
            vec![pa.clone(), pb.clone()]
        );
        r.call("save_document", &json!({ "path": pc })).unwrap();
        r.call("get_tree", &json!({})).unwrap();
        assert_eq!(r.host.allowed.lock().unwrap().last(), Some(&pc));
        assert_eq!(r.host.allowed.lock().unwrap().len(), 3);
        // a relative path is refused before it is granted
        assert!(
            r.call("save_document", &json!({ "path": "rel.icon" }))
                .is_err()
        );
        assert_eq!(r.host.allowed.lock().unwrap().len(), 3);
        // none untouched: a new window; a failure there closes it again
        let mut f = Fake::with(&[("main", doc(Some(&pa), false))]);
        f.fail_open = true;
        let r = Router::new(f);
        let e = r.call("open_document", &json!({ "path": pc })).unwrap_err();
        assert_eq!(e.code, "not_found");
        let log = r.host.log();
        assert!(log.contains(&"open_window:doc-1".to_string()));
        assert!(log.contains(&"doc-1:discard:{}".to_string()));
    }

    #[test]
    fn render_preview_renders_the_window_svg_in_rust() {
        let r = Router::new(Fake::with(&[("main", doc(None, false))]));
        let p = r
            .call("render_preview", &json!({"size": 32, "appearance": "dark"}))
            .unwrap();
        assert_eq!(p["image"]["mimeType"], "image/png");
        assert!(
            p["image"]["data"]
                .as_str()
                .unwrap()
                .starts_with("iVBORw0KGgo")
        );
        assert_eq!(
            (p["size"].clone(), p["transparent"].clone()),
            (json!(32), json!(false))
        );
        assert!(r.host.log().contains(
            &r#"main:preview_svg:{"appearance":"dark","mask":"squircle","tint":null}"#.to_string()
        ));
    }

    #[test]
    fn calls_wait_for_their_answer_and_time_out() {
        let calls = Arc::new(Calls::default());
        let (id, rx) = calls.begin("main");
        let c = calls.clone();
        let t = std::thread::spawn(move || {
            assert!(
                !c.complete(id, "doc-1", Ok(json!(1))),
                "another window may not answer"
            );
            assert!(c.complete(id, "main", Ok(json!({"ok": true}))));
        });
        assert_eq!(
            calls.wait(id, &rx, Duration::from_secs(5)).unwrap(),
            json!({"ok": true})
        );
        t.join().unwrap();
        let (id, rx) = calls.begin("main");
        let e = calls.wait(id, &rx, Duration::from_millis(20)).unwrap_err();
        assert_eq!(e.code, "timeout");
        assert!(!calls.complete(id, "main", Ok(json!(1))), "too late");
        // too large
        let (id, rx) = calls.begin("main");
        calls.complete(id, "main", Ok(json!("x".repeat(MAX_REPLY_BYTES + 1))));
        assert_eq!(
            calls
                .wait(id, &rx, Duration::from_secs(1))
                .unwrap_err()
                .code,
            "too_large"
        );
    }

    #[test]
    fn a_closed_window_fails_its_calls_and_is_not_ready() {
        let calls = Arc::new(Calls::default());
        assert!(!calls.wait_ready("doc-1", Duration::from_millis(10)));
        let c = calls.clone();
        let t = std::thread::spawn(move || c.wait_ready("doc-1", Duration::from_secs(5)));
        std::thread::sleep(Duration::from_millis(20));
        calls.mark_ready("doc-1");
        assert!(t.join().unwrap());
        let (id, rx) = calls.begin("doc-1");
        calls.window_gone("doc-1");
        assert!(!calls.is_ready("doc-1"));
        assert_eq!(
            calls
                .wait(id, &rx, Duration::from_secs(1))
                .unwrap_err()
                .code,
            "unknown_document"
        );
    }
}
