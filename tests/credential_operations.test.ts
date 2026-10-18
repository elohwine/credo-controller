import 'reflect-metadata'
import type { Agent } from '@credo-ts/core'
import type { Request } from 'express'

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'
import { container } from 'tsyringe'

import { CredentialOperationsController } from '../src/controllers/organizations/CredentialOperationsController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { OrganizationService } from '../src/services/OrganizationService'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { credentialDefinitionStore } from '../src/utils/credentialDefinitionStore'
import { schemaStore } from '../src/utils/schemaStore'
import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('credo-credential-ops-')
  // Catalogue reads do not use the agent; no live issuer is bootstrapped by these tests.
  container.registerInstance(OrganizationService, new OrganizationService({} as Agent))
})
afterAll(() => databases.cleanup())

const requestFor = (tenantId: string, userId: string): Request =>
  ({ user: { tenantId, id: userId } }) as Request & { user: { tenantId: string; id: string } }

describe('organization credential operations', () => {
  test('questionnaire-scoped field catalogue does not inherit health models or enable direct workflow records', async () => {
    const org = seedOrganization({ setup: 'new' })
    const profile = orgSetupProfileService.get(org.orgTenantId)
    orgSetupProfileService.save(org.orgTenantId, {
      kinds: ['field'],
      modules: ['field_jobs'],
      operatingModel: 'internal',
      expectedRevision: profile.access.revision,
    })
    const schema = schemaStore.register({
      name: 'MdocHealthSummary',
      version: '1',
      tenantId: org.orgTenantId,
      jsonSchema: { type: 'object', properties: { credentialSubject: { type: 'object' } } },
    })
    if ('error' in schema) throw new Error(schema.error)
    const definition = credentialDefinitionStore.register({
      name: 'MdocHealthSummary',
      version: '1',
      tenantId: org.orgTenantId,
      schemaId: schema.schemaId,
      issuerDid: 'did:key:health-test',
      credentialType: ['VerifiableCredential', 'MdocHealthSummary'],
    })
    if ('error' in definition) throw new Error(definition.error)
    const controller = new CredentialOperationsController()
    const request = requestFor(org.orgTenantId, org.ownerUserId)
    const result = await controller.getCatalogue(request)
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.some((item) => /health|ehr|cart|contract/i.test(item.credentialType))).toBe(false)
    expect(result.items.find((item) => item.credentialType === 'JobAssignmentVC')?.directIssue).toBe(false)
    expect((await controller.listDirectTypes(request)).credentialTypes).toEqual([])
    await expect(
      controller.createDirectOffer(request, {
        credentialType: 'MdocHealthSummary',
        claims: {},
        walletTenantId: 'not-used',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  test('unanswered setup exposes no credential catalogue', async () => {
    const org = seedOrganization({ setup: 'new' })
    expect(
      await new CredentialOperationsController().getCatalogue(requestFor(org.orgTenantId, org.ownerUserId)),
    ).toEqual({ items: [] })
  })

  test('offer link is issuer-scoped, read-only, non-cacheable and available only while pending', async () => {
    const issuer = seedOrganization()
    const other = seedOrganization()
    const id = randomUUID()
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `INSERT INTO wallet_pending_offers
      (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri, metadata, created_at)
      VALUES (?, ?, ?, 'manual_direct_offer', ?, 'TrainingBadge', ?, ?, ?)`,
    ).run(
      id,
      `wallet-${issuer.ownerUserId}`,
      issuer.orgTenantId,
      id,
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fexample.invalid%2Foffer',
      JSON.stringify({ offerExpiresAt: '2099-01-01T00:00:00Z' }),
      new Date().toISOString(),
    )
    const controller = new CredentialOperationsController()
    const request = requestFor(issuer.orgTenantId, issuer.ownerUserId)
    const result = await controller.getOfferLink(request, id)
    expect(result).toMatchObject({ rowId: id, credentialType: 'TrainingBadge' })
    expect(result.offerUri).toMatch(/^openid-credential-offer:/)
    expect(controller.getHeaders()['Cache-Control']).toBe('no-store')
    expect(db.prepare('SELECT accepted_at, resolved_at FROM wallet_pending_offers WHERE id = ?').get(id)).toEqual({
      accepted_at: null,
      resolved_at: null,
    })
    await expect(controller.getOfferLink(requestFor(other.orgTenantId, other.ownerUserId), id)).rejects.toMatchObject({
      status: 404,
    })
    db.prepare(`UPDATE wallet_pending_offers SET metadata = ? WHERE id = ?`).run(
      JSON.stringify({ offerExpiresAt: '2000-01-01T00:00:00Z' }),
      id,
    )
    await expect(controller.getOfferLink(request, id)).rejects.toMatchObject({ status: 409 })
    db.prepare(`UPDATE wallet_pending_offers SET accepted_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
    await expect(controller.getOfferLink(request, id)).rejects.toMatchObject({ status: 409 })
  })

  test('unknown callers cannot retrieve offer links', async () => {
    const org = seedOrganization()
    await expect(
      new CredentialOperationsController().getOfferLink(requestFor(org.orgTenantId, 'not-a-member'), 'missing'),
    ).rejects.toMatchObject({ status: 403 })
  })
})
