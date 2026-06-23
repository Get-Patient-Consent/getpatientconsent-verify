#!/usr/bin/env node
// gpc-verify — independent verifier for Get Patient Consent records.
//
// Zero dependencies (Node's built-in crypto only). This is deliberately small so
// anyone can audit it. It proves that a consent record was sealed by Get Patient
// Consent and has not changed since — WITHOUT contacting Get Patient Consent.
//
// What it checks, given the canonical bytes, the integrity record and a public key:
//   1. SHA-256(canonical bytes) == integrity.canonical_sha256        (intact)
//   2. ECDSA-P256/SHA-256 signature verifies under the public key    (authentic)
//   3. the public key's fingerprint == integrity.key_fingerprint     (right key)
//
// The signature is standard ES256 (DER), so `openssl` verifies it too — see
// HOW-TO-VERIFY.md. This tool is a convenience, not the root of trust.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

export function publicKeyFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return sha256Hex(der);
}

/** Pure verification. canonicalBytes: Buffer; integrity: object; publicKeyPem: string. */
export function verify({ canonicalBytes, integrity, publicKeyPem }) {
  const hash = sha256Hex(canonicalBytes) === integrity.canonical_sha256;

  let signature = false;
  try {
    signature = cryptoVerify(
      'sha256',
      canonicalBytes,
      { key: createPublicKey(publicKeyPem), dsaEncoding: 'der' },
      Buffer.from(integrity.server_signature, 'base64'),
    );
  } catch {
    signature = false;
  }

  const fingerprint = integrity.key_fingerprint_sha256
    ? publicKeyFingerprint(publicKeyPem) === integrity.key_fingerprint_sha256
    : null;

  return { verified: hash && signature && fingerprint !== false, checks: { hash, signature, fingerprint } };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parse(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1], i++;
  }
  return a;
}

function main() {
  const args = parse(process.argv.slice(2));
  if (!args.canonical || !args.integrity) {
    console.error('Usage: node verify.mjs --canonical <name.canonical.json> --integrity <name.integrity.json> [--pubkey <pub.pem>] [--keys-dir <dir>]');
    process.exit(2);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const canonicalBytes = readFileSync(args.canonical);
  const integrity = JSON.parse(readFileSync(args.integrity, 'utf8'));

  // Public key: explicit, else from the keys/ directory by key_id.
  const keysDir = args['keys-dir'] || join(here, 'keys');
  const pubPath = args.pubkey || join(keysDir, `${integrity.key_id}.pem`);
  const publicKeyPem = readFileSync(pubPath, 'utf8');

  const result = verify({ canonicalBytes, integrity, publicKeyPem });
  console.log(JSON.stringify({ key_id: integrity.key_id, ...result }, null, 2));
  console.log(result.verified ? 'VERIFIED OK' : 'VERIFICATION FAILED');
  process.exit(result.verified ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
