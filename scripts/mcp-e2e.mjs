#!/usr/bin/env node
// End-to-end check of AI control (design 018 E19): starts the sidecar `app-iconic-mcp` over stdio
// like Claude Code does and drives the running AppIconic through it – new icon, background, a
// circle with a gradient, preview, PNG export, undo of every AI step. Prints one line per step.
//
//   node scripts/mcp-e2e.mjs <sidecar> <out-dir>          the app runs with AI control on
//   node scripts/mcp-e2e.mjs <sidecar> --expect-off       the app is off / AI control off
//
// The app and this script must see the same config folder (XDG_CONFIG_HOME / HOME) or the same
// APP_ICONIC_MCP_ENDPOINT. Not part of `pnpm check` (needs the real app, e.g. under Xvfb).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const [sidecar, out] = process.argv.slice(2);
if (!sidecar || !out) {
  console.error('usage: mcp-e2e.mjs <sidecar> <out-dir | --expect-off>');
  process.exit(2);
}

const child = spawn(sidecar, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: child.stdout });
const waiting = new Map();
let nextId = 1;
lines.on('line', (l) => {
  const msg = JSON.parse(l);
  waiting.get(msg.id)?.(msg);
  waiting.delete(msg.id);
});

function rpc(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve) => waiting.set(id, resolve));
}

/** A tool call: the structured result, or throws `code: message`. */
async function tool(name, args = {}) {
  const r = (await rpc('tools/call', { name, arguments: args })).result;
  if (r.isError) throw new Error(r.content[0].text);
  return { ...r.structuredContent, content: r.content };
}

function check(ok, what) {
  if (!ok) {
    console.error(`FAIL ${what}`);
    child.kill();
    process.exit(1);
  }
  console.log(`ok   ${what}`);
}

const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'mcp-e2e', version: '1' },
});
check(init.result.serverInfo.name === 'app-iconic', 'initialize');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const list = await rpc('tools/list', {});
check(list.result.tools.length === 19, `tools/list: ${list.result.tools.length} tools`);

if (out === '--expect-off') {
  const r = (await rpc('tools/call', { name: 'list_documents', arguments: {} })).result;
  check(
    r.isError && r.content[0].text.startsWith('not_running:'),
    `clear error: ${r.content[0].text}`,
  );
  child.kill();
  process.exit(0);
}

mkdirSync(out, { recursive: true });
// the app may still be starting
let docs;
for (let i = 0; i < 60; i++) {
  try {
    docs = await tool('list_documents');
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
check(docs !== undefined, `list_documents: ${JSON.stringify(docs?.documents)}`);

const doc = await tool('new_document');
const id = doc.id;
check(typeof id === 'string', `new_document → ${id} (pristine ${doc.pristine})`);

const bg = await tool('run_action', {
  id,
  action: 'icon.setFill',
  args: { fill: { solid: 'srgb:0.08000,0.16000,0.45000,1.00000' } },
  expected_revision: doc.revision,
});
check(bg.ran && bg.undo === 'Undo AI: Change Background', `background: ${bg.undo}`);

const circle = await tool('insert_svg', {
  id,
  markup:
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="sun">' +
    '<stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#ff5a1f"/>' +
    '</radialGradient></defs><circle cx="512" cy="512" r="320" fill="url(#sun)"/></svg>',
  expected_revision: bg.revision,
});
check(circle.undo === 'Undo AI: Add SVG Snippet', `circle with gradient: ${circle.undo}`);

const tree = await tool('get_tree', { id });
const node = tree.nodes.find((n) => n.tag === 'circle');
check(!!node, `get_tree: ${tree.total} rows, circle ${JSON.stringify(node?.ref)}`);
const info = await tool('get_node', { id, node: node.ref });
check(
  info.bbox && Math.abs(info.bbox.width - 640) < 0.5,
  `get_node: bbox ${JSON.stringify(info.bbox)} (browser-measured)`,
);

const stale = (
  await rpc('tools/call', {
    name: 'run_action',
    arguments: { id, action: 'add.rect', expected_revision: doc.revision },
  })
).result;
check(
  stale.isError && stale.content[0].text.startsWith('revision_conflict'),
  'stale revision refused',
);

const preview = await tool('render_preview', { id, size: 256 });
const image = preview.content.find((c) => c.type === 'image');
const png = Buffer.from(image.data, 'base64');
writeFileSync(join(out, 'preview.png'), png);
check(
  png.subarray(1, 4).toString() === 'PNG',
  `render_preview: ${png.length} bytes PNG, image content`,
);

const ex = await tool('export_png', {
  id,
  dir: out,
  sizes: [1024, 64],
  appearances: ['light'],
  overwrite: true,
});
check(
  ex.files.length === 2 && ex.files.every((f) => existsSync(f.path)),
  `export_png: ${ex.files.map((f) => f.name).join(', ')}`,
);
check(readFileSync(ex.files[0].path).subarray(1, 4).toString() === 'PNG', 'exported file is a PNG');

// prompt 078: Xcode icon set – structure, pixel sizes, App Store icon without alpha
const set = await tool('export_package', {
  id,
  dir: out,
  format: 'appiconset',
  platforms: ['ios', 'macos', 'watchos'],
  appearances: ['dark', 'tinted'],
  overwrite: true,
});
const contents = JSON.parse(readFileSync(join(set.folder, 'Contents.json'), 'utf8'));
const pngInfo = (f) => {
  const b = readFileSync(join(set.folder, f));
  return { width: b.readUInt32BE(16), colorType: b[25] };
};
const sizesOk = contents.images.every((img) => {
  const pt = Number(img.size.split('x')[0]);
  const scale = img.scale ? Number(img.scale[0]) : 1;
  return pngInfo(img.filename).width === pt * scale;
});
check(
  contents.images.length === 14 && sizesOk,
  `export_package appiconset: ${contents.images.length} images, sizes match Contents.json`,
);
check(
  pngInfo('ios-1024.png').colorType === 2 && pngInfo('ios-1024-dark.png').colorType === 6,
  'iOS App Store icon is RGB without alpha, dark keeps alpha',
);
check(
  contents.images.some((i) => i.appearances?.[0]?.value === 'tinted'),
  'Contents.json has the tinted luminosity entry',
);
for (const format of ['icns', 'ico']) {
  const r = await tool('export_package', { id, dir: out, format, overwrite: true });
  const b = readFileSync(r.files[0].path);
  const ok = format === 'icns' ? b.subarray(0, 4).toString() === 'icns' : b.readUInt16LE(2) === 1;
  check(ok && b.length > 1000, `export_package ${format}: ${r.files[0].name}, ${b.length} bytes`);
}

// prompt 079: Android adaptive icon and web set
const android = await tool('export_package', { id, dir: out, format: 'android', overwrite: true });
const res = (f) => readFileSync(join(android.folder, f));
const pxOf = (b) => b.readUInt32BE(16);
check(
  android.files.length === 28 &&
    res('res/mipmap-anydpi-v26/ic_launcher.xml').toString().includes('<monochrome') &&
    pxOf(res('res/mipmap-xxxhdpi/ic_launcher_foreground.png')) === 432 &&
    pxOf(res('res/mipmap-mdpi/ic_launcher.png')) === 48 &&
    res('ic_launcher-playstore.png')[25] === 2,
  `export_package android: ${android.files.length} files, layers 108 dp per density, Play 512 RGB`,
);
const web = await tool('export_package', { id, dir: out, format: 'web', overwrite: true });
const wf = (f) => readFileSync(join(web.folder, f));
check(
  web.files.length === 8 &&
    // light and dark differ → both halves with prefers-color-scheme; here they are the same
    wf('favicon.svg').toString().includes('<svg') &&
    wf('favicon.ico').readUInt16LE(4) === 3 &&
    pxOf(wf('apple-touch-icon.png')) === 180 &&
    wf('icon-maskable-512.png')[25] === 2 &&
    JSON.parse(wf('manifest.webmanifest').toString()).icons.length === 3,
  `export_package web: ${web.files.map((f) => f.name).join(', ')}`,
);

// every AI call is one undo step
const steps = [];
for (const expect of ['Undo AI: Add SVG Snippet', 'Undo AI: Change Background']) {
  const d = await tool('get_document', { id, icon_json: false });
  steps.push(d.undo);
  if (d.undo !== expect) check(false, `undo title ${d.undo}, expected ${expect}`);
  await tool('run_action', { id, action: 'edit.undo' });
}
const after = await tool('get_document', { id, icon_json: false });
const gone = (await tool('get_tree', { id })).nodes.every((n) => n.tag !== 'circle');
check(after.undo === null && gone, `undo per AI step: ${steps.join(' → ')} → nothing left`);

await tool('run_action', { id, action: 'edit.redo' });
await tool('run_action', { id, action: 'edit.redo' });
const saved = await tool('save_document', { id, path: join(out, 'ai.icon'), format: 'zip' });
check(existsSync(saved.path), `save_document: ${saved.path}`);
const shot = await tool('render_preview', { id, size: 512 });
writeFileSync(
  join(out, 'final.png'),
  Buffer.from(shot.content.find((c) => c.type === 'image').data, 'base64'),
);
console.log(`done – preview in ${join(out, 'final.png')}`);
child.kill();
