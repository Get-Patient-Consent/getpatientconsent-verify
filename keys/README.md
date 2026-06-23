# Public signing keys

Each `<key_id>.pem` here is a **public** key (SPKI PEM) used to verify Get Patient
Consent signatures. [`INDEX.json`](INDEX.json) lists every key with its fingerprint
and status.

## Policy

- **Public keys only.** Never commit a private key to this repository.
- **Append-only.** When a key is rotated, add the new key and mark the old one
  `retired` — **never delete it**. Historic documents must stay verifiable forever.
- **Fingerprint is the anchor.** A document's integrity record carries
  `key_fingerprint_sha256`; it is the SHA-256 of the DER form of the public key.
  A verifier confirms the published key matches that fingerprint before trusting it.

## Adding a key

```bash
# Given the public key PEM exported from the signer (or kms:GetPublicKey):
KEY_ID=gpc-env-2026-06
cp /path/to/public.pem keys/$KEY_ID.pem

# Compute its fingerprint for INDEX.json:
openssl pkey -pubin -in keys/$KEY_ID.pem -outform DER | sha256sum
```

Then add an entry to `INDEX.json` with the `key_id`, `file`, `fingerprint_sha256`,
`status: "active"` and `published_at`.

> The example placeholder entry should be removed once a real key is added.
