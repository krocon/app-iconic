import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTags, compactNode, phosphorNodes, tablerData } from './symbol-data.mjs';

test('tags: lower case, no markers, no duplicates', () => {
  assert.deepEqual(cleanTags(['Love', '*new*', 'love', ' x ', 3]), ['love', 'x', '3']);
});

test('plain paths become their d, others stay [tag, attrs]', () => {
  assert.equal(compactNode(['path', { d: 'M0 0' }]), 'M0 0');
  assert.deepEqual(compactNode(['path', { d: 'M0 0', fill: 'currentColor' }]), [
    'path',
    { d: 'M0 0', fill: 'currentColor' },
  ]);
  assert.deepEqual(compactNode(['circle', { r: '1' }]), ['circle', { r: '1' }]);
});

test('tabler: sorted ids, tags with the category', () => {
  const d = tablerData(
    { b: [['path', { d: 'M1 1' }]], a: [['path', { d: 'M0 0' }]] },
    { a: { tags: ['x'], category: 'Shapes' } },
    '1.0.0',
  );
  assert.deepEqual(Object.keys(d.nodes), ['a', 'b']);
  assert.deepEqual(d.tags, { a: ['x', 'shapes'], b: [] });
  assert.equal(d.size, 24);
});

test('phosphor: paths only, anything else fails', () => {
  const ok =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M0 0"/><path d="M1 1"/></svg>';
  assert.deepEqual(phosphorNodes(ok, 'x'), ['M0 0', 'M1 1']);
  assert.throws(() => phosphorNodes(ok.replace('<path d="M1 1"/>', '<circle r="1"/>'), 'x'));
  assert.throws(() => phosphorNodes(ok.replace('0 0 256 256', '0 0 24 24'), 'x'));
});
