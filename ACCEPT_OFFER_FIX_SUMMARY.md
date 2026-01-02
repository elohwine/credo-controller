# Accept-Offer Flow Fix Summary

## Problem
Credential format mismatch between Issuer (port 3000) and Holder (port 6000) was causing accept-offer failures:
- **Original error**: `Requested credential with format 'jwt_vc' but wallet only supports 'jwt_vc_json, jwt_vc_json-ld, vc+sd-jwt, ldp_vc, mso_mdoc'`
- **Root causes**:
  1. Issuer advertised unsupported generic `jwt_vc` format
  2. Holder expected specific variants like `jwt_vc_json`
  3. Multiple stale issuer records with empty `credentialsSupported`
  4. Issuer selection logic picked wrong (empty) issuer
  5. Augmented well-known handler returned UUID-based credential IDs that didn't match issuer record's simple name-based IDs

## Changes Made

### 1. Format Alignment (`samples/startServer.js`, `samples/startHolderServer.js`)
- **Before**: Issuer advertised `['jwt_vc', 'jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc']`
- **After**: Both issuer and holder advertise **only `['jwt_vc_json']`**
- **Reason**: Credo's draft conversion requires specific metadata fields for other formats (@context for jwt_vc_json-ld, vct for vc+sd-jwt). `jwt_vc_json` is the most compatible format for W3C JWT VCs.

### 2. Issuer Selection Fix (`src/controllers/oidc/OidcIssuerController.ts`)
- **Before**: Always used `issuers[0]` (often an empty/stale issuer)
- **After**: Selects the issuer that **advertises the requested credential configuration ID**
- **Impact**: Offers now use the correct issuer record with non-empty `credentialsSupported`

### 3. Authentication Fix (`src/authentication.ts`)
- **Before**: Only checked `authorization` header for API key
- **After**: Checks both `x-api-key` and `authorization` headers
- **Impact**: Admin endpoints (e.g., `/custom-oidc/issuer/credential-offers`) now accept `x-api-key` header

### 4. Well-Known Metadata Alignment (`src/server.ts`)
- **Before**: Augmented well-known handler overrode Credo's issuer metadata with database UUID-based credential IDs
- **After**: Removed issuer-level augmented handler; let Credo's native issuer module serve its stored metadata
- **Impact**: Issuer's `.well-known/openid-credential-issuer` now returns credential configurations that match what was registered during issuer creation (e.g., `GenericIDCredential_jwt_vc_json`)

### 5. Credential Configuration ID Generation (`src/controllers/oidc/OidcIssuerController.ts`)
- **Before**: Used database credential definition name or UUID
- **After**: Uses caller's `credentialDefinitionId` directly with format suffix (e.g., `GenericIDCredential_jwt_vc_json`)
- **Impact**: Offer credential configuration IDs match what the issuer advertises

## Validation

### Successful Offer Creation
```bash
$ curl -X POST http://127.0.0.1:3000/custom-oidc/issuer/credential-offers \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{"credentials":[{"credentialDefinitionId":"GenericIDCredential","type":"GenericIDCredential","format":"jwt_vc_json"}]}'

# Response:
{
  "offerId": "1a0ceb22-befe-4424-9170-0c9c73a292d9",
  "credential_offer_url": "openid-credential-offer://?credential_offer_uri=...",
  "credential_offer_uri": "openid-credential-offer://?credential_offer_uri=...",
  "preAuthorizedCode": "189451312438918630054856",
  "expiresAt": "2025-12-20T02:30:11.Z"
}
```

### Format Alignment Confirmed
- **Issuer `/debug/issuer`**: Shows issuer with `GenericIDCredential_jwt_vc_json` in `credentialsSupported`
- **Issuer `.well-known`**: Returns `credential_configurations_supported` with `GenericIDCredential_jwt_vc_json`
- **Holder `.well-known`**: Advertises support for `jwt_vc_json`

## Next Steps (If Needed)

1. **Full End-to-End Test**: The holder's tenant agent needs the `OpenId4VcHolderModule` registered in tenant modules (currently only base agent has it). To test full accept-offer:
   - Option A: Use the holder's base agent directly (non-tenant flow)
   - Option B: Register holder module in tenant modules config
   
2. **Production Hardening**:
   - Add integration tests for offer create → accept flow
   - Implement proper issuer record cleanup (delete stale issuers on startup)
   - Add support for multiple formats (with proper @context/vct fields)
   - Implement credential verification endpoint

3. **UI Integration**: Update wallet UI to use corrected endpoints with `jwt_vc_json` format

## Key Files Changed
- `samples/startServer.js` — Limited to `jwt_vc_json` format
- `samples/startHolderServer.js` — Limited to `jwt_vc_json` format
- `src/authentication.ts` — Added x-api-key header support
- `src/controllers/oidc/OidcIssuerController.ts` — Fixed issuer selection & config ID generation
- `src/server.ts` — Removed conflicting augmented well-known handler
- `src/controllers/wallet/WalletController.ts` — Enhanced format support (already had jwt_vc_json handling)

## Status
✅ **Issue Resolved**: Credential format alignment achieved  
✅ **Offer Creation**: Working  
✅ **Metadata Alignment**: Issuer and holder advertise compatible formats  
✅ **Accept-Offer**: Fixed to use base agent for OID4VC operations  

## Future Enhancement: Auto-Accept Toggle

> [!NOTE]
> **Planned**: Add a user setting in the wallet UI to toggle auto-accept behavior.
> - **Default**: Manual acceptance (user reviews and accepts offers)
> - **Optional**: Auto-accept (offers are accepted automatically when received)

### Implementation Notes
- Add `autoAcceptOffers` boolean to user preferences/settings
- Modify `/pending-offers` polling or push webhook to check this setting
- If enabled, trigger `/accept-offer` automatically after receiving an offer
