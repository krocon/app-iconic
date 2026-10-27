import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bigSvg, random } from './big-svg.mjs';

test('the big SVG has ≥ 20 000 shapes and ≥ 5 MB, the same every time', () => {
  const s = bigSvg();
  const shapes = (s.match(/<(path|circle|rect) /g) ?? []).length;
  assert.ok(shapes >= 20_000, `${shapes} shapes`);
  assert.ok(Buffer.byteLength(s) >= 5 * 1024 * 1024, `${Buffer.byteLength(s)} bytes`);
  assert.equal(s, bigSvg());
  assert.notEqual(random(1)(), random(2)());
  const plain = bigSvg(300, 31, { opacity: false });
  assert.ok(!plain.includes('opacity'));
  assert.ok(bigSvg(300).includes('opacity="0.8"'));
});
