import { browserColor, toHex, toRgba } from '../../../shared/controls/color-value';
import { IconDocument } from '../icon-document';
import { elementsOf } from '../svg/node-ids';
import { CommandError, DocCommand } from './command';
import { CommandJson } from './command-json';

/** Attributes (and `style` properties) that hold a colour (prompt 074 E4). */
export const PAINT_PROPS: readonly string[] = [
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
  'color',
];

const HEX = /^#([0-9A-F]{6}|[0-9A-F]{8})$/;

/** The CSS 2 colour names – known without a browser (tests, jsdom); the rest asks the browser. */
const BASIC: Readonly<Record<string, string>> = {
  black: '#000000',
  silver: '#C0C0C0',
  gray: '#808080',
  grey: '#808080',
  white: '#FFFFFF',
  maroon: '#800000',
  red: '#FF0000',
  purple: '#800080',
  fuchsia: '#FF00FF',
  green: '#008000',
  lime: '#00FF00',
  olive: '#808000',
  yellow: '#FFFF00',
  navy: '#000080',
  blue: '#0000FF',
  teal: '#008080',
  aqua: '#00FFFF',
  orange: '#FFA500',
};

const resolve = (css: string) => BASIC[css.trim().toLowerCase()] ?? browserColor(css);

/**
 * A paint value as `#RRGGBB(AA)` upper case (opaque alpha left out); `null` for `none`, keywords,
 * references and what the browser does not know. In jsdom (no canvas) named colours stay unknown.
 */
export function normalizeColor(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s || s === 'none' || /^(url|var)\(/i.test(s) || /^(inherit|currentcolor|context-)/i.test(s))
    return null;
  const c = toRgba(s, resolve);
  if (!c || c.a <= 0) return null;
  return toHex({ ...c, a: Math.round(c.a * 255) / 255 });
}

function styleProps(style: string): [string, string][] {
  return style
    .split(';')
    .map((d) => d.split(':'))
    .filter((p) => p.length >= 2)
    .map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim()]);
}

/** One change of `ReplaceColor`: an attribute or the `style` of an element. */
interface Change {
  el: Element;
  name: string;
  old: string;
}

/**
 * "Replace Color in the whole icon" (prompt 074 E4) on the SVG assets – every paint attribute and
 * `style` property whose colour is `from` gets `to`, one step, serialisable
 * (`{ type: 'replaceColor', from, to, assets? }`). `assets` limits it to some images. The colours
 * of `icon.json` change through `setIconJsonValue` in the same composite (the action).
 */
export class ReplaceColor implements DocCommand {
  readonly label = 'replaceColor';
  private changes: Change[] = [];
  /** How many values changed (0: nothing had the colour). */
  count = 0;

  constructor(
    readonly from: string,
    readonly to: string,
    readonly assets?: readonly string[],
  ) {
    if (!HEX.test(from) || !HEX.test(to)) throw new CommandError('invalid command: colour');
  }

  do(doc: IconDocument): void {
    this.changes = [];
    for (const a of doc.assets.values()) {
      if (this.assets && !this.assets.includes(a.name)) continue;
      const root = a.svg?.root;
      if (!root) continue;
      for (const el of elementsOf(root)) {
        for (const name of PAINT_PROPS) {
          const v = el.getAttribute(name);
          if (v !== null && normalizeColor(v) === this.from) {
            this.changes.push({ el, name, old: v });
            el.setAttribute(name, this.to);
          }
        }
        const style = el.getAttribute('style');
        if (style && PAINT_PROPS.some((p) => style.toLowerCase().includes(p))) {
          let hit = false;
          const next = styleProps(style)
            .map(([k, v]) => {
              if (
                PAINT_PROPS.includes(k) &&
                normalizeColor(v.replace(/!important$/i, '')) === this.from
              ) {
                hit = true;
                return `${k}: ${this.to}`;
              }
              return `${k}: ${v}`;
            })
            .join('; ');
          if (hit) {
            this.changes.push({ el, name: 'style', old: style });
            el.setAttribute('style', next);
          }
        }
      }
    }
    this.count = this.changes.length;
  }

  undo(): void {
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const c = this.changes[i];
      c.el.setAttribute(c.name, c.old);
    }
  }

  toJSON(): CommandJson {
    return {
      type: 'replaceColor',
      from: this.from,
      to: this.to,
      ...(this.assets ? { assets: [...this.assets] } : {}),
    };
  }
}
