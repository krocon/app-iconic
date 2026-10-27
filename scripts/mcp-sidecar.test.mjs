// From editlicious scripts/mcp-sidecar.test.mjs (design 016); the release workflow is prompt 016.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sidecarFiles, sidecarName } from './mcp-sidecar.mjs';

test('sidecar names follow Tauri externalBin (name-<triple>[.exe])', () => {
  assert.equal(sidecarName('x86_64-unknown-linux-gnu'), 'app-iconic-mcp-x86_64-unknown-linux-gnu');
  assert.equal(sidecarName('x86_64-pc-windows-msvc'), 'app-iconic-mcp-x86_64-pc-windows-msvc.exe');
  assert.equal(sidecarName('universal-apple-darwin'), 'app-iconic-mcp-universal-apple-darwin');
});

test('the sidecar config bundles the program next to the app (design 018 E18)', () => {
  const conf = JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.sidecar.conf.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(conf.bundle.externalBin, ['binaries/app-iconic-mcp']);
  // the everyday config stays without it, so `tauri dev` and CI need no sidecar build
  const main = JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  assert.equal(main.bundle.externalBin, undefined);
});

test('a universal macOS build needs the sidecar of each architecture too', () => {
  assert.deepEqual(sidecarFiles('universal-apple-darwin'), [
    'app-iconic-mcp-aarch64-apple-darwin',
    'app-iconic-mcp-x86_64-apple-darwin',
    'app-iconic-mcp-universal-apple-darwin',
  ]);
  assert.deepEqual(sidecarFiles('x86_64-pc-windows-msvc'), [
    'app-iconic-mcp-x86_64-pc-windows-msvc.exe',
  ]);
});
