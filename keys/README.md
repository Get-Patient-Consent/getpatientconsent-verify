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

Use the script — it refuses anything that is not an SPKI EC P-256 **public** key,
computes the fingerprint with the verifier's own function, and appends to the
registry. It never commits.

```bash
# The app's keygen writes <key_id>.public.pem; the key_id is taken from the filename.
npm run keys:add -- --pem ~/gpc-keys/gpc-2026-10.public.pem --env production
# staging keys go to keys/non-production/ with an environment marker:
npm run keys:add -- --pem ~/gpc-keys/gpc-staging-2026-10.public.pem --env staging
```

Then run the `git add`/`commit`/`push` lines it prints. **Push before the key
signs anything** — the `CONSENT_SIGNING_PUBLIC_KEY_URL` it prints is dead until
`main` has the file.

## Retiring a key

Only once the app has switched to the new key and the old one has signed its
last record:

```bash
npm run keys:retire -- gpc-2026-06
```

This flips `status` to `retired` and sets `retired_at`. The `.pem` stays.

## Checking

`npm run keys:check` (also part of `npm test`) confirms every registry entry
points at a file whose fingerprint matches, with no duplicates.
