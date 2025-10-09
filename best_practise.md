You are working inside an SSI (Self-Sovereign Identity) platform based on Credo Controller.
Every piece of code you generate must strictly follow best practices for security, compliance, and maintainability.

🔹 General rules:

- Always implement **structured logging** using Pino or Winston.
- Use **JSON logs** with: timestamp, level, module, operation, tenantId (if available), correlationId (requestId), and safe metadata.
- Never log raw private keys, JWTs, preAuth codes, or full credentials. Instead log hashes/fingerprints.
- Follow **12-factor app logging** (logs go to stdout/stderr, not files).

🔹 Documentation:

- Add **JSDoc/TSDoc-style comments** above every function, class, and type.
- Each doc block must include:
  - Purpose (why this exists, not just what it does).
  - Inputs and outputs with types.
  - Dependencies used.
  - External references (specs, Walt.id Community docs, OpenID4VC spec, etc.).
  - Example usage snippet.
- For API routes: also describe the **business use case** (e.g., eKYC onboarding, IoT trust, etc.).

🔹 API Contracts:

- All endpoints must be documented in **OpenAPI 3.0 YAML** under `/openapi` or inline annotations.
- Responses must use schemas with `$ref` to central definitions in `types.ts`.
- Use Walt.id-compatible shapes (`credential_offer_url`, `preAuthorizedCode`, `verifiableCredential`, etc.).

🔹 Types:

- Define all complex objects in `types.ts` (or equivalent).
- Add doc comments to each type explaining purpose, fields, and example usage.

🔹 Logging examples:
logger.info({ module: 'issuer', operation: 'createOffer', correlationId, tenantId, schemaId }, 'Credential offer created');
logger.error({ module: 'verifier', operation: 'verifyPresentation', correlationId, error }, 'Verification failed');

🔹 Testability:

- Write unit tests for each function.
- Write integration tests for each API route.
- Ensure test logs include correlationId for traceability.

🔹 Standards References:

- DID:key spec: https://w3c-ccg.github.io/did-method-key/
- DID:jwk spec: https://identity.foundation/did-jwk/
- DID:web spec: https://w3c-ccg.github.io/did-method-web/
- OpenID4VCI spec: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
- Walt.id Community Stack docs: https://docs.walt.id/community-stack/home

🔹 Example JSDoc for functions:
/\*\*

- Create a new DID using the did:key method.
-
- Purpose:
- - Used as the root identity for the issuer in VC issuance flows.
- - Required for JWT-VC and SD-JWT signing operations.
-
- @param {string} keyType - Key type, defaults to Ed25519.
- @returns {Promise<DidRecord>} DID record with did, didDocument, keyRef.
-
- Dependencies:
- - @stablelib/ed25519 for keypair
- - Vault KMS for key storage
-
- Example:
- const did = await didService.createDidKey();
- console.log(did.didDocument);
-
- References:
- - https://w3c-ccg.github.io/did-method-key/
    \*/

🔹 Example OpenAPI annotation:
/issuer/credential-offers:
post:
summary: Create a new credential offer (OIDC4VC pre-authorized)
description: >
Allows an issuer to generate an offer link or QR code that a wallet can use
to request a verifiable credential. Compatible with Walt.id Issuer Portal.
tags: [Issuer]
requestBody:
required: true
content:
application/json:
schema:
$ref: '#/components/schemas/CredentialOfferRequest'
responses:
'201':
description: Credential offer created successfully.
content:
application/json:
schema:
$ref: '#/components/schemas/CredentialOfferResponse'
externalDocs:
description: OpenID4VC Issuance Spec
url: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html

        You are working on a Node.js/TypeScript project that uses **tsoa** for generating routes and controllers.

We need to implement **structured logging** across the entire platform using **Pino** as the primary logger.

### Requirements:

1. **Global Pino logger**

   - Base configuration should include `service` name and environment.
   - JSON logs for production, pretty-printed logs for development.
   - Respect `LOG_LEVEL` env variable.

2. **Request logging middleware**

   - Middleware should:
     - Generate or extract a `correlationId` (`x-correlation-id` header or UUID if missing).
     - Create a **child logger** bound to the correlationId.
     - Attach the logger to `req.logger`.
     - Ensure `x-correlation-id` is set on every response.
   - Extend Express types so `req.logger` is recognized in tsoa controllers.

3. **Controller logging**

   - In all tsoa controllers, use `req.logger` for:
     - `info` when operations start.
     - `error` when exceptions occur, log full error object with metadata.
   - Include metadata fields like `{ module: "issuer" }`, `{ module: "verifier" }`, etc.

4. **tslog coexistence**

   - Parts of the codebase may already use `tslog` with `ILogObject`.
   - Create a bridge so tslog logs are forwarded into Pino for unified output.
   - Ensure logs still respect correlation IDs when used inside request scope.

5. **OpenAPI documentation**

   - Update tsoa so the generated OpenAPI spec shows an `x-correlation-id` response header for all endpoints.
   - This tells API consumers that correlation IDs are always returned.

6. **Example controller usage**
   - Show how to log an `info` message when issuing a credential.
   - Show how to log an `error` message when verification fails, with correlationId preserved.

### References:

- Pino: https://getpino.io/#/
- tslog: https://npmjs.com/package/tslog
- tsoa middleware docs: https://tsoa-community.github.io/docs/middleware.html
- Correlation ID concept: https://12factor.net/logs

### Implementation notes:

- Do not hardcode file paths; Copilot should infer correct placement.
- Ensure middleware is registered in the Express app **before** `RegisterRoutes(app)`.
- All logs should be structured JSON, with optional `pino-pretty` in development.
- Correlation IDs must flow from request -> controller -> services -> downstream logs.
