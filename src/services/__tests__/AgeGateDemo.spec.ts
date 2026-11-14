import 'reflect-metadata'

import { ageGateDecision, ageGateQuery, siteMemberRef } from '../AgeGateDemoService'
import { shareReviewRows } from '../ssi/stageProofQuery'

describe('demonstration age check', () => {
  it('asks only whether the person is 18 or over', () => {
    const query = ageGateQuery()
    const credential = query.credentials[0] as { claims: Array<{ path: string[] }> }
    expect(credential.claims.map((claim) => claim.path.join('.'))).toEqual(['over18'])
  })

  it('admits a share of that one fact and refuses a share that includes the rest', () => {
    expect(ageGateDecision({ over18: 'Yes' })).toEqual({ admitted: true, leaked: [] })
    expect(ageGateDecision({ over18: 'Yes', dateOfBirth: '1990-03-15' }).admitted).toBe(false)
    expect(ageGateDecision({ over18: 'Yes', phone: '263770009901' }).leaked).toEqual(['phone'])
    expect(ageGateDecision({}).admitted).toBe(false)
  })

  it('names the shared fact and keeps the private details on the withheld side', () => {
    const rows = shareReviewRows({
      selective: true,
      disclosed: { over18: 'Yes' },
      withheld: { displayName: 'Tatenda Moyo', dateOfBirth: '1990-03-15', phone: '263770009901' },
    })
    expect(rows.basis).toBe('age_over')
    expect(rows.shared).toEqual([{ label: '18 or over', value: 'Yes' }])
    expect(rows.withheld.map((row) => row.label)).toEqual(['Full name', 'Date of birth', 'Phone'])
  })

  it('words the rest of the identity card plainly, with no codes or raw timestamps', () => {
    const rows = shareReviewRows({
      selective: true,
      disclosed: { over18: 'Yes' },
      withheld: {
        verificationLevel: 'phone_verified',
        identityVerification: 'self_attested',
        registeredAt: '2026-11-04T17:12:40.667Z',
      },
    })
    expect(rows.withheld).toEqual([
      { label: 'Checked', value: 'Phone number' },
      { label: 'Date of birth from', value: 'Entered by you' },
      { label: 'Member since', value: '4 Nov 2026' },
    ])
  })

  it('gives the same wallet the same member reference on one site and a different one elsewhere', () => {
    const holder = 'did:key:z6MkexampleHolder'
    const ref = siteMemberRef(holder)
    expect(ref).toMatch(/^[0-9A-F]{12}$/)
    expect(siteMemberRef(holder)).toBe(ref)
    expect(siteMemberRef(holder, 'another-site')).not.toBe(ref)
    expect(ref).not.toContain('z6Mk')
    expect(siteMemberRef(undefined)).toBeUndefined()
  })
})
