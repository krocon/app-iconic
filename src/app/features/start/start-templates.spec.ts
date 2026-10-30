import { ACTIONS } from '../../core/actions/action-catalog';
import { IconDocument } from '../document/icon-document';
import { GUIDE_ATTR } from '../guides/guide-attr';
import { LOCK_ATTR } from '../lock/lock';
import { exportSvg } from '../export/export-svg';
import { KEYLINES } from './template-art';
import { srgb, TEMPLATE_IDS, TEMPLATE_PREVIEW, templateDocument } from './start-templates';

/** `icon.json` keys seen in real files (testdata/fixtures, new_icon) – nothing else is written. */
const ROOT_KEYS = new Set(['fill', 'fill-specializations', 'groups', 'supported-platforms']);
const GROUP_KEYS = new Set(['layers', 'shadow', 'translucency']);
const LAYER_KEYS = new Set(['image-name', 'name', 'fill-specializations']);
const COLOR = /^srgb:\d\.\d{5},\d\.\d{5},\d\.\d{5},\d\.\d{5}$/;

function colors(v: unknown): string[] {
  if (typeof v === 'string') return v.includes(':') ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(colors);
  if (v && typeof v === 'object') return Object.values(v).flatMap(colors);
  return [];
}

describe('templates (design 082 E7)', () => {
  it('four templates; the action offers exactly these', () => {
    expect([...TEMPLATE_IDS]).toEqual(['ios', 'macos', 'watchos', 'lightDark']);
    const def = ACTIONS.find((a) => a.id === 'file.newFromTemplate')!;
    const spec = def.args!.properties['template'] as { enum: readonly string[] };
    expect([...spec.enum]).toEqual([...TEMPLATE_IDS]);
    expect(Object.keys(TEMPLATE_PREVIEW)).toEqual([...TEMPLATE_IDS]);
  });

  it('are untitled new documents with only known icon.json fields and own SVG assets', () => {
    for (const id of TEMPLATE_IDS) {
      const dto = templateDocument(id);
      expect(dto.path).toBeNull();
      expect(dto.name).toBeNull();
      expect(dto.format).toBe('bundle');
      const json = dto.iconJson;
      for (const k of Object.keys(json)) expect(ROOT_KEYS.has(k), `${id}: ${k}`).toBe(true);
      expect(json['supported-platforms']).toEqual({ circles: ['watchOS'], squares: 'shared' });
      const names = new Set(dto.assets.map((a) => a.name));
      for (const g of json.groups ?? []) {
        for (const k of Object.keys(g)) expect(GROUP_KEYS.has(k), `${id}: ${k}`).toBe(true);
        expect(['neutral', 'layer-color']).toContain(g.shadow?.kind);
        for (const l of g.layers ?? []) {
          for (const k of Object.keys(l)) expect(LAYER_KEYS.has(k), `${id}: ${k}`).toBe(true);
          expect(names.has(l['image-name']!)).toBe(true);
        }
      }
      for (const c of colors(json)) expect(c).toMatch(COLOR);
      for (const a of dto.assets) {
        expect(a.kind).toBe('svg');
        expect(a.text).toContain('viewBox="0 0 1024 1024"');
        // own vector art only: no links, images or scripts
        expect(a.text!.replace('http://www.w3.org/2000/svg', '')).not.toMatch(
          /href|<image|<script|https?:/,
        );
      }
      // a document like any other – and the export leaves the guides out
      const doc = IconDocument.fromDto(dto);
      expect(doc.path).toBeNull();
      const svg = exportSvg(doc, 'light', { mask: 'squircle', effects: true });
      expect(svg).not.toContain(GUIDE_ATTR);
    }
  });

  it('iOS carries the keylines as locked guides (prompt 056)', () => {
    const doc = IconDocument.fromDto(templateDocument('ios'));
    const guides = [...doc.assets.values()].flatMap((a) =>
      Array.from(a.svg!.root.querySelectorAll(`[${GUIDE_ATTR}]`)),
    );
    expect(guides).toHaveLength(KEYLINES.length * 2);
    for (const g of guides) {
      expect(g.getAttribute(LOCK_ATTR)).toBe('true');
      expect(g.getAttribute('opacity')).toBe('0');
    }
    const at = guides
      .filter((g) => g.getAttribute(GUIDE_ATTR) === 'vertical')
      .map((g) => Number(g.getAttribute('x1')));
    expect(at).toEqual([...KEYLINES]);
  });

  it('macOS has a group shadow, watchOS no black, light/dark a dark variant', () => {
    const mac = templateDocument('macos').iconJson;
    expect(mac.groups!.map((g) => g.shadow?.kind)).toEqual(['neutral', 'layer-color']);
    const watch = templateDocument('watchos').iconJson;
    expect(watch.fill).toEqual({ solid: srgb('#2fae7c') });
    expect(srgb('#000000')).not.toBe((watch.fill as { solid: string }).solid);
    const pair = templateDocument('lightDark').iconJson;
    const specs = pair['fill-specializations'] as { appearance?: string }[];
    expect(specs.map((s) => s.appearance ?? 'default')).toEqual(['default', 'dark']);
    expect(pair.groups![0].layers![0]['fill-specializations']).toHaveLength(1);
  });

  it('writes colours as Icon Composer does', () => {
    expect(srgb('#ff8000')).toBe('srgb:1.00000,0.50196,0.00000,1.00000');
  });
});
