import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import path from 'path'

import { BooksFiscalService } from '../integrations/BooksFiscalService'

const invoice = {
  invoice_id: 'inv-owned',
  invoice_number: 'INV-OWNED',
  date: '2026-11-10',
  status: 'sent',
  customer_name: 'Harbour Supplies',
  currency_code: 'USD',
  is_inclusive_tax: true,
  total: 100,
  balance: 100,
  line_items: [
    {
      name: 'Consulting',
      quantity: 1,
      rate: 100,
      item_total: 100,
      tax_percentage: 15.5,
      hsn_or_sac: '99831111',
    },
  ],
}

describe('books and fiscalisation owned by this platform', () => {
  const db = new Database(':memory:')
  db.exec(readFileSync(path.join(process.cwd(), 'migrations/148_books_and_fiscal.sql'), 'utf8'))
  const service = new BooksFiscalService(db)
  const org = 'org-owned'

  afterAll(() => db.close())

  it('fiscalises a Zoho invoice on this platform and does not need the other app', async () => {
    service.saveProfile(org, { taxpayerName: 'Synthetic Traders', tin: '2000000000', isVatPayer: true })
    service.addDevice(org, { deviceId: 321, serialNo: 'SIM0001', environment: 'simulator' })
    await service.openDay(org)
    const imported = service.importSource(org, invoice)
    expect(imported.status).toBe('imported')
    expect(imported.hasPhone).toBe(false)

    const withPhone = service.importSource(org, { ...invoice, invoice_id: 'inv-phone', customer_phone: '0771000000' })
    expect(withPhone.hasPhone).toBe(true)
    expect(withPhone.status).toBe('imported')

    const fiscalised = await service.fiscalise(org, imported.id)
    expect(fiscalised.status).toBe('accepted')
    expect(fiscalised.receiptId).toBe(321000001)
    expect(fiscalised.qrCode).toContain('0000000321')
    expect(fiscalised.walletStatus).toBe('no-phone')

    const again = await service.fiscalise(org, imported.id)
    expect(again.receiptId).toBe(fiscalised.receiptId)
    const status = service.status(org)
    expect(status.fiscal.device?.receiptCounter).toBe(1)
    expect(status.books.provider).toBe('zoho')
    expect(JSON.stringify(status)).not.toMatch(/private_key|refresh_token|access_token/)
  })

  it('refuses a draft Zoho document', () => {
    expect(() => service.importSource(org, { ...invoice, invoice_id: 'draft-1', status: 'draft' })).toThrow(/draft/)
  })
})
