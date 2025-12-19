### Copilot / AI agent instructions for IdenEx Credentis (credo-controller)

**Mission:** Build a Verifiable Commerce Platform for Zimbabwe (+ Africa) using OID4VC, anchored in EcoCash/mobile money payments. Transform SME trust via verifiable credentials: Cart → Pay → ReceiptVC, merchant attestations, trust scores, delegated agents (ACK pattern), and Gen-UI interfaces.

---

## Quick Start

**Entry points:** `src/server.ts` (Express app), `src/cliAgent.ts` (Credo agent bootstrap), `bin/afj-rest.js` (CLI).  
**UI apps:** `credo-ui/wallet` (demo wallet, Nuxt), `credo-ui/wallet-dev` (dev wallet, Nuxt), `credo-ui/portal` (issuer/verifier portal, Next.js).

**Dev commands:**
- `yarn dev` — Start API dev server (TSOA regenerates routes, starts sample app)
- `yarn build` — Clean, compile TS, regenerate TSOA routes/swagger, patch OpenAPI
- `yarn run tsoa && node ./scripts/patch-swagger.js` — Regenerate API schema after controller changes
- `yarn test` — Run Jest tests

**TSOA workflow:** Routes/OpenAPI are **generated** into `src/routes/routes.ts` + `src/routes/swagger.json`. Never hand-edit. After controller changes: `yarn run tsoa` → `node ./scripts/patch-swagger.js` → commit generated files.

---

## Architecture Patterns

**Multi-tenancy (Credo TenantsModule):**
- Root agent + per-tenant agents via `TenantsModule` (AskarModule ProfilePerWallet)
- Tenant provisioning: `TenantProvisioningService` creates tenant, mints issuer/verifier DIDs (did:key), stores metadata in genericRecords + `TenantRepository` (SQLite)
- Access tenant agent: `await (agent.modules as any).tenants.getTenantAgent({ tenantId })`
- Auth: JWT with role `RestTenantAgent` (see `src/authentication.ts`)

**OID4VC Issuance & Verification:**
- **Issuer:** `OpenId4VcIssuerModule` mounted at `/oidc` (credential offers, token, credential, jwks endpoints)
- **Verifier:** `OpenId4VcVerifierModule` (presentation requests, verification)
- **Credential mapper:** `src/cliAgent.ts` lines 130-165 — maps credential request → signed VC using tenant DID + claims from issuance session metadata
- **Schemas:** `src/utils/credentialDefinitionStore.ts` — in-memory credential definitions (GenericID exists; need CartSnapshotVC, InvoiceVC, PaymentReceiptVC)

**Workflows (EcoCash payment flows):**
- `WorkflowService` + `ActionRegistry` (CredentialActions, FinanceActions, ExternalActions)
- Webhook: `src/controllers/webhooks/EcoCashWebhookController.ts` receives payment notifications → triggers workflow
- Persistence: `WorkflowRepository` (SQLite), `IssuedCredentialRepository`

**Dependency Injection (tsyringe):**
- Register services in `src/server.ts`: `container.registerInstance(Agent, agent)` or `container.register(...)`
- Controllers auto-resolve via `src/utils/tsyringeTsoaIocContainer.ts`

**Persistence (better-sqlite3):**
- `DatabaseManager` auto-runs migrations from `migrations/*.sql` on startup
- Repos: `TenantRepository`, `IssuedCredentialRepository`, `WorkflowRepository`, `WalletCredentialRepository`
- DB path: `data/persistence.db` (configurable via `PERSISTENCE_DB_PATH`)

**Secrets & KMS:**
- Currently: JWT secrets stored in agent genericRecords (plaintext in Askar wallet)
- **Gap:** No external KMS/HSM integration; per-tenant key rotation not implemented

---

## Implementation Status (Phased Roadmap)

**Phase 0 - Foundations (70% done):**
- ✅ EcoCash webhook handler, persistence layer, tenant DID provisioning, OID4VC modules
- ⚠️ Missing: KMS per-tenant mapping, idempotency enforcement via `sourceReference` in webhook

**Phase 1 - Core Verifiable e-commerce MVP (40% done):**
- ✅ Workflow engine, credential issuance service, wallet UIs, portal foundation
- ❌ Missing: CartSnapshotVC/InvoiceVC/PaymentReceiptVC schemas, `/cart/{id}/issue-cartvc`, `/invoices/from-cart`, EcoCash payment initiation endpoint, verifier UI component

**Phase 2-6:** Not started (MerchantVC, trust score, agent delegation/ControllerCredential, Gen-UI tools, escrow/refunds, partnerships)

---

## Key Files & Responsibilities

| File/Dir | Purpose |
|----------|---------|
| `src/cliAgent.ts` | Credo agent config: Askar, TenantsModule, OID4VC issuer/verifier, credential mapper |
| `src/server.ts` | Express setup, middleware (CORS, rate-limit, auth, correlation IDs, OTel), DI registration |
| `src/authentication.ts` | JWT auth, tenant token validation, agent resolution per request |
| `src/controllers/multi-tenancy/` | Tenant CRUD: create, list, delete tenants |
| `src/controllers/oidc/` | OidcIssuerController (offers, credentials), OidcVerifierController, OidcMetadataController |
| `src/controllers/wallet/` | WalletAuthController (register, login, issue membership VC), WalletController (credential CRUD) |
| `src/controllers/webhooks/` | EcoCashWebhookController (payment notifications → workflow triggers) |
| `src/services/TenantProvisioningService.ts` | Provisions tenant DIDs + OpenID metadata on tenant creation |
| `src/services/WorkflowService.ts` | Workflow engine: executes action sequences |
| `src/services/CredentialIssuanceService.ts` | Issues VCs using Credo W3cCredentialsModule |
| `src/persistence/DatabaseManager.ts` | SQLite connection + auto-migration runner |
| `src/utils/credentialDefinitionStore.ts` | In-memory credential schemas (extend for new VC types) |
| `credo-ui/portal/` | Next.js issuer/verifier portal (needs verifier UI + trust card components) |
| `credo-ui/wallet/` | Nuxt demo wallet |
| `credo-ui/wallet-dev/` | Nuxt dev wallet (advanced DID/key management) |

---

## Common Tasks

**Add a new VC schema (e.g., CartSnapshotVC):**
1. Define JSON-LD context in `src/config/credentials.ts` or separate file
2. Add to `credentialDefinitionStore.ts`: `credentialDefinitionStore.set('CartSnapshot', { credentialType: [...], format: 'jwt_vc', ... })`
3. Create controller endpoint (e.g., `POST /cart/:id/issue`) using `CredentialIssuanceService`
4. Run `yarn run tsoa && node ./scripts/patch-swagger.js`

**Wire a workflow (Cart → Invoice → Payment → Receipt):**
1. Seed workflow definition in `migrations/003_create_workflows.sql` or via `POST /workflows`
2. Define actions in `src/services/workflow/actions/` (e.g., `IssueInvoiceAction`, `InitiatePaymentAction`)
3. Register actions in `ActionRegistry`
4. Trigger via `WorkflowService.executeWorkflow(workflowId, context)`

**Add a verifier UI component:**
1. Create React component in `credo-ui/portal/components/walt/verifier/`
2. Call backend `POST /oidc/verify` or use Credo `W3cCredentialsModule.verifyCredential()`
3. Display signature status, issuer DID, revocation status

---

## Critical Constraints

- **Never edit `src/routes/routes.ts` or `src/routes/swagger.json` by hand** — always regenerate via TSOA
- **Tenant sessions must be ended** — middleware in `src/server.ts` calls `tenantAgent.endSession()` after response
- **Secrets in genericRecords are plaintext** — avoid logging; plan KMS migration
- **OID4VC credential mapper must return holder binding** — see `credentialRequestToCredentialMapper` in `src/cliAgent.ts`
- **Idempotency:** EcoCash webhook must deduplicate via `sourceReference` to avoid duplicate ReceiptVCs

---

## Next Priorities (Phase 1 completion)

1. Define CartSnapshotVC, InvoiceVC, PaymentReceiptVC schemas (JSON-LD contexts)
2. Implement `POST /cart/:id/issue-cartvc` and `POST /invoices/from-cart`
3. Wire EcoCash payment initiation (`POST /payments/initiate` → EcoCash API)
4. Build verifier UI in portal (`components/walt/verifier/CredentialVerifier.tsx`)
5. Add idempotency check in `EcoCashWebhookController` (check `sourceReference` in DB before processing)

For detailed phase breakdown, see project overview doc (Cart → Pay → ReceiptVC → Trust Score → Agent Delegation → Gen-UI → Escrow/Lenders).

{
  "summary": "All agent entry points load Askar as the default wallet/KMS, but tenant onboarding stops after creating the TenantRecord: no persistent tenant table, no DID provisioning, and no OpenID issuer/verifier metadata, leaving critical SaaS gaps despite Askar compliance.",
  "askarDefaultKMS": {
    "present": true,
    "evidence": [
      {
        "file": "src/cliAgent.ts",
        "excerpt": "askar: new AskarModule({ ariesAskar, multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet })",
        "acceptance": "AC: Every root agent bootstraps with AskarModule; Command: `node ./bin/afj-rest.js --config samples/cliConfig.json` (inspect logs for Askar init)."
      },
      {
        "file": "src/utils/agent.ts",
        "excerpt": "modules: { askar: new AskarModule({ ariesAskar }) }",
        "acceptance": "AC: Utility agent setup also mounts Askar; Command: `ts-node src/utils/agent.ts` (expect Askar wallet mount)."
      }
    ],
    "severity": "low",
    "notes": "No non-Askar agent path exists; no external KMS adapter is declared."
  },
  "tenantModule": {
    "path": "src/controllers/multi-tenancy/MultiTenancyController.ts",
    "implements": {
      "registerTenantAPI": {
        "present": true,
        "evidence": [
          {
            "file": "src/controllers/multi-tenancy/MultiTenancyController.ts",
            "excerpt": "@Post('/create-tenant') ... agent.modules.tenants.createTenant({ config })",
            "acceptance": "AC: POST creates TenantRecord and JWT; Command: `curl -X POST http://localhost:3000/multi-tenancy/create-tenant -H \"Authorization: Bearer <basewallet-token>\" -d '{\"config\":{\"label\":\"Tenant A\"}}'`"
          }
        ],
        "severity": "medium"
      },
      "tenantModelInDB": {
        "present": false,
        "evidence": [
          {
            "file": "src",
            "excerpt": "No persistence layer or ORM calls storing tenants; only returns in-memory TenantRecord."
          }
        ],
        "severity": "high"
      },
      "perTenantAgentInstantiation": {
        "present": true,
        "evidence": [
          {
            "file": "src/authentication.ts",
            "excerpt": "tenantAgent = await (agent.modules as any).tenants.getTenantAgent({ tenantId })",
            "acceptance": "AC: JWT with role=RestTenantAgent yields TenantAgent; Command: issue tenant token then `curl -H \"Authorization: Bearer <tenant-token>\" /dids/create-key`."
          }
        ],
        "severity": "medium"
      },
      "walletProvisioning": {
        "present": true,
        "evidence": [
          {
            "file": "src/cliAgent.ts",
            "excerpt": "TenantsModuleClass(... sessionLimit ...) with AskarMultiWalletDatabaseScheme.ProfilePerWallet",
            "acceptance": "AC: TenantsModule provisions per-tenant Askar profiles; Command: `curl -X POST .../create-tenant` then inspect agent logs for `ProfilePerWallet`."
          }
        ],
        "severity": "medium"
      },
      "didProvisioning": {
        "present": false,
        "methods": [],
        "evidence": [
          {
            "file": "src/controllers/multi-tenancy/MultiTenancyController.ts",
            "excerpt": "createTenant never calls tenantAgent.dids.create; DID provisioning left to caller."
          }
        ],
        "severity": "critical"
      },
      "issuerConfigPublish": {
        "present": false,
        "evidence": [
          {
            "file": "src/controllers/oidc",
            "excerpt": "No /.well-known/openid-credential-issuer metadata; offers/token rely on in-memory store only."
          }
        ],
        "severity": "critical"
      },
      "verifierConfigPublish": {
        "present": false,
        "evidence": [
          {
            "file": "src/controllers/oidc/OidcVerifierController.ts",
            "excerpt": "Placeholder verify endpoint, no discovery document or presentation definitions."
          }
        ],
        "severity": "high"
      },
      "tenantRouting": {
        "present": true,
        "evidence": [
          {
            "file": "src/routes/routes.ts",
            "excerpt": "\"security\": [{\"jwt\": [\"tenant\"]}] on OIDC endpoints",
            "acceptance": "AC: Tenant tokens required on issuance routes; Command: `curl -H \"Authorization: Bearer <tenant-token>\" /oidc/token` (expect 400 without tenant scope)."
          }
        ],
        "severity": "medium"
      },
      "tenantIsolationControls": {
        "present": true,
        "evidence": [
          {
            "file": "src/server.ts",
            "excerpt": "if (agent instanceof TenantAgent) await agent.endSession()",
            "acceptance": "AC: Tenant sessions cleaned up post-response; Command: `curl /dids/create-key` and watch logs for `Ending tenant session`."
          },
          {
            "file": "src/cliAgent.ts",
            "excerpt": "sessionAcquireTimeout/sessionLimit set (default Infinity)."
          }
        ],
        "severity": "medium"
      },
      "secretsStorage": {
        "present": true,
        "type": "wallet",
        "evidence": [
          {
            "file": "src/cliAgent.ts",
            "excerpt": "agent.genericRecords.save({ content: { secretKey: secretKeyInfo }, tags: { hasSecretKey: 'true' } })"
          }
        ],
        "severity": "high"
      },
      "revocationStrategy": {
        "present": false,
        "format": "none",
        "evidence": [
          {
            "file": "src/controllers/oidc/OidcIssuerController.ts",
            "excerpt": "issuedVcStore[vcId] = { ..., revoked: false } // in-memory flag only."
          }
        ],
        "severity": "high"
      },
      "auditLogging": {
        "present": false,
        "evidence": [
          {
            "file": "repo",
            "excerpt": "No middleware or append-only log capturing tenant actions; only request.logger info."
          }
        ],
        "severity": "high"
      },
      "metrics_and_monitoring": {
        "present": true,
        "evidence": [
          {
            "file": "src/tracer.ts",
            "excerpt": "NodeSDK({ instrumentations: [HttpInstrumentation, ExpressInstrumentation, NestInstrumentation] })",
            "acceptance": "AC: OpenTelemetry exports traces/logs; Command: set OTEL env vars and run `node ./bin/afj-rest.js`."
          }
        ],
        "severity": "medium"
      },
      "backup_and_key_rotation": {
        "present": false,
        "evidence": [
          {
            "file": "src/cliAgent.ts",
            "excerpt": "backupBeforeStorageUpdate: false and no rotation beyond generateSecretKey()"
          }
        ],
        "severity": "high"
      },
      "tenantDelete/cleanup": {
        "present": false,
        "evidence": [
          {
            "file": "src/controllers/multi-tenancy/MultiTenancyController.ts",
            "excerpt": "deleteTenantById delegates to tenants.deleteTenantById without wallet teardown or credential revocation."
          }
        ],
        "severity": "high"
      }
    },
    "tests": {
      "unit": {
        "present": false,
        "evidence": [
          "No *.test.ts or jest specs found for tenant flows."
        ]
      },
      "integration": {
        "present": false,
        "evidence": [
          "No test harness covering onboard/issue/verify/revoke.",
          "which-flows": []
        ]
      },
      "e2e": {
        "present": false,
        "evidence": [
          "No e2e or smoke tests for tenant lifecycle."
        ]
      }
    },
    "infra": {
      "dns_and_subdomain_provision": {
        "present": false,
        "evidence": [
          "No IaC or scripting for subdomains or routing under scripts/."
        ]
      },
      "tls_cert_setup": {
        "present": false,
        "evidence": [
          "Dockerfile/docker-compose omit certbot/ACME or TLS configuration."
        ]
      },
      "did_web_support": {
        "present": true,
        "evidence": [
          {
            "file": "src/controllers/did/DidExpansionController.ts",
            "excerpt": "prepareDidWeb returns publishInstructions + verifyCommand.",
            "acceptance": "AC: Tenants receive instructions to publish did:web; Command: `curl -H \"Authorization: Bearer <tenant-token>\" -d '{\"domain\":\"example.com\"}' /dids/prepare-web`."
          }
        ]
      }
    },
    "concurrency_and_scaling": {
      "notes": "Relies on Credo TenantsModule session locking with default Infinity limits; no queueing or horizontal scaling patterns documented.",
      "evidence": [
        {
          "file": "src/cliAgent.ts",
          "excerpt": "new TenantsModuleClass({ sessionAcquireTimeout: ..., sessionLimit: ... })"
        }
      ]
    }
  },
  "missing": [
    {
      "item": "tenant-did-openid-provisioning",
      "why": "Tenants receive no issuer/verifier DID or metadata, blocking OIDC issuance per tenant.",
      "severity": "critical",
      "suggestedFix": "// src/controllers/multi-tenancy/MultiTenancyController.ts\nawait agent.modules.tenants.withTenantAgent({ tenantId: tenantRecord.id }, async (tenantAgent) => {\n  const didRes = await tenantAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })\n  const issuerDid = didRes.didState.did\n  await tenantAgent.genericRecords.save({ id: `tenant:${tenantRecord.id}:issuer`, content: { did: issuerDid, kid: didRes.didState.didDocument?.verificationMethod?.[0]?.id } })\n  await tenantAgent.genericRecords.save({ id: `tenant:${tenantRecord.id}:openid`, content: buildIssuerMetadata(issuerDid, request) })\n})",
      "filesToChange": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/utils/openidMetadata.ts"
      ]
    },
    {
      "item": "persistent-tenant-store",
      "why": "No database of tenant lifecycle records for audit/compliance.",
      "severity": "high",
      "suggestedFix": "// src/persistence/TenantRepository.ts\nimport { Pool } from 'pg'\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL })\nexport async function upsertTenant(data: { id: string; label: string; status: string }) {\n  await pool.query(`INSERT INTO tenants(id,label,status) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET label = EXCLUDED.label, status = EXCLUDED.status`, [data.id, data.label, data.status])\n}",
      "filesToChange": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/persistence/TenantRepository.ts",
        "migrations/001_create_tenants.sql"
      ]
    },
    {
      "item": "tenant-secret-management",
      "why": "Tenant JWTs reuse a basewallet secret stored in genericRecords; no per-tenant rotation or vault integration.",
      "severity": "high",
      "suggestedFix": "// src/services/SecretManager.ts\nimport Vault from 'node-vault'\nconst vault = Vault({ endpoint: process.env.VAULT_ADDR!, token: process.env.VAULT_TOKEN! })\nexport async function setTenantSecret(id: string, secret: string) {\n  await vault.write(`kv/tenants/${id}`, { data: { jwtSecret: secret } })\n}\nexport async function getTenantSecret(id: string) {\n  const { data } = await vault.read(`kv/tenants/${id}`)\n  return data?.data?.jwtSecret\n}",
      "filesToChange": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/authentication.ts",
        "src/services/SecretManager.ts"
      ]
    },
    {
      "item": "status-list-revocation",
      "why": "Credential revocation is a local boolean; no status list per tenant.",
      "severity": "high",
      "suggestedFix": "// src/controllers/oidc/OidcIssuerController.ts\nconst statusList = await ensureStatusList(request.agent)\npayload.credentialStatus = statusList.entry\nawait publishStatusList(request.agent, statusList)",
      "filesToChange": [
        "src/controllers/oidc/OidcIssuerController.ts",
        "src/services/statusList.ts"
      ]
    },
    {
      "item": "tenant-deletion-cleanup",
      "why": "Deleting a tenant leaves credentials and Askar profile intact.",
      "severity": "high",
      "suggestedFix": "// src/controllers/multi-tenancy/MultiTenancyController.ts\nawait agent.modules.tenants.withTenantAgent({ tenantId }, async (tenantAgent) => {\n  await revokeIssuedCredentials(tenantAgent)\n  await tenantAgent.wallet.deleteProfile()\n})",
      "filesToChange": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/services/revocation.ts"
      ]
    }
  ],
  "actionPlan": [
    {
      "priority": 1,
      "task": "Provision per-tenant DID + OpenID metadata",
      "estimatedSteps": [
        "Extend create-tenant flow to mint issuer/verifier DIDs using Askar wallet",
        "Persist DID + metadata in genericRecords and database",
        "Expose /.well-known/openid-credential-issuer for each tenant"
      ],
      "codeRefs": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/controllers/oidc",
        "src/persistence/TenantRepository.ts"
      ],
      "testToAdd": "tests/multiTenancy/provisioning.spec.ts"
    },
    {
      "priority": 2,
      "task": "Secure tenant secrets and revocation",
      "estimatedSteps": [
        "Integrate Vault/KMS for tenant JWT secrets with rotation endpoint",
        "Implement status list revocation + publication per tenant",
        "Wire deleteTenant to revoke issued credentials and destroy Askar profile"
      ],
      "codeRefs": [
        "src/authentication.ts",
        "src/utils/kms.ts",
        "src/controllers/oidc/OidcIssuerController.ts"
      ],
      "testToAdd": "tests/multiTenancy/revocation.spec.ts"
    },
    {
      "priority": 3,
      "task": "Add audit logging and automation coverage",
      "estimatedSteps": [
        "Introduce audit middleware capturing tenantId/action/correlationId",
        "Add integration/e2e tests: onboard → issue → verify → revoke",
        "Document DNS/TLS automation or wildcard routing strategy"
      ],
      "codeRefs": [
        "src/middleware/auditLogger.ts",
        "package.json",
        "docs/tenancy-operations.md"
      ],
      "testToAdd": "tests/e2e/tenantLifecycle.spec.ts"
    }
  ],
  "tenantOnboardingChecklist": [
    "API: POST /multi-tenancy/create-tenant { config }",
    "Provision per-tenant Askar wallet/profile via TenantsModule",
    "Mint issuer/verifier DIDs and store key references",
    "Publish tenant-specific OpenID issuer/verifier metadata endpoints",
    "Persist tenant record (status=ACTIVE) in database",
    "Return tenant base URLs + Vault secret ref to operator"
  ],
  "rolloutPlan": {
    "MVP": [
      "Add tenant DID and OpenID metadata provisioning on create-tenant",
      "Persist tenants + Askar profile path in relational database",
      "Ship integration test covering tenant onboarding and credential issuance"
    ],
    "Harden": [
      "Wire Vault-backed tenant secrets with rotation APIs",
      "Implement per-tenant status-list revocation and notifications",
      "Add audit logging middleware and retention policy"
    ],
    "Production": [
      "Automate DNS/TLS per tenant or enforce wildcard pattern",
      "Introduce disaster recovery plan with wallet/status-list backups",
      "Tune TenantsModule session limits via load testing and autoscaling"
    ]
  },
  "topFiles": [
    {
      "path": "src/controllers/multi-tenancy/MultiTenancyController.ts",
      "reason": "Defines tenant creation, token issuance, lookup, and deletion routes."
    },
    {
      "path": "src/authentication.ts",
      "reason": "Assigns tenant agents per request and enforces JWT scope checks."
    },
    {
      "path": "src/cliAgent.ts",
      "reason": "Bootstraps the root agent with Askar, TenantsModule, and secret generation."
    },
    {
      "path": "src/server.ts",
      "reason": "Adds correlation IDs, rate limiting, and tenant session teardown."
    },
    {
      "path": "src/controllers/oidc/OidcIssuerController.ts",
      "reason": "Implements issuance logic but lacks tenant-aware metadata and revocation."
    }
  ],
  "testStubs": [
    {
      "name": "tests/multiTenancy/provisioning.spec.ts",
      "description": "Provision tenant ensures DID + metadata stored",
      "snippet": "describe('Tenant provisioning', () => {\n  it('creates issuer metadata with Askar wallet', async () => {\n    const res = await request(app).post('/multi-tenancy/create-tenant').send({ config: { label: 'TenantA' } })\n    expect(res.status).toBe(200)\n    const tenantId = res.body.id\n    const meta = await fetchTenantMetadata(tenantId)\n    expect(meta.issuer.did).toMatch(/^did:/)\n    expect(meta.kms).toBe('askar')\n  })\n})"
    },
    {
      "name": "tests/multiTenancy/secretRotation.spec.ts",
      "description": "Tenant JWT secret rotation invalidates old tokens",
      "snippet": "describe('Tenant secret rotation', () => {\n  it('invalidates old JWT after rotation', async () => {\n    const { tenantId, token } = await onboardTenant()\n    await rotateTenantSecret(tenantId)\n    await expect(accessTenantRoute(token)).rejects.toThrow('Unauthorized')\n  })\n})"
    },
    {
      "name": "tests/oidc/statusList.spec.ts",
      "description": "Status list revocation per tenant",
      "snippet": "describe('Status list revocation', () => {\n  it('marks credential revoked and verification fails', async () => {\n    const { tenantToken, credentialId } = await issueCredentialForTenant()\n    await revokeCredential(tenantToken, credentialId)\n    const result = await verifyCredential(tenantToken, credentialId)\n    expect(result.verified).toBe(false)\n    expect(result.reason).toContain('revoked')\n  })\n})"
    },
    {
      "name": "tests/e2e/tenantLifecycle.spec.ts",
      "description": "Full tenant lifecycle with Askar cleanup",
      "snippet": "describe('Tenant lifecycle', () => {\n  it('tears down Askar profile and revokes creds on delete', async () => {\n    const tenant = await onboardTenant()\n    await issueSampleCredential(tenant.id)\n    await deleteTenant(tenant.id)\n    await expect(fetchTenant(tenant.id)).rejects.toThrow('not found')\n  })\n})"
    },
    {
      "name": "tests/security/auditLog.spec.ts",
      "description": "Audit middleware logs tenant actions",
      "snippet": "describe('Audit logging', () => {\n  it('captures tenant issuance audit entry', async () => {\n    const tenant = await onboardTenant()\n    const res = await issueCredential(tenant.token)\n    const auditEntry = await auditStore.read(res.headers['x-correlation-id'])\n    expect(auditEntry.action).toBe('oidc.issue')\n    expect(auditEntry.tenantId).toBe(tenant.id)\n  })\n})"
    }
  ],
  "prioritizedChecklist": [
    {
      "priority": "P1",
      "window": "0-30 days",
      "items": [
        "Implement tenant DID + OpenID metadata provisioning using Askar wallet keys",
        "Persist tenant records and Askar profile paths in database",
        "Add integration test for tenant onboarding → issue credential"
      ]
    },
    {
      "priority": "P2",
      "window": "30-60 days",
      "items": [
        "Move tenant JWT secrets to Vault/KMS with rotation API",
        "Introduce per-tenant status list revocation and verification checks",
        "Add audit logging middleware with correlationId + tenantId"
      ]
    },
    {
      "priority": "P3",
      "window": "60-90 days",
      "items": [
        "Automate DNS/TLS for tenant domains or enforce wildcard pattern",
        "Implement tenant deletion cleanup with wallet teardown and backups",
        "Load-test TenantsModule session limits and configure autoscaling"
      ]
    },
    {
      "priority": "P4",
      "window": "90+ days",
      "items": [
        "Add tenant billing/analytics dashboards",
        "Offer customer-managed key adapter (audited) while keeping Askar default",
        "Run quarterly DR drill restoring tenant wallets and status lists"
      ]
    }
  ],
  "secretsFindings": [
    {
      "file": "src/cliAgent.ts:118-126",
      "issue": "JWT secret stored as plain value in agent genericRecords, shared across tenants.",
      "remediation": "Move secret storage to Vault transit/kv (see SecretManager snippet) and inject per-tenant secret references; rotate existing secrets."
    }
  ],
  "prChecklist": [
    "Confirm create-tenant provisions issuer/verifier DID metadata and persists tenant record.",
    "Verify Vault/KMS secrets integration and rotation endpoints function.",
    "Ensure status list revocation endpoints respond per tenant and verification fails after revocation.",
    "Run new integration tests: onboard → issue → verify → revoke → delete.",
    "Review audit logs for correlationId + tenantId on every write operation."
  ]
}


{
  "summary": "All agent entry points load Askar as the default wallet/KMS. Phase 1 hardening is underway: tenant onboarding now provisions issuer/verifier DIDs, persists metadata, and stores tenant records in SQLite. Remaining gaps focus on Vault-backed secrets, revocation, audit logging, and deployment automation to unlock end-to-end SaaS readiness.",
  "askarDefaultKMS": {
    "present": true,
    "evidence": [
      {
        "file": "src/cliAgent.ts",
        "excerpt": "askar: new AskarModule({ ariesAskar, multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet })",
        "acceptance": "AC: Every root agent bootstraps with AskarModule; Command: `node ./bin/afj-rest.js --config samples/cliConfig.json` (inspect logs for Askar init)."
      },
      {
        "file": "src/utils/agent.ts",
        "excerpt": "modules: { askar: new AskarModule({ ariesAskar }) }",
        "acceptance": "AC: Utility agent setup also mounts Askar; Command: `ts-node src/utils/agent.ts` (expect Askar wallet mount)."
      }
    ],
    "severity": "low",
    "notes": "No non-Askar agent path exists; no external KMS adapter is declared."
  },
  "tenantModule": {
    "path": "src/controllers/multi-tenancy/MultiTenancyController.ts",
    "implements": {
      "registerTenantAPI": {
        "present": true,
        "evidence": [
          {
            "file": "src/controllers/multi-tenancy/MultiTenancyController.ts",
            "excerpt": "@Post('/create-tenant') ... agent.modules.tenants.createTenant({ config })",
            "acceptance": "AC: POST creates TenantRecord and JWT; Command: `curl -X POST http://localhost:3000/multi-tenancy/create-tenant -H \"Authorization: Bearer <basewallet-token>\" -d '{\"config\":{\"label\":\"Tenant A\"}}'`"
          }
        ],
        "severity": "medium"
      },
      "tenantModelInDB": {
        "present": true,
        "evidence": [
          {
            "file": "src/persistence/TenantRepository.ts",
            "excerpt": "export function upsertTenant(record: TenantPersistenceRecord) { ... db.prepare(\"INSERT INTO tenants...\") }",
            "acceptance": "AC: Tenants persist to SQLite via better-sqlite3; Command: `node -e \"require('./build/persistence/TenantRepository').getTenantById('sample')\"` after onboarding to verify row."
          }
        ],
        "severity": "low",
        "notes": "SQLite store lives at data/tenants.db; configurable via TENANT_DB_PATH."
      },
      "perTenantAgentInstantiation": {
        "present": true,
        "evidence": [
          {
            "file": "src/authentication.ts",
            "excerpt": "tenantAgent = await (agent.modules as any).tenants.getTenantAgent({ tenantId })",
            "acceptance": "AC: JWT with role=RestTenantAgent yields TenantAgent; Command: issue tenant token then `curl -H \"Authorization: Bearer <tenant-token>\" /dids/create-key`."
          }
        ],
        "severity": "medium"
      },
      "walletProvisioning": {
        "present": true,
        "evidence": [
          {
            "file": "src/cliAgent.ts",
            "excerpt": "TenantsModuleClass(... sessionLimit ...) with AskarMultiWalletDatabaseScheme.ProfilePerWallet",
            "acceptance": "AC: TenantsModule provisions per-tenant Askar profiles; Command: `curl -X POST .../create-tenant` then inspect agent logs for `ProfilePerWallet`."
          }
        ],
        "severity": "medium"
      },
      "didProvisioning": {
        "present": true,
        "methods": ["createTenant"],
        "evidence": [
          {
            "file": "src/services/TenantProvisioningService.ts",
            "excerpt": "const issuerDidState = await tenantAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })",
            "acceptance": "AC: Tenant creation mints issuer/verifier DIDs automatically; Command: `curl -X POST .../multi-tenancy/create-tenant` and inspect response.metadata."
          }
        ],
        "severity": "medium",
        "notes": "Issuer/verifier metadata saved to generic records and returned in create-tenant response."
      },
      "issuerConfigPublish": {
        "present": false,
        "evidence": [
          {
            "file": "src/controllers/oidc",
            "excerpt": "No /.well-known/openid-credential-issuer metadata; offers/token rely on in-memory store only."
          }
        ],
        "severity": "critical"
      },
      "verifierConfigPublish": {
        "present": false,
        "evidence": [
          {
            "file": "src/controllers/oidc/OidcVerifierController.ts",
            "excerpt": "Placeholder verify endpoint, no discovery document or presentation definitions."
          }
        ],
        "severity": "high"
      },
      "tenantRouting": {
        "present": true,
        "evidence": [
          {
            "file": "src/routes/routes.ts",
            "excerpt": "\"security\": [{\"jwt\": [\"tenant\"]}] on OIDC endpoints",
            "acceptance": "AC: Tenant tokens required on issuance routes; Command: `curl -H \"Authorization: Bearer <tenant-token>\" /oidc/token` (expect 400 without tenant scope)."
          }
        ],
        "severity": "medium"
      },
      "tenantIsolationControls": {
        "present": true,
        "evidence": [
          {
            "file": "src/server.ts",
            "excerpt": "if (agent instanceof TenantAgent) await agent.endSession()",
            "acceptance": "AC: Tenant sessions cleaned up post-response; Command: `curl /dids/create-key` and watch logs for `Ending tenant session`."
          },
          {
            "file": "src/cliAgent.ts",
            "excerpt": "sessionAcquireTimeout/sessionLimit set (default Infinity)."
          }
        ],
        "severity": "medium"
      },
      "secretsStorage": {
        "present": true,
        "type": "wallet",
        "evidence": [
          {
            "file": "src/cliAgent.ts",
            "excerpt": "agent.genericRecords.save({ content: { secretKey: secretKeyInfo }, tags: { hasSecretKey: 'true' } })"
          }
        ],
        "severity": "high"
      },
      "revocationStrategy": {
        "present": false,
        "format": "none",
        "evidence": [
          {
            "file": "src/controllers/oidc/OidcIssuerController.ts",
            "excerpt": "issuedVcStore[vcId] = { ..., revoked: false } // in-memory flag only."
          }
        ],
        "severity": "high"
      },
      "auditLogging": {
        "present": false,
        "evidence": [
          {
            "file": "repo",
            "excerpt": "No middleware or append-only log capturing tenant actions; only request.logger info."
          }
        ],
        "severity": "high"
      },
      "metrics_and_monitoring": {
        "present": true,
        "evidence": [
          {
            "file": "src/tracer.ts",
            "excerpt": "NodeSDK({ instrumentations: [HttpInstrumentation, ExpressInstrumentation, NestInstrumentation] })",
            "acceptance": "AC: OpenTelemetry exports traces/logs; Command: set OTEL env vars and run `node ./bin/afj-rest.js`."
          }
        ],
        "severity": "medium"
      },
      "backup_and_key_rotation": {
        "present": false,
        "evidence": [
          {
            "file": "src/cliAgent.ts",
            "excerpt": "backupBeforeStorageUpdate: false and no rotation beyond generateSecretKey()"
          }
        ],
        "severity": "high"
      },
      "tenantDelete/cleanup": {
        "present": false,
        "evidence": [
          {
            "file": "src/controllers/multi-tenancy/MultiTenancyController.ts",
            "excerpt": "deleteTenantById delegates to tenants.deleteTenantById without wallet teardown or credential revocation."
          }
        ],
        "severity": "high"
      }
    },
    "tests": {
      "unit": {
        "present": true,
        "evidence": [
          "src/utils/__tests__/openidMetadata.spec.ts validates metadata builders.",
          "src/persistence/__tests__/TenantRepository.spec.ts exercises tenant upsert/retrieval."
        ],
        "notes": "Need controller-level and integration coverage next."
      },
      "integration": {
        "present": false,
        "evidence": [
          "No test harness covering onboard/issue/verify/revoke.",
          "which-flows": []
        ]
      },
      "e2e": {
        "present": false,
        "evidence": [
          "No e2e or smoke tests for tenant lifecycle."
        ]
      }
    },
    "infra": {
      "dns_and_subdomain_provision": {
        "present": false,
        "evidence": [
          "No IaC or scripting for subdomains or routing under scripts/."
        ]
      },
      "tls_cert_setup": {
        "present": false,
        "evidence": [
          "Dockerfile/docker-compose omit certbot/ACME or TLS configuration."
        ]
      },
      "did_web_support": {
        "present": true,
        "evidence": [
          {
            "file": "src/controllers/did/DidExpansionController.ts",
            "excerpt": "prepareDidWeb returns publishInstructions + verifyCommand.",
            "acceptance": "AC: Tenants receive instructions to publish did:web; Command: `curl -H \"Authorization: Bearer <tenant-token>\" -d '{\"domain\":\"example.com\"}' /dids/prepare-web`."
          }
        ]
      }
    },
    "concurrency_and_scaling": {
      "notes": "Relies on Credo TenantsModule session locking with default Infinity limits; no queueing or horizontal scaling patterns documented.",
      "evidence": [
        {
          "file": "src/cliAgent.ts",
          "excerpt": "new TenantsModuleClass({ sessionAcquireTimeout: ..., sessionLimit: ... })"
        }
      ]
    }
  },
  "missing": [
    {
      "item": "tenant-secret-management",
      "why": "Tenant JWTs reuse a basewallet secret stored in genericRecords; no per-tenant rotation or vault integration.",
      "severity": "high",
      "suggestedFix": "// src/services/SecretManager.ts\nimport Vault from 'node-vault'\nconst vault = Vault({ endpoint: process.env.VAULT_ADDR!, token: process.env.VAULT_TOKEN! })\nexport async function setTenantSecret(id: string, secret: string) {\n  await vault.write(`kv/tenants/${id}`, { data: { jwtSecret: secret } })\n}\nexport async function getTenantSecret(id: string) {\n  const { data } = await vault.read(`kv/tenants/${id}`)\n  return data?.data?.jwtSecret\n}",
      "filesToChange": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/authentication.ts",
        "src/services/SecretManager.ts"
      ]
    },
    {
      "item": "status-list-revocation",
      "why": "Credential revocation is a local boolean; no status list per tenant.",
      "severity": "high",
      "suggestedFix": "// src/controllers/oidc/OidcIssuerController.ts\nconst statusList = await ensureStatusList(request.agent)\npayload.credentialStatus = statusList.entry\nawait publishStatusList(request.agent, statusList)",
      "filesToChange": [
        "src/controllers/oidc/OidcIssuerController.ts",
        "src/services/statusList.ts"
      ]
    },
    {
      "item": "tenant-deletion-cleanup",
      "why": "Deleting a tenant leaves credentials and Askar profile intact.",
      "severity": "high",
      "suggestedFix": "// src/controllers/multi-tenancy/MultiTenancyController.ts\nawait agent.modules.tenants.withTenantAgent({ tenantId }, async (tenantAgent) => {\n  await revokeIssuedCredentials(tenantAgent)\n  await tenantAgent.wallet.deleteProfile()\n})",
      "filesToChange": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/services/revocation.ts"
      ]
    }
  ],
  "actionPlan": [
    {
      "priority": 1,
      "task": "Expose and test end-to-end tenant credential flow",
      "status": "in-progress",
      "estimatedSteps": [
        "Add integration harness that onboards a tenant, issues a VC, and verifies it (tests/e2e/tenantCredential.spec.ts)",
        "Provide minimal schema/credential definition setup or JWT VC fixtures",
        "Document runbook: yarn test tenantCredential --runInBand"
      ],
      "codeRefs": [
        "src/controllers/multi-tenancy/MultiTenancyController.ts",
        "src/controllers/oidc/OidcIssuerController.ts",
        "src/controllers/oidc/OidcVerifierController.ts"
      ],
      "testToAdd": "tests/e2e/tenantCredential.spec.ts"
    },
    {
      "priority": 2,
      "task": "Secure tenant secrets and revocation",
      "status": "deferred",
      "estimatedSteps": [
        "Integrate Vault/KMS for tenant JWT secrets with rotation endpoint",
        "Implement status list revocation + publication per tenant",
        "Wire deleteTenant to revoke issued credentials and destroy Askar profile"
      ],
      "codeRefs": [
        "src/authentication.ts",
        "src/utils/kms.ts",
        "src/controllers/oidc/OidcIssuerController.ts"
      ],
      "testToAdd": "tests/multiTenancy/revocation.spec.ts"
    },
    {
      "priority": 3,
      "task": "Add audit logging and automation coverage",
      "estimatedSteps": [
        "Introduce audit middleware capturing tenantId/action/correlationId",
        "Add integration/e2e tests: onboard → issue → verify → revoke",
        "Document DNS/TLS automation or wildcard routing strategy"
      ],
      "codeRefs": [
        "src/middleware/auditLogger.ts",
        "package.json",
        "docs/tenancy-operations.md"
      ],
      "testToAdd": "tests/e2e/tenantLifecycle.spec.ts"
    }
  ],
  "tenantOnboardingChecklist": [
    "API: POST /multi-tenancy/create-tenant { config }",
    "Provision per-tenant Askar wallet/profile via TenantsModule",
    "Mint issuer/verifier DIDs and store key references",
    "Publish tenant-specific OpenID issuer/verifier metadata endpoints",
    "Persist tenant record (status=ACTIVE) in database",
    "Return tenant base URLs + Vault secret ref to operator"
  ],
  "rolloutPlan": {
    "MVP": [
      "Add tenant DID and OpenID metadata provisioning on create-tenant",
      "Persist tenants + Askar profile path in relational database",
      "Ship integration test covering tenant onboarding and credential issuance"
    ],
    "Harden": [
      "Wire Vault-backed tenant secrets with rotation APIs",
      "Implement per-tenant status-list revocation and notifications",
      "Add audit logging middleware and retention policy"
    ],
    "Production": [
      "Automate DNS/TLS per tenant or enforce wildcard pattern",
      "Introduce disaster recovery plan with wallet/status-list backups",
      "Tune TenantsModule session limits via load testing and autoscaling"
    ]
  },
  "topFiles": [
    {
      "path": "src/controllers/multi-tenancy/MultiTenancyController.ts",
      "reason": "Defines tenant creation, token issuance, lookup, and deletion routes."
    },
    {
      "path": "src/authentication.ts",
      "reason": "Assigns tenant agents per request and enforces JWT scope checks."
    },
    {
      "path": "src/cliAgent.ts",
      "reason": "Bootstraps the root agent with Askar, TenantsModule, and secret generation."
    },
    {
      "path": "src/server.ts",
      "reason": "Adds correlation IDs, rate limiting, and tenant session teardown."
    },
    {
      "path": "src/controllers/oidc/OidcIssuerController.ts",
      "reason": "Implements issuance logic but lacks tenant-aware metadata and revocation."
    }
  ],
  "testStubs": [
    {
      "name": "tests/multiTenancy/provisioning.spec.ts",
      "description": "Provision tenant ensures DID + metadata stored",
      "snippet": "describe('Tenant provisioning', () => {\n  it('creates issuer metadata with Askar wallet', async () => {\n    const res = await request(app).post('/multi-tenancy/create-tenant').send({ config: { label: 'TenantA' } })\n    expect(res.status).toBe(200)\n    const tenantId = res.body.id\n    const meta = await fetchTenantMetadata(tenantId)\n    expect(meta.issuer.did).toMatch(/^did:/)\n    expect(meta.kms).toBe('askar')\n  })\n})"
    },
    {
      "name": "tests/multiTenancy/secretRotation.spec.ts",
      "description": "Tenant JWT secret rotation invalidates old tokens",
      "snippet": "describe('Tenant secret rotation', () => {\n  it('invalidates old JWT after rotation', async () => {\n    const { tenantId, token } = await onboardTenant()\n    await rotateTenantSecret(tenantId)\n    await expect(accessTenantRoute(token)).rejects.toThrow('Unauthorized')\n  })\n})"
    },
    {
      "name": "tests/oidc/statusList.spec.ts",
      "description": "Status list revocation per tenant",
      "snippet": "describe('Status list revocation', () => {\n  it('marks credential revoked and verification fails', async () => {\n    const { tenantToken, credentialId } = await issueCredentialForTenant()\n    await revokeCredential(tenantToken, credentialId)\n    const result = await verifyCredential(tenantToken, credentialId)\n    expect(result.verified).toBe(false)\n    expect(result.reason).toContain('revoked')\n  })\n})"
    },
    {
      "name": "tests/e2e/tenantLifecycle.spec.ts",
      "description": "Full tenant lifecycle with Askar cleanup",
      "snippet": "describe('Tenant lifecycle', () => {\n  it('tears down Askar profile and revokes creds on delete', async () => {\n    const tenant = await onboardTenant()\n    await issueSampleCredential(tenant.id)\n    await deleteTenant(tenant.id)\n    await expect(fetchTenant(tenant.id)).rejects.toThrow('not found')\n  })\n})"
    },
    {
      "name": "tests/security/auditLog.spec.ts",
      "description": "Audit middleware logs tenant actions",
      "snippet": "describe('Audit logging', () => {\n  it('captures tenant issuance audit entry', async () => {\n    const tenant = await onboardTenant()\n    const res = await issueCredential(tenant.token)\n    const auditEntry = await auditStore.read(res.headers['x-correlation-id'])\n    expect(auditEntry.action).toBe('oidc.issue')\n    expect(auditEntry.tenantId).toBe(tenant.id)\n  })\n})"
    }
  ],
  "prioritizedChecklist": [
    {
      "priority": "P1",
      "window": "0-30 days",
      "items": [
        "Implement tenant DID + OpenID metadata provisioning using Askar wallet keys",
        "Persist tenant records and Askar profile paths in database",
        "Add integration test for tenant onboarding → issue credential"
      ]
    },
    {
      "priority": "P2",
      "window": "30-60 days",
      "items": [
        "Move tenant JWT secrets to Vault/KMS with rotation API",
        "Introduce per-tenant status list revocation and verification checks",
        "Add audit logging middleware with correlationId + tenantId"
      ]
    },
    {
      "priority": "P3",
      "window": "60-90 days",
      "items": [
        "Automate DNS/TLS for tenant domains or enforce wildcard pattern",
        "Implement tenant deletion cleanup with wallet teardown and backups",
        "Load-test TenantsModule session limits and configure autoscaling"
      ]
    },
    {
      "priority": "P4",
      "window": "90+ days",
      "items": [
        "Add tenant billing/analytics dashboards",
        "Offer customer-managed key adapter (audited) while keeping Askar default",
        "Run quarterly DR drill restoring tenant wallets and status lists"
      ]
    }
  ],
  "secretsFindings": [
    {
      "file": "src/cliAgent.ts:118-126",
      "issue": "JWT secret stored as plain value in agent genericRecords, shared across tenants.",
      "remediation": "Move secret storage to Vault transit/kv (see SecretManager snippet) and inject per-tenant secret references; rotate existing secrets."
    }
  ],
  "prChecklist": [
    "Confirm create-tenant provisions issuer/verifier DID metadata and persists tenant record.",
    "Verify Vault/KMS secrets integration and rotation endpoints function.",
    "Ensure status list revocation endpoints respond per tenant and verification fails after revocation.",
    "Run new integration tests: onboard → issue → verify → revoke → delete.",
    "Review audit logs for correlationId + tenantId on every write operation."
  ]
}