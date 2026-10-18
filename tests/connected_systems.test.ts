/**
 * Connected systems: an organisation's own software sends its own record types to people's
 * wallets with scoped, idempotent clients.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { createHash, randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import {
  authenticateConnectedSystem,
  CONNECTED_RECORD_SOURCE,
  ConnectedRecordService,
} from '../src/services/connected/ConnectedRecordService'
import {
  credentialTypeForLabel,
  jsonSchemaForRecord,
  normaliseRecordFields,
  OrgRecordTypeService,
} from '../src/services/connected/OrgRecordTypeService'
import {
  canSignIn,
  normalisePolicy,
  PartnerClientService,
  storedPolicy,
  type PartnerClientRecord,
} from '../src/services/partner/PartnerClientService'
import { parseCsv, RecordFileImportService } from '../src/services/connected/RecordFileImport'
import { credentialDefinitionStore } from '../src/utils/credentialDefinitionStore'
import { schemaStore } from '../src/utils/schemaStore'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
let orgTenantId: string
let organizationId: string
let ownerId: string
let memberWallet: string
let outsiderWallet: string

const MEMBER_PHONE = '0771234567'
const OUTSIDER_PHONE = '0779876543'

const hydraCalls: string[] = []
const hydra = {
  createClient: async () => void hydraCalls.push('create'),
  patchClient: async () => void hydraCalls.push('patch'),
  deleteClient: async () => void hydraCalls.push('delete'),
} as any
const clients = new PartnerClientService(hydra)

const types = new OrgRecordTypeService(async (tenantId, credentialType, version, jsonSchema) => {
  const registered = schemaStore.register({ name: credentialType, version: `${version}.0.0`, jsonSchema, tenantId })
  if ('error' in registered) throw new Error(registered.error)
  return registered.schemaId
})

const sent: any[] = []
let failNextSend = false
const send = async (input: any) => {
  if (failNextSend) {
    failNextSend = false
    throw new Error('issuer unavailable')
  }
  sent.push(input)
  const rowId = randomUUID()
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO wallet_pending_offers (id, tenant_id, source_type, source_id, offer_uri, credential_type, title, body, metadata, created_at)
       VALUES (?, ?, ?, ?, 'openid-credential-offer://x', ?, ?, ?, '{}', ?)`,
    )
    .run(
      rowId,
      input.walletTenantId,
      input.sourceType,
      input.sourceId,
      input.credentialType,
      input.title,
      input.body,
      new Date().toISOString(),
    )
  return { rowId, offerId: `offer-${rowId}` }
}
const records = new ConnectedRecordService(types, send as any)

function registerWallet(phone: string): string {
  const userId = `user-${randomUUID()}`
  const tenantId = `wallet-${userId}`
  const now = new Date().toISOString()
  const normalized = phone.replace(/\D/g, '').replace(/^0/, '263')
  DatabaseManager.getDatabase()
    .prepare(`INSERT INTO ssi_users (id, tenant_id, did, phone_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, tenantId, `did:key:${userId}`, createHash('sha256').update(normalized).digest('hex'), now, now)
  return tenantId
}

async function sender(recipientScope = 'org_members'): Promise<PartnerClientRecord> {
  const created = await clients.create(orgTenantId, ownerId, {
    name: `Records ${randomUUID().slice(0, 6)}`,
    operations: ['send_records'],
    recipientScope,
  })
  return authenticateConnectedSystem(
    `Basic ${Buffer.from(`${created.clientId}:${created.clientSecret}`).toString('base64')}`,
  )!
}

const certificate = {
  label: 'Training certificate',
  description: 'Completed course',
  fields: [
    { key: 'course', label: 'Course', type: 'text' as const },
    { key: 'completedOn', label: 'Completed on', type: 'date' as const },
    { key: 'score', label: 'Score', type: 'number' as const, required: false },
  ],
}

beforeAll(async () => {
  databases = initTestDatabases('credo-connected-')
  const org = seedOrganization({ name: 'Skills Academy' })
  orgTenantId = org.orgTenantId
  organizationId = org.organizationId
  ownerId = org.ownerUserId
  memberWallet = registerWallet(MEMBER_PHONE)
  const memberUserId = (
    DatabaseManager.getDatabase().prepare('SELECT id FROM ssi_users WHERE tenant_id = ?').get(memberWallet) as any
  ).id
  addMember({ orgTenantId, organizationId, userId: memberUserId, role: 'member' })
  outsiderWallet = registerWallet(OUTSIDER_PHONE)
  await types.create(orgTenantId, ownerId, certificate)
})

afterAll(() => databases.cleanup())

describe('organisation record types', () => {
  test('names become record credential types and platform meanings are refused', async () => {
    expect(credentialTypeForLabel('training certificate')).toBe('TrainingCertificateRecord')
    expect(credentialTypeForLabel('Attendance Record')).toBe('AttendanceRecord')
    await expect(
      types.create(orgTenantId, ownerId, { ...certificate, label: 'Payment receipt' }),
    ).rejects.toMatchObject({
      status: 400,
    })
    await expect(types.create(orgTenantId, ownerId, { ...certificate, label: 'Staff identity' })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
  })

  test('fields are checked', () => {
    expect(() => normaliseRecordFields([])).toThrow()
    expect(() => normaliseRecordFields([{ key: 'Course', label: 'Course' }])).toThrow()
    expect(() => normaliseRecordFields([{ key: 'id', label: 'Id' }])).toThrow()
    expect(() =>
      normaliseRecordFields([
        { key: 'a', label: 'A' },
        { key: 'a', label: 'B' },
      ]),
    ).toThrow()
    expect(() => normaliseRecordFields([{ key: 'a', label: 'A', type: 'file' as any }])).toThrow()
    expect(normaliseRecordFields([{ key: 'a', label: 'A' }])).toEqual([
      { key: 'a', label: 'A', type: 'text', required: true },
    ])
  })

  test('schemas are scoped to the organisation', () => {
    const fields = normaliseRecordFields(certificate.fields)
    expect(jsonSchemaForRecord('org-a', 'XRecord', 1, fields).$id).not.toBe(
      jsonSchemaForRecord('org-b', 'XRecord', 1, fields).$id,
    )
  })

  test('claims are validated against the active version', () => {
    expect(
      types.validateClaims(orgTenantId, 'TrainingCertificateRecord', { course: 'Safety', completedOn: '2025-03-01' })
        .version,
    ).toBe(1)
    expect(() => types.validateClaims(orgTenantId, 'TrainingCertificateRecord', { course: 'Safety' })).toThrow()
    expect(() =>
      types.validateClaims(orgTenantId, 'TrainingCertificateRecord', { course: 'Safety', completedOn: '1 March' }),
    ).toThrow()
    expect(() =>
      types.validateClaims(orgTenantId, 'TrainingCertificateRecord', {
        course: 'Safety',
        completedOn: '2025-03-01',
        extra: 'no',
      }),
    ).toThrow()
    expect(() => types.validateClaims(orgTenantId, 'UnknownRecord', {})).toThrow()
  })

  test('editing publishes a new version; retiring stops sends; recreating continues the versions', async () => {
    await types.create(orgTenantId, ownerId, { label: 'Site visit', fields: [{ key: 'site', label: 'Site' }] })
    await expect(
      types.create(orgTenantId, ownerId, { label: 'Site visit', fields: [{ key: 'site', label: 'Site' }] }),
    ).rejects.toMatchObject({
      status: 409,
    })
    const v2 = await types.update(orgTenantId, ownerId, 'SiteVisitRecord', {
      fields: [
        { key: 'site', label: 'Site' },
        { key: 'visitedOn', label: 'Visited on', type: 'date' },
      ],
    })
    expect(v2.version).toBe(2)
    expect(types.list(orgTenantId).filter((t) => t.credentialType === 'SiteVisitRecord')).toHaveLength(1)
    expect(() => types.validateClaims(orgTenantId, 'SiteVisitRecord', { site: 'Harare' })).toThrow()

    types.retire(orgTenantId, 'SiteVisitRecord')
    expect(types.list(orgTenantId).some((t) => t.credentialType === 'SiteVisitRecord')).toBe(false)
    expect(types.list(orgTenantId, true).find((t) => t.credentialType === 'SiteVisitRecord')?.status).toBe('retired')
    expect(() => types.validateClaims(orgTenantId, 'SiteVisitRecord', { site: 'Harare' })).toThrow()

    const v3 = await types.create(orgTenantId, ownerId, {
      label: 'Site visit',
      fields: [{ key: 'site', label: 'Site' }],
    })
    expect(v3.version).toBe(3)
  })
})

describe('connected-system clients', () => {
  test('existing clients sign people in; send-only clients need no redirect and skip Hydra', async () => {
    expect(storedPolicy(JSON.stringify({ releaseClaims: ['displayName'] }))).toMatchObject({
      operations: ['sign_in'],
      recipientScope: 'org_members',
    })
    expect(() => normalisePolicy({ operations: ['delete_everything'] })).toThrow()
    expect(() => normalisePolicy({ recipientScope: 'everyone' })).toThrow()

    hydraCalls.length = 0
    const client = await sender()
    expect(canSignIn(client)).toBe(false)
    expect(client.redirectUris).toEqual([])
    expect(hydraCalls).toEqual([])
    await expect(
      clients.update(orgTenantId, client.clientId, { operations: ['sign_in', 'send_records'] }),
    ).rejects.toMatchObject({
      status: 409,
    })
  })

  test('sign-in clients still need redirect URIs and cannot send records', async () => {
    await expect(
      clients.create(orgTenantId, ownerId, { name: 'Portal', operations: ['sign_in'] }),
    ).rejects.toMatchObject({
      status: 400,
    })
    const created = await clients.create(orgTenantId, ownerId, {
      name: 'Portal',
      redirectUris: ['https://portal.example.com/callback'],
    })
    const client = authenticateConnectedSystem(
      `Basic ${Buffer.from(`${created.clientId}:${created.clientSecret}`).toString('base64')}`,
    )!
    expect(canSignIn(client)).toBe(true)
    expect(() => records.recordTypes(client)).toThrow(expect.objectContaining({ status: 403 }))
  })

  test('wrong secrets do not authenticate', async () => {
    const created = await clients.create(orgTenantId, ownerId, { name: 'Bad', operations: ['send_records'] })
    expect(
      authenticateConnectedSystem(`Basic ${Buffer.from(`${created.clientId}:wrong`).toString('base64')}`),
    ).toBeUndefined()
    expect(authenticateConnectedSystem(`Bearer ${created.clientSecret}`)).toBeUndefined()
  })
})

describe('sending records', () => {
  const body = {
    credentialType: 'TrainingCertificateRecord',
    recipient: { phone: MEMBER_PHONE },
    claims: { course: 'First aid', completedOn: '2025-04-02', score: 91 },
    externalReference: 'CERT-001',
  }

  test('a send offers the record once, and the same key replays it', async () => {
    const client = await sender()
    expect(records.recordTypes(client).map((t) => t.credentialType)).toContain('TrainingCertificateRecord')
    const first = await records.submit(client, 'cert-001-key', body)
    expect(first.replayed).toBe(false)
    expect(first.record).toMatchObject({ status: 'pending', recordTypeVersion: 1, externalReference: 'CERT-001' })
    expect(JSON.stringify(first.record)).not.toContain(memberWallet)
    expect(sent.at(-1)).toMatchObject({
      orgTenantId,
      walletTenantId: memberWallet,
      sourceType: CONNECTED_RECORD_SOURCE,
    })

    const before = sent.length
    const again = await records.submit(client, 'cert-001-key', {
      ...body,
      claims: { score: 91, completedOn: '2025-04-02', course: 'First aid' },
    })
    expect(again).toMatchObject({ replayed: true, record: { id: first.record.id } })
    expect(sent.length).toBe(before)

    await expect(
      records.submit(client, 'cert-001-key', { ...body, claims: { ...body.claims, score: 50 } }),
    ).rejects.toMatchObject({
      status: 409,
    })
  })

  test('status follows the wallet offer', async () => {
    const client = await sender()
    const { record } = await records.submit(client, 'cert-accept-key', body)
    const offerRowId = (
      DatabaseManager.getDatabase()
        .prepare('SELECT offer_row_id FROM integration_record_requests WHERE id = ?')
        .get(record.id) as any
    ).offer_row_id
    DatabaseManager.getDatabase()
      .prepare('UPDATE wallet_pending_offers SET accepted_at = ?, resolved_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), offerRowId)
    expect(records.get(client, record.id).status).toBe('accepted')
  })

  test('keys are scoped to the client and records are hidden from other clients', async () => {
    const a = await sender()
    const b = await sender()
    const fromA = await records.submit(a, 'shared-key-01', body)
    const fromB = await records.submit(b, 'shared-key-01', { ...body, claims: { ...body.claims, score: 10 } })
    expect(fromB.record.id).not.toBe(fromA.record.id)
    expect(() => records.get(b, fromA.record.id)).toThrow(expect.objectContaining({ status: 404 }))
  })

  test('a failed send is retried with the same key without duplicating the record', async () => {
    const client = await sender()
    failNextSend = true
    const failed = await records.submit(client, 'cert-retry-key', body)
    expect(failed.record.status).toBe('failed')
    expect(failed.record.error).toContain('Retry')
    const retried = await records.submit(client, 'cert-retry-key', body)
    expect(retried.record).toMatchObject({ id: failed.record.id, status: 'pending' })
  })

  test('a crashed send adopts the offer it already made', async () => {
    const client = await sender()
    const { record } = await records.submit(client, 'cert-crash-key', body)
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `UPDATE integration_record_requests SET status = 'processing', offer_row_id = NULL, updated_at = ? WHERE id = ?`,
    ).run(new Date(Date.now() - 10 * 60 * 1000).toISOString(), record.id)
    const before = sent.length
    const resumed = await records.submit(client, 'cert-crash-key', body)
    expect(resumed.record).toMatchObject({ id: record.id, status: 'pending' })
    expect(sent.length).toBe(before)
    const offers = db
      .prepare('SELECT COUNT(*) AS n FROM wallet_pending_offers WHERE source_type = ? AND source_id = ?')
      .get(CONNECTED_RECORD_SOURCE, `connected:${record.id}`) as { n: number }
    expect(offers.n).toBe(1)
  })

  test('recipients follow the client scope', async () => {
    const membersOnly = await sender()
    await expect(
      records.submit(membersOnly, 'cert-outsider-1', { ...body, recipient: { phone: OUTSIDER_PHONE } }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      records.submit(membersOnly, 'cert-nobody-01', { ...body, recipient: { phone: '0770000001' } }),
    ).rejects.toMatchObject({ status: 422 })

    const anyone = await sender('any_registered')
    const outsider = await records.submit(anyone, 'cert-outsider-2', { ...body, recipient: { phone: OUTSIDER_PHONE } })
    expect(outsider.record.status).toBe('pending')
    expect(sent.at(-1).walletTenantId).toBe(outsiderWallet)
  })

  test('bad input is refused before anything is stored', async () => {
    const client = await sender()
    await expect(records.submit(client, 'short', body)).rejects.toMatchObject({ status: 400 })
    await expect(records.submit(client, 'cert-bad-claims', { ...body, claims: { course: 'x' } })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
    expect(
      DatabaseManager.getDatabase()
        .prepare('SELECT COUNT(*) AS n FROM integration_record_requests WHERE idempotency_key = ?')
        .get('cert-bad-claims'),
    ).toEqual({ n: 0 })
  })

  test('administrators see recent sends with the client name', async () => {
    const activity = records.activity(orgTenantId, 5)
    expect(activity.length).toBeGreaterThan(0)
    expect(activity[0].clientName).toMatch(/^Records /)
    expect(activity.find((r) => r.credentialType === 'TrainingCertificateRecord')?.label).toBe('Training certificate')
    expect(JSON.stringify(activity)).not.toContain(memberWallet)
  })
})

describe('signing definitions', () => {
  test('a type name shared by two organisations resolves to the issuing organisation', () => {
    const db = DatabaseManager.getDatabase()
    const insert = db.prepare(
      `INSERT INTO credential_definitions (id, tenant_id, credential_definition_id, schema_id, definition_data, issuer_did, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const definition = JSON.stringify({
      name: 'SharedNameRecord',
      credentialType: ['VerifiableCredential', 'SharedNameRecord'],
    })
    const mine = `org-a-${randomUUID()}`
    const theirs = `org-b-${randomUUID()}`
    insert.run(randomUUID(), mine, randomUUID(), 's-a', definition, 'did:key:org-a', '2025-01-01 00:00:00')
    insert.run(randomUUID(), theirs, randomUUID(), 's-b', definition, 'did:key:org-b', '2025-06-01 00:00:00')

    expect(credentialDefinitionStore.get('SharedNameRecord_jwt_vc_json', mine)?.issuerDid).toBe('did:key:org-a')
    expect(credentialDefinitionStore.get('SharedNameRecord_jwt_vc_json', theirs)?.issuerDid).toBe('did:key:org-b')
  })
})

describe('records from an uploaded file', () => {
  const files = () => new RecordFileImportService(types, records)

  test('CSV parsing handles quotes, commas, CRLF and semicolon exports', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  test('columns map by label or key, values convert, and bad rows are explained', () => {
    const csv = [
      'Mobile,Course,Completed on,Score,Reference,Class',
      `${MEMBER_PHONE},First aid,15/06/2025,"1,000",F-001,4B`,
      `${OUTSIDER_PHONE},Fire safety,2025-06-16,80,F-002,4B`,
      `${MEMBER_PHONE},,2025-06-17,70,F-003,4B`,
      `${MEMBER_PHONE},Rescue,2025-06-18,75,F-001,4B`,
    ].join('\n')
    const preview = files().preview(orgTenantId, 'TrainingCertificateRecord', { content: csv })
    expect(preview.columns).toMatchObject({
      Mobile: 'phone',
      Course: 'course',
      'Completed on': 'completedOn',
      Reference: 'reference',
    })
    expect(preview.ignoredColumns).toEqual(['Class'])
    expect(preview.rows[0]).toMatchObject({
      row: 2,
      error: null,
      claims: { course: 'First aid', completedOn: '2025-06-15', score: 1000 },
    })
    expect(preview.rows[1].error).toMatch(/not belong to an active member/)
    expect(preview.rows[2].error).toMatch(/course/)
    expect(preview.rows[3].error).toBe('Same reference as row 2')
    expect(preview).toMatchObject({ ready: 1, failed: 3 })
  })

  test('sending a file goes through connected records once, and a second upload sends nothing new', async () => {
    const csv = `phone,course,completedOn,reference\n${MEMBER_PHONE},Forklift,2025-07-01,FL-1\n${MEMBER_PHONE},Crane,2025-07-02,FL-2`
    const before = sent.length
    const first = await files().send(orgTenantId, 'TrainingCertificateRecord', { content: csv })
    expect(first).toMatchObject({ sent: 2, alreadySent: 0, failed: 0 })
    expect(sent.length).toBe(before + 2)
    expect(sent.at(-1)).toMatchObject({ sourceType: CONNECTED_RECORD_SOURCE, walletTenantId: memberWallet })

    const again = await files().send(orgTenantId, 'TrainingCertificateRecord', { content: csv })
    expect(again).toMatchObject({ sent: 0, alreadySent: 2, failed: 0 })
    expect(sent.length).toBe(before + 2)

    const changed = await files().send(orgTenantId, 'TrainingCertificateRecord', {
      content: `phone,course,completedOn,reference\n${MEMBER_PHONE},Forklift advanced,2025-07-01,FL-1`,
    })
    expect(changed.rows[0]).toMatchObject({
      status: 'failed',
      error: 'This reference was already sent with different details',
    })

    const activity = records.activity(orgTenantId, 10)
    expect(activity.find((row) => row.externalReference === 'FL-2')).toMatchObject({
      clientName: 'File upload',
      label: 'Training certificate',
    })
  })

  test('a JSON list works too, and anyone registered can receive when the uploader allows it', async () => {
    const content = JSON.stringify([
      { phone: OUTSIDER_PHONE, course: 'Induction', completedOn: '2025-08-01', reference: 'J-1' },
    ])
    expect(files().preview(orgTenantId, 'TrainingCertificateRecord', { content }).rows[0].error).toMatch(
      /active member/,
    )
    const result = await files().send(orgTenantId, 'TrainingCertificateRecord', {
      content,
      recipientScope: 'any_registered',
    })
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(result.rows[0].row).toBe(1)
  })

  test('unknown types and empty or oversized files are refused', () => {
    expect(() => files().preview(orgTenantId, 'NoSuchRecord', { content: 'phone\n1' })).toThrow(/not set up/)
    expect(() => files().preview(orgTenantId, 'TrainingCertificateRecord', { content: '' })).toThrow(/empty/)
    const big = 'phone,course,completedOn\n' + `${MEMBER_PHONE},x,2025-01-01\n`.repeat(501)
    expect(() => files().preview(orgTenantId, 'TrainingCertificateRecord', { content: big })).toThrow(/at most 500/)
  })
})
