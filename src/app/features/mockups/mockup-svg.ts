import { Appearance } from '../canvas/appearance';
import { Line, Panel, Placeholder, SceneLayout, sceneTheme } from './mockup-scenes';

/**
 * A scene of "In Context" as one SVG in points (prompt 081, design E3/E6): an own neutral backdrop
 * (gradient and soft shapes, or the user's image), panels and bars, abstract placeholder icons and
 * the edited icon as nested SVG data URL (the export SVG of 057). Nothing is referenced from
 * outside – every `href` is a `data:` URL – so the browser shows it as `<img>` and resvg renders
 * the same text to PNG (design E8). No platform artwork, logos or system typefaces are copied.
 */

export interface SceneBackground {
  /** `data:image/png|jpeg|webp;base64,…` from the open dialog (Rust checked it). */
  dataUrl: string;
}

export interface SceneInput {
  layout: SceneLayout;
  appearance: Appearance;
  /** Data URL of the icon's export SVG for this scene; `null` = not drawn yet. */
  icon: string | null;
  /** The icon's name (labels). */
  name: string;
  background: SceneBackground | null;
  /** Accessible title of the image. */
  title: string;
  /**
   * Previews of the user's recently used icons (data URLs, prompt 082 E10): they take the
   * placeholder slots in order; missing ones stay abstract placeholders.
   */
  neighbours?: readonly string[];
}

interface Palette {
  from: string;
  to: string;
  blobA: string;
  blobB: string;
  panel: string;
  panelOpacity: number;
  stroke: string;
  strokeOpacity: number;
  text: string;
  muted: string;
}

const LIGHT: Palette = {
  from: '#dbe7f5',
  to: '#f3e9dc',
  blobA: '#b9d3f0',
  blobB: '#f1cfa8',
  panel: '#ffffff',
  panelOpacity: 0.6,
  stroke: '#ffffff',
  strokeOpacity: 0.75,
  text: '#222428',
  muted: '#6b6f76',
};

const DARK: Palette = {
  from: '#18202e',
  to: '#2a2038',
  blobA: '#2d4a6b',
  blobB: '#4b2f5a',
  panel: '#0b0d12',
  panelOpacity: 0.5,
  stroke: '#ffffff',
  strokeOpacity: 0.14,
  text: '#f1f2f4',
  muted: '#a4a8b0',
};

/** Own colours of the placeholder icons (no app's colours). */
export const TONES = [
  '#5b8def',
  '#3fb38a',
  '#f2a541',
  '#e5677d',
  '#9a7fe0',
  '#43b5c9',
  '#c9a227',
  '#8a94a6',
  '#6fbf5a',
  '#d9734e',
  '#4f6fd1',
  '#b45fb0',
];

const r = (v: number) => Math.round(v * 100) / 100;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** UTF-8 text as `data:image/svg+xml;base64,…` (works in `<img>` and for resvg). */
export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** The name cut to what fits `width` at `size` (rough average glyph width). */
export function fitName(name: string, width: number, size: number): string {
  const max = Math.max(1, Math.floor(width / (size * 0.56)));
  const chars = [...name.trim()];
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, Math.max(1, max - 1)).join('') + '…';
}

function rect(p: Panel, attrs: string): string {
  return `<rect x="${r(p.x)}" y="${r(p.y)}" width="${r(p.width)}" height="${r(p.height)}" rx="${r(p.radius)}" ${attrs}/>`;
}

/** An abstract glyph (circle, rounded square, triangle, ring, diamond, bars) centred in a box. */
function glyph(kind: number, cx: number, cy: number, s: number, color: string): string {
  const h = s / 2;
  switch (kind % 6) {
    case 0:
      return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(h)}" fill="${color}"/>`;
    case 1:
      return `<rect x="${r(cx - h)}" y="${r(cy - h)}" width="${r(s)}" height="${r(s)}" rx="${r(s * 0.2)}" fill="${color}"/>`;
    case 2:
      return `<path d="M${r(cx)} ${r(cy - h)}L${r(cx + h)} ${r(cy + h * 0.8)}H${r(cx - h)}Z" fill="${color}"/>`;
    case 3:
      return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(h * 0.8)}" fill="none" stroke="${color}" stroke-width="${r(s * 0.2)}"/>`;
    case 4:
      return `<path d="M${r(cx)} ${r(cy - h)}L${r(cx + h)} ${r(cy)}L${r(cx)} ${r(cy + h)}L${r(cx - h)} ${r(cy)}Z" fill="${color}"/>`;
    default: {
      const w = s / 5;
      return [0, 2, 4]
        .map(
          (i) =>
            `<rect x="${r(cx - h + i * w)}" y="${r(cy - h + (i === 2 ? 0 : s * 0.25))}" width="${r(w)}" height="${r(i === 2 ? s : s * 0.75)}" rx="${r(w / 2)}" fill="${color}"/>`,
        )
        .join('');
    }
  }
}

/** A placeholder icon in the look of its scene – or a recently used icon's preview (082 E10). */
function placeholder(
  p: Placeholder,
  layout: SceneLayout,
  appearance: Appearance,
  neighbour?: string,
): string {
  const tone = TONES[p.tone % TONES.length];
  const [fill, mark] =
    appearance === 'light'
      ? [tone, '#ffffff']
      : appearance === 'dark'
        ? ['#2b2f36', tone]
        : ['#2b2b2b', '#9a9a9a'];
  // the Dock's tiles hold the macOS template: a body of 824 / 1024 with margin (design E5)
  const inset = layout.spec.look === 'macos' ? (p.size * 100) / 1024 : 0;
  const body = p.size - 2 * inset;
  const radius = body * (layout.spec.look === 'view' ? 0.2 : 0.225);
  const box = { x: p.x + inset, y: p.y + inset, width: body, height: body, radius };
  // the tinted scene stays grey: a coloured preview would not be tinted
  if (neighbour && appearance !== 'tinted') {
    return `<image data-neighbour="${p.tone}" x="${r(box.x)}" y="${r(box.y)}" width="${r(body)}" height="${r(body)}" href="${escapeXml(neighbour)}"/>`;
  }
  return (
    `<g data-placeholder="${p.tone}">` +
    rect(box, `fill="${fill}"`) +
    glyph(p.tone, p.x + p.size / 2, p.y + p.size / 2, body * 0.42, mark) +
    '</g>'
  );
}

function line(l: Line, pal: Palette, name: string): string {
  const color = l.muted ? pal.muted : pal.text;
  if (l.name) {
    const text = escapeXml(fitName(name, l.width, l.size));
    return `<text x="${r(l.x)}" y="${r(l.y)}" font-family="sans-serif" font-size="${l.size}" text-anchor="${l.anchor}" fill="${color}">${text}</text>`;
  }
  const h = Math.max(4, l.size / 2.2);
  const x = l.anchor === 'middle' ? l.x - l.width / 2 : l.x;
  return rect(
    { x, y: l.y - h, width: l.width, height: h, radius: h / 2 },
    `fill="${color}" fill-opacity="0.35"`,
  );
}

function backdrop(input: SceneInput, pal: Palette): string {
  const { width: w, height: h } = input.layout.spec;
  if (input.background) {
    return `<image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${escapeXml(input.background.dataUrl)}"/>`;
  }
  return (
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${pal.from}"/><stop offset="1" stop-color="${pal.to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>` +
    `<circle cx="${r(w * 0.18)}" cy="${r(h * 0.2)}" r="${r(h * 0.55)}" fill="${pal.blobA}" fill-opacity="0.55"/>` +
    `<circle cx="${r(w * 0.86)}" cy="${r(h * 0.9)}" r="${r(h * 0.5)}" fill="${pal.blobB}" fill-opacity="0.5"/>`
  );
}

/** The scene as SVG text (points; `width`/`height` give resvg the image size). */
export function sceneSvg(input: SceneInput): string {
  const { layout, appearance } = input;
  const { width: w, height: h } = layout.spec;
  const pal = sceneTheme(layout.spec, appearance) === 'light' ? LIGHT : DARK;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-scene="${layout.spec.id}" data-appearance="${appearance}">`,
  );
  parts.push(`<title>${escapeXml(input.title)}</title>`);
  parts.push(backdrop(input, pal));
  for (const p of layout.panels) {
    parts.push(
      rect(
        p,
        `fill="${pal.panel}" fill-opacity="${pal.panelOpacity}" stroke="${pal.stroke}" stroke-opacity="${pal.strokeOpacity}"`,
      ),
    );
  }
  if (layout.highlight)
    parts.push(rect(layout.highlight, `fill="${pal.text}" fill-opacity="0.08"`));
  layout.placeholders.forEach((p, i) =>
    parts.push(placeholder(p, layout, appearance, input.neighbours?.[i])),
  );
  if (input.icon) {
    for (const s of layout.own) {
      parts.push(
        `<image data-own="" x="${r(s.x)}" y="${r(s.y)}" width="${s.size}" height="${s.size}" href="${escapeXml(input.icon)}"/>`,
      );
    }
  }
  for (const l of layout.lines) parts.push(line(l, pal, input.name));
  for (const m of layout.marks) parts.push(rect(m, `fill="${pal.text}" fill-opacity="0.7"`));
  parts.push('</svg>');
  return parts.join('');
}
