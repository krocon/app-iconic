// Design 005 E2: no chord twice in a keymap file. `JSON.parse` keeps only the last of two equal
// keys, so the Vitest checks cannot see a duplicate – this test reads the raw text.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'core', 'actions');
const FILES = ['keymap.base.json', 'keymap.mac.json', 'keymap.other.json'];

/** Keys per context object of a flat `{ "<context>": { "<chord>": "<id>" } }` file. */
export function duplicateKeys(text) {
  const dups = [];
  let context = null;
  let seen = new Set();
  for (const line of text.split('\n')) {
    const open = /^\s*"([^"]+)":\s*\{\s*(\}\s*,?)?\s*$/.exec(line);
    if (open) {
      context = open[1];
      seen = new Set();
      continue;
    }
    const entry = /^\s*"((?:[^"\\]|\\.)+)":\s*"[^"]*",?\s*$/.exec(line);
    if (entry && context) {
      if (seen.has(entry[1])) dups.push(`${context}: ${entry[1]}`);
      seen.add(entry[1]);
    }
  }
  return dups;
}

test('the duplicate check finds a repeated chord', () => {
  const text = '{\n  "global": {\n    "Mod+s": "file.save",\n    "Mod+s": "file.open"\n  }\n}\n';
  assert.deepEqual(duplicateKeys(text), ['global: Mod+s']);
});

for (const name of FILES) {
  test(`${name} has no chord twice in a context`, () => {
    const text = readFileSync(join(DIR, name), 'utf8');
    JSON.parse(text);
    assert.deepEqual(duplicateKeys(text), []);
  });
}
