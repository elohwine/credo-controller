import { describe, expect, it } from '@jest/globals'

import { extractPresentedCredentials } from '../ActorCredentialProofService'

describe('extractPresentedCredentials', () => {
  it('reads the amount and the term from a Credo credential subject', () => {
    const cards = extractPresentedCredentials({
      presentationExchange: {
        presentations: [
          {
            presentation: {
              verifiableCredential: [
                {
                  credential: {
                    type: ['VerifiableCredential', 'SchoolFeeReceiptVC'],
                    id: 'urn:uuid:receipt-1',
                    credentialSubject: {
                      id: 'did:key:holder',
                      claims: { amount: 650, currency: 'USD', term: 'Term 3', schoolName: 'Springfield High' },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    })
    expect(cards[0]?.subject.amount).toBe(650)
    expect(cards[0]?.subject.term).toBe('Term 3')
    expect(cards[0]?.subject.schoolName).toBe('Springfield High')
    expect(cards[0]?.subject.claims).toBeUndefined()
  })
})
