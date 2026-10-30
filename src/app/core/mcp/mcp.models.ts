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
  /** A debug build: a missing sidecar comes from `pnpm mcp:sidecar:dev` (design 086 E6). */
  debug: boolean;
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

export const NO_MCP: McpInfo = { enabled: false, connections: 0, sidecar: null, debug: false };

/** The AI clients the app can set up (design 086 E1) – mirror of Rust `McpClient`. */
export type McpTarget = 'claudeDesktop' | 'cursor';
export const MCP_TARGETS: readonly McpTarget[] = ['claudeDesktop', 'cursor'];

/** What a client configuration says about the `app-iconic` entry (design 086 E7). */
export type McpClientState = 'absent' | 'missing' | 'installed' | 'other' | 'invalid';

export interface McpClientStatus {
  target: McpTarget;
  /** Where the configuration is – opaque, for display only. */
  path: string;
  state: McpClientState;
}

/** “Set up” / “Remove” before it is written (design 086 E4). */
export interface McpSetupPlan {
  target: McpTarget;
  path: string;
  /** The file now; `null` = there is none. */
  before: string | null;
  /** The file after “Apply”; `null` = nothing to change. */
  after: string | null;
}

export interface McpSetupDone {
  path: string;
  /** The backup copy of the old file, if there was one. */
  backup: string | null;
}

/** The connection test (design 086 E8) – mirror of `ai_mcp::probe::Probe`. */
export interface McpProbe {
  ok: boolean;
  step: 'start' | 'initialize' | 'tools' | 'app';
  /** Why the step failed (`not_found`, `timeout`, `invalid_request`, `not_running` …). */
  code: string | null;
  server: string | null;
  version: string | null;
  protocol: string | null;
  tools: number;
  app: boolean;
  documents: number | null;
}
