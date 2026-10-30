import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { BoxEdit } from '../../shared/geometry/box-frame';
import { Anchor, ANCHORS } from '../../shared/geometry/transform-ops';
import { BoxService } from './box.service';

const NUMBERS = ['x', 'y', 'width', 'height', 'rotation', 'rotateBy'] as const;

/** The box edit of the AI's arguments (unknown keys and non-numbers are ignored). */
export function boxEditFromArgs(a: Record<string, unknown>): BoxEdit {
  const edit: BoxEdit = {};
  for (const k of NUMBERS) {
    const v = a[k];
    if (typeof v === 'number' && Number.isFinite(v)) edit[k] = v;
  }
  if (a['flipH'] === true) edit.flipH = true;
  if (a['flipV'] === true) edit.flipV = true;
  return edit;
}

/**
 * `properties.box { x?, y?, width?, height?, rotation?, rotateBy?, flipH?, flipV?, pivot?, lock? }`
 * (prompt 062): position, size, rotation and flips of the selection in document units at once,
 * one undo step – the panel's box head for the AI and the palette; `properties.flipH` /
 * `properties.flipV` mirror the selection in place.
 */
export function registerBoxActions(
  actions: ActionService,
  box: BoxService,
  destroyRef?: DestroyRef,
): void {
  const enabled = () => box.canApply();
  actions.registerAll(
    {
      'properties.box': {
        run: (args) => {
          const a = (args ?? {}) as Record<string, unknown>;
          const pivot = ANCHORS.includes(a['pivot'] as Anchor) ? (a['pivot'] as Anchor) : undefined;
          const lock = typeof a['lock'] === 'boolean' ? a['lock'] : undefined;
          return box.apply(boxEditFromArgs(a), pivot, lock);
        },
        enabled,
      },
      'properties.flipH': { run: () => box.apply({ flipH: true }), enabled },
      'properties.flipV': { run: () => box.apply({ flipV: true }), enabled },
    },
    destroyRef,
  );
}
