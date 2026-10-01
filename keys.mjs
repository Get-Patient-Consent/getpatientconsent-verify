#!/usr/bin/env node
// gpc-verify keys — maintain the public signing-key registry (keys/INDEX.json).
//
//   node keys.mjs add    --pem <public.pem> --env production|staging [--key-id <id>] [--published-at YYYY-MM-DD]
//   node keys.mjs retire <key-id> [--retired-at YYYY-MM-DD]
//
// Zero dependencies, like verify.mjs. It never commits: it edits the working
// tree and prints the git commands.
//
// The guards are the point of this file:
//   - `add` refuses anything that is not an SPKI EC P-256 PUBLIC key, so a
//     private key can never be committed through this path.
//   - fingerprints come from the same publicKeyFingerprint() the verifier uses.
//   - the registry is append-only: `add` refuses a conflicting key_id or
//     fingerprint, `retire` only flips status, nothing ever deletes.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey } from 'node:crypto';
import { publicKeyFingerprint } from './verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_BASE = 'https://raw.githubusercontent.com/Get-Patient-Consent/getpatientconsent-verify/main';

/** Registry directory per environment. `dev` is deliberately absent: dev keys are not published. */
const REGISTRY_DIR = { production: 'keys', staging: 'keys/non-production' };

function fail(msg) {
  console.error(`gpc-verify keys: ${msg}`);
  process.exit(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function assertDate(s, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) fail(`${flag} must be YYYY-MM-DD`);
  return s;
}

function readIndex(dir) {
  const path = join(here, dir, 'INDEX.json');
  return { path, index: JSON.parse(readFileSync(path, 'utf8')) };
}

function writeIndex(path, index) {
  writeFileSync(path, JSON.stringify(index, null, 2) + '\n');
}

/** Returns the public key PEM, or exits. Anything that is not an SPKI EC P-256 public key is refused. */
export function assertPublicP256Pem(pem) {
  if (/PRIVATE KEY/.test(pem)) throw new Error('that is a PRIVATE key — refusing. Only the .public.pem is published.');
  if (!/-----BEGIN PUBLIC KEY-----/.test(pem)) throw new Error('not an SPKI public key PEM (expected -----BEGIN PUBLIC KEY-----)');
  let key;
  try {
    key = createPublicKey(pem);
  } catch (e) {
    throw new Error(`unparseable public key: ${e.message}`);
  }
  if (key.type !== 'public') throw new Error(`not a public key (got ${key.type})`);
  if (key.asymmetricKeyType !== 'ec') throw new Error(`not an EC key (got ${key.asymmetricKeyType})`);
  const curve = key.asymmetricKeyDetails?.namedCurve;
  if (curve !== 'prime256v1') throw new Error(`not P-256 (got ${curve})`);
  // Normalise: re-export so the committed file is canonical SPKI PEM regardless of source formatting.
  return key.export({ type: 'spki', format: 'pem' });
}

/** Every entry in an index must point at a file whose fingerprint matches. Used by `npm test` too. */
export function checkIndex(dir) {
  const { index } = readIndex(dir);
  const problems = [];
  const seenIds = new Set();
  const seenFp = new Set();
  for (const k of index.keys) {
    const path = join(here, dir, k.file);
    if (seenIds.has(k.key_id)) problems.push(`${k.key_id}: duplicate key_id`);
    if (seenFp.has(k.fingerprint_sha256)) problems.push(`${k.key_id}: duplicate fingerprint`);
    seenIds.add(k.key_id);
    seenFp.add(k.fingerprint_sha256);
    if (k.file !== `${k.key_id}.pem`) problems.push(`${k.key_id}: file should be ${k.key_id}.pem, is ${k.file}`);
    if (!existsSync(path)) {
      problems.push(`${k.key_id}: ${k.file} missing`);
      continue;
    }
    let fp;
    try {
      fp = publicKeyFingerprint(assertPublicP256Pem(readFileSync(path, 'utf8')));
    } catch (e) {
      problems.push(`${k.key_id}: ${e.message}`);
      continue;
    }
    if (fp !== k.fingerprint_sha256) problems.push(`${k.key_id}: fingerprint mismatch (file ${fp}, index ${k.fingerprint_sha256})`);
    if (!['active', 'retired'].includes(k.status)) problems.push(`${k.key_id}: bad status ${k.status}`);
    if (k.status === 'retired' && !k.retired_at) problems.push(`${k.key_id}: retired without retired_at`);
    if (k.status === 'active' && k.retired_at) problems.push(`${k.key_id}: active but has retired_at`);
  }
  return problems;
}

function cmdAdd(args) {
  if (!args.pem) fail('add requires --pem <public.pem>');
  const dir = REGISTRY_DIR[args.env];
  if (!dir) fail(`add requires --env ${Object.keys(REGISTRY_DIR).join('|')} (dev keys are not published)`);

  let pem;
  try {
    pem = assertPublicP256Pem(readFileSync(args.pem, 'utf8'));
  } catch (e) {
    fail(e.message);
  }
  const fingerprint = publicKeyFingerprint(pem);
  const keyId = args['key-id'] ?? basename(args.pem).replace(/(\.public)?\.pem$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(keyId)) fail(`key-id "${keyId}" must be lowercase [a-z0-9-] (pass --key-id)`);
  const publishedAt = args['published-at'] ? assertDate(args['published-at'], '--published-at') : today();

  const { path: indexPath, index } = readIndex(dir);
  const file = `${keyId}.pem`;
  const dest = join(here, dir, file);

  const byId = index.keys.find((k) => k.key_id === keyId);
  const byFp = index.keys.find((k) => k.fingerprint_sha256 === fingerprint);
  if (byId && byId.fingerprint_sha256 === fingerprint && existsSync(dest) && publicKeyFingerprint(readFileSync(dest, 'utf8')) === fingerprint) {
    console.log(`${keyId} is already published in ${dir}/INDEX.json with this fingerprint — nothing to do.`);
    return;
  }
  if (byId) fail(`key_id ${keyId} already exists in ${dir}/INDEX.json with a DIFFERENT key. Keys are never replaced; pick a new key-id.`);
  if (byFp) fail(`this key is already published as ${byFp.key_id}`);
  if (existsSync(dest)) fail(`${dir}/${file} already exists but is not in the index — resolve by hand`);

  const entry = {
    key_id: keyId,
    file,
    fingerprint_sha256: fingerprint,
    ...(args.env !== 'production' ? { environment: args.env } : {}),
    status: 'active',
    published_at: publishedAt,
    retired_at: null,
  };
  writeFileSync(dest, pem);
  index.keys.push(entry);
  writeIndex(indexPath, index);

  const problems = checkIndex(dir);
  if (problems.length) fail(`registry inconsistent after add:\n  ${problems.join('\n  ')}`);

  console.log(`Published ${keyId} (${args.env})`);
  console.log(`  ${dir}/${file}`);
  console.log(`  ${dir}/INDEX.json  +1 entry, fingerprint ${fingerprint}`);
  console.log('');
  console.log('Commit and push — the URL below is dead until main has it:');
  console.log(`  git add ${dir}/${file} ${dir}/INDEX.json`);
  console.log(`  git commit -m "keys: publish ${keyId}${args.env === 'production' ? '' : ` (${args.env})`}"`);
  console.log('  git push');
  console.log('');
  console.log(`  CONSENT_SIGNING_PUBLIC_KEY_URL=${RAW_BASE}/${dir}/${file}`);
}

function cmdRetire(args) {
  const keyId = args._[0];
  if (!keyId) fail('retire requires <key-id>');
  const retiredAt = args['retired-at'] ? assertDate(args['retired-at'], '--retired-at') : today();

  for (const dir of Object.values(REGISTRY_DIR)) {
    const { path: indexPath, index } = readIndex(dir);
    const entry = index.keys.find((k) => k.key_id === keyId);
    if (!entry) continue;
    if (entry.status === 'retired') {
      console.log(`${keyId} was already retired on ${entry.retired_at} — nothing to do.`);
      return;
    }
    entry.status = 'retired';
    entry.retired_at = retiredAt;
    writeIndex(indexPath, index);
    console.log(`Retired ${keyId} as of ${retiredAt} in ${dir}/INDEX.json. The key file stays — retired keys are never removed.`);
    console.log('');
    console.log(`  git add ${dir}/INDEX.json`);
    console.log(`  git commit -m "keys: retire ${keyId}"`);
    console.log('  git push');
    return;
  }
  fail(`${keyId} is not in any registry`);
}

function parse(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1], i++;
    else a._.push(argv[i]);
  }
  return a;
}

function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._.shift();
  switch (cmd) {
    case 'add':
      return cmdAdd(args);
    case 'retire':
      return cmdRetire(args);
    case 'check': {
      const problems = Object.values(REGISTRY_DIR).flatMap((d) => checkIndex(d).map((p) => `${d}: ${p}`));
      if (problems.length) fail(problems.join('\n'));
      console.log('registries consistent');
      return;
    }
    default:
      console.error('Usage:\n  node keys.mjs add    --pem <public.pem> --env production|staging [--key-id <id>] [--published-at YYYY-MM-DD]\n  node keys.mjs retire <key-id> [--retired-at YYYY-MM-DD]\n  node keys.mjs check');
      process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
