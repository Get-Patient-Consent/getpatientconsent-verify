# How to verify a Get Patient Consent record

> **If you have the signed PDF**, the record is embedded inside it (PDF/A-3).
> Extract the files first, then follow the steps below:
> ```bash
> pdfdetach -saveall consent.pdf      # writes consent-record.json + consent-record.integrity.json + HOW-TO-VERIFY.txt
> ```
> `consent-record.json` is the canonical signed bytes; `consent-record.integrity.json`
> is the signature + key + trusted-timestamp record referenced below.

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

## Trusted timestamp (proves *when*)

When the integrity record includes a `trusted_timestamp`, it is an **RFC 3161**
token from an independent timestamp authority (TSA) proving the signature — and
therefore the signed record — existed at the attested time. The token is taken
over the **signature**, not the canonical bytes (a timestamp cannot live inside
the data it certifies), so it is verified against `server_signature`:

```bash
# The token was issued over SHA-256(server_signature). Recreate that input:
python3 -c "import json,base64; \
  open('sig.bin','wb').write(base64.b64decode(json.load(open('consent.integrity.json'))['server_signature']))"

# Extract the token (base64 DER) from the integrity record:
python3 -c "import json,base64; \
  open('ts.token','wb').write(base64.b64decode(json.load(open('consent.integrity.json'))['trusted_timestamp']['token_base64']))"

# Verify the token against the signature, using the TSA's CA cert (archived here):
openssl ts -verify -data sig.bin -in ts.token -CAfile keys/tsa/<tsa>-cacert.pem
#    -> "Verification: OK"

# Read the attested time:
openssl ts -reply -in ts.token -text | grep -i "Time stamp"
```

The TSA's CA certificate is archived under `keys/tsa/` so the token stays
verifiable offline even if the TSA disappears. The `tsa` field in the record
names which authority issued it. A genuine `Verification: OK` plus the signature
check above proves the consent existed, intact, at the stated time — without
contacting anyone.

> Note: the TSA CA certificate(s) need to be committed under `keys/tsa/` before
> this step works end-to-end; until then the token is still stored in every
> record and can be verified once the cert is archived.
