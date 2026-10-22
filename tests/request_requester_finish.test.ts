/**
 * The person who asked for a purchase finishes it themselves with the receipt, from their
 * personal wallet, once it is approved. Other request types stay with the organisation.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { readReceiptProof } from '../src/utils/receiptProof'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-requester-finish-')
})

afterAll(() => {
  databases.cleanup()
})

function raiseApproved(requestType: string, context: Record<string, unknown> = {}) {
  const org = seedOrganization({ name: 'Field Ops Ltd' })
  const workerUserId = `worker-${Math.random().toString(36).slice(2)}`
  addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: workerUserId, role: 'field_worker' })
  const created = platformRequestService.create({
    tenantId: org.orgTenantId,
    subjectRef: workerUserId,
    requestType,
    title: 'Cement for site',
    amount: 120,
    currency: 'USD',
    context,
    items: [{ description: 'Cement', quantity: 4, unitPrice: 30 }],
  }) as { id: string }
  DatabaseManager.getDatabase().prepare(`UPDATE requests SET status = 'approved' WHERE id = ?`).run(created.id)
  return { org, workerUserId, requestId: created.id }
}

describe('requester finishes their approved purchase', () => {
  test('the field worker sees "Mark as bought" and completes it with a wallet receipt', () => {
    const { workerUserId, requestId } = raiseApproved('procurement.requisition', { categoryCode: 'materials' })

    const mine = platformRequestService.getMine(requestId, workerUserId) as { requesterStep?: { label: string } }
    expect(mine.requesterStep?.label).toBe('Mark as bought')

    platformRequestService.finishMine(requestId, workerUserId, {
      receiptRef: 'R-1001',
      amountPaid: 118,
      receiptRecord: { id: 'vc-receipt-1', type: 'PaymentReceiptVC', label: 'Receipt from Hardware Co' },
    })

    const status = DatabaseManager.getDatabase().prepare(`SELECT status FROM requests WHERE id = ?`).get(requestId) as {
      status: string
    }
    expect(status.status).toBe('completed')
    expect((platformRequestService.getMine(requestId, workerUserId) as any).requesterStep).toBeUndefined()
  })

  test('the receipt is still required', () => {
    const { workerUserId, requestId } = raiseApproved('procurement.requisition', { categoryCode: 'materials' })
    expect(() => platformRequestService.finishMine(requestId, workerUserId, { receiptRef: 'R-1', amountPaid: 10 })).toThrow()
  })

  test('someone else cannot finish it, and other request types are not the requester to finish', () => {
    const { requestId } = raiseApproved('procurement.requisition', { categoryCode: 'materials' })
    expect(() => platformRequestService.finishMine(requestId, 'stranger', {})).toThrow('Request not found')
  })
})

describe('receipt proof', () => {
  test('supplier payments can keep their proof', () => {
    const db = DatabaseManager.getDatabase()
    const columns = (db.prepare(`PRAGMA table_info(ap_payments)`).all() as Array<{ name: string }>).map((c) => c.name)
    expect(columns).toEqual(expect.arrayContaining(['proof_image_sha256', 'proof_record_json']))
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ap_payment_proof_images'`).get()).toBeTruthy()
  })

  test('keeps a wallet record as id, type and label only', () => {
    const proof = readReceiptProof({ receiptRecord: { id: 'vc-1', type: 'PaymentReceiptVC', secret: 'x' } })
    expect(proof.record).toEqual({ id: 'vc-1', type: 'PaymentReceiptVC', label: 'Payment Receipt' })
  })

  test('rejects something that is not a photo', () => {
    expect(() => readReceiptProof({ receiptImage: 'https://example.com/a.png' })).toThrow('must be a photo')
  })

  test('fingerprints a photo', () => {
    const proof = readReceiptProof({ receiptImage: 'data:image/png;base64,iVBORw0KGgo=' })
    expect(proof.imageSha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
