import { signal } from '@angular/core';
import { CanvasOptions } from './canvas-view.store';
import { CanvasTools } from './canvas-tools';
import { selectionToolActions } from './selection-tools';
import { SelectionMode } from './selection-measure';

describe('selection tools (prompt 061)', () => {
  function setup() {
    const mode = signal<SelectionMode>('point');
    const view = {
      options: () => ({ selectionMode: mode() }) as CanvasOptions,
      set: (key: string, value: unknown) => {
        if (key === 'selectionMode') mode.set(value as SelectionMode);
      },
    };
    const tools = new CanvasTools();
    const pen = signal(false);
    const freehand = signal(false);
    tools.register({
      id: 'pen',
      active: () => pen(),
      stop: () => pen.set(false),
      press: () => undefined,
      move: () => undefined,
      release: () => undefined,
      leave: () => undefined,
      escape: () => false,
    });
    tools.registerMode({
      id: 'freehand',
      active: () => freehand(),
      stop: () => freehand.set(false),
    });
    const a = selectionToolActions(view as never, tools);
    return { a, mode, pen, freehand, tools };
  }

  it('V ends every tool (freehand too) and selects with the box', () => {
    const { a, mode, pen, freehand, tools } = setup();
    pen.set(true);
    freehand.set(true);
    expect(tools.anyActive()).toBe(true);
    expect(a['tool.select'].checked!()).toBe(false);
    a['tool.select'].run();
    expect(pen()).toBe(false);
    expect(freehand()).toBe(false);
    expect(mode()).toBe('boxed');
    expect(a['tool.select'].checked!()).toBe(true);
    expect(a['tool.direct'].checked!()).toBe(false);
  });

  it('A is the point mode; a tool on unchecks both', () => {
    const { a, mode, pen } = setup();
    a['tool.direct'].run();
    expect(mode()).toBe('point');
    expect(a['tool.direct'].checked!()).toBe(true);
    pen.set(true);
    expect(a['tool.direct'].checked!()).toBe(false);
    expect(a['tool.select'].checked!()).toBe(false);
  });

  it('a mode takes part in stopAll and anyActive, except the one named', () => {
    const { tools, freehand } = setup();
    freehand.set(true);
    tools.stopAll('freehand');
    expect(freehand()).toBe(true);
    tools.stopAll('pen');
    expect(freehand()).toBe(false);
    expect(tools.anyActive()).toBe(false);
  });
});
