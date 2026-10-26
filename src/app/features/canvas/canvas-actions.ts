import { ActionHandler } from '../../core/actions/action.service';
import { CanvasToggle, CanvasViewStore, MaskShape } from './canvas-view.store';
import { Appearance } from './appearance';

/**
 * The view actions of the canvas (design 005 E17): zoom, centre, the View options, appearance and
 * mask – the same for menu, keyboard, the View Options menu, the toolbar and the AI.
 * Registered by `CanvasView` (with its `DestroyRef`). Snap to Grid / Magic Snap are states now
 * and work from prompt 007 on.
 */
export function canvasActions(view: CanvasViewStore): Record<string, ActionHandler> {
  const toggle = (key: CanvasToggle): ActionHandler => ({
    run: () => view.toggle(key),
    checked: () => view.options()[key],
  });
  const appearance = (value: Appearance): ActionHandler => ({
    run: () => view.set('appearance', value),
    checked: () => view.options().appearance === value,
  });
  const mask = (value: MaskShape): ActionHandler => ({
    run: () => view.set('mask', value),
    checked: () => view.options().mask === value,
  });
  return {
    'view.zoomIn': { run: () => view.zoomIn() },
    'view.zoomOut': { run: () => view.zoomOut() },
    'view.actualSize': { run: () => view.actualSize() },
    'view.zoomToFit': { run: () => view.fit() },
    'view.centerCanvas': { run: () => view.center() },
    'view.zoomTo': { run: (args) => view.zoomTo((args as { zoom: number }).zoom) },
    'view.rulers': toggle('rulers'),
    'view.guides': toggle('guides'),
    'view.background': toggle('background'),
    'view.crossCursor': toggle('crossCursor'),
    'view.handles': toggle('handles'),
    'view.snapToGrid': toggle('snapToGrid'),
    'view.magicSnap': toggle('magicSnap'),
    'view.appearance.light': appearance('light'),
    'view.appearance.dark': appearance('dark'),
    'view.mask.squircle': mask('squircle'),
    'view.mask.circle': mask('circle'),
    'view.mask.none': mask('none'),
  };
}
