import { paymentLinkMatchesContact } from '../openBillMatch'

const store = { id: 'c-store', phone: '+263772123456' }

describe('A store’s open bills', () => {
  it('matches 0772…, +263 77…, and a bill stored against the contact, and nothing else', () => {
    expect(paymentLinkMatchesContact({ payer_phone: '0772123456', metadata: '{}' }, store)).toBe(true)
    expect(paymentLinkMatchesContact({ payer_phone: '+263 77 212 3456', metadata: null }, store)).toBe(true)
    expect(paymentLinkMatchesContact({ payer_phone: null, metadata: JSON.stringify({ contactId: 'c-store' }) }, store)).toBe(true)
    expect(paymentLinkMatchesContact({ payer_phone: '0771000000', metadata: '{}' }, store)).toBe(false)
    expect(paymentLinkMatchesContact({ payer_phone: null, metadata: 'not json' }, store)).toBe(false)
    expect(paymentLinkMatchesContact({ payer_phone: '0772123456', metadata: '{}' }, { id: 'c-store', phone: '' })).toBe(false)
  })
})
