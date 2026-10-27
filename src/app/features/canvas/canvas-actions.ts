import { ActionHandler } from '../../core/actions/action.service';
import { CanvasToggle, CanvasViewStore, MaskShape } from './canvas-view.store';
import { GridOrigin } from '../../shared/geometry/snapping';
import { Appearance } from './appearance';
import { SelectionMode } from './selection-measure';

/**
 * The view actions of the canvas (design 005 E17): zoom, centre, the View options, appearance and
 * mask – the same for menu, keyboard, the View Options menu, the toolbar and the AI.
 * Registered by `CanvasView` (with its `DestroyRef`). Snapping and the selection mode act in the
 * canvas gestures (design 007).
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
  const selectionMode = (value: SelectionMode): ActionHandler => ({
    run: () => view.set('selectionMode', value),
    checked: () => view.options().selectionMode === value,
  });
  const gridOrigin = (value: GridOrigin): ActionHandler => ({
    run: () => view.set('gridOrigin', value),
    checked: () => view.options().gridOrigin === value,
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
    'view.effects': toggle('effects'),
    'view.crossCursor': toggle('crossCursor'),
    'view.handles': toggle('handles'),
    'view.snapToGrid': toggle('snapToGrid'),
    'view.magicSnap': toggle('magicSnap'),
    'view.appearance.light': appearance('light'),
    'view.appearance.dark': appearance('dark'),
    'view.mask.squircle': mask('squircle'),
    'view.mask.circle': mask('circle'),
    'view.mask.none': mask('none'),
    'view.selectionMode.point': selectionMode('point'),
    'view.selectionMode.boxed': selectionMode('boxed'),
    'view.selectionMode.none': selectionMode('none'),
    'view.gridOrigin.worldZero': gridOrigin('worldZero'),
    'view.gridOrigin.svgCenter': gridOrigin('svgCenter'),
  };
}
