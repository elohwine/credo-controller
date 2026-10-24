import express from 'express'
import request from 'supertest'

import { registerPaymentCheckoutPage, renderPaymentCheckout } from '../paymentCheckoutPage'

const payment = {
  linkId: 'L1',
  description: 'School fees <script>alert(1)</script>',
  amount: 120,
  currency: 'USD',
  merchantName: 'St "Mary\'s"',
  status: 'active',
  invoiceRef: 'FEE-1',
  sector: 'education',
  availableMethods: ['ecocash'],
  availableMethodDetails: [
    { providerId: 'ecocash', providerName: 'EcoCash', type: 'ussd' as const },
    { providerId: 'bad"id', providerName: 'Bad', type: 'other' as const },
  ],
}

describe('payment checkout page', () => {
  it('shows the bill and its real payment options with every value escaped', () => {
    const page = renderPaymentCheckout('SDF3YG', { found: true, payment })
    expect(page.status).toBe(200)
    expect(page.html).toContain('🎓 School fees')
    expect(page.html).toContain('USD 120.00')
    expect(page.html).toContain('value="ecocash"')
    expect(page.html).toContain('EcoCash')
    expect(page.html).not.toContain('bad"id')
    expect(page.html).not.toContain('<script>alert(1)</script>')
    expect(page.html).toContain('School fees &lt;script&gt;')
    expect(page.html).toContain('St &quot;Mary&#39;s&quot;')
    expect(page.html).toContain('/api/ssi/auth/login/pin')
    expect(page.html).toContain('Open in Credentis app')
  })

  it('shows the paid receipt state and closed links', () => {
    const paid = renderPaymentCheckout('SDF3YG', {
      found: true,
      payment: { ...payment, status: 'paid', providerRef: 'SIM-1', availableMethods: [] },
    })
    expect(paid.html).toContain('Payment complete')
    expect(paid.html).toContain('SIM-1')
    expect(paid.html).not.toContain('login/pin')

    expect(renderPaymentCheckout('X', { found: false, error: 'Payment link not found or has expired' }).status).toBe(
      404,
    )
    const expired = renderPaymentCheckout('X', { found: false, error: 'Payment link has expired' })
    expect(expired.status).toBe(410)
    expect(expired.html).toContain('Payment link has expired')
  })

  it('rejects malformed codes with a locked-down page', async () => {
    const app = express()
    registerPaymentCheckoutPage(app)
    const res = await request(app).get('/pay/%3Cscript%3E')
    expect(res.status).toBe(404)
    expect(res.headers['content-security-policy']).toContain("connect-src 'self'")
    expect(res.headers['cache-control']).toBe('no-store')
  })
})
