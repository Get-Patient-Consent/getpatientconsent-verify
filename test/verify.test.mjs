// Cross-implementation round-trip for the public verifier (spec §14.13).
//
// The vectors in test/vectors/ were produced by the Get Patient Consent app's
// OWN signer (shared/consent-signing.ts → signConsentRecord), with a throwaway
// test key. This proves the independent, zero-dependency verify.mjs accepts a
// real app-produced signature byte-for-byte — and that tampering or a wrong key
// is rejected. If the two implementations ever drift (e.g. signature encoding),
// this test fails.
//
// Run: `npm test`  (node --test, no dependencies).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { verify, publicKeyFingerprint } from '../verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const vec = (name) => join(here, 'vectors', name);

const canonicalBytes = readFileSync(vec('sample.canonical.json'));
const integrity = JSON.parse(readFileSync(vec('sample.integrity.json'), 'utf8'));
const publicKeyPem = readFileSync(vec('sample.public.pem'), 'utf8');

test('accepts an app-produced signature (intact, authentic, right key)', () => {
  const result = verify({ canonicalBytes, integrity, publicKeyPem });
  assert.equal(result.verified, true);
  assert.deepEqual(result.checks, { hash: true, signature: true, fingerprint: true });
});

test('the published fingerprint matches the public key', () => {
  assert.equal(publicKeyFingerprint(publicKeyPem), integrity.key_fingerprint_sha256);
});

test('rejects a one-byte tamper of the canonical bytes', () => {
  const tampered = Buffer.from(canonicalBytes);
  tampered[tampered.length - 5] ^= 0x01; // flip a bit well inside the JSON
  const result = verify({ canonicalBytes: tampered, integrity, publicKeyPem });
  assert.equal(result.verified, false);
  assert.equal(result.checks.hash, false);
});

test('rejects verification under the wrong key', () => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const wrongPem = publicKey.export({ type: 'spki', format: 'pem' });
  const result = verify({ canonicalBytes, integrity, publicKeyPem: wrongPem });
  assert.equal(result.verified, false);
  assert.equal(result.checks.signature, false);
});
