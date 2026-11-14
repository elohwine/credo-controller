import 'reflect-metadata'

import { jest } from '@jest/globals'

import { organizationRegistryRepository, type OrganizationRegistry } from '../../persistence/OrganizationRegistryRepository'
import { orgOfferingsService } from '../OrgOfferingsService'
import { cleanReach, describeRequest, judgeProvider, readRequest, splitPlace, type MatchCandidate } from '../providerMatch'

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    name: 'ABC Plumbing',
    description: 'Plumbers for homes',
    category: 'supplier',
    trustScore: 4,
    verified: true,
    reach: { serviceAreas: ['Borrowdale'], fulfilment: ['call_out'] },
    paymentRails: ['ecocash'],
    services: [{ id: 'svc-plumb', name: 'Plumbing', description: 'Leaks and geysers', offeringKey: 'custom' }],
    ...overrides,
  }
}

function org(overrides: Partial<OrganizationRegistry> = {}): OrganizationRegistry {
  return {
    id: 'org-1',
    tenantId: 'tenant-1',
    displayName: 'ABC Plumbing',
    description: 'Plumbers for homes',
    category: 'supplier',
    isPublic: true,
    trustScore: 4,
    verificationStatus: 'verified',
    issuerDid: 'did:example:abc',
    country: 'ZW',
    metadata: { reach: { serviceAreas: ['Borrowdale'], fulfilment: ['call_out'] } },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('judgeProvider', () => {
  it('keeps a business that fits and says why', () => {
    const verdict = judgeProvider(candidate(), {
      need: 'a plumber for a leak',
      area: 'Borrowdale',
      payment: 'ecocash',
      fulfilment: 'call_out',
    })
    expect(verdict.eligible).toBe(true)
    expect(verdict.serviceName).toBe('Plumbing')
    expect(verdict.reasons).toEqual(expect.arrayContaining(['Offers Plumbing', 'Works in Borrowdale', 'Comes to you', 'Verified organisation']))
    expect(verdict.unsure).toEqual([])
  })

  it('reads a place out of the sentence and does not treat "in" as the service', () => {
    expect(splitPlace('construction in Harare')).toEqual({ need: 'construction', area: 'Harare' })
    const verdict = judgeProvider(
      candidate({
        name: 'SGK Construction',
        description: 'Trusted organization profile for SGK Construction',
        reach: { serviceAreas: ['Harare'], fulfilment: ['call_out'] },
        services: [{ id: 'bill', name: 'Get a bill and pay it', description: 'We send you a bill you pay in the app.' }],
      }),
      splitPlace('construction in Harare'),
    )
    expect(verdict.eligible).toBe(true)
    expect(verdict.serviceName).toBeUndefined()
    expect(verdict.reasons).toEqual(expect.arrayContaining(['Says they do this', 'Works in Harare']))
  })

  it('leaves out a business whose stated area, payment or fulfilment does not fit', () => {
    expect(judgeProvider(candidate(), { need: 'plumber', area: 'Avondale' }).eligible).toBe(false)
    expect(judgeProvider(candidate(), { need: 'plumber', payment: 'card' }).eligible).toBe(false)
    expect(judgeProvider(candidate(), { need: 'plumber', fulfilment: 'delivery' }).eligible).toBe(false)
  })

  it('keeps a business that has not said, and names the gap', () => {
    const verdict = judgeProvider(
      candidate({ reach: { serviceAreas: [], fulfilment: [] }, paymentRails: [] }),
      { need: 'plumber', area: 'Avondale', payment: 'ecocash', fulfilment: 'call_out' },
    )
    expect(verdict.eligible).toBe(true)
    expect(verdict.unsure).toEqual([
      'Has not said where they work',
      'Has not said how they get paid',
      'Has not said how the work is done',
    ])
  })

  it('treats plumber and plumbing as the same word', () => {
    const verdict = judgeProvider(
      candidate({ description: 'Home repairs', services: [{ id: 'svc-plumb', name: 'Plumbing', offeringKey: 'custom' }] }),
      { need: 'plumber' },
    )
    expect(verdict.eligible).toBe(true)
    expect(verdict.reasons).toContain('Offers Plumbing')
  })

  it('leaves out a business that does not do the thing asked for', () => {
    expect(judgeProvider(candidate(), { need: 'wedding cake' }).eligible).toBe(false)
  })

  it('matches on what the business says about itself when no service is named that way', () => {
    const verdict = judgeProvider(
      candidate({ services: [{ id: 'svc-ask', name: 'Ask for a quote', offeringKey: 'ask_quote' }] }),
      { need: 'plumber' },
    )
    expect(verdict.eligible).toBe(true)
    expect(verdict.reasons).toContain('Says they do this')
    expect(verdict.serviceId).toBeUndefined()
  })

  it('leaves out a business that is not taking new work, however good it is', () => {
    const paused = candidate({
      reach: { serviceAreas: ['Borrowdale'], fulfilment: ['call_out'], acceptingWork: false },
      track: { finished: 40, reviewAverage: 5, reviewCount: 20 },
    })
    expect(judgeProvider(paused, { need: 'plumber' }).eligible).toBe(false)
    expect(cleanReach({ serviceAreas: ['Borrowdale'], acceptingWork: false }).acceptingWork).toBe(false)
    expect(cleanReach({ serviceAreas: ['Borrowdale'], acceptingWork: true })).not.toHaveProperty('acceptingWork')
  })

  it('ranks finished work and good ratings higher, but they never let a misfit in', () => {
    const fresh = judgeProvider(candidate(), { need: 'plumber', area: 'Borrowdale' })
    const proven = judgeProvider(
      candidate({ track: { finished: 3, reviewAverage: 4.5, reviewCount: 2 } }),
      { need: 'plumber', area: 'Borrowdale' },
    )
    expect(proven.score).toBeGreaterThan(fresh.score)
    expect(proven.reasons).toContain('3 paid or finished jobs on Credentis')
    const poorlyRated = judgeProvider(
      candidate({ track: { finished: 0, reviewAverage: 1, reviewCount: 5 } }),
      { need: 'plumber', area: 'Borrowdale' },
    )
    expect(poorlyRated.score).toBeLessThan(fresh.score)
    const farButProven = judgeProvider(
      candidate({ track: { finished: 50, reviewAverage: 5, reviewCount: 50 } }),
      { need: 'plumber', area: 'Avondale' },
    )
    expect(farButProven.eligible).toBe(false)
  })

  it('reads the trade, place, payment, delivery, day and quantity out of one sentence', () => {
    const asked = readRequest('I need 20 bags of cement delivered to Borrowdale tomorrow. I can pay using EcoCash.')
    expect(asked).toMatchObject({
      need: 'cement',
      area: 'Borrowdale',
      payment: 'ecocash',
      fulfilment: 'delivery',
      when: 'tomorrow',
      quantity: '20 bags',
    })
    expect(describeRequest(asked)).toBe('cement · 20 bags · Borrowdale · Delivers · tomorrow · EcoCash')
    expect(readRequest('plumber in Mount Pleasant')).toEqual({ need: 'plumber', area: 'Mount Pleasant' })
    expect(readRequest('construction in Harare')).toEqual({ need: 'construction', area: 'Harare' })
    expect(readRequest('a geyser fixed')).toEqual({ need: 'a geyser fixed' })
  })

  it('drops blank and repeated areas', () => {
    expect(cleanReach({ serviceAreas: [' Borrowdale ', 'borrowdale', 'a', ''], hours: '  Mon to Fri  ', fulfilment: ['call_out', 'nope'] })).toEqual({
      serviceAreas: ['Borrowdale'],
      hours: 'Mon to Fri',
      fulfilment: ['call_out'],
    })
  })
})

describe('orgOfferingsService.match', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('ranks a matching trade above a suspended or out-of-area business', () => {
    const plumbing = org()
    const far = org({
      id: 'org-2',
      tenantId: 'tenant-2',
      displayName: 'Far Pipes',
      metadata: { reach: { serviceAreas: ['Avondale'], fulfilment: ['call_out'] } },
    })
    const suspended = org({
      id: 'org-3',
      tenantId: 'tenant-3',
      displayName: 'Closed Plumbing',
      verificationStatus: 'suspended',
    })
    jest.spyOn(organizationRegistryRepository, 'listPublicOrganizations').mockReturnValue([far, suspended, plumbing])
    jest.spyOn(orgOfferingsService, 'publishedServices').mockReturnValue([
      {
        id: 'svc-plumb',
        kind: 'service',
        name: 'Plumbing',
        description: 'Leak repairs',
        requestType: 'service',
        youGet: [],
        requirements: [],
        feeAmount: 0,
        feeCurrency: 'USD',
        requestSchema: {},
      },
    ])

    const matches = orgOfferingsService.match({ need: 'plumber leak', area: 'Borrowdale' })

    expect(matches.map((match) => match.name)).toEqual(['ABC Plumbing'])
    expect(matches[0].reasons).toEqual(expect.arrayContaining(['Offers Plumbing', 'Works in Borrowdale']))
    expect(matches[0].quoteServiceId).toBeUndefined()
  })
})
