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
import { registerTrimActions } from '../trim/trim-actions';
import { TrimTool } from '../trim/trim-tool';
import { AddService } from '../commands/add.service';
import { registerDimensionActions } from '../dimension/dimension-actions';
import { DimensionService } from '../dimension/dimension.service';
import { DimensionTool } from '../dimension/dimension-tool';
import { MeasureTool } from '../dimension/measure-tool';
import { FilesService } from '../files/files.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { registerPatternActions } from '../pattern/pattern-actions';
import { PatternService } from '../pattern/pattern.service';
import { PatternTool } from '../pattern/pattern-tool';

/** Registers the path tools of prompts 046 and 047 Measure / Dimension of 048, patterns of 049 (in an injection context: the app's constructor). */
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
  registerDimensionActions(
    actions,
    inject(AddService),
    inject(DimensionService),
    inject(DimensionTool),
    inject(MeasureTool),
    tools,
    freehand,
    destroyRef,
  );
  registerTrimActions(actions, inject(TrimTool), tools, freehand, destroyRef);
  registerPatternActions(
    actions,
    inject(PatternService),
    inject(PatternTool),
    tools,
    freehand,
    inject(FilesService),
    inject(DialogService),
    destroyRef,
  );
}
