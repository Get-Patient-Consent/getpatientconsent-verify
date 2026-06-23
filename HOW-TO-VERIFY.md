# How to verify a Get Patient Consent record

You need three things, all of which travel with the document or live in this repo:

- `consent.canonical.json` — the exact canonical bytes that were signed.
- `consent.integrity.json` — the detached integrity record (signature + key id).
- the **public key** — `keys/<key_id>.pem` in this repo (the `key_id` is named in
  the integrity record).

There are two equivalent ways to check it.

## Option A — the bundled tool (Node 18+, no install)

```bash
node verify.mjs --canonical consent.canonical.json --integrity consent.integrity.json
```

The tool looks up `keys/<key_id>.pem` automatically. Pass `--pubkey <file>` to use
a specific key file. Output is a JSON summary plus `VERIFIED OK` / `VERIFICATION
FAILED`, with a matching exit code.

## Option B — stock OpenSSL (no Node at all)

The signature is standard ES256 (DER ECDSA), so OpenSSL verifies it directly.

```bash
# 1. Confirm the content fingerprint matches the integrity record
sha256sum consent.canonical.json
#    compare to "canonical_sha256" in consent.integrity.json

# 2. Extract the signature bytes from the integrity record
python3 -c "import json,base64,sys; \
  open('sig.bin','wb').write(base64.b64decode(json.load(open('consent.integrity.json'))['server_signature']))"

# 3. Confirm you have the right key: its SHA-256 must equal key_fingerprint_sha256
KEY_ID=$(python3 -c "import json;print(json.load(open('consent.integrity.json'))['key_id'])")
openssl pkey -pubin -in keys/$KEY_ID.pem -outform DER 2>/dev/null | sha256sum
#    compare to "key_fingerprint_sha256" in consent.integrity.json

# 4. Verify the signature over the canonical bytes
openssl dgst -sha256 -verify keys/$KEY_ID.pem -signature sig.bin consent.canonical.json
#    -> "Verified OK"
```

If step 1's fingerprint differs, the record was altered. If step 4 does not print
`Verified OK`, the signature is invalid or the wrong key was used.

## What each check establishes

| Check | Proves |
|---|---|
| Fingerprint matches (step 1) | the record is intact and unmodified |
| Signature verifies (step 4) | it was sealed by Get Patient Consent and is unaltered |
| Key fingerprint matches (step 3) | you used the genuine published key |

None of these steps contacts Get Patient Consent. A complete verification can be
performed entirely offline.
