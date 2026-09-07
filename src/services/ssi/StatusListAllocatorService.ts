import { createHash, randomInt, randomUUID } from 'crypto'
import { gzipSync } from 'zlib'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'StatusListAllocatorService' })

/**
 * W3C Bitstring Status List minimum size (spec §5.3 — at least 131072 entries).
 * Using this floor guarantees herd privacy regardless of actual issuance volume.
 */
export const STATUS_LIST_MIN_SIZE = 131_072

/**
 * Seal an active list when it reaches this fill ratio.
 * A sealed list becomes read-only; new issuances go to a fresh list.
 */
const SEAL_THRESHOLD = 0.9

/** Maximum random-probe retries before falling back to a linear scan. */
const MAX_RANDOM_RETRIES = 12

export type StatusPurpose = 'revocation' | 'suspension'

export interface BitstringStatusListEntry {
  type: 'BitstringStatusListEntry'
  statusPurpose: StatusPurpose
  statusListIndex: string
  statusListCredential: string
}

export interface StatusListAllocation {
  allocationId: string
  statusListId: string
  statusIndex: number
  issuerRef: string
  purpose: StatusPurpose
  /** The object to embed as `credentialStatus` in the issued credential. */
  entry: BitstringStatusListEntry
}

interface StatusListRow {
  id: string
  organization_id: string
  issuer_ref: string
  purpose: string
  list_size: number
  allocated_count: number
  status: string
}

interface AllocationRow {
  id: string
  status_list_id: string
  status_index: number
  current_status: string
}

/**
 * Allocates and manages credential status indices in W3C Bitstring Status Lists.
 *
 * One service instance is shared across all tenants/organizations.  All writes
 * are wrapped in SQLite transactions for consistency.  The bitstring encoding
 * exactly matches what CredentialStatusService expects:
 *
 *   multibase-u prefix + base64url(gzip(bitstring))
 *
 * where bits are packed MSB-first: index 0 → byte[0] bit 7, index 1 → byte[0]
 * bit 6, …, index 7 → byte[0] bit 0, index 8 → byte[1] bit 7, etc.
 */
export class StatusListAllocatorService {
  /**
   * Allocates a random index from the active status list for this issuer+purpose.
   * Creates a new status list if none exists or the current one is sealed.
   * Resolves organization_id from tenant_id automatically.
   */
  public allocateForTenant(
    tenantId: string,
    issuerRef: string,
    purpose: StatusPurpose,
    issuedCredentialRef?: string,
  ): StatusListAllocation | null {
    const db = DatabaseManager.getDatabase()
    const org = db
      .prepare(`SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(tenantId) as { id?: string } | undefined
    if (!org?.id) {
      logger.warn(
        { tenantId, issuerRef, purpose },
        'No active organization for tenant — skipping status list allocation',
      )
      return null
    }
    return this.allocate(org.id, issuerRef, purpose, issuedCredentialRef)
  }

  /**
   * Allocates a random index from the active status list for this org+issuer+purpose.
   */
  public allocate(
    organizationId: string,
    issuerRef: string,
    purpose: StatusPurpose,
    issuedCredentialRef?: string,
  ): StatusListAllocation {
    const db = DatabaseManager.getDatabase()

    return db.transaction((): StatusListAllocation => {
      const statusList = this.getOrCreateActiveList(organizationId, issuerRef, purpose)
      const index = this.pickRandomIndex(statusList)
      const allocationId = randomUUID()

      db.prepare(
        `INSERT INTO credential_status_allocations
           (id, status_list_id, status_index, organization_id, issuer_ref, purpose, issued_credential_ref, current_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'valid')`,
      ).run(allocationId, statusList.id, index, organizationId, issuerRef, purpose, issuedCredentialRef ?? null)

      db.prepare(
        `UPDATE credential_status_lists
           SET allocated_count = allocated_count + 1,
               status = CASE
                 WHEN allocated_count + 1 >= ? * list_size THEN 'sealed'
                 ELSE status
               END,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(SEAL_THRESHOLD, statusList.id)

      const statusListUrl = this.buildStatusListUrl(statusList.id)
      logger.info({ allocationId, statusListId: statusList.id, statusIndex: index, purpose }, 'Allocated status index')

      return {
        allocationId,
        statusListId: statusList.id,
        statusIndex: index,
        issuerRef,
        purpose,
        entry: {
          type: 'BitstringStatusListEntry',
          statusPurpose: purpose,
          statusListIndex: String(index),
          statusListCredential: statusListUrl,
        },
      }
    })()
  }

  /** Marks an allocation as revoked and invalidates the cached signed VC. */
  public revoke(allocationId: string): void {
    this.setStatus(allocationId, 'revoked')
  }

  /** Marks an allocation as suspended and invalidates the cached signed VC. */
  public suspend(allocationId: string): void {
    this.setStatus(allocationId, 'suspended')
  }

  /** Reinstates a previously revoked or suspended allocation. */
  public reactivate(allocationId: string): void {
    this.setStatus(allocationId, 'valid')
  }

  public setStatusByCredentialRef(issuedCredentialRef: string, newStatus: 'valid' | 'revoked' | 'suspended'): boolean {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(`SELECT id FROM credential_status_allocations WHERE issued_credential_ref = ? LIMIT 1`)
      .get(issuedCredentialRef) as { id?: string } | undefined
    if (!row?.id) return false
    this.setStatus(row.id, newStatus)
    return true
  }

  /**
   * Builds the raw binary bitstring for a status list from the current allocation
   * state.  Bit layout matches CredentialStatusService.readBitsMostSignificantFirst:
   * index i → byte[floor(i/8)] bit (7 - i%8).
   */
  public buildBitstringBuffer(statusListId: string): Buffer {
    const db = DatabaseManager.getDatabase()
    const listRow = db.prepare(`SELECT list_size FROM credential_status_lists WHERE id = ?`).get(statusListId) as
      | { list_size?: number }
      | undefined

    const listSize = listRow?.list_size ?? STATUS_LIST_MIN_SIZE
    const bufferSize = Math.ceil(listSize / 8) // statusSize=1
    const buf = Buffer.alloc(bufferSize, 0)

    const nonValid = db
      .prepare(
        `SELECT status_index FROM credential_status_allocations
          WHERE status_list_id = ? AND current_status != 'valid'`,
      )
      .all(statusListId) as Array<{ status_index: number }>

    for (const { status_index } of nonValid) {
      if (status_index < 0 || status_index >= listSize) continue
      const byteIndex = Math.floor(status_index / 8)
      const bitPosition = 7 - (status_index % 8) // MSB-first
      buf[byteIndex] |= 1 << bitPosition
    }

    return buf
  }

  /**
   * Encodes a status list buffer to the multibase-u encoded string.
   * Format: 'u' + base64url(gzip(buffer))  (per W3C BitstringStatusList §5.3.1)
   */
  public encodeList(buffer: Buffer): string {
    const compressed = gzipSync(buffer, { level: 9 })
    return 'u' + compressed.toString('base64url')
  }

  /**
   * Computes a content digest of the status list for cache invalidation and
   * evidence digests.
   */
  public computeListDigest(statusListId: string): string {
    const buf = this.buildBitstringBuffer(statusListId)
    return createHash('sha256').update(buf).digest('hex')
  }

  /** Returns the URL at which a status list VC is published. */
  public buildStatusListUrl(statusListId: string): string {
    const base = (process.env.STATUS_LIST_BASE_URL ?? 'https://localhost:3000').replace(/\/$/, '')
    return `${base}/status-lists/${statusListId}`
  }

  // ────────────────────────────────────────────────────────────────────────────

  private setStatus(allocationId: string, newStatus: 'valid' | 'revoked' | 'suspended'): void {
    const db = DatabaseManager.getDatabase()
    db.transaction(() => {
      const row = db
        .prepare(`SELECT status_list_id FROM credential_status_allocations WHERE id = ?`)
        .get(allocationId) as AllocationRow | undefined
      if (!row) throw new Error(`Status allocation not found: ${allocationId}`)

      db.prepare(
        `UPDATE credential_status_allocations
           SET current_status = ?, status_updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(newStatus, allocationId)

      // Invalidate the cached signed VC so it is re-published on next request
      db.prepare(
        `UPDATE credential_status_lists
           SET signed_vc_json = NULL, published_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(row.status_list_id)
    })()
  }

  private getOrCreateActiveList(organizationId: string, issuerRef: string, purpose: StatusPurpose): StatusListRow {
    const db = DatabaseManager.getDatabase()

    const existing = db
      .prepare(
        `SELECT id, organization_id, issuer_ref, purpose, list_size, allocated_count, status
           FROM credential_status_lists
          WHERE organization_id = ? AND issuer_ref = ? AND purpose = ? AND status = 'active'
          LIMIT 1`,
      )
      .get(organizationId, issuerRef, purpose) as StatusListRow | undefined

    if (existing) return existing

    const newId = randomUUID()
    db.prepare(
      `INSERT INTO credential_status_lists
         (id, organization_id, issuer_ref, purpose, list_size, allocated_count, status)
       VALUES (?, ?, ?, ?, ?, 0, 'active')`,
    ).run(newId, organizationId, issuerRef, purpose, STATUS_LIST_MIN_SIZE)

    logger.info({ statusListId: newId, organizationId, issuerRef, purpose }, 'Created new status list')

    return {
      id: newId,
      organization_id: organizationId,
      issuer_ref: issuerRef,
      purpose,
      list_size: STATUS_LIST_MIN_SIZE,
      allocated_count: 0,
      status: 'active',
    }
  }

  /**
   * Picks a random unused index.
   *
   * Uses random probing first (good performance at <80% fill) with a fallback
   * to a linear scan to guarantee termination.
   */
  private pickRandomIndex(statusList: StatusListRow): number {
    const db = DatabaseManager.getDatabase()
    const { list_size } = statusList

    // Random probe
    for (let attempt = 0; attempt < MAX_RANDOM_RETRIES; attempt++) {
      const candidate = randomInt(0, list_size)
      const collision = db
        .prepare(`SELECT 1 FROM credential_status_allocations WHERE status_list_id = ? AND status_index = ? LIMIT 1`)
        .get(statusList.id, candidate)
      if (!collision) return candidate
    }

    // Linear fallback: find the smallest unallocated index
    // Fetch used indexes sorted and scan for first gap
    const used = db
      .prepare(
        `SELECT status_index FROM credential_status_allocations
          WHERE status_list_id = ? ORDER BY status_index`,
      )
      .all(statusList.id) as Array<{ status_index: number }>

    const usedSet = new Set(used.map((r) => r.status_index))
    for (let i = 0; i < list_size; i++) {
      if (!usedSet.has(i)) return i
    }

    throw new Error(`Status list ${statusList.id} is completely full (${list_size} entries)`)
  }
}

export const statusListAllocatorService = new StatusListAllocatorService()
