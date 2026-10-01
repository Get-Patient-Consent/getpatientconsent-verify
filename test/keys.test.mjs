// Registry maintenance (keys.mjs): the committed registries are consistent,
// a private key can never be published, and add/retire round-trip against a
// scratch copy of the repo (the real keys/ is never touched by tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { assertPublicP256Pem, checkIndex } from '../keys.mjs';
import { publicKeyFingerprint } from '../verify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('committed registries are consistent (files exist, fingerprints match, statuses sane)', () => {
  assert.deepEqual(checkIndex('keys'), []);
  assert.deepEqual(checkIndex('keys/non-production'), []);
});

test('refuses a private key, a non-EC key and a non-P-256 key', () => {
  const p256 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const p384 = generateKeyPairSync('ec', { namedCurve: 'P-384' });
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = (k, type) => k.export({ type, format: 'pem' });
  assert.throws(() => assertPublicP256Pem(pem(p256.privateKey, 'pkcs8')), /PRIVATE key/);
  assert.throws(() => assertPublicP256Pem(pem(p256.privateKey, 'sec1')), /PRIVATE key/);
  assert.throws(() => assertPublicP256Pem(pem(p384.publicKey, 'spki')), /not P-256/);
  assert.throws(() => assertPublicP256Pem(pem(rsa.publicKey, 'spki')), /not an EC key/);
  assert.ok(assertPublicP256Pem(pem(p256.publicKey, 'spki')).startsWith('-----BEGIN PUBLIC KEY-----'));
});

// Scratch copy of the repo so `add`/`retire` resolve paths relative to it.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'gpc-verify-keys-'));
  for (const f of ['keys.mjs', 'verify.mjs']) cpSync(join(root, f), join(dir, f));
  cpSync(join(root, 'keys'), join(dir, 'keys'), { recursive: true });
  return dir;
}
const run = (dir, ...args) => execFileSync('node', [join(dir, 'keys.mjs'), ...args], { encoding: 'utf8' });
const runFails = (dir, ...args) => {
  try {
    run(dir, ...args);
  } catch (e) {
    return e.stderr;
  }
  assert.fail('expected the command to fail');
};
const index = (dir, sub = 'keys') => JSON.parse(readFileSync(join(dir, sub, 'INDEX.json'), 'utf8'));

test('add → publishes, is idempotent, refuses conflicts; retire → flips status only', () => {
  const dir = scratch();
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const pubPath = join(dir, 'gpc-2099-01.public.pem');
  writeFileSync(pubPath, pubPem);
  writeFileSync(join(dir, 'gpc-2099-01.private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));

  // The private key is refused before anything is written.
  assert.match(runFails(dir, 'add', '--pem', join(dir, 'gpc-2099-01.private.pem'), '--env', 'production'), /PRIVATE key/);
  // --env is required and dev is not a registry.
  assert.match(runFails(dir, 'add', '--pem', pubPath), /requires --env/);
  assert.match(runFails(dir, 'add', '--pem', pubPath, '--env', 'dev'), /requires --env/);

  const before = index(dir).keys.length;
  const out = run(dir, 'add', '--pem', pubPath, '--env', 'production', '--published-at', '2099-01-01');
  assert.match(out, /Published gpc-2099-01 \(production\)/);
  assert.match(out, /CONSENT_SIGNING_PUBLIC_KEY_URL=https:\/\/raw\.githubusercontent\.com\/.*\/keys\/gpc-2099-01\.pem/);
  const after = index(dir);
  assert.equal(after.keys.length, before + 1);
  const entry = after.keys.at(-1);
  assert.deepEqual(entry, {
    key_id: 'gpc-2099-01',
    file: 'gpc-2099-01.pem',
    fingerprint_sha256: publicKeyFingerprint(pubPem),
    status: 'active',
    published_at: '2099-01-01',
    retired_at: null,
  });
  assert.equal(readFileSync(join(dir, 'keys', 'gpc-2099-01.pem'), 'utf8'), pubPem);

  // Idempotent re-add; conflicting re-adds refused.
  assert.match(run(dir, 'add', '--pem', pubPath, '--env', 'production'), /already published/);
  assert.match(runFails(dir, 'add', '--pem', pubPath, '--env', 'production', '--key-id', 'gpc-2099-02'), /already published as gpc-2099-01/);
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' });
  writeFileSync(join(dir, 'other.pem'), other);
  assert.match(runFails(dir, 'add', '--pem', join(dir, 'other.pem'), '--env', 'production', '--key-id', 'gpc-2099-01'), /never replaced/);

  // Staging goes to the non-production registry with an environment marker.
  const st = run(dir, 'add', '--pem', join(dir, 'other.pem'), '--env', 'staging', '--key-id', 'gpc-staging-2099-01');
  assert.match(st, /non-production\/gpc-staging-2099-01\.pem/);
  assert.equal(index(dir, 'keys/non-production').keys.at(-1).environment, 'staging');

  // Retire: status + date flip, nothing removed, idempotent, unknown id fails.
  assert.match(run(dir, 'retire', 'gpc-2099-01', '--retired-at', '2099-02-01'), /Retired gpc-2099-01/);
  const retired = index(dir).keys.find((k) => k.key_id === 'gpc-2099-01');
  assert.equal(retired.status, 'retired');
  assert.equal(retired.retired_at, '2099-02-01');
  assert.equal(index(dir).keys.length, before + 1);
  assert.match(run(dir, 'retire', 'gpc-2099-01'), /already retired/);
  assert.match(runFails(dir, 'retire', 'nope'), /not in any registry/);

  assert.match(run(dir, 'check'), /consistent/);
});
