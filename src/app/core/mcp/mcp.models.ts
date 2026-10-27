/**
 * AI control over MCP (design 018) – mirror of Rust `mcp_commands.rs` (`McpInfo`, `McpCall`) and
 * `ai-mcp::bridge::BridgeError`.
 */

/** As the settings dialog and the status show it. */
export interface McpInfo {
  /** The bridge is open (setting on). */
  enabled: boolean;
  /** Connected AI clients. */
  connections: number;
  /** The sidecar program next to the app; `null` = missing (design 018 E17). */
  sidecar: string | null;
}

/** One tool call the app hands to this window (event `mcp-call`). */
export interface McpCall {
  callId: number;
  tool: string;
  args: Record<string, unknown>;
}

/** An error of a tool call (`code` = `FsErrorCode`, `message` for the AI, never shown in the UI). */
export interface McpError {
  code: string;
  message: string;
}

export const NO_MCP: McpInfo = { enabled: false, connections: 0, sidecar: null };
