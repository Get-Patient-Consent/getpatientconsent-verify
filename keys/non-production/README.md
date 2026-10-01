# Non-production signing keys

Public keys for **staging and rehearsal** instances. A record signed with any key
here is a test record and must not be treated as a genuine consent. Production
keys live in [`../INDEX.json`](../INDEX.json) and nowhere else.

Same policy as the parent folder: public keys only, append-only, never delete.

## Adding a key

```bash
KEY_ID=gpc-staging-2026-10
cp /path/to/$KEY_ID.public.pem keys/non-production/$KEY_ID.pem
openssl pkey -pubin -in keys/non-production/$KEY_ID.pem -outform DER | shasum -a 256
```

Add an entry to [`INDEX.json`](INDEX.json): `key_id`, `file`, `fingerprint_sha256`,
`environment` (e.g. `staging`), `status: "active"`, `published_at`, `retired_at: null`.
