import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { OS } from '../../core/actions/platform';
import { ACTIONS } from '../../core/actions/action-catalog';
import { TOOL_ACTION_IDS } from '../commands/add-layout';
import { ToolContexts } from '../canvas/tool-context';
import { ConstraintTool } from '../constraints/constraint-tool';
import { FilletService } from '../fillet/fillet.service';
import { LiveFillTool } from '../live-fill/live-fill-tool';
import { LiveFillService } from '../live-fill/live-fill.service';
import { SettingsStore } from '../settings/settings.store';
import { SketchStore } from '../sketch/sketch.store';
import { FreehandStore } from './freehand.store';
import { drawKindOf, registerToolContexts } from './tool-context-providers';

describe('tool contexts (prompt 067)', () => {
  let contexts: ToolContexts;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    contexts = TestBed.inject(ToolContexts);
    registerToolContexts(contexts, {
      settings: TestBed.inject(SettingsStore),
      sketch: TestBed.inject(SketchStore),
      freehand: TestBed.inject(FreehandStore),
      fillet: TestBed.inject(FilletService),
      constraint: TestBed.inject(ConstraintTool),
      liveFill: TestBed.inject(LiveFillTool),
      liveFillService: TestBed.inject(LiveFillService),
    });
  });

  it('every drawing tool of the sidebar has the paint of its kind', () => {
    const sketch = TOOL_ACTION_IDS.filter((id) => /^sketch\./.test(id));
    expect(sketch.length).toBeGreaterThan(20);
    for (const id of [...sketch, 'pen.tool', 'curvature.tool']) {
      expect(drawKindOf(id), id).not.toBeNull();
      expect(
        contexts
          .for(id)!
          .options.map((o) => o.key)
          .slice(0, 3),
        id,
      ).toEqual(['fill', 'stroke', 'strokeWidth']);
    }
    expect(drawKindOf('sketch.dragStar')).toBe('polygon');
    expect(drawKindOf('trim.tool')).toBeNull();
  });

  it('the paint options write the style memory', () => {
    const fill = contexts.for('sketch.dragRect')!.options.find((o) => o.key === 'fill')!;
    expect(fill.set('#ff0000')).toBe(true);
    expect(TestBed.inject(SettingsStore).settings().drawing.styles.rect.fill).toBe('#ff0000');
    expect(fill.value()).toBe('#ff0000');
    expect(fill.set('red; x')).toBe(false);
    const width = contexts.for('sketch.dragRect')!.options.find((o) => o.key === 'strokeWidth')!;
    expect(width.set(3)).toBe(true);
    expect(width.set(500)).toBe(false);
  });

  it('counts, fillet radius, freehand, constraint relation, fill colour', () => {
    const count = contexts.for('sketch.dragStar')!.options.find((o) => o.key === 'count')!;
    expect(count.set(7)).toBe(true);
    expect(TestBed.inject(SketchStore).countOf('dragStar')).toBe(7);
    const sides = contexts.for('sketch.dragPolygon')!.options.find((o) => o.key === 'count')!;
    expect(sides.set(2)).toBe(false);
    const size = contexts.for('fillet.tool')!.options[0];
    expect(size.set(20)).toBe(true);
    expect(TestBed.inject(FilletService).size()).toBe(20);
    const free = contexts.for('add.freehand')!;
    expect(free.options.map((o) => o.key)).toEqual(['smoothing', 'strokeWidth', 'closed']);
    expect(free.options[2].set(true)).toBe(true);
    expect(TestBed.inject(FreehandStore).closed()).toBe(true);
    const rel = contexts.for('constraint.tool')!.options[0];
    expect(rel.set('parallel')).toBe(true);
    expect(TestBed.inject(ConstraintTool).type()).toBe('parallel');
    expect(rel.set('nope')).toBe(false);
    const color = contexts.for('fill.tool')!.options[0];
    expect(color.set('#123456')).toBe(true);
    expect(TestBed.inject(LiveFillTool).color()).toBe('#123456');
  });

  it('the bar actions are in the catalogue', () => {
    const ids = ACTIONS.map((a) => a.id);
    for (const id of ['tool.option', 'tool.done', 'tool.focusOptions']) expect(ids).toContain(id);
  });
});
