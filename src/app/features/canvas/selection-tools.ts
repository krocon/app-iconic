import { ActionHandler } from '../../core/actions/action.service';
import { CanvasViewStore } from './canvas-view.store';
import { CanvasTools } from './canvas-tools';
import { SelectionMode } from './selection-measure';

/**
 * The selection tools (prompt 061): `tool.select` (V) = move with the box (Selection Mode
 * "Boxed"), `tool.direct` (A) = edit points (Selection Mode "Point"). Both switch every other
 * tool off – the way back from pen, trim, live fill … with one key or click. They are checked
 * while no tool is on and the selection mode matches; the View › Selection Mode menu shows the
 * same state (one source: `CanvasOptions.selectionMode`).
 */
export function selectionToolActions(
  view: Pick<CanvasViewStore, 'set' | 'options'>,
  tools: Pick<CanvasTools, 'stopAll' | 'anyActive'>,
): Record<string, ActionHandler> {
  const tool = (mode: SelectionMode): ActionHandler => ({
    run: () => {
      tools.stopAll();
      view.set('selectionMode', mode);
    },
    checked: () => !tools.anyActive() && view.options().selectionMode === mode,
  });
  return { 'tool.select': tool('boxed'), 'tool.direct': tool('point') };
}
