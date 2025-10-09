Short answer up front (direct):
**Yes — use Credo’s Askar-backed agent wallets as the primary key store and signer.**
We will not use `jose` at the application layer for signing. If Credo uses JOSE internally, that remains encapsulated. For backups/recovery we use an external KMS (Vault / AWS KMS / HSM) only for encrypted backup/restore (wrapping), never for live signing. The live signing and verification remain inside the Askar wallet (server issuer agent or mobile wallets).

Below I explain why, show how it fits into your architecture, provide concrete backup/recovery patterns (server + mobile), give example pseudocode you can hand to devs/Copilot, and include references so you can verify everything.

---

## Why Askar (Credo) should be the primary key manager & signer

- **Askar is the designed secure wallet/storage for Aries/Credo agents.** It provides encrypted-at-rest storage and crypto operations (encrypt/decrypt, sign/verify) for agent keys. Credo docs explicitly describe Askar as the wallet/storage implementation for agents. ([credo.js.org][1])
- **Best practice:** keep signing operations inside the wallet/agent (Askar) so keys are used where they live and are not needlessly exported. This improves security (reduces key leakage surface) and aligns with Aries agent architecture. ([GitHub][2])

Policy decisions implemented:

- Wallet-only signing (Askar). No app-level jose for signing.
- KMS/Vault used only for encrypted backup/restore of the wallet state.
- No private key export via REST endpoints; no KMS signing routes.

* **Credo already integrates with Askar.** Use Credo’s agent APIs to request signatures and resolve keys for verification. No need to re-implement signing with `jose` for core issuance/verification flows. ([GitHub][3])

**Conclusion:** Askar (via Credo) = primary key store + signer. `jose` = optional adapter for external interoperability (JWKS/JWS) only.

---

## Role of external KMS (Vault / AWS KMS / HSM)

- Use external KMS **only for backup/escrow/wrapping** of key material (KEK to wrap DEKs), and for enterprise custodial recovery policies — not for everyday signing if you are using Askar as the primary wallet.
- Vault Transit / AWS KMS let you **wrap/unwrap** keys (envelope encryption) or perform signing operations if you choose to offload signing (but that’s optional). Use KMS for:

  - Storing tenant KEKs (wrapping keys) and performing `wrap/unwrap`.
  - Generating and protecting long-term KEKs; storing wrapped backups (wrapped DEKs) in object store or DB. ([HashiCorp Developer][4])

---

## Two recommended modes (choose per tenant / policy)

A — **Agent-first, non-custodial (recommended default)**

- Askar holds keys and performs sign/verify.
- Backups: mobile or server agent exports an encrypted backup blob (encrypted with a DEK). The DEK is wrapped by a _user-derived key_ (passphrase) or split shares — the platform stores only ciphertext and metadata. No KMS unwrap by platform. This protects user sovereignty.

B — **Agent-first, custodial-backup (enterprise opt-in)**

- Askar still signs and stores keys for normal operation.
- Backups: when a tenant opts for custodial recovery, the agent wraps the DEK using the tenant’s KEK via Vault/AWS KMS and stores the wrapped DEK reference with the backup. The platform can later request an unwrap (with RBAC + audit) to assist recovery. KMS never exposes KEK; unwrap is an authorized API call. ([HashiCorp Developer][5])

---

## Concrete flows — diagrams & explanation

### Server agent (Askar) signing + backup (custodial or non-custodial)

```mermaid
sequenceDiagram
  participant Agent as Askar (server agent)
  participant API as Credo Controller
  participant KMS as Vault/AWS KMS
  participant Store as ObjectStore/DB

  Agent->>Agent: create issuer keypair (stored encrypted in Askar)
  API->>Agent: request signature (issue VC)
  Agent-->>API: signature (does sign inside Askar)
  API->>Store: persist signed VC metadata

  Note over Agent,Store: Backup (optional)
  Agent->>Agent: export key material (if allowed) OR derive export bytes
  Agent->>Agent: generate DEK; encrypt key material with DEK (AES-GCM)
  alt Custodial
    Agent->>KMS: wrap DEK using tenant KEK
    KMS-->>Agent: wrappedDEKRef
    Agent->>Store: upload {ciphertext, wrappedDEKRef, metadata}
  else Non-custodial
    Agent->>Agent: wrap DEK with user-derived key (passphrase)
    Agent->>Store: upload {ciphertext, passphraseSalt, metadata}
  end
```

### Mobile wallet backup & recovery

```mermaid
sequenceDiagram
  participant Device as Mobile Wallet Agent (Talao/React Native)
  participant API as Credo Controller
  participant KMS as Vault/AWS KMS
  participant Store as ObjectStore/DB

  Device->>Device: generate keypair (Ed25519) in secure store
  Device->>Device: generate DEK; encrypt private key (AES-GCM)
  alt Non-custodial
    Device->>Device: wrap DEK with passphrase-derived key (scrypt/argon2)
    Device->>Store: upload encrypted blob + salt + metadata
  else Custodial
    Device->>API: send DEK to API over TLS or request server-side wrap
    API->>KMS: wrap DEK (transit/encrypt)
    KMS-->>API: wrappedDEKRef
    API->>Store: upload encrypted blob + wrappedDEKRef + metadata
  end

  Recovery:
  Device->>Store: request encrypted blob
  alt Non-custodial
    Device->>Device: derive wrapKey from passphrase; unwrap DEK; decrypt private key locally
  else Custodial
    Device->>API: request unwrap (auth)
    API->>KMS: unwrap wrappedDEKRef
    KMS-->>API: DEK
    API-->>Device: deliver DEK over secure short-lived channel
    Device->>Device: decrypt private key locally
  end
```

---

## Pseudocode patterns (safe, general — no made-up Askar function names)

### 1) Signing with Askar (conceptual)

```ts
// high-level pattern: let Askar/agent perform signing
const agent = getAgentForTenant(tenantId); // Credo agent instance wired to Askar wallet
const credentialPayload = buildVcPayload(...);

// request the agent to sign the credential -- the agent uses Askar-backed key
const signedVc = await agent.issueCredential({ payload: credentialPayload });
// Credo / agent internals perform signing inside Askar; private key never leaves Askar.
```

> Implementation detail: use Credo/Aries agent operations (issue credential / openid4vc flows). These call into the agent wallet (Askar) to sign. See Credo OpenID4VC docs for issuance flows. ([GitLab][6])

### 2) Backup: envelope-encrypt + wrap via Vault (server-side example sketch)

```js
// Node.js - server-side (uses Vault transit or AWS KMS)
const crypto = require('crypto')

// device/agent produced ciphertext and DEK (or agent returns DEK to server for wrap)
const dek = crypto.randomBytes(32) // DEK (AES-256) - if agent exported plaintext (avoid if possible)
const iv = crypto.randomBytes(12)
const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv)
const ct = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()])
const tag = cipher.getAuthTag()

// wrap DEK in Vault transit (custodial)
const vaultResp = await vault.transit.encryptData({ name: 'tenant-kev', plaintext: dek.toString('base64') })
const wrappedDEK = vaultResp.data.ciphertext

// store { ct, iv, tag, wrappedDEK, metadata } in object store
```

References: Vault Transit API docs and AWS KMS data key workflow. ([HashiCorp Developer][4])

### 3) Recovery (custodial)

```js
// server-side: authorized unwrap
const unwrapResp = await vault.transit.decryptData({ name: 'tenant-kev', ciphertext: wrappedDEK })
const dekBase64 = unwrapResp.data.plaintext
const dek = Buffer.from(dekBase64, 'base64')
// send DEK over TLS within short-lived session to authenticated device/process
```

References: Vault Transit encrypt/decrypt & AWS KMS decrypt. ([HashiCorp Developer][4])

---

## Key integration points — what to implement now

1. **Do not change Credo issuance to use `jose`** — keep Credo + Askar for signing. `jose` only for a small interop output if needed. ([GitLab][6])

2. **Implement a KeyProvider adapter that:**

   - Uses Credo agent/Askar for live `sign()` and `getPublicKey()` operations.
   - Talks to Vault/AWS KMS for `wrapKey()` / `unwrapKey()` during backup/recovery.
   - Exposes a uniform interface to issuance/verify code: `signWithAgent(tenantId, data)` and `wrapBackup(tenantId, ciphertext)`.

3. **Backup API endpoints (server)**

   - `POST /tenants/:tid/wallets/:wid/backup` — store the encrypted blob and wrappedDEKRef / metadata.
   - `POST /tenants/:tid/wallets/:wid/recover` — authorized unwrap path for custodial flows.

4. **Mobile agent (wallet)**

   - Use native secure store (Keychain / Keystore) for ephemeral key import after recovery.
   - Use passphrase-based non-custodial backup by default; provide optional custodial backup via server+KMS for tenants that require it.

5. **Audit & policy**

   - Log every wrap/unwrap, who requested it, which tenant/wallet, correlationId — but never log key material. Use Pino structured logs. ([HashiCorp Developer][5])

---

## References (authoritative)

- Credo / Aries Askar (Askar is the secure wallet/storage for Credo agents). Read: Aries Askar + Credo Askar docs. ([credo.js.org][1])

  - Aries Askar overview: [https://credo.js.org/guides/getting-started/set-up/aries-askar](https://credo.js.org/guides/getting-started/set-up/aries-askar) ([credo.js.org][1])
  - Askar repo & wrappers: [https://github.com/openwallet-foundation/askar](https://github.com/openwallet-foundation/askar) and the Node wrapper package. ([GitHub][2])

- Credo OpenID4VC & issuance flows (how issuance uses agent signing): Credo docs. ([GitLab][6])
- HashiCorp Vault Transit API (wrap/unwrap & sign/verify): [https://developer.hashicorp.com/vault/api-docs/secret/transit](https://developer.hashicorp.com/vault/api-docs/secret/transit). ([HashiCorp Developer][4])
- AWS KMS data key & encrypt/decrypt patterns: [https://docs.aws.amazon.com/kms/latest/developerguide/overview.html](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html). ([AWS Documentation][7])
- Envelope encryption primer: how to wrap data keys and store ciphertext: freeCodeCamp / AWS docs. ([FreeCodeCamp][8])

---

## Final short checklist for you to confirm implementation plan

- [ ] Keep Credo + Askar as the primary key store & signer for both server agents and mobile wallet agents. ([credo.js.org][1])
- [ ] Implement KeyProvider adapter: Askar for live signing; KMS (Vault/AWS KMS) for backup/wrap/unwrap. ([HashiCorp Developer][4])
- [ ] Default wallet backup = non-custodial (user passphrase); optional custodial backup = wrap DEK with tenant KEK in KMS. ([FreeCodeCamp][8])
- [ ] Use `jose` only if an external party requires a JOSE/JWS/JWK output; do not replace Credo/Askar signing with `jose`. ([GitHub][9])

---

[1]: https://credo.js.org/guides/getting-started/set-up/aries-askar?utm_source=chatgpt.com 'Aries Askar'
[2]: https://github.com/openwallet-foundation/askar?utm_source=chatgpt.com 'openwallet-foundation/askar'
[3]: https://github.com/openwallet-foundation/credo-ts?utm_source=chatgpt.com 'openwallet-foundation/credo-ts: Typescript framework for ...'
[4]: https://developer.hashicorp.com/vault/api-docs/secret/transit?utm_source=chatgpt.com 'Transit secrets engine API - Vault'
[5]: https://developer.hashicorp.com/vault/tutorials/encryption-as-a-service/eaas-transit?utm_source=chatgpt.com 'Encrypt data in transit with Vault'
[6]: https://opensource.unicc.org/openwallet-foundation/credo-ts/-/blob/%40credo-ts/askar%400.5.6/CHANGELOG.md?utm_source=chatgpt.com 'CHANGELOG.md · @credo-ts/askar@0.5.6'
[7]: https://docs.aws.amazon.com/kms/latest/developerguide/overview.html?utm_source=chatgpt.com 'AWS Key Management Service'
[8]: https://www.freecodecamp.org/news/envelope-encryption/?utm_source=chatgpt.com 'How to Manage Encryption at Scale with Envelope ...'
[9]: https://github.com/credebl/credo-controller?utm_source=chatgpt.com 'Controller Service for Credo REST extension'

[10] :https://credo.js.org/guides/tutorials/registering-schema-and-credential-definition
https://credo.js.org/guides/features/openid4vc
https://credo.js.org/guides/features/dids
https://credo.js.org/guides/concepts/agents

Great — here’s a complete, copy-pasteable package you can drop into your repo (or hand to Copilot) to implement:

1. A **tenant-aware KeyProvider adapter** that:

   - Uses the **Credo/Askar agent** for live signing (primary).
   - Uses **Vault** (or AWS KMS) for **wrap/unwrap** (backup/custodial) operations.

2. A **Backup & Recovery TSOA/Express controller** (API endpoints) that supports:

   - Non-custodial backups (passphrase-wrap)
   - Custodial backups (KMS wrap via Vault/AWS)

3. Example **unit tests (Jest)** for the wrap/unwrap flow (in-memory / Vault dev mock).
4. A **Vault dev Docker Compose** snippet for local testing.
5. Example `curl` requests to exercise the flows.
6. Security, audit, and operational notes.

All code below is TypeScript-oriented, TSOA-friendly, and annotated with JSDoc/comments, so Copilot or your engineers can paste it in and adapt it to your repo layout and Credo agent APIs.

---

## ⚠️ Important design reminders (short)

- **Primary signer = Askar (Credo agent wallet)**. Do **not** move production signing to KMS unless you explicitly want custodial signing. KMS is used **only for wrapping/unwrapping** keys for backup/custody.
- **Default**: non-custodial backups (user passphrase / device recovery) — safer and privacy-preserving. Custodial (KMS) is optional per tenant and requires policy & audit.
- **Never** log plaintext keys or unwrapped DEKs. Log only hashed identifiers and metadata.

---

## 1) KeyProvider interface (contract)

```ts
/**
 * KeyProvider - abstract interface for key operations used by Credo issuance and backup flows.
 *
 * Purpose:
 *  - Provide a uniform API to: 1) obtain public key material, 2) ask the agent to sign,
 *    3) wrap/unwrap DEKs via KMS (Vault/AWS) for backups.
 *
 * Notes:
 *  - Live signing should be performed by the agent (Askar). KMS is used only for wrap/unwrap.
 */
export interface KeyProvider {
  /**
   * Request the agent (Askar) to sign an arbitrary payload (used for VC issuance).
   * @param tenantId Tenant identifier
   * @param keyId Optional key identifier inside agent
   * @param payloadBytes Binary payload to sign (e.g. hash of SD-JWT container)
   * @returns signature bytes (base64 or Buffer)
   */
  signWithAgent(tenantId: string, keyId: string | undefined, payloadBytes: Uint8Array): Promise<Buffer>

  /**
   * Get public JWK (or public key) for verification (e.g. to publish JWKS or verify VC).
   * @param tenantId Tenant identifier
   * @param keyId Optional key identifier
   */
  getPublicJwk(tenantId: string, keyId?: string): Promise<JsonWebKey>

  /**
   * Wrap (encrypt) a DEK using tenant KEK in KMS (Vault/AWS) for custodial backup.
   * Returns a wrapped reference (opaque) that can later be unwrapped.
   * @param tenantId
   * @param dek Plaintext DEK Buffer (AES key)
   */
  wrapKeyWithKms(tenantId: string, dek: Buffer): Promise<{ wrapped: string; meta?: any }>

  /**
   * Unwrap a wrapped DEK using KMS (Vault/AWS). Returns plaintext DEK Buffer.
   */
  unwrapKeyWithKms(tenantId: string, wrappedRef: string): Promise<Buffer>
}
```

---

## 2) AskarAgentKeyProvider — adapter to Credo agent (Primary signer)

> NOTE: adapt agent calls to match your Credo controller/agent instance API. Below uses generic `agent` method placeholders (e.g., `agent.wallet.sign()` or `agent.crypto.sign()`); replace with actual calls in your codebase.

```ts
/**
 * AskarAgentKeyProvider
 *
 * Purpose:
 *  - Route signing operations to Credo's agent (Askar wallet) to keep private keys inside the wallet.
 *  - Provide public JWKs from agent DID docs.
 *
 * Dependencies:
 *  - Credo agent instance (injected)
 *  - A KMS provider instance (Vault/AWS) for wrap/unwrap; used only for backup operations
 *
 * Example usage:
 *  const provider = new AskarAgentKeyProvider({ agent, kmsProvider });
 *  const signed = await provider.signWithAgent('tenantA', 'key-1', payloadBytes);
 */
import crypto from 'crypto'
import type { KeyProvider } from './key-provider-interface'

type Agent = any // replace with actual Credo agent type

export class AskarAgentKeyProvider implements KeyProvider {
  constructor(
    private agent: Agent,
    private kmsProvider: KmsAdapter,
  ) {}

  async signWithAgent(tenantId: string, keyId: string | undefined, payloadBytes: Uint8Array): Promise<Buffer> {
    // Hash the payload as required by Credo/SD-JWT flow (or pass raw if agent expects)
    const digest = crypto.createHash('sha256').update(payloadBytes).digest()

    // Use agent to sign inside Askar (private key never leaves Askar)
    // Replace `agent.cryptoSign` below with the real agent method
    const signatureBase64 = await this.agent.cryptoSign({
      tenantId,
      keyId,
      data: digest.toString('base64'),
    })

    return Buffer.from(signatureBase64, 'base64')
  }

  async getPublicJwk(tenantId: string, keyId?: string): Promise<JsonWebKey> {
    // Resolve the tenant's DID doc from agent or ledger and return associated public JWK
    // Replace `agent.getDidDoc` with actual API
    const didDoc = await this.agent.getDidDocForTenant(tenantId)
    // find verification method matching keyId or return first jwk
    const vm =
      (didDoc?.verificationMethod || []).find((v: any) => !keyId || v.id.endsWith(keyId)) ||
      didDoc?.verificationMethod?.[0]
    if (!vm) throw new Error('No verification method found')
    return vm.publicKeyJwk
  }

  async wrapKeyWithKms(tenantId: string, dek: Buffer): Promise<{ wrapped: string; meta?: any }> {
    // Delegate to KMS adapter (Vault/AWS). The adapter will return ciphertext (wrapped DEK).
    return this.kmsProvider.wrapKey(tenantId, dek)
  }

  async unwrapKeyWithKms(tenantId: string, wrappedRef: string): Promise<Buffer> {
    return this.kmsProvider.unwrapKey(tenantId, wrappedRef)
  }
}
```

---

## 3) KmsAdapter (Vault + AWS examples)

Provide a small adapter that can use **HashiCorp Vault Transit** or **AWS KMS** to wrap/unwrap DEKs. Use it only for backups.

### VaultTransitAdapter (Node.js)

```ts
/**
 * VaultTransitAdapter
 *
 * Uses HashiCorp Vault Transit API to wrap / unwrap data keys.
 * Vault must be configured with a transit key per tenant (or key name stored in tenant metadata).
 *
 * Reference: https://developer.hashicorp.com/vault/api-docs/secret/transit
 */
import Vault from 'node-vault'

export class VaultTransitAdapter {
  constructor(
    private vaultClient: any,
    private transitKeyNameByTenant: (tid: string) => string,
  ) {}

  async wrapKey(tenantId: string, dek: Buffer): Promise<{ wrapped: string; meta?: any }> {
    const keyName = this.transitKeyNameByTenant(tenantId)
    // base64 encode plaintext for Vault API
    const resp = await this.vaultClient.write(`transit/encrypt/${keyName}`, { plaintext: dek.toString('base64') })
    return { wrapped: resp.data.ciphertext, meta: { keyName } }
  }

  async unwrapKey(tenantId: string, wrappedCiphertext: string): Promise<Buffer> {
    const keyName = this.transitKeyNameByTenant(tenantId)
    const resp = await this.vaultClient.write(`transit/decrypt/${keyName}`, { ciphertext: wrappedCiphertext })
    const dekBase64 = resp.data.plaintext
    return Buffer.from(dekBase64, 'base64')
  }
}
```

Install node-vault or use HTTP calls. For AWS KMS you would use AWS SDK `Encrypt`/`Decrypt` or the DataKey APIs.

---

## 4) Backup & Recovery Controller (TSOA style)

Below is a TSOA controller skeleton that exposes custodial and non-custodial backup endpoints. Replace injection/agent retrieval with your app's DI.

```ts
import { Controller, Post, Route, Body, Path, Request, Security } from 'tsoa'
import { KeyProvider } from './key-provider-interface'
import crypto from 'crypto'

/**
 * BackupController
 *
 * Endpoints:
 *  - POST /tenants/{tenantId}/wallets/{walletId}/backup
 *  - POST /tenants/{tenantId}/wallets/{walletId}/recover
 */
@Route('tenants/{tenantId}/wallets/{walletId}')
export class BackupController extends Controller {
  // Inject providers in your DI layer
  constructor(private keyProvider: KeyProvider) {
    super()
  }

  /**
   * Create an encrypted backup for a wallet.
   * Behavior:
   *  - Accepts a client-supplied encrypted blob (ciphertext) + metadata OR
   *  - Accepts plaintext export if agent exports raw privateKey (less recommended) which server will encrypt using DEK.
   *
   * For non-custodial: client wraps DEK with passphrase (server stores only ciphertext & salt)
   * For custodial: server wraps DEK using KMS (wrapKeyWithKms) and stores wrapped reference.
   */
  @Post('backup')
  public async createBackup(
    @Path() tenantId: string,
    @Path() walletId: string,
    @Body()
    body: {
      // Option 1: client already encrypted keyfile
      ciphertext?: string // base64
      iv?: string
      tag?: string
      // Option 2: client wants server to wrap DEK (not recommended)
      dekWrappedByClient?: string
      // backup metadata
      custodian?: boolean // true = use KMS
      passphraseSalt?: string
    },
    @Request() req: any,
  ): Promise<{ backupId: string; status: string }> {
    const logger = req.logger
    const correlationId = req.headers['x-correlation-id'] || req.logger?.bindings?.correlationId

    // validation (simplified)
    if (!body.ciphertext) {
      throw new Error('ciphertext required')
    }

    // if custodian requested, expect the client to have sent a raw DEK (only in secure cases)
    if (body.custodian) {
      // we expect client to send DEK encrypted under a short-lived session OR client calls server to wrap DEK.
      // For this example, server requests wrap by KMS: the client sends dek (base64) over TLS (discouraged).
      // Better: client calls server to perform wrapping via a secure channel (see mobile flow).
      // Here we just accept wrappedDEK if provided:
      const dekPlain = body.dekWrappedByClient ? Buffer.from(body.dekWrappedByClient, 'base64') : null
      if (dekPlain) {
        const wrapResp = await (this.keyProvider as any).wrapKeyWithKms(tenantId, dekPlain)
        // persist ciphertext + wrapResp.wrapped + metadata to DB (pseudocode)
        const backupId = `backup-${Date.now()}`
        await persistBackupMeta(tenantId, walletId, {
          backupId,
          ciphertext: body.ciphertext,
          wrappedRef: wrapResp.wrapped,
          meta: wrapResp.meta,
        })
        logger.info(
          { module: 'backup', operation: 'create', tenantId, walletId, correlationId },
          'custodial backup stored',
        )
        return { backupId, status: 'stored' }
      } else {
        throw new Error('For custodial backup, DEK must be provided or client must call wrap endpoint.')
      }
    } else {
      // Non-custodial: server stores ciphertext, passphraseSalt and metadata
      const backupId = `backup-${Date.now()}`
      await persistBackupMeta(tenantId, walletId, {
        backupId,
        ciphertext: body.ciphertext,
        iv: body.iv,
        tag: body.tag,
        salt: body.passphraseSalt || crypto.randomBytes(16).toString('base64'),
      })
      logger.info(
        { module: 'backup', operation: 'create', tenantId, walletId, correlationId },
        'non-custodial backup stored',
      )
      return { backupId, status: 'stored' }
    }
  }

  /**
   * Recover a backup. Two modes:
   *  - Non-custodial: server returns ciphertext & metadata for client to derive DEK & decrypt locally.
   *  - Custodial: server calls KMS to unwrap DEK and returns DEK to authenticated device over short-lived channel.
   */
  @Post('recover')
  public async recoverBackup(
    @Path() tenantId: string,
    @Path() walletId: string,
    @Body() body: { backupId: string; requestMode: 'client' | 'custodial' },
    @Request() req: any,
  ): Promise<any> {
    const logger = req.logger
    const { backupId, requestMode } = body

    const meta = await fetchBackupMeta(tenantId, walletId, backupId)
    if (!meta) throw new Error('backup not found')

    if (requestMode === 'client') {
      // return ciphertext & salt etc. Client will derive key and decrypt.
      logger.info(
        { module: 'backup', operation: 'recover-client', tenantId, walletId },
        'returning backup blob to client',
      )
      return { ciphertext: meta.ciphertext, iv: meta.iv, tag: meta.tag, salt: meta.salt }
    } else {
      // custodial: authorized server-side unwrap (requires RBAC + audit)
      // perform policy checks here: e.g., req.user must have recovery role, MFA, tenant consent
      await assertAuthorizedForCustodialRecover(req.user, tenantId, walletId)

      const wrappedRef = meta.wrappedRef
      const dek = await (this.keyProvider as any).unwrapKeyWithKms(tenantId, wrappedRef) // returns Buffer (plaintext DEK)
      // DO NOT log dek; create short-lived token/session to deliver DEK to requesting device
      const shortSession = await createShortLivedSessionForRecovery(tenantId, walletId, dek)
      logger.info(
        { module: 'backup', operation: 'recover-custodial', tenantId, walletId },
        'custodial unwrap performed',
      )
      return { recoverySessionToken: shortSession.token, expiresIn: shortSession.expiresIn }
    }
  }
}
```

**Notes**

- `persistBackupMeta`, `fetchBackupMeta`, `assertAuthorizedForCustodialRecover`, and `createShortLivedSessionForRecovery` are placeholders — implement in your DB/session system.
- For custodial mode, _never_ send DEK in plain JSON over a channel without strong proof & short TTL; prefer to create an ephemeral session for the device to fetch exact DEK once, then destroy it.

---

## 5) Unit test sketch (Jest) for Vault wrap/unwrap (dev)

```ts
describe('VaultTransitAdapter', () => {
  let adapter: VaultTransitAdapter
  let vaultClientMock: any

  beforeEach(() => {
    // create a simple fake vault client with write behavior
    vaultClientMock = {
      write: jest.fn(async (path: string, payload: any) => {
        if (path.includes('encrypt')) {
          return { data: { ciphertext: `vault:v1:${Buffer.from(payload.plaintext, 'base64').toString('base64')}` } }
        }
        if (path.includes('decrypt')) {
          return { data: { plaintext: payload.ciphertext.replace('vault:v1:', '') } }
        }
      }),
    }
    adapter = new VaultTransitAdapter(vaultClientMock, (tid) => `tenant-${tid}-key`)
  })

  test('wrap and unwrap returns original dek', async () => {
    const dek = Buffer.from('01234567890123456789012345678901') // 32 bytes
    const wrapped = await adapter.wrapKey('tenantA', dek)
    expect(wrapped.wrapped).toMatch(/^vault:v1:/)
    const unwrapped = await adapter.unwrapKey('tenantA', wrapped.wrapped)
    expect(unwrapped.toString()).toEqual(dek.toString())
  })
})
```

---

## 6) Docker Compose for Vault dev (quick local test)

```yaml
version: '3.8'
services:
  vault:
    image: vault:1.14.1
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: 'root'
      VAULT_ADDR: 'http://0.0.0.0:8200'
    ports:
      - '8200:8200'
    command: 'server -dev -dev-root-token-id=root'
```

Initialize a transit key per tenant (example `vault` CLI):

```bash
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=root
# enable transit
vault secrets enable transit
# create key for tenantA
vault write -f transit/keys/tenant-tenantA-key
```

---

## 7) Example `curl` flows

**Non-custodial backup (client-side wrapped):**

```bash
curl -X POST "http://localhost:3000/tenants/tenantA/wallets/w1/backup" \
 -H "Content-Type: application/json" \
 -H "x-correlation-id: abc-123" \
 -d '{
   "ciphertext":"<BASE64_CIPHERTEXT_FROM_CLIENT>",
   "iv":"<BASE64_IV>",
   "tag":"<BASE64_TAG>",
   "custodian": false,
   "passphraseSalt": "<BASE64_SALT>"
 }'
```

**Custodial backup (client asks server to wrap DEK)** — here client first sends DEK over secure channel (not recommended unless client is trusted/attested):

```bash
curl -X POST "http://localhost:3000/tenants/tenantA/wallets/w1/backup" \
 -H "Content-Type: application/json" \
 -d '{
   "ciphertext":"<BASE64_CIPHERTEXT>",
   "custodian": true,
   "dekWrappedByClient": "<BASE64_DEK>"
 }'
```

**Recover non-custodial (client asks for blob & decrypts locally):**

```bash
curl -X POST "http://localhost:3000/tenants/tenantA/wallets/w1/recover" \
 -H "Content-Type: application/json" \
 -d '{"backupId":"backup-..." , "requestMode":"client"}'
```

**Recover custodial (server unwrapps using KMS and returns short session token after policy checks):**

```bash
curl -X POST "http://localhost:3000/tenants/tenantA/wallets/w1/recover" \
 -H "Content-Type: application/json" \
 -d '{"backupId":"backup-...", "requestMode":"custodial"}'
```

---

## 8) Security & Operational checklist

- Use TLS everywhere.
- Protect Vault root token — use best practices.
- For custodial unwrapping:

  - Require RBAC, MFA, and an approval workflow (audit trail).
  - Generate a short-lived ephemeral session for device to fetch DEK; destroy after use.

- Rotate KEKs periodically and maintain metadata about key versions. Handle re-wrapping of stored DEKs.
- Do not log secrets or DEKs; log only hashed ids or metadata.
- Run regular penetration tests and HSM audits if you move to cloud KMS/HSM.

---

## 9) References & docs

- Credo / Askar (agent wallet): [https://credo.js.org/guides/getting-started/set-up/aries-askar](https://credo.js.org/guides/getting-started/set-up/aries-askar) and Askar repos (Open Wallet Foundation).
- Credo OpenID4VC & SD-JWT: Credo docs — issuance & verification concepts.
- HashiCorp Vault Transit API docs: [https://developer.hashicorp.com/vault/api-docs/secret/transit](https://developer.hashicorp.com/vault/api-docs/secret/transit).
- AWS KMS Data Key & Encrypt/Decrypt docs: [https://docs.aws.amazon.com/kms/latest/developerguide/programming-encryption.html](https://docs.aws.amazon.com/kms/latest/developerguide/programming-encryption.html).
- Envelope encryption patterns (AWS): [https://aws.amazon.com/architecture/data-encryption-with-kms/](https://aws.amazon.com/architecture/data-encryption-with-kms/) and general guides.
- React Native secure storage / mobile key handling: platform docs & best practices.

---
