# SGK Rollout Sequence (Existing Tenants)

## Goal
Backfill and activate SGK-aligned capabilities for existing tenants without interrupting active workflows.

## 1. Preflight

1. Confirm database backups are current.
2. Confirm tenant list and active sectors.
3. Ensure API version includes:
   - model registry parity updates
   - FEPT standalone-capture guard
   - contact capability routing
   - reconciliation policy packs

## 2. Definition Backfill

1. Restart API to trigger tenant model seeding via provisioning path for newly onboarded tenants.
2. For existing tenants, run a one-time seeding script/path to ensure missing definitions exist:
   - QuoteVC, PaymentReceiptVC, EscrowVC, DeliveryConfirmationVC
   - CreditEligibilityVC, ConsentVC, IdentityVerificationVC
   - PayslipVC, PayrollReportVC, DigitalTwinVC, PolicyVC
3. Validate with metadata endpoint:
   - GET /tenants/{tenantId}/.well-known/openid-credential-issuer
   - check credential_configurations_supported contains expected VC names.

## 3. Contact Capability Rollout

1. For each SGK supplier/partner contact, create capability records using:
   - POST /workflow-requests/contacts/{contactId}/capabilities
2. Include at least:
   - supportedRequestTypes
   - supportedWorkflows
   - paymentMethods
   - verificationPolicies
   - approvalPolicies
3. Verify with:
   - GET /workflow-requests/contacts/{contactId}/capabilities

## 4. Reconciliation Policy Activation

1. Set policy mode in request/workflow metadata as needed:
   - 2-way for approval + invoice flows
   - 3-way for approval + delivery/receipt + invoice
   - 4-way for approval + delivery/receipt + invoice + payment/completion
2. Run smoke flows and verify statuses:
   - RECONCILED
   - AMOUNT_MISMATCH
   - SETTLEMENT_MISSING
3. Verify RECONCILIATION_DECISION appears in audit event timeline.

## 5. FEPT Safety Validation

1. Confirm standalone capture blocks active FEPT evidence checkpoint refs.
2. Confirm mobile scan routes capture in-flow when run context exists.
3. Validate before/after checkpoint transitions via field task flow.

## 6. Production Cutover Checklist

1. Deploy API.
2. Run targeted tests:
   - tests/workflowEvidenceController.spec.ts
   - tests/fieldExecutionActions.spec.ts
   - tests/reconciliationPolicyPacks.spec.ts
   - tests/oidcMetadataExposure.spec.ts
3. Verify tenant metadata exposure and routing behavior for one pilot org before broad enablement.
4. Monitor reconciliation exceptions dashboard for first 48h and tune capability/policy metadata.
