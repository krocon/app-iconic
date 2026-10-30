//! The connection test (prompt 086 E8) against the real sidecar binary: the handshake works, the
//! app is not running (the endpoint file does not exist).

use ai_mcp::probe::{ProbeStep, probe};
use std::path::Path;
use std::time::Duration;

#[test]
fn the_real_sidecar_answers_the_handshake_and_says_the_app_is_off() {
    let tmp = tempfile::tempdir().unwrap();
    // SAFETY: the only test of this binary; set before any thread is started
    unsafe {
        std::env::set_var(ai_mcp::bridge::ENDPOINT_ENV, tmp.path().join("no-app.json"));
    }
    let p = probe(
        Path::new(env!("CARGO_BIN_EXE_app-iconic-mcp")),
        Duration::from_secs(10),
    );
    assert_eq!(p.server.as_deref(), Some("app-iconic"));
    assert_eq!(p.protocol.as_deref(), Some("2025-06-18"));
    assert_eq!(p.tools, ai_mcp::tools::names().len());
    assert!(p.tools >= 20);
    assert!(!p.ok && !p.app);
    assert_eq!(p.step, ProbeStep::App);
    assert_eq!(p.code.as_deref(), Some("not_running"));
}
