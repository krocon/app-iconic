import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, outdated, render } from './fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('generated fixture modules are up to date', async () => {
  assert.deepEqual(await outdated(ROOT), []);
});

test('the module carries icon.json and the SVG assets byte for byte', async () => {
  const src = await render(ROOT, MODULES[0]);
  const json = readFileSync(join(ROOT, MODULES[0].bundle, 'icon.json'), 'utf8');
  const literal = src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'));
  const data = Function(`return (${literal});`)();
  assert.equal(data.name, 'camscanner.icon');
  assert.equal(data.iconJson, json);
  assert.deepEqual(
    data.assets.map((a) => a.name),
    ['logo-scanner 3.svg', 'logo-scanner-2 2.svg'],
  );
});

test('a changed fixture is reported', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fixtures-'));
  for (const p of ['testdata', 'src/testing', '.prettierrc']) {
    cpSync(join(ROOT, p), join(root, p), { recursive: true });
  }
  const json = join(root, MODULES[0].bundle, 'icon.json');
  writeFileSync(json, readFileSync(json, 'utf8') + ' ');
  assert.deepEqual(await outdated(root), [MODULES[0].out]);
});

test('the SVG fixtures and the name table are carried as is', async () => {
  const svg = await render(ROOT, MODULES[1]);
  const names = await render(ROOT, MODULES[2]);
  const literal = (src) =>
    Function(`return (${src.slice(src.lastIndexOf('= ') + 2, src.lastIndexOf(';'))});`)();
  const files = literal(svg);
  const nested = files.find((f) => f.name === 'nested_g.svg');
  assert.equal(nested.text, readFileSync(join(ROOT, 'testdata/fixtures/svg/nested_g.svg'), 'utf8'));
  const table = JSON.parse(readFileSync(join(ROOT, 'testdata/unique-names.json'), 'utf8'));
  assert.deepEqual(literal(names), { asset: table.asset, layer: table.layer });
});
