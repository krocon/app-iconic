// Theme tokens of src/styles.css (design 015 E15): the dark block under the media query and the
// forced dark block are the same, every token is in all three blocks, and text tokens keep their
// contrast in light and dark (WCAG 2.x: 4.5:1 for text, 3:1 for large text and UI parts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');

/** `--name: value` of the first block that starts with `selector`. */
function block(selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const tokens = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return tokens;
}

const light = block(':root {');
const darkMedia = block(":root:not([data-theme='light'])");
const darkForced = block(":root[data-theme='dark']");

function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [foreground, background, minimum ratio]. */
const PAIRS = [
  ['--color-text', '--color-bg', 4.5],
  ['--color-text', '--color-surface', 4.5],
  ['--color-text', '--color-surface-2', 4.5],
  ['--color-text-muted', '--color-surface', 4.5],
  ['--color-text-muted', '--color-bg', 4.5],
  ['--color-accent-text', '--color-accent', 4.5],
  ['--color-error', '--color-surface', 4.5],
  ['--color-warning', '--color-surface', 4.5],
  ['--color-text', '--color-selection', 4.5],
  // canvas (design 015 E15): ruler numbers are small text
  ['--ai-ruler-text', '--ai-ruler-bg', 4.5],
  ['--ai-ruler-tick', '--ai-ruler-bg', 1.5],
  ['--color-focus', '--color-surface', 3],
  ['--color-border', '--color-surface', 1.2],
  ['--code-tag', '--color-surface', 4.5],
  ['--code-attr', '--color-surface', 4.5],
  ['--code-string', '--color-surface', 4.5],
  ['--code-comment', '--color-surface', 4.5],
  ['--code-punct', '--color-surface', 4.5],
];

test('the dark blocks are the same and every colour token is in all three', () => {
  assert.deepEqual(darkForced, darkMedia);
  const colour = (t) =>
    t.startsWith('--color-') || t.startsWith('--ai-') || t.startsWith('--code-');
  const lightColours = Object.keys(light).filter(colour).sort();
  assert.deepEqual(Object.keys(darkMedia).filter(colour).sort(), lightColours);
});

for (const [name, tokens] of [
  ['light', light],
  ['dark', darkForced],
]) {
  test(`contrast of the ${name} scheme`, () => {
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(tokens[fg], tokens[bg]);
      assert.ok(ratio >= min, `${name}: ${fg} on ${bg} = ${ratio.toFixed(2)} < ${min}`);
    }
  });
}
