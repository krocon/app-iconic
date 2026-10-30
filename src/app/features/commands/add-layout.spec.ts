import { ADD_MENU_LAYOUT, activeToolId, addLayoutIds, TOOL_ACTION_IDS } from './add-layout';

describe('add layout (prompt 061)', () => {
  it('the selection tools come first in the sidebar, but not in the Add menu', () => {
    expect(addLayoutIds().slice(0, 2)).toEqual(['tool.select', 'tool.direct']);
    expect(addLayoutIds(ADD_MENU_LAYOUT)).not.toContain('tool.select');
  });

  it('the active tool is the checked one; a tool before the selection', () => {
    expect(TOOL_ACTION_IDS).toContain('transform.rotate');
    expect(new Set(TOOL_ACTION_IDS).size).toBe(TOOL_ACTION_IDS.length);
    expect(activeToolId((id) => id === 'pen.tool' || undefined)).toBe('pen.tool');
    expect(activeToolId((id) => id === 'tool.direct')).toBe('tool.direct');
    expect(activeToolId(() => undefined)).toBeNull();
  });
});
