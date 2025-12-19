# Problem Summary: Credential Format Mismatch

## Issue
During the `accept-offer` flow on the Holder Agent (Port 6000), the following error occurs:

```json
{
    "message": "Failed to accept offer: Requested credential with format 'jwt_vc',\nfor the credential with id 'GenericIDCredential,\nbut the wallet only supports the following formats 'jwt_vc_json, jwt_vc_json-ld, vc+sd-jwt, ldp_vc, mso_mdoc'"
}
```

## Root Cause
- **Issuer Configuration**: The Issuer Agent (Port 3000) was configured to offer credentials in the generic `jwt_vc` format.
- **Holder Capability**: The Credo-based Holder Agent expects more specific formats like `jwt_vc_json`.

## Resolution
Align the credential format across both agents to credo supported format `jwt_vc`, research.

### Changes Made
1. **Issuer (`samples/startServer.js`)**: Updated `credentialsSupported` metadata and the `credentialRequestToCredentialMapper` to use `jwt_vc`.
2. **Holder (`WalletCredentialsController.ts`)**: Updated the internal request to the Issuer to specify `jwt_vc`.
3. **Consistency (`samples/startHolderServer.js`)**: Updated the Holder's own internal issuer configuration to match.

## Current Status
The project has been rebuilt (`yarn build`). Both agents should be restarted to apply the new format configuration.

## Updated investigation (accurate, scanned code)

- I scanned and edited several files to trace and align advertised credential formats across issuer and holder. Key observations:
    - The OpenID4VC Issuer module stores its own issuer records and will return whatever it has persisted, regardless of platform-level `/.well-known` generation logic. Updating the metadata object alone does not always change what the module returns unless the module's stored issuer record is updated or recreated.
    - TSOA-generated routes (`src/routes/routes.ts`) mount controller handlers that can take precedence over ad-hoc Express `app.get(...)` handlers depending on registration order. We register discovery handlers before TSOA in `src/server.ts` so our augmented well-known can win when needed.
    - The credential definition store (`src/utils/credentialDefinitionStore.ts`) persists `definition_data` JSON with a `format` field. The `OidcMetadataController` maps that stored `format` (e.g. `sd_jwt`) to OpenID4VC advertised formats (e.g. `vc+sd-jwt`).

## Actions performed

- Seeded / inspected `credential_definitions` in `./data/persistence.db` and adjusted `definition_data.format` during tests.
- Patched and rebuilt the project to:
    - Make issuer startup register multiple credential formats derived from credential definition IDs (`src/cliAgent.ts`).
    - Add an augmented issuer-level `/.well-known/openid-credential-issuer` handler in `src/server.ts` registered before TSOA routes.
    - Add a static holder `/.well-known/openid-credential-issuer` in `samples/startHolderServer.js` so the wallet advertises supported formats from port 6000.
    - Modify `samples/startServer.js` to attempt deletion/clear of pre-existing issuer records and recreate a fresh issuer with the full set of formats (force a clean state).

## Observed problems and current blockers

- Issuer metadata mismatch: despite attempts to update metadata, the OpenID4VC module can still return older/stored issuer records. Workaround applied: delete/recreate issuer record during startup (`samples/startServer.js`). New issuer id `d299d71a-d688-4113-bfb5-e641239d673d` was created and advertises all formats.
- Precedence and caching: platform-level well-known builder vs module-stored issuer metadata — required registering our augmented route before TSOA routes and priming `issuerMetadataCache` to avoid stale discovery loops.
- Accept-offer specifics:
    - Creating an offer requires `x-api-key` (admin API key). A POST without the correct API key or JWT returns `Unauthorized` — ensure header `x-api-key: test-api-key-12345` is present.
    - The holder/wallet will reject credential retrieval if the credentialRequest proof JWT is missing or incorrectly formed (`No jwt in the credentialRequest proof.`). The holder's wallet flow must produce a holder proof or use the holder agent's accept-offer endpoints which produce the proof.
- OpenTelemetry noise: startup attempted to connect to OTLP at 127.0.0.1:4318 and produced ECONNREFUSED logs; this is harmless for functionality but noisy during debugging (set OTEL env or disable to reduce spam).

## Relevant files (scanned & edited)

- `src/cliAgent.ts` — builds and registers issuer `credentialsSupported` + `credentialConfigurationsSupported` at agent startup; now iterates DB definitions and registers multiple config-id forms (UUID-based and name-based) so holder discovery matches issuer.
- `src/controllers/oidc/OidcMetadataController.ts` — maps persisted `definition_data.format` to advertised OpenID4VC formats (e.g., `sd_jwt` -> `vc+sd-jwt`) for both platform and tenant well-known endpoints.
- `src/controllers/oidc/OidcIssuerController.ts` — create-offer logic maps incoming templates to registered issuer `credentialConfiguration` IDs using `${credentialDefinitionId}_${format}`; important to ensure those IDs exist in issuer metadata.
- `src/utils/credentialDefinitionStore.ts` — persistent store for credential definitions (`definition_data` JSON includes `format`), used by metadata builders.
- `src/server.ts` — registers augmented issuer well-known handler (moved to before TSOA routes) and serves as central mounting point for OpenID4VC routers; also contains debug wrappers around issuer credential endpoint.
- `samples/startServer.js` — sample issuer startup; now attempts to delete/clear existing issuers and create a fresh issuer advertising all formats; also contains a debug `/debug/issuer` endpoint.
- `samples/startHolderServer.js` — sample holder startup; modified to remove local issuer and to serve a static `/.well-known/openid-credential-issuer` on port 6000 advertising all supported formats.
- `src/controllers/wallet/WalletController.ts` — wallet UI controller that fetches issuer well-known and initiates accept-offer flows (ensure it passes cookies/Authorization correctly).

## Reproduction steps (what I ran locally)

1. Start issuer: `node samples/startServer.js` (server listens on 3000)
2. Start holder: `node samples/startHolderServer.js` (holder on 6000)
3. Confirm holder well-known: `curl http://127.0.0.1:6000/.well-known/openid-credential-issuer | jq .` — shows `GenericIDCredential_*` entries with formats `vc+sd-jwt`, `jwt_vc_json`, etc.
4. Confirm issuer list: `curl http://127.0.0.1:3000/debug/issuer | jq .` — shows new issuer id and `credentialsSupported` entries.
5. Create offer (admin):
     curl -X POST http://127.0.0.1:3000/custom-oidc/issuer/credential-offers \
         -H "Content-Type: application/json" -H "x-api-key: test-api-key-12345" \
         -d '{"credentials":[{"credentialDefinitionId":"GenericIDCredential","format":"vc+sd-jwt"}]}'

6. Exchange pre-authorized code for token and call issuer credential endpoint — ensure the holder sends a proper `credentialRequest.proof` JWT or use the holder agent `accept-offer` flow to generate the proof.

## Next recommended steps

1. Verify the holder `accept-offer` path (UI -> `WalletController`) uses the tenant-holder agent accept flow to build a valid proof JWT rather than directly calling the issuer credential endpoint without a proof.
2. Add an integration test that:
     - Onboards temporary issuer, seeds a GenericID credential definition, creates offer for `vc+sd-jwt`, runs the holder accept-offer flow, and asserts the holder stores the VC.
3. Optional: configure OTLP/disable OpenTelemetry to reduce noisy startup logs.

If you want, I can now (a) run the full accept-offer flow end-to-end and capture the failing request/response, or (b) add the integration test harness. Which do you prefer?
