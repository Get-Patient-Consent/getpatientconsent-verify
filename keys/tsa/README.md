# Timestamp Authority (TSA) certificates

This folder archives the **CA certificate** for each RFC 3161 timestamp authority
the platform uses, so a record's `trusted_timestamp` token can be verified
**offline** — even years later, and even if the TSA itself disappears.

A timestamp token is only as durable as the certificate needed to check it.
Storing the CA cert here (public, forkable, mirrored) is the timestamp counterpart
to publishing the signing public keys in [`../`](../).

## Naming convention

The integrity record names the issuing authority in `trusted_timestamp.tsa`. The
cert for that authority lives here as **`<tsa>-cacert.pem`**, where `<tsa>` is the
same name. That name comes from the app's `TSA_URLS` config: `freetsa=https://…`
→ `tsa: "freetsa"` → `freetsa-cacert.pem`. A bare URL uses its hostname.

So `HOW-TO-VERIFY.md`'s `openssl ts -verify … -CAfile keys/tsa/<tsa>-cacert.pem`
resolves directly from the token's `tsa` field.

## Why these aren't committed for you

A CA certificate is a **trust anchor**. You should obtain each one from its
authoritative source and verify its fingerprint yourself, rather than trust a
copy someone handed you. The steps below download each cert and print its SHA-256
fingerprint so you can cross-check it against the provider before committing it.

## Easiest: `npm run tsa:certs`

The app ships a helper that does this for every configured authority at once. It
asks each TSA for a timestamp and extracts the certificate chain the TSA embeds
in the token (we request `certReq`), so it works without hunting for per-provider
cert URLs:

```
cd app
npm run tsa:certs -- --out=../GetPatientConsentVerify/keys/tsa
# or pass authorities directly:
npm run tsa:certs -- freetsa=https://freetsa.org/tsr digicert=http://timestamp.digicert.com
```

It writes `<name>-cacert.pem` per authority and prints each certificate's subject
+ SHA-256 fingerprint. **Cross-check the fingerprints against the providers
below, then commit the `.pem` files.** The manual recipes that follow are the
fallback if you'd rather fetch a provider's published root directly.

## Recommended free RFC 3161 authorities (and how to archive their certs)

Use two or more. Configure them in the app with, e.g.:

```
TSA_URLS=freetsa=https://freetsa.org/tsr,digicert=http://timestamp.digicert.com,certum=http://time.certum.pl
```

### FreeTSA — `https://freetsa.org/tsr`  (good primary for alpha)

```bash
# CA cert (this is the trust anchor to archive):
curl -sS https://freetsa.org/files/cacert.pem -o freetsa-cacert.pem
# TSA signing cert (optional, useful for -untrusted in some openssl versions):
curl -sS https://freetsa.org/files/tsa.crt   -o freetsa-tsa.crt
# Verify the fingerprint, then cross-check it against https://freetsa.org/ :
openssl x509 -in freetsa-cacert.pem -noout -fingerprint -sha256
```

### DigiCert — `http://timestamp.digicert.com`

The token is `certReq`-signed; extract the embedded chain from a token you
obtain, or download DigiCert's Trusted Root + Timestamp ICA from
`https://www.digicert.com/kb/digicert-root-certificates.htm`, then:

```bash
openssl x509 -in digicert-cacert.pem -noout -fingerprint -sha256
```

### Certum — `http://time.certum.pl`   ·   DFN — `http://zeitstempel.dfn.de`

Download each provider's CA from its official root/repository page, save as
`certum-cacert.pem` / `dfn-cacert.pem`, and fingerprint-verify as above.

> Tip: because we set `certReq` in the request, the TSA embeds its signing
> certificate **inside the token**. You can inspect what a token actually carries
> with `openssl ts -reply -in ts.token -text` — handy for confirming you've
> archived the right CA.

## What to commit here

For each authority you enable: `<tsa>-cacert.pem` (required) and optionally the
TSA signing cert. Add the verified SHA-256 fingerprint to your commit message so
reviewers can confirm the anchor.
