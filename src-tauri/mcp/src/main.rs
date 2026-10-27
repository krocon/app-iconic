//! `app-iconic-mcp` – MCP server (stdio) for the running AppIconic (design 018).
//!
//! Claude Code: `claude mcp add app-iconic -- /path/to/app-iconic-mcp`
//! The app must run with Settings → AI control (MCP) on. Logs nothing of the documents.
//! Taken over from editlicious `editlicious-mcp` (design 016).

use ai_mcp::bridge;
use ai_mcp::client::BridgeClient;
use ai_mcp::server;
use std::io::{BufReader, stdin, stdout};

fn main() {
    if std::env::args().any(|a| a == "--version" || a == "-V") {
        println!("app-iconic-mcp {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let mut tools = BridgeClient::new(bridge::endpoint_path());
    let mut input = BufReader::new(stdin().lock());
    let mut output = stdout().lock();
    if let Err(e) = server::serve(&mut input, &mut output, &mut tools) {
        eprintln!("app-iconic-mcp: {e}");
        std::process::exit(1);
    }
}
