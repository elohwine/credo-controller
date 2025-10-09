Great — I’ll keep it tight and developer-friendly.

You asked me to **forget multi-tenancy for now** and focus on **single-tenant core SSI capabilities** (use Walt.id Community as the behavioral reference).
Below are **clean, copy-pasteable prompts** for GitHub Copilot (or any dev) that:

- Avoid hard-coded file names/paths (Copilot will infer repo layout).
- Target the **credo-controller** codebase and **Credo** libraries.
- Cover **DID creation** (did\:key, did\:jwk, did\:web), **VC schema registration**, **credential issuance (OIDC4VC pre-authorized)**, and **presentation verification**.
- Include short example code sketches, required libraries, test ideas, and authoritative references (Walt.id Community docs + DID/JWK specs) so Copilot can fill gaps.

Use these prompts directly in your Copilot-enabled editor. Each prompt describes the task, inputs, behavior, expected outputs, and simple tests/assertions.

---

## Quick references (for Copilot & devs to consult)

- Walt.id Community Stack docs (behavioral reference): [https://docs.walt.id/community-stack/home](https://docs.walt.id/community-stack/home)
- DID method specs: did\:key, did\:web, did\:jwk (W3C / relevant repos)
- JWK / jose: [https://github.com/panva/jose](https://github.com/panva/jose)
- Credo / openid4vc packages & tutorials: [https://credo.js.org/guides/tutorials](https://credo.js.org/guides/tutorials) and OpenID4VC tutorial

---

## General instructions for Copilot prompts

- **Context hint**: “Repository is credo-controller (Credo-based). Focus on single-tenant runtime. Use Credo libraries (@credo-ts/\*) where possible; use Vault/dev KMS for private key handling. Follow Walt.id Community Stack behavior for issuance & verification flows.”
- Use **Pre-Authorized Code** OIDC4VC flow for issuance MVP.
- Return shapes must match the Walt.id compatible OpenAPI you already committed (credential_offer_url, preAuthorizedCode, verifiableCredential, presentation_request_url, etc.).
- Add robust logging, error handling, and unit tests for each unit.

---

## Prompt A — DID: create did\:key (bootstrap DID for wallet)

````
Task:
Implement a "create DID (did:key)" routine for single-tenant Credo Controller.

Context:
- Repo already uses Credo. Use server-side utilities and KMS integration (Vault or dev-mode Vault) to store private key material.
- This is single-tenant: store DID record in the local DB table for ‘dids’ with columns (did, method, controller, keyRef, createdAt).

Behavior:
- Generate an Ed25519 keypair (use preferred Node library or @stablelib/ed25519).
- Derive did:key from public key (use did-method-key helpers or compute per did:key spec).
- Store private key securely in KMS (do not persist raw private key to DB).
- Produce a DID Document with verificationMethod array and return it to caller.

Inputs:
- optional `{ keyType: 'Ed25519' }` in request body.

Outputs:
- HTTP 201 JSON: `{ did: 'did:key:...', didDocument: { ... }, keyRef: 'vault:transit/...', createdAt: '...' }`

Example snippet (pseudo):
```ts
// generate keypair
const { publicKey, privateKey } = await generateEd25519KeyPair();
// store private key in vault, get keyRef
const keyRef = await vault.storeKey(tenant='default', privateKey);
// compute did:key (e.g., base58 multicodec)
const did = deriveDidKeyFromPublicKey(publicKey);
// build didDoc
const didDoc = { id: did, verificationMethod: [...], assertionMethod: [...] };
// persist did record and return response
````

Tests:

- Unit test: verify did starts with `did:key:`.
- Integration: confirm Vault contains keyRef and DB has stored DID metadata.

References: Walt.id Community behavior for wallet DID creation; did\:key spec; digitalbazaar did-method-key library.

```

---

## Prompt B — DID: create did:jwk (server-side JWK DID)
```

Task:
Implement "create DID (did\:jwk)" routine for single-tenant Credo Controller.

Context:

- Use `jose` to generate/export JWK keys. Use KMS to store private JWK.
- DID will follow did\:jwk encoding rules (use base64url of canonical public JWK or use library helper).

Behavior:

- Generate appropriate key pair (e.g., P-256 for ES256 or OKP Ed25519).
- Compute DID: `did:jwk:<base64url(JSON(publicJwk))>` (or use canonical method per spec).
- Store private JWK in KMS; return public JWK + DID Document.

Inputs:

- `{ keyType: 'P-256' | 'Ed25519' }`

Outputs:

- HTTP 201 JSON `{ did: 'did:jwk:...', didDocument: { verificationMethod:[{publicKeyJwk:...}] }, keyRef }`

Example snippet:

```ts
const { publicKey, privateKey } = await generateJwkPair('P-256') // jose
const pubJwk = await exportJWK(publicKey)
const did = `did:jwk:${base64url(JSON.stringify(pubJwk))}`
await vault.storeSecret(kmsPath, await exportJWK(privateKey))
const didDoc = {
  id: did,
  verificationMethod: [{ id: `${did}#0`, type: 'JsonWebKey2020', publicKeyJwk: pubJwk }],
  assertionMethod: [`${did}#0`],
}
```

Tests:

- Verify DID starts with `did:jwk:`.
- Verify VC issuance uses `issuer` field with that DID and signs with KMS keyRef.

References: did\:jwk spec drafts; jose library docs.

```

---

## Prompt C — DID: prepare did:web (issuer/domain anchored)
```

Task:
Implement a "prepare did\:web" helper for single-tenant Credo Controller.

Context:

- Many orgs will publish DID docs to their domain. For Phase 1 we _prepare_ the did\:web DID Document & return safe, copy/paste publish instructions and a verification check helper. We do NOT auto-deploy to tenant web host (unless credentials provided).

Behavior:

- Accept `{ domain: 'bank.example.com', keyMethod: 'jwk' | 'key' }`.
- Create signer key pair (or reuse existing did\:jwk or did\:key for issuer).
- Build did\:web DID string: `did:web:bank.example.com` and canonical DID Document JSON with publicKey (JsonWebKey2020 or verificationMethod).
- Return:

  - `did`: string
  - `didDocument`: JSON
  - `publishInstructions`: text showing `curl --upload-file <file> https://bank.example.com/.well-known/did.json` or SFTP steps
  - `verifyCommand`: curl command to confirm published content.

Example snippet:

```ts
const did = `did:web:${domain}`
const didDoc = {
  '@context': 'https://www.w3.org/ns/did/v1',
  id: did,
  verificationMethod: [{ id: `${did}#key-1`, type: 'JsonWebKey2020', controller: did, publicKeyJwk: pubJwk }],
  assertionMethod: [`${did}#key-1`],
}
return { did, didDocument: didDoc, publishInstructions, verifyCommand }
```

Tests:

- Validate emitted didDocument has `@context` and `id`.
- After manual publish to a sample local webserver, run the `verifyCommand` to confirm resolution.

Reference: did\:web spec; Walt.id docs for domain-anchored issuers.

```

---

## Prompt D — Schema registration (VC schema registry)
```

Task:
Implement VC schema registration & retrieval for single-tenant Credo Controller.

Context:

- This is used by Issuers/Verifiers to agree on credential shape (e.g., eKYC schema).
- Store schema metadata in DB: (schemaId, name, version, jsonSchema, createdAt).

Behavior:

- POST /schemas { name, version, jsonSchema } -> validates JSON Schema, stores record, returns schemaId.
- GET /schemas -> list schemas
- GET /schemas/{schemaId} -> return schema

Outputs:

- Return consistent IDs (URN or UUID). Store the JSON Schema for validating credential subjects before issuing.

Example:

```ts
// validate jsonSchema with AJV
const validate = new Ajv().compile(jsonSchema)
if (!validate) throw 400
const schemaId = uuid()
db.insert({ schemaId, name, version, jsonSchema })
return { schemaId, name, version }
```

Tests:

- Register schema; then use it to validate a VC subject payload in issuance flow (error if mismatch).
- Ensure versioning supports minor upgrades (store previous versions).

Reference: Walt.id patterns for credential schema and credential templates.

```

---

## Prompt E — Credential Offer (OIDC4VC pre-authorized) — issuance flow (Phase 1)
```

Task:
Implement OIDC4VC Pre-Authorized issuance offer handling and token exchange to issue a signed VC (JWT-VC or SD-JWT).

Context:

- Single-tenant.
- Use Credo's openid4vc module to assemble offers and use Credo core to sign JWT-SD or JWT-VC via KMS (keyRef from DID).
- Offer persistence: store offer (offerId, preAuthCode, allowedSubjectTemplate, expiresAt).

Endpoints:

- POST /issuer/credential-offers { credentials:\[{type, schemaId, claimsTemplate}] } -> returns { offerId, credential_offer_url, preAuthorizedCode }
- POST /oidc/token { grant_type:'urn\:ietf\:params\:oauth\:grant-type\:pre-authorized_code', pre_authorized_code, subject_did } -> issue credential to subject DID, sign VC with tenant DID keyRef, persist issued VC metadata, return { verifiableCredential }

Behavior details:

- Support both JWT-VC and SD-JWT (choose by `format` in credential request).
- Use KMS sign operation (transit sign) to produce token; NEVER export private key.

Example skeleton:

```ts
// create offer
const preAuthCode = randomToken()
db.insertOffer({ offerId, preAuthCode, payload })
const offerUrl = `${BASE_PUBLIC_URL}/oidc/authorize?pre-authorized_code=${preAuthCode}`
return { offerId, credential_offer_url: offerUrl, preAuthorizedCode: preAuthCode }

// token exchange
validatePreAuth(preAuthCode)
const vcPayload = buildVcPayload(issuerDid, subjectDid, claims)
const signedVc = await kms.signJwt(vcPayload, keyRef, { alg: 'EdDSA' })
db.persistVc({ id: vcId, jwt: signedVc, issuerDid, subjectDid })
return { verifiableCredential: signedVc }
```

Tests:

- Full E2E: create offer, wallet posts token with preAuthCode and subjectDid -> receives VC JWT -> validate JWT signature with public key from tenant DID doc.

References: OpenID4VC pre-authorized flow docs; Credo openid4vc tutorial.

```

---

## Prompt F — Presentation request & verification (OIDC4VP)
```

Task:
Implement presentation-request creation + presentation verification.

Endpoints:

- POST /verifier/presentation-requests { presentationDefinition } -> returns { requestId, presentation_request_url }
- POST /verifier/verify { requestId, verifiablePresentation } -> server verifies signature, checks revocation, checks issuer trust (tenant DID present and valid), returns { verified: true/false, claimResults }

Behavior:

- Use Credo verify primitives to validate signatures and presentation structure.
- Check revocation store (DB) for credential status.
- Optionally validate that presented credential subject matches holder DID (subject DID eq holder DID) if required.

Example:

```ts
// verify
const vp = parseVp(verifiablePresentation)
const checkSig = await credo.verifyPresentation(vp)
const revCheck = await revocationStore.check(vp)
const trusted = await trustRegistry.isTrustedIssuer(vp.iss)
return { verified: checkSig && !revCheck && trusted }
```

Tests:

- Create sample VC (issued earlier), present it and verify => should return verified true.
- Tamper VC JWT (change payload) -> verify should fail.

Reference: Credo core verify primitives and Walt.id verifier behavior.

```

---

## QA & acceptance criteria (single-tenant Phase 1)
- DID creation: did:key/did:jwk/did:web creation returns valid DID doc shapes and stores key references in KMS.
- Schema registration: stored schemas used to validate outgoing VC subjects.
- Issuance (pre-auth): wallet can get offer, submit preAuth token + subject DID and receive a signed VC; verifier can validate it cryptographically using DID doc public key.
- Revocations: simple per-VC revocation flag works and verifier consults it.
- All flows align with Walt.id Community behaviors and shapes (credential_offer_url, preAuthorizedCode, verifiableCredential fields).

---

## Final notes for Copilot usage
- **Do not reference repo paths** in prompts; Copilot will infer and create files in the best location.
- **Tell Copilot to use Credo libs**: `@credo-ts/openid4vc`, `@credo-ts/core`, `@credo-ts/did` .
- **Ask Copilot to add unit tests** and sample Postman/curl snippets in the commit message or PR description.
```
