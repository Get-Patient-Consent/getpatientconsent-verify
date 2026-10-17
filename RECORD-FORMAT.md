# The consent record: what each field means

This describes `consent-record.json`, the file embedded in every signed
Get Patient Consent PDF and the exact bytes the signature covers. Verifying
the signature ([`HOW-TO-VERIFY.md`](HOW-TO-VERIFY.md)) proves these bytes are
intact and genuine; this document says what they mean, so the record can be
read without access to Get Patient Consent's systems or source code.

Current format: **1.6**. Older records carry their own `schema_version`; the
[changes by version](#changes-by-version) table at the end says which fields a
given version has, so a field that is missing from an older record is read as
absent by design, not as tampering.

## Reading it

The record is one JSON object. Three conventions apply throughout:

- **Who said it.** Every field is one of three kinds, marked below as
  *[patient]* (the patient's own words, ticks or answers), *[content]* (what the
  clinician put in front of the patient, frozen onto this consent when it was
  issued; a later change to any library or template cannot reach it), or
  *[system]* (recorded by the application: identifiers, timestamps, digests).
- **`null` is a statement, not a gap.** A `null` answer means the patient saw the
  question and left it blank; a `null` band means no band was shown; a `null`
  identity value means the clinic does not hold it. Fields the format defines are
  always present in that version, `null` when empty, never omitted.
- **Timestamps** are ISO 8601 in UTC (`2026-10-17T19:45:51.088Z`). Dates of birth
  are `YYYY-MM-DD`.

The canonical form is RFC 8785 (JCS): keys sorted, no whitespace. Pretty-printing
it for reading is fine; re-serialising it is not, since any byte change breaks
the signature.

## What is deliberately not in the record

- The patient's **email address and phone number**. They are shown on the
  "Your details" page and confirmed there, but they are contact details, not
  identity, and are not sealed.
- **Instructions and navigation** text on the pages ("Click Next", how to use
  the signature pad). Only text that carries consent meaning is sealed.
- The **planned procedure date**. It is scheduling, not consent (removed at
  1.3); the material dates are when the patient signed and, separately, the
  day-of confirmation, which is its own sealed document chained to this one.
- **Clinic branding** (organisation name, logo, address) and any
  **countersignature**. The responsible clinician is recorded under
  `clinician`; a day-of confirmation is a separate record, never a change to
  this one.
- Anything that would require Get Patient Consent to exist to interpret: no
  template identifiers, no library version pointers. The words themselves are
  inline.

## Top level

| Field | Kind | Meaning |
|---|---|---|
| `schema_version` | system | The format of this record, e.g. `"1.6"`. Decides which fields to expect. |
| `consent_event_id` | system | The identifier of this consent. Printed on the PDF as "Record reference" and used in the online verify URL. |
| `tenant_id` | system | The organisation the issuing clinician belonged to. An opaque identifier. |
| `render` | | Everything the patient was shown and agreed to. The PDF is rendered from this block alone. |
| `engagement` | system | How the patient moved through it: when each section was first read and for how long. |
| `signature_event` | patient | The act of signing: when, how, the typed name and the drawn mark. |
| `verification` | system | How the patient's identity was checked before they could open the consent. |
| `clinician` | system | Who issued the consent and when it was issued. |
| `audit` | system | A digest binding the consent's audit-log events up to signing. |

## `render`

### `render.patient`

| Field | Kind | Meaning |
|---|---|---|
| `name` | content | Full name as held by the clinic. |
| `date_of_birth` | content | `YYYY-MM-DD`. |
| `sex` | content | As held; `null` if not recorded. |
| `nhs_number` | content | As held; `null` if not recorded. Never shown to the patient for confirmation. |
| `hospital_number` | content | As held; `null` if not recorded. Never shown to the patient for confirmation. |
| `postcode` | content | As held; `null` if not recorded. |
| `confirmed_by_patient` | patient | The patient ticked "These details are correct" on the "Your details" page, and the details had not changed between that tick and signing. `confirmed_at` is when; `fields` names exactly which of `name`, `date_of_birth`, `sex`, `postcode` were on screen (blank values are not shown, so not listed). `null` if the consent had no details page. Absent before 1.4. |

### `render.context`

| Field | Kind | Meaning |
|---|---|---|
| `payment_class` | content | `"nhs"`, `"private"` or `null`. |

### Sections and their order

| Field | Kind | Meaning |
|---|---|---|
| `section_order` | content | The section keys in the order the patient read them, e.g. `core_details`, `core_procedures`, `core_benefits`, `core_risks`, `core_alternatives`, `core_leaflets`, then any optional sections, then `core_declaration`. |
| `section_titles` | content | The heading the patient saw for each key, e.g. `"core_risks": "Risks of your procedure"`. From 1.6. |

### `render.procedures` (the "Your proposed procedure(s)" section)

One entry per procedure, in the order shown.

| Field | Kind | Meaning |
|---|---|---|
| `ref` | system | Identifier of this procedure row within the consent. Opaque. |
| `name` | content | The procedure name as shown. |
| `code`, `code_system` | content | The coding, e.g. `"L8542"` in `"CCSD"`, or OPCS-4. `null` if uncoded. |
| `role` | content | `"primary"` or `"possible"`. |
| `laterality` | content | `"left"`, `"right"`, `"bilateral"` or `"not_applicable"`. |
| `anaesthesia` | content | The proposed anaesthesia, e.g. `["local"]`, `["spinal", "sedation"]`. May be empty. |
| `narrative` | content | The plain-language description shown under the name. |
| `notes` | content | Any free-text note the clinician added for the patient; `null` if none. |
| `side_confirmed` | patient | The wrong-side safeguard. The patient ticked "Please confirm: this operation is on the left side" (or right, or both); `value` is the side they confirmed and `confirmed_at` when. `null` for a procedure with no side. The signature is refused unless `value` equals `laterality` at the moment of signing. |

### `render.benefits`, `render.complications`, `render.alternatives`

The three clinical-item sections, each in the order shown. Only items the
patient was shown are present.

| Field | Kind | Meaning |
|---|---|---|
| `label` | content | The item's heading. |
| `narrative` | content | The sentence or paragraph under it. |
| `severity` | content | Complications only: `"minor"`, `"significant"`, `"serious"` or `"catastrophic"`; `null` where no band was shown. |
| `incidence_band` | content | Complications only: `"very_common"`, `"common"`, `"uncommon"`, `"rare"` or `"very_rare"`; `null` where no band was shown. |
| `band_label` | content | The words shown beside the item for those two codes, e.g. `"Rare · Serious"` (`catastrophic` is shown to patients as "Very serious"). `null` when no band. From 1.6; for older records derive it from the codes. |

The page tells the patient the bands are broad groups and that a number in the
narrative is the better guide. The frequency bands mean: very common, more than
1 in 10; common, 1 in 100 to 1 in 10; uncommon, 1 in 1,000 to 1 in 100; rare,
1 in 10,000 to 1 in 1,000; very rare, fewer than 1 in 10,000.

### `render.leaflets` (the "Information leaflets" section)

| Field | Kind | Meaning |
|---|---|---|
| `leaflet_id` | system | Identifier of the leaflet. |
| `version` | content | Which version of it was attached. |
| `title` | content | Its title as shown. |
| `sha256` | content | SHA-256 of the leaflet file the patient read. The bytes are not inside this record; this hash identifies them exactly. |

Whether and when the patient confirmed reading each leaflet is under
`engagement.leaflets`.

### `render.optional_sections`

Sections that apply only to some consents: photographs and video, teaching and
research, tissue donation, medical devices and registries. One entry per section
shown.

| Field | Kind | Meaning |
|---|---|---|
| `key` | system | The section key, e.g. `photo_video`, `medical_devices`. |
| `title` | content | The heading shown. |
| `informational` | content | The explanatory text shown, as written (Markdown: a line starting `## ` is a heading; `**text**` is bold). |
| `responses` | | One entry per question the patient answered or deliberately left blank. |

Each entry in `responses`:

| Field | Kind | Meaning |
|---|---|---|
| `block_key` | system | Identifier of the question within the section. |
| `block_kind` | system | `"consent_grant"` (a yes/no question) or `"multi_select"` (tick any that apply). Says which of the two answer fields below is the live one. |
| `prompt` | content | The question exactly as shown. |
| `granted` | patient | For a `consent_grant`: `true` ("Yes, I consent"), `false` ("No"), or `null` (an optional question the patient saw and left unanswered). Always `null` for a `multi_select`. |
| `selected_values` | patient | For a `multi_select`: the options ticked. Always `null` for a `consent_grant`. |

A required question that was never answered blocks signing, so it does not
appear with `granted: null`.

### `render.registries`

| Field | Kind | Meaning |
|---|---|---|
| `selected` | content | The national registries the clinician selected as applying to this consent, by name. |
| `mdor_disclosure_shown` | system | Whether the Medical Device Outcome Registry disclosure text was on the patient's pages. |

### `render.questions`

Questions the patient asked through the consent and the answers they received.

| Field | Kind | Meaning |
|---|---|---|
| `question` | patient | The question as typed. |
| `asked_at` | system | When. |
| `section_context` | system | Which section the patient was on when they asked; `null` if asked from the questions page. |
| `answers` | | Each answer: `answer` (content, the clinician's words), `answered_by_clinician_id` and `answered_by_clinician_name` (system; both kept so the record stays legible without the identifier), `answered_at`, and `resolution_context` (`"online"`, or `"in_person"` when the answer was given in conversation and recorded afterwards). |
| `satisfaction_confirmed_at` | patient | When the patient confirmed "Yes, I'm satisfied" with the answer. `null` if not yet; a consent cannot be signed with an unconfirmed answer. |
| `confirmation_method` | system | How that confirmation was given: `"PATIENT_DIGITAL"` (the patient tapped it on their device) or `"CLINICIAN_VERBAL"` (the clinician recorded a verbal confirmation). `null` until confirmed. |

### `render.checkpoints`

Reserved for comprehension statements a template can ask the patient to confirm
one by one. Each has `text` and `confirmed_at`. No template defines any yet, so
this is an empty list in every record to date.

### The declaration

| Field | Kind | Meaning |
|---|---|---|
| `declarations` | content, attested by the patient | The statements shown on the signing card under "By signing below, I, *name*, confirm that:". The patient attests to all of them by signing. From 1.6 these come from the consent's own frozen copy of the declaration; earlier records carried the application's fixed list of the day. |
| `signing_intent` | content, attested by the patient | The statement of intent shown directly above the Sign button ("I intend this to be my signature. …"), which is what makes the mark an electronic signature. From 1.5. |
| `signing_statement` | content | 1.5 and earlier only: a one-sentence paraphrase of the declarations that appeared on the PDF but not on screen. Removed at 1.6 for that reason. |
| `content_versions` | system | Reserved. `{}` in every record sealed by the application: it carries its words inline and points at no template or library version. (The 1.1 and 1.5 sample vectors in this repository were built from a test fixture and carry `information_version` and `risk_version` keys here; real records do not.) |

## `engagement`

Process evidence: how the patient moved through the content, as opposed to what
the content was. The fuller event stream is in the audit log, bound by
`audit.events_digest`.

| Field | Kind | Meaning |
|---|---|---|
| `opened_at` | system | When the patient first opened the consent after passing the identity check. |
| `sections[]` | system | Per section: `key`; `first_viewed_at`, when the patient first pressed Next on it *in the content that was sealed* (a clinician edit before signing resets this, so it is the first read of the final wording); `time_spent_seconds`, accumulated across visits; `min_read_met`, `null` in every record to date (the minimum-read timer is enforced on the page but not separately recorded). |
| `leaflets[]` | system | Per leaflet: `leaflet_id`; `confirmed_at`, when the patient confirmed "I have read this leaflet", `null` if never; `time_spent_seconds`, `pages_viewed`, `total_pages` where the viewer could measure them. |

## `signature_event`

| Field | Kind | Meaning |
|---|---|---|
| `signed_at` | system | When the signature was accepted. The trusted timestamp in the integrity record independently attests the signature existed at that time. |
| `signature_method` | system | `"typed_name_plus_drawn_signature"` (every signature since October 2026: a printed name and a drawn mark) or `"typed_name"` (older records). |
| `typed_name` | patient | The name the patient typed, as typed. It may legitimately differ from `render.patient.name` (a preferred name, a spelling); the page points the difference out and lets them proceed, and the record holds both. |
| `mark` | patient | The drawn signature itself: `v` (format version, 1), `w` and `h` (the grid, 1000 by 400), `fmt` (`"xyt"`), `render` (`"ink-v1"`, the stroke-rendering style), `pointer` (`"touch"`, `"pen"`, `"mouse"`, `"mixed"` or `"unknown"`), and `strokes`, one flat integer array per stroke of repeating x, y, and milliseconds since the first point. Reproduce it with `node verify.mjs … --mark out.svg`; the format is specified in [`MARK-FORMAT.md`](MARK-FORMAT.md). `null` for a typed-name-only record; absent before 1.5. |

## `verification`

How the patient's identity was checked before the consent would open.

| Field | Kind | Meaning |
|---|---|---|
| `method` | system | `"demographic"`: the patient answered a question only they should know, from their own record. Older records may carry `"email_otp"`, `"email_link"` or `"in_person"`, which predate the current check. |
| `verified_at` | system | When they passed it. |
| `challenge_field` | system | Which detail was asked: `"dob"` or `"postcode"`. `null` on older records. |
| `masked_identifier` | system | Reserved; `null`. |
| `verifier_clinician_id` | system | Reserved for a clinician-attested identity check; `null`. |

## `clinician`

| Field | Kind | Meaning |
|---|---|---|
| `clinician_id` | system | Identifier of the responsible clinician. |
| `clinician_name` | system | Their name, kept alongside the identifier so the record stays legible on its own. |
| `gmc_number` | system | As held at signing; `null` for a clinician without one. From 1.3. |
| `role` | system | As held at signing, e.g. `"Consultant Vascular Surgeon"`. From 1.3. |
| `record_issued_at` | system | When the clinician sent the consent to the patient, i.e. when its content was fixed and put to them. It is not the date of the consent discussion, which this system does not record. `null` if sealed without being sent. |

## `audit`

| Field | Kind | Meaning |
|---|---|---|
| `events_digest` | system | SHA-256 over the consent's audit-log events up to and including signing. Binding the digest here means no event in that history can be altered without breaking the signature. Empty string if there were none. |
| `event_count` | system | How many events the digest covers. |

## Changes by version

Records keep the format they were sealed under. A reader of an older record
should expect:

| Version | Date | Change |
|---|---|---|
| 1.6 | 17 Oct 2026 | `signing_statement` removed (never shown on screen). `declarations` now come from the consent's own frozen text. `section_titles` added. `band_label` added to each clinical item. |
| 1.5 | 13 Oct 2026 | `signature_event.mark` added (the drawn strokes inline); `drawn_signature_sha256` and `drawn_signature_present` removed (nothing outside the record is bound any more). `render.signing_intent` added. |
| 1.4 | 10 Sep 2026 | `render.patient.confirmed_by_patient` added. |
| 1.3 | 10 Sep 2026 | `render.context.procedure_date` and `procedure_date_provisional` removed (scheduling, not consent). `clinician.gmc_number` and `clinician.role` added. `render.leaflets[].embedded_file` removed (it described an attachment no PDF carried). |
| 1.2 | 7 Sep 2026 | `clinician_confirmation` (with `countersigned_at` and `discussion_date`) replaced by `clinician` with `record_issued_at`. The removed fields had been filled from proxies (the patient's own signature time; the row's creation time) and were not what they claimed to be. |
| 1.1 | Jun 2026 | First sealed format. |

Each change to the canonical shape is a deliberate decision recorded in the
application's tests (`consent-record.test.ts`, which pins a golden hash per
version). The test suite in this repository walks every key of the sample
records under `test/vectors/` and fails if one is not described here.
