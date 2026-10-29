import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { AddService } from '../commands/add.service';
import { FreehandStore } from '../tools/freehand.store';
import { DimensionService } from './dimension.service';
import { DimensionTool } from './dimension-tool';
import { MeasureTool } from './measure-tool';

/**
 * The actions of prompt 048: `measure.tool` (I) and `dimension.tool` (D) switch the tools on/off
 * (the other tools go off); `dimension.add` adds a dimension from arguments at once (the AI's way).
 */
export function registerDimensionActions(
  actions: ActionService,
  add: AddService,
  service: DimensionService,
  dimension: DimensionTool,
  measure: MeasureTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  const toggle = (id: string, tool: { toggle(): void }) => () => {
    freehand.toggle(false);
    tools.stopAll(id);
    tool.toggle();
  };
  actions.registerAll(
    {
      'measure.tool': { run: toggle('measure', measure), checked: () => measure.on() },
      'dimension.tool': {
        run: toggle('dimension', dimension),
        enabled: () => add.canAdd() || dimension.on(),
        checked: () => dimension.on(),
      },
      'dimension.add': {
        run: (a) => service.insertFromArgs((a ?? {}) as Record<string, unknown>),
        enabled: () => add.canAdd(),
      },
    },
    destroyRef,
  );
}
