#!/usr/bin/env node
// The data of the symbol sets Tabler (outline) and Phosphor (regular) for the symbol picker
// (prompt 084, design E2/E3): one compact JSON per set under src/app/features/symbols/data/,
// loaded lazily as its own chunk. Generated from the npm packages (`@tabler/icons`,
// `@phosphor-icons/core`, MIT) because neither ships its data in an importable form: Tabler's
// `exports` hide `tabler-nodes-outline.json`, Phosphor only has one SVG file per icon.
//
//   node scripts/symbol-data.mjs          write the files
//   node scripts/symbol-data.mjs --check  fail if a file is out of date
//
// Format: { set, version, size, nodes: { id: Element[] }, tags: { id: string[] } } with
// Element = "d" (a path) | [tag, attrs].
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/app/features/symbols/data');

/** Directory of an installed package (read directly: its `exports` hide the data files). */
function packageDir(name) {
  return join(ROOT, 'node_modules', name);
}

function version(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
}

/** Search words of a set: lower case, without markers like `*new*`, no duplicates. */
export function cleanTags(list) {
  const out = [];
  for (const t of list) {
    const s = String(t).trim().toLowerCase();
    if (!s || /^\*.*\*$/.test(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/** One element: a plain path as its `d`, anything else as `[tag, attrs]`. */
export function compactNode([tag, attrs]) {
  const keys = Object.keys(attrs);
  if (tag === 'path' && keys.length === 1 && keys[0] === 'd') return attrs.d;
  return [tag, attrs];
}

/** Tabler: the outline nodes and the tags + category of `icons.json`. */
export function tablerData(nodes, icons, ver) {
  const out = { set: 'tabler', version: ver, size: 24, nodes: {}, tags: {} };
  for (const id of Object.keys(nodes).sort()) {
    out.nodes[id] = nodes[id].map(compactNode);
    const meta = icons[id] ?? {};
    out.tags[id] = cleanTags([...(meta.tags ?? []), ...(meta.category ? [meta.category] : [])]);
  }
  return out;
}

/**
 * The elements of one Phosphor SVG file. Phosphor's regular icons are `<svg viewBox="0 0 256 256"
 * fill="currentColor">` with `<path d>` only – anything else fails loudly (a new package version
 * is checked, not guessed).
 */
export function phosphorNodes(svg, id) {
  if (!/^<svg [^>]*viewBox="0 0 256 256"[^>]*>/.test(svg))
    throw new Error(`${id}: unexpected root`);
  const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const nodes = [];
  const rest = body.replace(/<path d="([^"]*)"\s*\/>/g, (_, d) => {
    nodes.push(d);
    return '';
  });
  if (rest.trim() || !nodes.length)
    throw new Error(`${id}: unexpected content ${rest.slice(0, 80)}`);
  return nodes;
}

async function phosphorData() {
  const dir = packageDir('@phosphor-icons/core');
  const { icons } = await import(pathToFileURL(join(dir, 'dist/index.mjs')).href);
  const meta = new Map(icons.map((i) => [i.name, i]));
  const out = { set: 'phosphor', version: version(dir), size: 256, nodes: {}, tags: {} };
  const files = readdirSync(join(dir, 'assets/regular'))
    .filter((f) => f.endsWith('.svg'))
    .sort();
  for (const f of files) {
    const id = f.slice(0, -4);
    out.nodes[id] = phosphorNodes(readFileSync(join(dir, 'assets/regular', f), 'utf8').trim(), id);
    const m = meta.get(id) ?? {};
    out.tags[id] = cleanTags([...(m.tags ?? []), ...(m.categories ?? [])]);
  }
  return out;
}

function tablerFromPackage() {
  const dir = packageDir('@tabler/icons');
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return tablerData(read('tabler-nodes-outline.json'), read('icons.json'), version(dir));
}

async function main() {
  const check = process.argv.includes('--check');
  const files = [
    ['tabler-outline.json', tablerFromPackage()],
    ['phosphor-regular.json', await phosphorData()],
  ];
  let stale = 0;
  for (const [name, data] of files) {
    const path = join(OUT, name);
    const text = JSON.stringify(data) + '\n';
    if (check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
        console.error(`${name} is out of date – run: pnpm symbols:data`);
        stale++;
      }
    } else {
      writeFileSync(path, text);
      console.log(`${name}: ${Object.keys(data.nodes).length} icons, ${text.length} bytes`);
    }
  }
  if (stale) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
