import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { requestKindsFor as mobileKinds } from '../credo-ui/mobile/lib/requestCatalog'
import { requestKindsFor as portalKinds } from '../credo-ui/portal/lib/requestCatalog'
import { getWorkflowCapabilityFlags } from '../credo-ui/shared/workflowCapabilities'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('member-request-entry-')
})
afterAll(() => {
  databases.cleanup()
})

function organization(modules: string[]) {
  const org = seedOrganization()
  orgSetupProfileService.save(org.orgTenantId, {
    operatingModel: 'internal',
    kinds: ['office'],
    modules,
    expectedRevision: 0,
  })
  return org
}

describe('contextual request entry on both clients', () => {
  test('an explicit server-safe capability snapshot does not read persisted client answers', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    let storageReads = 0
    const stored = new Map([
      ['credoActiveOrg', JSON.stringify({ orgTenantId: 'selected-org' })],
      [
        'credoOrgProfile',
        JSON.stringify({
          orgTenantId: 'selected-org',
          kinds: ['field'],
          access: { mode: 'explicit', modules: [{ id: 'purchases', available: true }] },
        }),
      ],
    ])
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => {
            storageReads += 1
            return stored.get(key) ?? null
          },
        },
      },
    })
    try {
      expect(getWorkflowCapabilityFlags([], null).internalRequisitions).toBe(false)
      expect(storageReads).toBe(0)
      expect(getWorkflowCapabilityFlags([]).internalRequisitions).toBe(true)
      expect(storageReads).toBeGreaterThan(0)
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
      else Reflect.deleteProperty(globalThis, 'window')
    }
  })

  test('an active member can discover and raise an item request only where purchases are selected', () => {
    const org = organization(['purchases'])
    const person = 'member-requester'
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: person, role: 'member' })
    const options = platformRequestService.optionsForSubject(person)
    expect(options.memberships[0].kinds).toContain('procurement.requisition')
    for (const kinds of [mobileKinds, portalKinds]) {
      expect(kinds(options, { contextMode: 'personal' })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'procurement.requisition',
            orgTenantId: org.orgTenantId,
            label: 'Request an item',
          }),
          expect.objectContaining({ id: 'business.service', routeKey: 'discover' }),
        ]),
      )
    }
    const raised = platformRequestService.raiseForSubject({
      orgTenantId: org.orgTenantId,
      subjectRef: person,
      requestType: 'procurement.requisition',
      title: 'Protective boots',
      description: 'One pair for site work',
      amount: 35,
      currency: 'USD',
    })
    expect(raised).toMatchObject({ status: 'submitted' })
    expect(platformRequestService.listMine(person)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Protective boots', request_type: 'procurement.requisition' }),
      ]),
    )
  })

  test('a disabled purchase option is hidden and cannot be raised by bypassing the menu', () => {
    const org = organization([])
    const options = platformRequestService.optionsForSubject(org.ownerUserId)
    expect(options.memberships[0].kinds).not.toContain('procurement.requisition')
    expect(() =>
      platformRequestService.raiseForSubject({
        orgTenantId: org.orgTenantId,
        subjectRef: org.ownerUserId,
        requestType: 'procurement.requisition',
        title: 'Boots',
        amount: 20,
        currency: 'USD',
      }),
    ).toThrow(/setup answers|unavailable/i)
  })

  test('invalid item amounts are explicit client errors', () => {
    const org = organization(['purchases'])
    for (const amount of [0, -1, Number.NaN]) {
      expect(() =>
        platformRequestService.raiseForSubject({
          orgTenantId: org.orgTenantId,
          subjectRef: org.ownerUserId,
          requestType: 'procurement.requisition',
          title: 'Boots',
          amount,
          currency: 'USD',
        }),
      ).toThrow(/positive estimated amount/)
    }
  })

  test('organisation operations are not invented when no workflow applicability is available', () => {
    for (const kinds of [mobileKinds, portalKinds]) {
      expect(kinds(null, { contextMode: 'org', activeWorkflowTypes: [] })).toEqual([])
      expect(kinds(null, { contextMode: 'org', activeWorkflowTypes: ['internal_requisitions'] })).toEqual([
        expect.objectContaining({ id: 'org.purchase_request' }),
      ])
    }
  })
})
