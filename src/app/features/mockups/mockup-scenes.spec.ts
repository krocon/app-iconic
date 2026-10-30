import { SCENES, sceneLayout, sceneSpec, sceneTheme, Slot, isSceneId } from './mockup-scenes';

const inside = (s: { x: number; y: number; width: number; height: number }, w: number, h: number) =>
  s.x >= 0 && s.y >= 0 && s.x + s.width <= w + 1e-9 && s.y + s.height <= h + 1e-9;
const box = (s: Slot) => ({ x: s.x, y: s.y, width: s.size, height: s.size });
const overlap = (a: Slot, b: Slot) =>
  a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;

describe('mockup scenes (prompt 081)', () => {
  it('icon sizes are the documented ones', () => {
    const sizes = Object.fromEntries(SCENES.map((s) => [s.id, s.iconSize]));
    expect(sizes).toEqual({ dock: 64, homeLight: 60, homeDark: 60, spotlight: 40, taskbar: 24 });
    for (const s of SCENES) {
      expect(sceneLayout(s.id).own[0].size).toBe(s.iconSize);
      expect(s.source.length).toBeGreaterThan(10);
    }
    // Spotlight also shows the 20 pt notification icon
    expect(sceneLayout('spotlight').own.map((o) => o.size)).toEqual([40, 20]);
  });

  it('everything lies inside the scene and no two icons overlap', () => {
    for (const spec of SCENES) {
      const l = sceneLayout(spec.id);
      const icons: Slot[] = [...l.own, ...l.placeholders];
      for (const i of icons) expect(inside(box(i), spec.width, spec.height)).toBe(true);
      for (const p of [...l.panels, ...l.marks])
        expect(inside(p, spec.width, spec.height)).toBe(true);
      for (let a = 0; a < icons.length; a++) {
        for (let b = a + 1; b < icons.length; b++) expect(overlap(icons[a], icons[b])).toBe(false);
      }
    }
  });

  it('Dock: seven 64 pt tiles on the bar, the own one in the middle with a running dot', () => {
    const l = sceneLayout('dock');
    expect(l.placeholders).toHaveLength(6);
    const xs = [...l.placeholders, ...l.own].map((s) => s.x).sort((a, b) => a - b);
    expect(xs.indexOf(l.own[0].x)).toBe(3);
    const bar = l.panels[0];
    expect(l.own[0].y).toBe(bar.y + 8);
    expect(l.marks[0].x + 2).toBeCloseTo(l.own[0].x + 32);
    expect(l.lines.filter((x) => x.name)).toHaveLength(1);
  });

  it('home screen: 4 × 3 grid with even gaps, a label under every icon', () => {
    const l = sceneLayout('homeLight');
    expect(l.placeholders.length + l.own.length).toBe(12);
    const cols = [...new Set([...l.placeholders, ...l.own].map((s) => s.x))].sort((a, b) => a - b);
    expect(cols).toHaveLength(4);
    const gaps = cols.slice(1).map((x, i) => x - cols[i] - 60);
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBe(1);
    expect(cols[0]).toBeCloseTo(360 - cols[3] - 60); // centred
    expect(l.lines).toHaveLength(12);
    expect(l.lines.filter((x) => x.name)).toHaveLength(1);
    expect(sceneLayout('homeDark').own).toEqual(l.own);
  });

  it('taskbar: 24 px icons centred in a 48 px bar, the own one active', () => {
    const l = sceneLayout('taskbar');
    const bar = l.panels[0];
    expect(bar.height).toBe(48);
    for (const s of [...l.own, ...l.placeholders]) expect(s.y + 12).toBe(bar.y + 24);
    const xs = [...l.own, ...l.placeholders].map((s) => s.x);
    expect(Math.min(...xs) + Math.max(...xs) + 24).toBeCloseTo(480);
    expect(l.highlight).not.toBeNull();
    expect(l.marks).toHaveLength(1);
  });

  it('themes: named scenes keep theirs, the others follow the appearance', () => {
    expect(sceneTheme(sceneSpec('homeDark'), 'light')).toBe('dark');
    expect(sceneTheme(sceneSpec('homeLight'), 'dark')).toBe('light');
    expect(sceneTheme(sceneSpec('dock'), 'light')).toBe('light');
    expect(sceneTheme(sceneSpec('dock'), 'tinted')).toBe('dark');
    expect(isSceneId('dock')).toBe(true);
    expect(isSceneId('desk')).toBe(false);
  });
});
