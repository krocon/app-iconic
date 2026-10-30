import { Injectable } from '@angular/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { call } from '../backend/call';
import {
  McpCall,
  McpClientStatus,
  McpError,
  McpInfo,
  McpProbe,
  McpSetupDone,
  McpSetupPlan,
  McpTarget,
} from './mcp.models';

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
  /** The AI clients with their configuration (design 086 E7). */
  abstract clients(): Promise<McpClientStatus[]>;
  /** What setting up (`remove: false`) or removing would write (design 086 E4). */
  abstract preview(target: McpTarget, remove: boolean): Promise<McpSetupPlan>;
  /** Writes the entry; `expected` = `before` of the preview the user confirmed. */
  abstract install(target: McpTarget, expected: string | null): Promise<McpSetupDone>;
  abstract uninstall(target: McpTarget, expected: string | null): Promise<McpSetupDone>;
  /** Starts the sidecar, MCP handshake, one call to the app (design 086 E8). */
  abstract test(): Promise<McpProbe>;
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

  clients(): Promise<McpClientStatus[]> {
    return call<McpClientStatus[]>('mcp_clients');
  }

  preview(target: McpTarget, remove: boolean): Promise<McpSetupPlan> {
    return call<McpSetupPlan>('mcp_setup_preview', { target, remove });
  }

  install(target: McpTarget, expected: string | null): Promise<McpSetupDone> {
    return call<McpSetupDone>('mcp_install', { target, expected });
  }

  uninstall(target: McpTarget, expected: string | null): Promise<McpSetupDone> {
    return call<McpSetupDone>('mcp_uninstall', { target, expected });
  }

  test(): Promise<McpProbe> {
    return call<McpProbe>('mcp_test');
  }
}
