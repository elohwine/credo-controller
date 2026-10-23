import type { Express, Request, Response } from 'express'

import path from 'path'

const SAFE_ID = /^[A-Za-z0-9._:-]{1,200}$/

/** Only the inbox selectors the WhatsApp link contract emits survive; everything else is dropped. */
export function inboxQuery(query: Request['query']): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of ['item', 'request']) {
    const value = query[key]
    if (typeof value === 'string' && SAFE_ID.test(value)) params.set(key, value)
  }
  return params
}

const INVITE_CODE = /^[A-Za-z0-9_-]{16,128}$/

/** Only a well-formed invite code is carried into the app link. */
export function inviteQuery(query: Request['query']): URLSearchParams {
  const params = new URLSearchParams()
  const code = query.code
  if (typeof code === 'string' && INVITE_CODE.test(code)) params.set('code', code)
  return params
}

export function androidAssetLinks(env: NodeJS.ProcessEnv = process.env): unknown[] {
  const fingerprints = (env.ANDROID_APP_CERT_SHA256 || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))
  if (!fingerprints.length) return []
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.ANDROID_APP_PACKAGE || 'com.credentis.mobile',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}

interface LandingCopy {
  host: 'inbox' | 'join'
  title: string
  heading: string
  body: string
  hint: string
}

const INBOX_COPY: LandingCopy = {
  host: 'inbox',
  title: 'Credentis inbox',
  heading: 'You have an update',
  body: 'Open the Credentis app and sign in to see it in your inbox.',
  hint: 'If nothing happens, open the Credentis app yourself and go to Inbox.',
}

const JOIN_COPY: LandingCopy = {
  host: 'join',
  title: 'Join on Credentis',
  heading: 'You were invited',
  body: 'Open the Credentis app to confirm your name and choose your own PIN.',
  hint: 'If nothing happens, install the Credentis app and tap this link again. The link works once and expires after 7 days.',
}

function landingHtml(params: URLSearchParams, packageName: string, copy: LandingCopy = INBOX_COPY): string {
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const appLink = `credentis://${copy.host}${suffix}`
  const intentLink = `intent://${copy.host}${suffix}#Intent;scheme=credentis;package=${packageName};end`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${copy.title}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px 20px;background:#f4f8fb;color:#12324a;text-align:center}
main{max-width:420px;margin:auto;background:#fff;border-radius:16px;padding:28px 20px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
a.btn{display:block;margin-top:20px;padding:14px;border-radius:10px;background:#2188ca;color:#fff;text-decoration:none;font-weight:600}
p{line-height:1.5}small{color:#5a7184}</style></head>
<body><main><h2>${copy.heading}</h2>
<p>${copy.body}</p>
<a class="btn" id="open" href="${appLink}">Open in Credentis</a>
<p><small>${copy.hint}</small></p></main>
<script>if(/Android/i.test(navigator.userAgent)){document.getElementById('open').href=${JSON.stringify(intentLink)}}</script>
</body></html>`
}

/** Public HTTPS target for WhatsApp notification links. Android App Links open the app directly when verified. */
export function registerWhatsAppInboxLanding(app: Express): void {
  app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.json(androidAssetLinks())
  })
  // Header banners for the WhatsApp templates; Meta fetches them by URL on every send.
  app.get('/wa/:file', (req: Request, res: Response) => {
    if (!/^(task|vc_offer|proof_request|payment_link|remittance|invite)\.png$/.test(req.params.file)) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(path.resolve(process.cwd(), 'assets/whatsapp', req.params.file), (error) => {
      if (error && !res.headersSent) res.status(404).end()
    })
  })
  const send = (res: Response, params: URLSearchParams, copy: LandingCopy) => {
    const packageName = /^[A-Za-z0-9_.]+$/.test(process.env.ANDROID_APP_PACKAGE || '')
      ? (process.env.ANDROID_APP_PACKAGE as string)
      : 'com.credentis.mobile'
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    )
    res.type('html').send(landingHtml(params, packageName, copy))
  }
  app.get('/inbox', (req: Request, res: Response) => send(res, inboxQuery(req.query), INBOX_COPY))
  // Member invite links from WhatsApp/SMS land here and hand the one-time code to the app's join page.
  app.get('/login/join', (req: Request, res: Response) => send(res, inviteQuery(req.query), JOIN_COPY))
}
