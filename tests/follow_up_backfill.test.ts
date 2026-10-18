/**
 * Purchases approved before follow-up cards existed get exactly one "finish it" card at startup.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { platformRequestService } from '../src/services/PlatformRequestService'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-follow-up-backfill-')
})

afterAll(() => {
  databases.cleanup()
})

function followUpCards(requestId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT id FROM wallet_pending_offers
        WHERE source_type = 'workflow_stage_action' AND source_id = ?
          AND metadata LIKE '%"requestStep":"follow_up"%'`,
    )
    .all(requestId)
}

describe('follow-up card backfill', () => {
  test('an approved purchase with no follow-up card gets its cards once, and a rerun adds none', async () => {
    const org = seedOrganization({ name: 'Backfill Traders' })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'admin' })

    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: org.ownerUserId,
      requestType: 'procurement.requisition',
      title: 'Cement for depot',
      targetModule: 'finance',
      context: { urgency: 'normal' },
    }) as { id: string }

    // A request approved before follow-up cards existed: approved, with no card.
    const db = DatabaseManager.getDatabase()
    db.prepare(`UPDATE requests SET status = 'approved' WHERE id = ?`).run(request.id)
    db.prepare(`DELETE FROM wallet_pending_offers WHERE source_id = ?`).run(request.id)
    expect(followUpCards(request.id)).toHaveLength(0)

    expect(await platformRequestService.backfillFollowUpCards()).toBe(1)
    // One card per person who can finish the purchase.
    const routed = followUpCards(request.id).length
    expect(routed).toBeGreaterThan(0)

    expect(await platformRequestService.backfillFollowUpCards()).toBe(0)
    expect(followUpCards(request.id)).toHaveLength(routed)
  })
})
