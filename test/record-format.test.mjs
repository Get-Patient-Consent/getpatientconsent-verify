// RECORD-FORMAT.md must describe every field a real record carries.
//
// Walks every key of the sample records under test/vectors/ (one per format
// version the app has sealed) and fails if a key is not named in
// RECORD-FORMAT.md as a backticked token. A new field cannot ship in a vector
// without a line of documentation, and a documented field that no longer
// appears is caught by eye in review rather than here (removed fields stay
// documented under "Changes by version").
//
// Run: `npm test`  (node --test, no dependencies).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const doc = readFileSync(join(here, '..', 'RECORD-FORMAT.md'), 'utf8');
const vectorsDir = join(here, 'vectors');

function keysOf(value, into = new Set()) {
  if (Array.isArray(value)) for (const v of value) keysOf(v, into);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysOf(v, into);
    }
  }
  return into;
}

const canonicalVectors = readdirSync(vectorsDir).filter((f) => f.endsWith('.canonical.json'));

test('there is at least one canonical vector per documented current version', () => {
  const versions = canonicalVectors.map((f) => JSON.parse(readFileSync(join(vectorsDir, f), 'utf8')).schema_version);
  const current = doc.match(/Current format: \*\*(\d+\.\d+)\*\*/)?.[1];
  assert.ok(current, 'RECORD-FORMAT.md names a current format');
  assert.ok(versions.includes(current), `a vector for the current format ${current} exists (have ${versions.join(', ')})`);
});

for (const file of canonicalVectors) {
  test(`every key in ${file} is described in RECORD-FORMAT.md`, () => {
    const record = JSON.parse(readFileSync(join(vectorsDir, file), 'utf8'));
    // A key counts as described when it appears as a backticked token, bare
    // (`granted`) or as the tail of a dotted path (`render.leaflets`).
    const described = (k) => doc.includes('`' + k + '`') || doc.includes('.' + k + '`') || doc.includes('`' + k + '[]`');
    const undocumented = [...keysOf(record)].filter((k) => !described(k));
    assert.deepEqual(undocumented, [], `undocumented keys in ${file}`);
    assert.ok(doc.includes(`| ${record.schema_version} |`), `version ${record.schema_version} has a row in "Changes by version"`);
  });
}
