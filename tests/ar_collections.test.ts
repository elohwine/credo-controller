import { isArCollectionRow } from '../src/controllers/finance/ArController'

describe('AR collections classifier', () => {
  test('keeps generic payment links that were explicitly marked for AR', () => {
    expect(
      isArCollectionRow({
        id: 'pl-1',
        status: 'active',
        amount: 42,
        invoice_ref: 'INV-1',
        metadata: JSON.stringify({ arModule: true, collectionType: 'one_time' }),
      }),
    ).toBe(true)
  })

  test('still excludes plain invoiced links that have no AR metadata', () => {
    expect(
      isArCollectionRow({
        id: 'pl-2',
        status: 'active',
        amount: 42,
        invoice_ref: 'INV-2',
        metadata: null,
      }),
    ).toBe(false)
  })
})
