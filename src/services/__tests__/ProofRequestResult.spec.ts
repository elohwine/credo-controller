import { describe, expect, it } from '@jest/globals'

import { describeProofShare } from '../ProofRequestResult'

const receipt = {
  types: ['VerifiableCredential', 'SchoolFeeReceiptVC'],
  subject: {
    amount: 650,
    currency: 'USD',
    term: 'Term 3',
    schoolName: 'Springfield High',
    studentName: 'Tatenda Moyo',
  },
  id: 'urn:uuid:receipt-1',
}

describe('describeProofShare', () => {
  it('stays pending until the wallet answers', () => {
    expect(describeProofShare({ sessionState: 'RequestUriRetrieved' })).toEqual({
      status: 'pending',
      summary: 'Waiting for them to share.',
    })
  })

  it('says what was shared and that it is still valid', () => {
    const view = describeProofShare({
      sessionState: 'ResponseVerified',
      cards: [receipt],
      standing: { status: 'valid', issuerName: 'Springfield High' },
    })
    expect(view.status).toBe('shared')
    expect(view.summary).toBe('Shared: School Fee Receipt from Springfield High. Paid $650, Term 3. Still valid.')
    expect(view.rows).toEqual(
      expect.arrayContaining([
        { label: 'Amount', value: '$650' },
        { label: 'Student', value: 'Tatenda Moyo' },
      ]),
    )
  })

  it('says the record is no longer valid after it is withdrawn', () => {
    const view = describeProofShare({
      sessionState: 'ResponseVerified',
      cards: [receipt],
      standing: { status: 'revoked', issuerName: 'Springfield High' },
    })
    expect(view.standingTitle).toBe('No longer valid')
    expect(view.summary).toContain('No longer valid.')
  })

  it('fails when the share did not include a record', () => {
    expect(describeProofShare({ sessionState: 'ResponseVerified', cards: [] }).status).toBe('failed')
    expect(describeProofShare({ sessionState: 'Error' }).status).toBe('failed')
  })
})
