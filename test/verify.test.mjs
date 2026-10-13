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
import { verify, publicKeyFingerprint, markSvg } from '../verify.mjs';

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

// Schema 1.5: the drawn signature is inside the canonical bytes (MARK-FORMAT.md).
// This vector was also produced by the app's own signer, with a throwaway key.
const v15 = {
  canonicalBytes: readFileSync(vec('sample-1.5.canonical.json')),
  integrity: JSON.parse(readFileSync(vec('sample-1.5.integrity.json'), 'utf8')),
  publicKeyPem: readFileSync(vec('sample-1.5.public.pem'), 'utf8'),
};

test('a schema 1.5 record (mark inside the signed bytes) verifies', () => {
  assert.equal(verify(v15).verified, true);
});

test('the drawn mark is redrawn from the record alone, as SVG', () => {
  const svg = markSvg(v15.canonicalBytes);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 400"/);
  assert.ok((svg.match(/<path /g) ?? []).length > 0);
});

test('a record sealed before 1.5 has no mark to draw', () => {
  assert.equal(markSvg(canonicalBytes), null);
});

test('moving one point of the mark breaks verification', () => {
  const tampered = Buffer.from(v15.canonicalBytes.toString('utf8').replace('"strokes":[[235,', '"strokes":[[236,'));
  assert.notDeepEqual(tampered, v15.canonicalBytes);
  assert.equal(verify({ ...v15, canonicalBytes: tampered }).verified, false);
});

