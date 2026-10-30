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
import { registerOffsetActions } from '../offset/offset-actions';
import { OffsetService } from '../offset/offset.service';
import { registerTransformActions } from '../transform/transform-actions';
import { TransformService } from '../transform/transform.service';
import { TransformTool } from '../transform/transform-tool';
import { registerConstraintActions } from '../constraints/constraint-actions';
import { ConstraintService } from '../constraints/constraint.service';
import { ConstraintTool } from '../constraints/constraint-tool';
import { registerLiveFillActions } from '../live-fill/live-fill-actions';
import { LiveFillService } from '../live-fill/live-fill.service';
import { LiveFillTool } from '../live-fill/live-fill-tool';
import { registerGradientActions } from '../gradient/gradient-actions';
import { GradientService } from '../gradient/gradient.service';
import { registerAlignActions } from '../align/align-actions';
import { AlignService } from '../align/align.service';
import { registerLockActions } from '../lock/lock-actions';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { LayerStyleService } from '../canvas/layer-style.service';
import { GuideService } from '../guides/guide.service';
import { ConstructionMode } from '../construction/construction-mode';
import { registerPreviewActions } from '../preview/preview-actions';
import { SmallPreviewService } from '../preview/small-preview.service';
import { registerMockupsActions } from '../mockups/mockups-actions';
import { MockupsService } from '../mockups/mockups.service';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { registerFilletActions } from '../fillet/fillet-actions';
import { FilletService } from '../fillet/fillet.service';
import { FilletTool } from '../fillet/fillet-tool';
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
  registerOffsetActions(actions, inject(OffsetService), inject(DialogService), destroyRef);
  registerAlignActions(actions, inject(AlignService), destroyRef);
  registerGradientActions(actions, inject(GradientService), destroyRef);
  registerLiveFillActions(
    actions,
    inject(LiveFillService),
    inject(LiveFillTool),
    tools,
    freehand,
    inject(FilesService),
    destroyRef,
  );
  registerConstraintActions(
    actions,
    inject(ConstraintService),
    inject(ConstraintTool),
    tools,
    freehand,
    destroyRef,
  );
  registerPreviewActions(
    actions,
    inject(SmallPreviewService),
    inject(FilesService),
    inject(CanvasViewStore),
    destroyRef,
  );
  registerMockupsActions(actions, inject(MockupsService), destroyRef);
  registerLockActions(
    actions,
    inject(FilesService),
    inject(CanvasEditStore),
    inject(LayerStyleService),
    inject(GuideService),
    inject(ConstructionMode),
    destroyRef,
  );
  registerTransformActions(
    actions,
    inject(TransformService),
    inject(TransformTool),
    tools,
    freehand,
    inject(FilesService),
    inject(DialogService),
    destroyRef,
  );
  registerFilletActions(
    actions,
    inject(FilletService),
    inject(FilletTool),
    tools,
    freehand,
    destroyRef,
  );
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
