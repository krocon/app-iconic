//! ai-mcp – the MCP side of AppIconic (design 018): a stdio MCP server (`app-iconic-mcp`) that
//! forwards tool calls over a local bridge to the running app, and the bridge server the app
//! runs. Taken over from editlicious `ed-mcp` (design 016, same author, MIT) and cut to AppIconic.
//!
//! - [`bridge`]    messages between sidecar and app, the endpoint file, token check
//! - [`tools`]     the tools and their JSON schemas (snapshot `tools.snapshot.json`)
//! - [`server`]    JSON-RPC 2.0 / MCP over lines (initialize, ping, tools/list, tools/call)
//! - [`client`]    the bridge client of the sidecar (TCP to 127.0.0.1)
//! - [`host`]      the bridge server of the app (token, line limit, connections)

pub mod bridge;
pub mod client;
pub mod host;
pub mod server;
pub mod tools;
