import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { TextEdit } from './text-edit';
import { TextTool } from './text-tool';
import { TextToPathService } from './text-to-path.service';

function isRef(v: unknown): v is NodeRef {
  const r = v as NodeRef | null;
  return !!r && typeof r.asset === 'string' && typeof r.id === 'string';
}

/**
 * The actions of prompt 075: `text.tool` (⇧T), `text.edit` (the selected text on the canvas),
 * `text.set { node, text }` (lines with `\n`), `text.toPath { nodes? }`.
 */
export function registerTextActions(
  actions: ActionService,
  deps: {
    tool: TextTool;
    edit: TextEdit;
    toPath: TextToPathService;
    tools: CanvasTools;
    freehand: FreehandStore;
    files: FilesService;
  },
  destroyRef?: DestroyRef,
): void {
  const { tool, edit, toPath, tools, freehand, files } = deps;
  const selectedText = () => {
    const s = files.store();
    const r = s?.selection()[0];
    return r && s?.document().node(r)?.localName === 'text' ? r : null;
  };
  actions.registerAll(
    {
      'text.tool': {
        run: () => {
          freehand.toggle(false);
          tools.stopAll('text');
          tool.toggle();
        },
        checked: () => tool.on(),
        enabled: () => !!files.store(),
      },
      'text.edit': {
        run: () => {
          const r = selectedText();
          return r ? edit.start(r) : false;
        },
        enabled: () => selectedText() !== null,
      },
      'text.set': {
        run: (a) => {
          const o = (a ?? {}) as { node?: unknown; text?: unknown };
          return isRef(o.node) && typeof o.text === 'string' ? edit.setText(o.node, o.text) : false;
        },
        enabled: () => !!files.store(),
      },
      'text.toPath': {
        run: (a) => {
          const nodes = (a as { nodes?: unknown } | undefined)?.nodes;
          return toPath.convert(Array.isArray(nodes) ? nodes.filter(isRef) : undefined);
        },
        enabled: () => toPath.canConvert(),
      },
    },
    destroyRef,
  );
}
