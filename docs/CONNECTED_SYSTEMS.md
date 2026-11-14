# Connected systems

Organisations keep their own software: accounting, HR, school management, a learning system or a
shop. Credentis does not replace it. A **connected system** is that software holding a Credentis
client ID and secret, so it can:

- **sign people in** with their Credentis wallet (see the partner verification API), and/or
- **send records** the organisation defines into people's wallets, where they hold them as
  verifiable credentials.

An organisation that runs everything in its own software can be "integration only": it needs no
internal work areas in Credentis, just its identity, record types and a way to send records.

There are three ways to send records, all checked against the same record types and recipients:

1. **API**: a connected system calls `POST /api/partner/v1/records` (below).
2. **File**: an owner or admin uploads a CSV or JSON export from any software (see
   [Upload a file](#upload-a-file)). No integration work needed.
3. **By hand**: a single offer from the portal's credential operations.

## Set up (owner or admin)

Portal → **Connected systems**.

1. **Add record type.** Name it (e.g. _Training certificate_) and list its fields. Each field has a
   label people see, the key your system sends, a type (`text`, `number`, `date` as `YYYY-MM-DD`,
   `yes_no`) and whether it is required. The name becomes the `credentialType`
   (`TrainingCertificateRecord`).
   - Names that describe what Credentis issues itself (identity, authority, payments, receipts,
     invoices, tax) are refused.
   - **Change** publishes a new version. Records already sent keep their version.
   - **Retire** stops new sends. Records already in wallets stay valid. Adding the same name again
     continues its version numbers.
2. **Add system** → tick _Sends our records to people's wallets_ and choose who it may send to:

   - _Only members of this organisation_ (default), or
   - _Anyone with a Credentis wallet_ (customers, students, patients).

   Return addresses are only needed when the system also signs people in. What a system does is
   fixed once added; add another system for a different job.

3. Copy the client ID and secret. The secret is shown once; **New secret** replaces it.

Record types also appear in **Manage records**, so staff can send one by hand.

API equivalents (organisation token, owner/admin):

| Method | Path                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| GET    | `/api/organizations/connected-systems/record-types?includeRetired=true`                    |
| POST   | `/api/organizations/connected-systems/record-types`                                        |
| PUT    | `/api/organizations/connected-systems/record-types/{credentialType}`                       |
| POST   | `/api/organizations/connected-systems/record-types/{credentialType}/retire`                |
| GET    | `/api/organizations/connected-systems/records?limit=50`                                    |
| POST   | `/api/organizations/partner-clients` with `operations: ["send_records"]`, `recipientScope` |

## Send a record (your system)

Authenticate with HTTP Basic (`client_id:client_secret`).

```bash
curl -u "$CLIENT_ID:$CLIENT_SECRET" https://api.example.com/api/partner/v1/records/types
```

```bash
curl -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: lms-cert-2025-000123' \
  -d '{
        "credentialType": "TrainingCertificateRecord",
        "recipient": { "phone": "0771234567" },
        "claims": { "course": "First aid", "completedOn": "2025-04-02", "score": 91 },
        "externalReference": "CERT-000123",
        "title": "First aid certificate",
        "message": "Your certificate from Skills Academy"
      }' \
  https://api.example.com/api/partner/v1/records
```

Response (`201` new, `200` repeat of the same key):

```json
{
  "id": "6f0c…",
  "status": "pending",
  "credentialType": "TrainingCertificateRecord",
  "recordTypeVersion": 1,
  "externalReference": "CERT-000123",
  "createdAt": "2025-04-02T09:00:00.000Z",
  "updatedAt": "2025-04-02T09:00:00.000Z",
  "acceptedAt": null,
  "expiresAt": "2025-05-02T09:00:00.000Z",
  "error": null
}
```

Check it later: `GET /api/partner/v1/records/{id}`.

| Status                               | Meaning                                            |
| ------------------------------------ | -------------------------------------------------- |
| `processing`                         | Being sent.                                        |
| `failed`                             | Not sent. Retry with the **same** Idempotency-Key. |
| `pending`                            | Waiting in the person's wallet.                    |
| `accepted`                           | The person holds the record.                       |
| `expired` / `withdrawn` / `resolved` | The offer ended without being accepted.            |

Responses never include the person's wallet or identifiers; keep your own `externalReference`.

### Idempotency

- `Idempotency-Key` is required: 8–128 of `A-Z a-z 0-9 . _ : -`. Use one key per logical record
  (e.g. your certificate number).
- The same key and the same body return the same record and never send twice (key order in
  JSON does not matter).
- The same key with a different body returns `409`.
- A `failed` send, or one interrupted for more than two minutes, is resumed by repeating the key.
  If the offer had already reached the wallet it is reused, not duplicated.
- Keys are scoped to the client.

### Errors

| Code | Cause                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | Missing key, unknown or retired `credentialType`, or claims that do not match the fields (missing required field, wrong type, unknown field, date not `YYYY-MM-DD`). |
| 401  | Wrong client ID or secret, or the system was turned off (`WWW-Authenticate: Basic`).                                                                                 |
| 403  | The system is not allowed to send records, or the organisation is not active.                                                                                        |
| 404  | Record not found for this system.                                                                                                                                    |
| 409  | Idempotency-Key reused for a different record.                                                                                                                       |
| 422  | The phone number has no Credentis wallet, or (members-only systems) is not an active member.                                                                         |

## Upload a file

For software with no API, or a spreadsheet. Portal → **Connected systems** → a record type →
**Upload a file**. **Download template** gives a CSV with the right columns.

- **Format**: CSV (comma or semicolon, quotes allowed, UTF-8 with or without BOM) or a JSON array
  of objects. Up to 500 rows and 1 MB per file.
- **Columns** are matched to fields by key or label, ignoring case, spaces and punctuation
  (`Course name`, `course_name` and `courseName` all match). Phone accepts `Phone`, `Mobile`,
  `Cell` or `MSISDN`; reference accepts `Reference`, `Ref`, `ID` or `Number`. Other columns are
  ignored and listed in the preview.
- **Values**: numbers may have thousands separators; yes/no accepts `yes/no/true/false/1/0`;
  dates may be `YYYY-MM-DD` or `DD/MM/YYYY`.
- **Preview first**: every row is checked (fields, phone, recipient) and nothing is sent until
  you press **Send**. Rows with problems are skipped and reported by row number.
- **Re-uploading is safe**: each row's key comes from its reference (or its contents when there is
  no reference), so the same row is never sent twice. A reference re-used with different details
  is refused.
- **Who can receive**: members of the organisation (default) or anyone with Credentis.
- Rows show as **File upload** in Recently sent, are signed by the organisation and audited as
  `connected_records_file_imported`.

API: `POST /api/organizations/connected-systems/record-types/{credentialType}/import/preview` and
`.../import`, body `{ content, format?: 'csv' | 'json', recipientScope? }`, owner or admin token.

## How it fits

- Clients are the existing `partner_clients` rows with `policy.operations`
  (`sign_in`, `send_records`, `discover`) and `policy.recipientScope`. Clients created earlier keep `sign_in`.
  Only sign-in clients are registered with Hydra, and send-only clients cannot use
  `/api/partner/v1/verifications`. A client with `discover` can call
  `POST /api/partner/v1/discovery/search` and gets the same public match as Discover,
  without a phone, an email or a tenant id. Sign-in is not required for that search,
  and a sign-in client does not receive `discover` unless it was registered with it.
- Record types live in `org_record_types` (migration 126). Each version has its own JSON schema,
  scoped to the organisation, and is registered with the organisation's issuer.
- A send is a row in `integration_record_requests` (unique per organisation, client and key) that
  goes through the same direct-offer path as Manage records: a `wallet_pending_offers` row
  (`source_type = connected_system_record`) and a `wallet.vc.offered` outbox event. Status is
  read from that wallet offer.
- Records are signed by the organisation's own DID, not the platform's. The offer goes through the
  organisation's own OpenID4VC issuer (`/oidc/issuer/<org issuer id>`), so the credential is signed
  inside the organisation's wallet. If that wallet cannot sign (no issuer, or the type's
  `issuerDid` is not in it), the send falls back to the platform issuer and logs a warning.
  The offer metadata records which one signed it: `signedBy: 'organisation' | 'platform'`.
  Manage records direct sends use the same path.
- Every type change and send is audited (`org_record_type_*`, `connected_record_sent`).

Tests: `tests/connected_systems.test.ts`.

## Accounts packages (2026-11-10)

Zoho Books and ZIMRA fiscalisation are capabilities of this platform. They are not a post from the neighbouring fiscalisation app, and that app is not called.

- **Zoho Books** is connected by an owner or admin under Connected systems → Books and tax receipts. The server holds `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` and `ZOHO_REDIRECT_URI` (the redirect is `POST` start, then Zoho returns to `GET /api/organizations/books-fiscal/zoho/callback`). The client in `src/integrations/fiscal/zoho.ts` is this platform's copy of the same Books calls: issued invoices and credit notes, contacts for the phone, drafts and voids refused.
- **Fiscalisation** is a device on the organisation (`org_fiscal_devices`). A simulator device signs and accepts a receipt locally. A test or production device registers with ZIMRA FDMS and submits there (`src/integrations/fiscal/fdms`). Opening and closing the fiscal day, and fiscalising one imported document, happen on `POST /api/organizations/books-fiscal/...`.
- After a receipt is accepted, Credentis offers a **Customer bill** card (`CustomerBillRecord`) when the invoice has a phone and that record type exists, with `documentNumber`, `issuedOn`, `currency`, `total`, `fiscalReceipt` and `checkLink`. A missing phone or a missing record type does not undo the fiscal receipt.
- A file upload and `POST /api/partner/v1/records` still work for any other package. QuickBooks Online and Sage Pastel Partner are not connected yet. Pastel Partner still has no public REST API.

The card is a copy the customer can hold. The fiscal receipt is a separate record. Neither one writes the lines back into the books.

## Accounts packages (2026-11-05)

The send path above is ready for an organisation that already keeps its books elsewhere. Credentis does not log into that package and wait for another app to post a summary. The organisation connects the package here, or uploads a file. The person accepts the card into their wallet. The books stay the system of record.

What works today, with no new connector:

- A file export. Portal → Connected systems → the record type → Upload a file. CSV or JSON, preview, then send. Re-uploading the same document number does not send a second card.
- A direct call. `POST /api/partner/v1/records` with HTTP Basic, an `Idempotency-Key` equal to the document id in the books, `recipient.phone`, and `externalReference` set to the document number.
- The customer must already have a Credentis wallet on that phone. Otherwise the call returns 422. A members-only system can only send to staff.
- At most 20 fields, so the card carries the summary (number, date, currency, total, and the fiscal receipt number once there is one). The lines stay in the books.
- The record type's name must not contain the words invoice, receipt, payment, tax or fiscal. Those words are reserved so an organisation-defined card is not mistaken for one the platform issued itself (`OrgRecordTypeService`). Call the type "Customer bill". The document number still goes in a field.

What is not built, and should not be copied into this repository yet:

| Package | How an organisation connects | First step here |
| --- | --- | --- |
| Zoho Books | Connected in this platform. OAuth, then list and import issued invoices and credit notes (`src/integrations/fiscal/zoho.ts`). | Live. Connected systems → Books and tax receipts. |
| QuickBooks Online | Cloud. OAuth, webhooks for a new invoice or credit memo, or a CSV export. Intuit does not let you point a webhook at an arbitrary URL without an app, so a bridge (the same shape as the Zoho one) is required. | Second. Same summary card. Do not start it before Zoho, and do not assume a Zimbabwe company is on QuickBooks. |
| Sage 50cloud Pastel Partner | The desktop product used in South Africa and Zimbabwe. No public REST API. Sage's own community answer is the Pastel Partner SDK, a Windows library licensed per version ([SDK download](https://root.pastel.co.za/Software-Development-Kit-SDK/Download.asp), [community thread](https://communityhub.sage.com/za/sage-50-pastel/f/general-discussion/217577/sage-50-cloud-pastel-partner-rest-api)). | A CSV export through Upload a file. A live link means a program sitting next to the company file. That is a later project. |
| Sage Business Cloud Accounting | A different Sage product, with a REST API for sales invoices. Not the same as Pastel Partner. | Same shape as Zoho, only if a customer is actually on it. |

The card is a copy the customer can hold and that "Check a record" can confirm. Fiscal submission is this platform's fiscal device, not a call to another app.
