import { Injectable } from '@angular/core';
import { McpApi } from '../app/core/mcp/mcp-api';
import { McpCall, McpError, McpInfo, NO_MCP } from '../app/core/mcp/mcp.models';

/** One answer the window gave. */
export interface FakeReply {
  callId: number;
  result: unknown;
  error: McpError | null;
}

/**
 * `McpApi` without a backend (tests, browser mode): `send` plays a tool call of the app, the
 * answers are kept in `replies`; `waitFor(callId)` resolves with the answer.
 */
@Injectable()
export class FakeMcpApi extends McpApi {
  infoValue: McpInfo = { ...NO_MCP };
  readyCount = 0;
  disconnects = 0;
  readonly replies: FakeReply[] = [];
  private callFn: ((c: McpCall) => void) | null = null;
  private statusFn: ((i: McpInfo) => void) | null = null;
  private waiting = new Map<number, (r: FakeReply) => void>();
  private nextId = 1;

  async info(): Promise<McpInfo> {
    return { ...this.infoValue };
  }

  async ready(): Promise<void> {
    this.readyCount++;
  }

  async reply(callId: number, result: unknown, error: McpError | null): Promise<void> {
    const r = { callId, result, error };
    this.replies.push(r);
    this.waiting.get(callId)?.(r);
    this.waiting.delete(callId);
  }

  async disconnect(): Promise<void> {
    this.disconnects++;
    this.setStatus({ ...this.infoValue, connections: 0 });
  }

  async onCall(fn: (c: McpCall) => void): Promise<() => void> {
    this.callFn = fn;
    return () => (this.callFn = null);
  }

  async onStatus(fn: (i: McpInfo) => void): Promise<() => void> {
    this.statusFn = fn;
    return () => (this.statusFn = null);
  }

  /** The app sends a tool call; resolves with this window's answer. */
  send(tool: string, args: Record<string, unknown> = {}): Promise<FakeReply> {
    const callId = this.nextId++;
    const answer = new Promise<FakeReply>((resolve) => this.waiting.set(callId, resolve));
    this.callFn?.({ callId, tool, args });
    return answer;
  }

  setStatus(i: McpInfo): void {
    this.infoValue = i;
    this.statusFn?.(i);
  }
}
