import { DestroyRef } from '@angular/core';
import { DrawStyle, StyleKind, THIN_LINE } from '../../core/settings/settings.models';
import { CONSTRAINT_TYPES, ConstraintType } from '../../shared/geometry/constraints/constraints';
import { DRAG_COUNTS, DragToolId } from '../../shared/geometry/sketch/drag-shapes';
import { CANVAS_TEXTS } from '../canvas/canvas-texts';
import { optionNumber, ToolContext, ToolContexts, ToolOption } from '../canvas/tool-context';
import { ConstraintTool } from '../constraints/constraint-tool';
import { CONSTRAINT_TEXTS } from '../constraints/constraint-texts';
import { GLYPHS } from '../constraints/constraint-view';
import { FilletService } from '../fillet/fillet.service';
import { LiveFillTool } from '../live-fill/live-fill-tool';
import { LiveFillService } from '../live-fill/live-fill.service';
import { LIVE_FILL_TEXTS } from '../live-fill/live-fill-texts';
import { SettingsStore } from '../settings/settings.store';
import { SketchStore } from '../sketch/sketch.store';
import { FreehandStore } from './freehand.store';
import { TOOLS_TEXTS } from './tools-texts';

const T = CANVAS_TEXTS.context;

/** The kind of shape (style memory, design 019 E12) a drawing tool makes; `null`: no drawing tool. */
export function drawKindOf(actionId: string): StyleKind | null {
  if (actionId === 'pen.tool' || actionId === 'curvature.tool') return 'path';
  const m = /^sketch\.(.+)$/.exec(actionId);
  if (!m) return null;
  const t = m[1];
  if (/^(line|midpointLine|dragLine)$/.test(t)) return 'line';
  if (/^(rect2p|rect3p|rectCenter|dragRect|dragRoundRect)$/.test(t)) return 'rect';
  if (/^circle/.test(t)) return 'circle';
  if (t === 'dragEllipse') return 'ellipse';
  if (/^(arc|dragArc)/.test(t)) return 'arc';
  if (/^(polygon|dragPolygon|dragStar)/.test(t)) return 'polygon';
  if (/^(dragSpiral|dragRectGrid|dragPolarGrid)$/.test(t)) return 'path';
  return null;
}

/** The label of a drag tool's count. */
const COUNT_LABELS: Partial<Record<DragToolId, () => string>> = {
  dragPolygon: () => T.sides,
  dragStar: () => T.points,
  dragSpiral: () => T.turns,
  dragRectGrid: () => T.dividers,
  dragPolarGrid: () => T.dividers,
  dragRoundRect: () => T.cornerRadius,
};

const COLOR = /^(none|#[0-9a-f]{3}|#[0-9a-f]{6})$/i;

/** The paint options of a drawing tool, on the style memory of its kind (settings). */
function paintOptions(settings: SettingsStore, kind: StyleKind): ToolOption[] {
  const style = (): DrawStyle => settings.settings().drawing?.styles[kind] ?? THIN_LINE;
  const write = (patch: Partial<DrawStyle>) =>
    settings.update({ drawing: { styles: { [kind]: { ...style(), ...patch } } } });
  const color = (key: 'fill' | 'stroke', label: string): ToolOption => ({
    key,
    label,
    kind: 'color',
    testId: `context-${key}`,
    value: () => style()[key] || 'none',
    set: (v) => {
      if (typeof v !== 'string' || !COLOR.test(v.trim())) return false;
      write({ [key]: v.trim() });
      return true;
    },
  });
  const width: ToolOption = {
    key: 'strokeWidth',
    label: T.strokeWidth,
    kind: 'number',
    min: 0,
    max: 64,
    step: 0.5,
    testId: 'context-strokeWidth',
    value: () => Number(style().strokeWidth || 1),
    set: (v) => {
      const n = optionNumber(width, v);
      if (n === null) return false;
      write({ strokeWidth: String(n) });
      return true;
    },
  };
  return [color('fill', T.fill), color('stroke', T.stroke), width];
}

export interface ToolContextDeps {
  settings: SettingsStore;
  sketch: SketchStore;
  freehand: FreehandStore;
  fillet: FilletService;
  constraint: ConstraintTool;
  liveFill: LiveFillTool;
  liveFillService: LiveFillService;
}

/**
 * The contexts of the tools for the context bar (prompt 067): drawing tools show the paint of
 * their kind (fill, stroke, width – the style memory) and their count (sides, points …); Freehand
 * its smoothing, width and open/closed; Fillet / Chamfer the radius / distance used next; the
 * constraint tool its relations and dimensions; Fill its colour and an open area.
 */
export function registerToolContexts(
  contexts: ToolContexts,
  d: ToolContextDeps,
  destroyRef?: DestroyRef,
): void {
  contexts.register((id): ToolContext | null => {
    if (id === 'add.freehand') return freehandContext(d.freehand);
    if (id === 'fillet.tool' || id === 'chamfer.tool') return filletContext(d.fillet, id);
    if (id === 'constraint.tool') return constraintContext(d.constraint);
    if (id === 'fill.tool') return fillContext(d.liveFill, d.liveFillService);
    const kind = drawKindOf(id);
    if (!kind) return null;
    const options = paintOptions(d.settings, kind);
    const tool = id.slice('sketch.'.length) as DragToolId;
    const label = COUNT_LABELS[tool];
    const range = DRAG_COUNTS[tool];
    if (label && range) {
      const count: ToolOption = {
        key: 'count',
        label: label(),
        kind: 'number',
        min: tool === 'dragPolygon' ? 3 : range.min,
        max: range.max,
        step: range.step,
        testId: 'context-count',
        value: () => d.sketch.countOf(tool),
        set: (v) => {
          const n = optionNumber(count, v);
          if (n === null) return false;
          d.sketch.setCount(tool, n);
          return true;
        },
      };
      options.push(count);
    }
    return {
      options,
      tip: id.startsWith('sketch.drag') ? T.tipDraw : id === 'pen.tool' ? T.tipPen : undefined,
    };
  }, destroyRef);
}

function freehandContext(f: FreehandStore): ToolContext {
  const tt = TOOLS_TEXTS.freehand;
  const num = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    sig: { (): number; set(v: number): void },
    testId: string,
  ): ToolOption => {
    const o: ToolOption = {
      key,
      label,
      kind: 'number',
      min,
      max,
      step,
      testId,
      value: () => sig(),
      set: (v) => {
        const n = optionNumber(o, v);
        if (n === null) return false;
        sig.set(n);
        return true;
      },
    };
    return o;
  };
  return {
    testId: 'freehand-options',
    options: [
      num('smoothing', tt.smoothing, 0, 20, 0.5, f.epsilon, 'freehand-epsilon'),
      num('strokeWidth', tt.strokeWidth, 1, 64, 1, f.strokeWidth, 'freehand-width'),
      {
        key: 'closed',
        label: tt.closed,
        kind: 'toggle',
        testId: 'freehand-closed',
        value: () => f.closed(),
        set: (v) => {
          if (typeof v !== 'boolean') return false;
          f.closed.set(v);
          return true;
        },
      },
    ],
  };
}

function filletContext(s: FilletService, id: string): ToolContext {
  const o: ToolOption = {
    key: 'size',
    label: id === 'fillet.tool' ? T.radius : T.distance,
    kind: 'number',
    min: 0.1,
    max: 1024,
    step: 1,
    testId: 'context-size',
    value: () => s.size(),
    set: (v) => {
      const n = optionNumber(o, v);
      if (n === null) return false;
      s.size.set(n);
      return true;
    },
  };
  return { options: [o], tip: T.tipFillet };
}

function constraintContext(tool: ConstraintTool): ToolContext {
  return {
    testId: 'constraint-bar',
    tip: T.tipConstraint,
    options: [
      {
        key: 'type',
        label: T.relation,
        kind: 'choice',
        choices: CONSTRAINT_TYPES.map((type) => ({
          value: type,
          label: CONSTRAINT_TEXTS.types[type],
          glyph: GLYPHS[type],
        })),
        value: () => tool.type(),
        set: (v) => {
          if (!CONSTRAINT_TYPES.includes(v as ConstraintType)) return false;
          tool.start(v as ConstraintType, false);
          return true;
        },
      },
    ],
  };
}

function fillContext(tool: LiveFillTool, service: LiveFillService): ToolContext {
  return {
    tip: T.tipFill,
    note: service.stale().size
      ? { text: `⚠ ${LIVE_FILL_TEXTS.staleShort}`, testId: 'fill-stale' }
      : null,
    options: [
      {
        key: 'color',
        label: T.color,
        kind: 'color',
        testId: 'fill-color',
        value: () => tool.color(),
        set: (v) => {
          if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.trim())) return false;
          tool.color.set(v.trim());
          return true;
        },
      },
    ],
  };
}
