/**
 * The page a WhatsApp reply links to: businesses that fit what the person asked, with the reason.
 * No sign-in. Names and reasons only; "Ask for a quote" opens the business in the phone app.
 */
import type { Express, Request, Response } from 'express'

import { orgOfferingsService } from '../services/OrgOfferingsService'
import { describeRequest, readRequest } from '../services/providerMatch'

/** The phone app, where asking needs an account. */
function appUrl(): string {
  return (process.env.MOBILE_APP_URL || process.env.WALLET_PUBLIC_URL || 'http://localhost:3001').replace(/\/+$/, '')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

export function registerFindLanding(app: Express): void {
  app.get('/find', (req: Request, res: Response) => {
    const need = String(req.query.need || '').trim().slice(0, 200)
    const asked = readRequest(need)
    const matches =
      need.length < 2
        ? []
        : orgOfferingsService.match({ need: asked.need, area: asked.area, payment: asked.payment, fulfilment: asked.fulfilment, limit: 8 })
    const understood = need.length < 2 ? '' : describeRequest(asked)
    const items = matches.length
      ? matches
          .map((match) => {
            const reasons = [
              match.standing.configured,
              match.standing.verified,
              match.standing.live,
              ...(match.offer ? [`Offer: ${match.offer}`] : []),
              ...match.reasons,
              ...match.unsure,
            ]
              .map((line) => `<li>${escapeHtml(line)}</li>`)
              .join('')
            const score = match.reviewCount
              ? `<p>${escapeHtml(String(match.reviewAverage))} from ${match.reviewCount} ${match.reviewCount === 1 ? 'customer' : 'customers'}</p>`
              : ''
            const ask = `${appUrl()}/organizations/${encodeURIComponent(match.orgId)}?source=discover&ask=quote`
            return `<article><h3>${escapeHtml(match.name)}</h3>${score}${reasons ? `<ul>${reasons}</ul>` : ''}<a class="ask" href="${escapeHtml(ask)}">Ask for a quote</a></article>`
          })
          .join('')
      : `<p>${need.length < 2 ? 'Say what you need.' : 'No business matched that. Try a trade and a place.'}</p>`
    res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Businesses that can help</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px 16px;background:#f4f8fb;color:#12324a}
main{max-width:480px;margin:auto} article{background:#fff;border-radius:16px;padding:16px;margin:12px 0}
h3{margin:0 0 8px} ul{margin:8px 0 0;padding-left:18px} p{line-height:1.45}
.ask{display:inline-flex;align-items:center;min-height:48px;margin-top:12px;padding:0 20px;border-radius:24px;background:#0b6bcb;color:#fff;text-decoration:none;font-weight:500}</style></head>
<body><main><h2>Businesses that can help</h2><p>${escapeHtml(need || 'Tell us what you need.')}</p>${understood ? `<p>Looking for: ${escapeHtml(understood)}</p>` : ''}<p>The same list is asked for a quote when you send this on WhatsApp.</p>${items}</main></body></html>`)
  })
}
