import { Injectable } from '@angular/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { call } from '../backend/call';
import { McpCall, McpError, McpInfo } from './mcp.models';

const MCP_CALL = 'mcp-call';
const MCP_STATUS = 'mcp-status';

/**
 * AI control (design 018 E4/E5): the app hands tool calls of the MCP sidecar to this window, the
 * window answers. Typed facade over `mcp_*`; tests and the browser use `FakeMcpApi`. After
 * editlicious `core/mcp/mcp-api.ts` (design 016).
 */
@Injectable()
export abstract class McpApi {
  abstract info(): Promise<McpInfo>;
  /** This window has its document and listens (calls may come now). */
  abstract ready(): Promise<void>;
  abstract reply(callId: number, result: unknown, error: McpError | null): Promise<void>;
  /** Closes every AI connection (the bridge stays open). */
  abstract disconnect(): Promise<void>;
  /** Tool calls for this window; returns the function that stops listening. */
  abstract onCall(fn: (c: McpCall) => void): Promise<() => void>;
  /** Bridge on/off, connections. */
  abstract onStatus(fn: (i: McpInfo) => void): Promise<() => void>;
}

@Injectable()
export class TauriMcpApi extends McpApi {
  info(): Promise<McpInfo> {
    return call<McpInfo>('mcp_info');
  }

  ready(): Promise<void> {
    return call<void>('mcp_ready');
  }

  reply(callId: number, result: unknown, error: McpError | null): Promise<void> {
    return call<void>('mcp_reply', error ? { callId, error } : { callId, result: result ?? null });
  }

  disconnect(): Promise<void> {
    return call<void>('mcp_disconnect');
  }

  onCall(fn: (c: McpCall) => void): Promise<() => void> {
    return getCurrentWebviewWindow().listen<McpCall>(MCP_CALL, (e) => fn(e.payload));
  }

  onStatus(fn: (i: McpInfo) => void): Promise<() => void> {
    return listen<McpInfo>(MCP_STATUS, (e) => fn(e.payload));
  }
}
