# Get Patient Consent — public verification

This repository is the **independent, durable home** for everything needed to
verify a Get Patient Consent record:

- the **public signing keys** (current and every retired key — see [`keys/`](keys/)),
- a small, dependency-free **verification tool** ([`verify.mjs`](verify.mjs)),
- the step-by-step **manual recipe** using standard tools ([`HOW-TO-VERIFY.md`](HOW-TO-VERIFY.md)).

It is intentionally separate from the application so that consent records remain
verifiable **regardless of the company's status** — this repo is public,
forkable, mirrorable and archived. Trust derives from the key fingerprint carried
inside each document, not from any server being online.

## What verification proves

A consent record is a canonical JSON document signed with **ES256** (ECDSA on the
NIST P‑256 curve, SHA‑256). Verifying it proves:

1. **Integrity** — the record has not changed since it was signed.
2. **Authorship** — it was sealed by Get Patient Consent (the holder of the
   private key matching a public key published here).
3. **Time** *(when a trusted timestamp is present)* — it existed at a stated time,
   attested by an independent timestamp authority.

It does **not**, by itself, establish that the consent was clinically valid —
that depends on the consent discussion, the patient's capacity and the
information provided. The record *evidences* that process.

## Quick start

```bash
# Using the bundled tool (Node 18+, no install):
node verify.mjs --canonical consent.canonical.json --integrity consent.integrity.json
# (the public key is looked up automatically from keys/<key_id>.pem)

# Or verify with stock openssl — see HOW-TO-VERIFY.md
```

A successful run prints `VERIFIED OK` and exits `0`; a failure prints
`VERIFICATION FAILED` and exits non‑zero.

## Trust model

The authoritative artefacts are the **canonical bytes** + the **detached
integrity record** + the **published public key**. The document embeds the key
*fingerprint*, so a key obtained from anywhere (this repo, a fork, a mirror, or
the document itself) can be checked against it. This repo's job is to be the
independent place those public keys are published and kept forever.

Signed consent PDFs are **PDF/A‑3** and carry the canonical record + integrity
record as embedded files, so a single PDF is self-verifying offline: extract the
attachments with `pdfdetach -saveall consent.pdf`, then run the recipe above on
the extracted `consent-record.json` / `consent-record.integrity.json`. Each PDF
also shows a QR/link to the (convenience) online verifier; the offline check here
is the root of trust.

## Tests

```bash
npm test   # node --test, no dependencies
```

The suite (`test/verify.test.mjs`) runs `verify.mjs` against a vector in
`test/vectors/` that was produced by the application's **own** signer, proving
this independent verifier accepts a real app‑produced signature byte‑for‑byte and
rejects tampering or a wrong key. If the two implementations ever drift, it fails.

## Licence

[MIT](LICENSE). This repository contains only public material — never private
keys, never patient data.
