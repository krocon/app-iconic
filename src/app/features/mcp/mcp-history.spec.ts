import { describe, expect, it } from 'vitest';
import {
  canUndo,
  clock,
  describeCall,
  HISTORY_MAX,
  McpHistoryEntry,
  pushEntry,
} from './mcp-history';

const entry = (seq: number, over: Partial<McpHistoryEntry> = {}): McpHistoryEntry => ({
  seq,
  at: 0,
  tool: 'run_action',
  detail: '',
  ok: true,
  code: null,
  ms: 1,
  undoId: null,
  ...over,
});

describe('mcp-history', () => {
  it('describes a call by its kind, never its content', () => {
    expect(describeCall('run_action', { action: 'add.circle', args: { r: 3 } })).toBe('add.circle');
    expect(
      describeCall('run_command', { command: { type: 'setAttributes', attrs: { d: 'M0' } } }),
    ).toBe('setAttributes');
    expect(describeCall('run_command', { command: 'x' })).toBe('');
    expect(describeCall('insert_svg', { markup: '<svg><script/></svg>' })).toBe('20 chars');
    expect(describeCall('select', { nodes: [1, 2] })).toBe('2 nodes');
    expect(describeCall('get_node', { node: { asset: 'a.svg', id: 'n1' } })).toBe('a.svg #n1');
    expect(describeCall('export_package', { format: 'icns', dir: '/x' })).toBe('icns');
    expect(describeCall('export_png', { dir: '/tmp/out' })).toBe('/tmp/out');
    expect(describeCall('preview_svg', {})).toBe('light');
    expect(describeCall('get_tree', { max_nodes: 5 })).toBe('');
    expect(describeCall('run_action', { action: 'x'.repeat(200) }).length).toBe(80);
  });

  it('keeps the newest first and at most HISTORY_MAX', () => {
    let list: McpHistoryEntry[] = [];
    for (let i = 1; i <= HISTORY_MAX + 5; i++) list = pushEntry(list, entry(i));
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0].seq).toBe(HISTORY_MAX + 5);
    expect(pushEntry([entry(1)], entry(2), 1).map((e) => e.seq)).toEqual([2]);
  });

  it('offers undo only while its step is the last one', () => {
    const e = entry(1, { undoId: 7 });
    expect(canUndo(e, 7)).toBe(true);
    expect(canUndo(e, 8)).toBe(false);
    expect(canUndo(e, null)).toBe(false);
    expect(canUndo(entry(2), 7)).toBe(false);
    expect(canUndo(entry(3, { undoId: 7, ok: false, code: 'io' }), 7)).toBe(false);
  });

  it('shows the time as HH:MM:SS', () => {
    expect(clock(new Date(2026, 9, 30, 9, 5, 7).getTime())).toBe('09:05:07');
  });
});
