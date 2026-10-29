import { DestroyRef, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { registerPathEditActions } from '../path-edit/path-edit-actions';
import { PathEditService } from '../path-edit/path-edit.service';
import { PathEditTool } from '../path-edit/path-edit-tool';
import { FreehandStore } from '../tools/freehand.store';
import { CutTool } from './cut-tool';
import { registerPathfinderActions } from './pathfinder-actions';
import { PathfinderService } from './pathfinder.service';
import { ShapeBuilderTool } from './shape-builder-tool';

/** Registers the path tools of prompts 046 and 047 (in an injection context: the app's constructor). */
export function registerPathTools(
  actions: ActionService,
  tools: CanvasTools,
  destroyRef?: DestroyRef,
): void {
  const freehand = inject(FreehandStore);
  registerPathEditActions(
    actions,
    inject(PathEditService),
    inject(PathEditTool),
    tools,
    freehand,
    destroyRef,
  );
  registerPathfinderActions(
    actions,
    inject(PathfinderService),
    inject(ShapeBuilderTool),
    inject(CutTool),
    tools,
    freehand,
    destroyRef,
  );
}
