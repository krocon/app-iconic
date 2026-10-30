// Nach editlicious src/app/core/i18n/catalogs.spec.ts (Prompt 009).
import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../actions/action-catalog';
import { ACTION_LABELS_DE } from '../actions/action-catalog.de';
import { CATALOGS, PHRASEBOOKS } from './i18n';
import { P } from '../../features/properties/property-defs';
// every catalog registers itself on import
import '../errors/fs-error';
import '../../shared/controls/controls-texts';
import '../../features/about/about-texts';
import '../../features/canvas/canvas-texts';
import '../../features/clip/clip-texts';
import '../../features/commands/commands-texts';
import '../../features/document/undo/undo-texts';
import '../../features/export/export-texts';
import '../../features/files/files-texts';
import '../../features/hierarchy/hierarchy-texts';
import '../../features/mcp/mcp-texts';
import '../../features/inspector/inspector-texts';
import '../../features/menus/menus-texts';
import '../../features/properties/properties-texts';
import '../../features/settings/settings-texts';
import '../../features/sketch/sketch-texts';
import '../../features/pen/pen-texts';
import '../../features/corners/corners-texts';
import '../../features/shell/shell-texts';
import '../../features/svg-source/svg-source-texts';
import '../../features/tools/tools-texts';
import '../../features/image-layer/image-layer-texts';

/** Shape of a catalog: keys and value kinds (functions by arity). */
function shape(v: unknown): unknown {
  if (typeof v === 'function') return `fn/${v.length}`;
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, shape((v as Record<string, unknown>)[k])]),
    );
  }
  return typeof v;
}

const NAMES = [
  'about',
  'canvas',
  'clip',
  'commands',
  'controls',
  'errors',
  'export',
  'files',
  'hierarchy',
  'imageLayer',
  'inspector',
  'menus',
  'properties',
  'settings',
  'shell',
  'sketch',
  'pen',
  'corners',
  'svgSource',
  'tools',
  'undo',
];

describe('catalogs (design 015 E13)', () => {
  it('registers every catalog', () => {
    for (const name of NAMES) expect([...CATALOGS.keys()], name).toContain(name);
  });

  it('German has exactly the keys and signatures of English', () => {
    for (const [name, c] of CATALOGS) {
      if (name.startsWith('test.')) continue;
      expect(shape(c.tr['de']), name).toEqual(shape(c.en));
    }
  });

  it('German texts are not empty', () => {
    for (const [name, c] of CATALOGS) {
      const walk = (v: unknown, path: string): void => {
        if (typeof v === 'string') expect(v.trim(), `${name}.${path}`).not.toBe('');
        else if (typeof v === 'function') {
          // numbers fit most texts; one that wants a list says so by throwing
          let out: unknown;
          try {
            out = v(...Array.from({ length: v.length }, () => 2));
          } catch {
            out = v(...Array.from({ length: v.length }, () => ['a']));
          }
          expect(String(out).trim(), `${name}.${path}()`).not.toBe('');
        } else if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
        }
      };
      walk(c.tr['de'], '');
    }
  });

  it('every action has a German label, none for an action that does not exist', () => {
    expect(ACTIONS.map((a) => a.id).filter((id) => !ACTION_LABELS_DE[id])).toEqual([]);
    const ids = new Set(ACTIONS.map((a) => a.id));
    expect(Object.keys(ACTION_LABELS_DE).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every property name has a German phrase', () => {
    const book = PHRASEBOOKS.get('properties.labels')!['de'];
    const labels = [...new Set(Object.values(P).map((d) => d.label))];
    expect(labels.filter((l) => !book[l])).toEqual([]);
    for (const extra of ['Angle', 'Pivot X', 'Pivot Y']) expect(book[extra]).toBeTruthy();
  });
});
