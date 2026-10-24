import type { Express, Request, Response } from 'express'

import { PublicPaymentController } from '../controllers/public/PublicPaymentController'

const PAY_CODE = /^[A-Za-z0-9_-]{3,128}$/

type Details = Awaited<ReturnType<PublicPaymentController['getPaymentDetails']>>

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  )
}

function money(amount: unknown, currency: unknown): string {
  const value = Number(amount)
  return `${escapeHtml(currency || 'USD')} ${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`
}

function packageName(): string {
  const value = process.env.ANDROID_APP_PACKAGE || ''
  return /^[A-Za-z0-9_.]+$/.test(value) ? value : 'com.credentis.mobile'
}

function shell(title: string, accent: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px 16px;background:#f4f8fb;color:#12324a}
main{max-width:440px;margin:auto;background:#fff;border-radius:16px;padding:24px 20px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 4px}.muted{color:#5a7184;font-size:14px}.badge{display:inline-block;padding:3px 10px;border-radius:999px;background:#e8f3fb;color:${accent};font-size:12px;font-weight:600;margin-bottom:10px}
.amount{margin:16px 0;padding:16px;border-radius:12px;background:#f4f8fb;text-align:center}.amount strong{display:block;font-size:30px;color:${accent}}
dl{margin:0 0 12px;font-size:14px}dt{color:#5a7184;margin-top:8px}dd{margin:2px 0 0;font-weight:600;word-break:break-word}
.btn{display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:14px;border:0;border-radius:10px;background:${accent};color:#fff;font-size:16px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
.btn.alt{background:#fff;color:${accent};border:1.5px solid ${accent}}.btn:disabled{opacity:.6}
label{display:block;margin-top:12px;font-size:14px;font-weight:600}input[type=tel],input[type=password]{width:100%;box-sizing:border-box;margin-top:4px;padding:12px;border:1px solid #c9d6e2;border-radius:10px;font-size:16px}
.method{display:flex;gap:8px;align-items:center;margin-top:8px;padding:12px;border:1px solid #c9d6e2;border-radius:10px;font-weight:500}
.note{margin-top:12px;padding:12px;border-radius:10px;font-size:14px;line-height:1.45}.ok{background:#e9f8ef;color:#145c32}.err{background:#fdecec;color:#8a1f1f}.info{background:#eef5fb;color:#12324a}
hr{border:0;border-top:1px solid #e3ebf2;margin:20px 0}.paid{font-size:44px;text-align:center}
</style></head><body><main>${body}</main>${script}</body></html>`
}

function closedPage(message: string): string {
  return shell(
    'Payment link',
    '#2188ca',
    `<h1>Payment link unavailable</h1><p class="note info">${escapeHtml(message)}</p>
<p class="muted">Ask the sender for a new link, or open the Credentis app to check your inbox.</p>`,
  )
}

function paidPage(payment: any): string {
  return shell(
    'Paid',
    '#1f8a4c',
    `<div class="paid">✅</div><h1 style="text-align:center">Payment complete</h1>
<div class="amount"><strong>${money(payment.amount, payment.currency)}</strong></div>
<dl><dt>For</dt><dd>${escapeHtml(payment.description)}</dd>
${payment.merchantName ? `<dt>Paid to</dt><dd>${escapeHtml(payment.merchantName)}</dd>` : ''}
${payment.invoiceRef ? `<dt>Invoice</dt><dd>${escapeHtml(payment.invoiceRef)}</dd>` : ''}
${payment.providerRef ? `<dt>Payment reference</dt><dd>${escapeHtml(payment.providerRef)}</dd>` : ''}
${payment.paidAt ? `<dt>Paid on</dt><dd>${escapeHtml(new Date(payment.paidAt).toUTCString())}</dd>` : ''}</dl>
<p class="muted">Your invoice and receipt are kept in your Credentis records.</p>`,
  )
}

function checkoutPage(code: string, payment: any): string {
  const primary = payment.branding?.primaryColor
  const accent = typeof primary === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(primary) ? primary : '#2188ca'
  const methods: Array<{ providerId: string; providerName: string }> = (
    payment.availableMethodDetails?.length
      ? payment.availableMethodDetails
      : (payment.availableMethods || []).map((id: string) => ({ providerId: id, providerName: id }))
  ).filter((m: any) => m && PAY_CODE.test(String(m.providerId)))
  const badge =
    payment.kind === 'quote'
      ? 'Quote'
      : payment.sector === 'education'
        ? '🎓 School fees'
        : payment.kind === 'invoice'
          ? 'Invoice'
          : 'Payment request'
  const appLink = 'credentis://inbox'
  const intentLink = `intent://inbox#Intent;scheme=credentis;package=${packageName()};end`
  const methodList = methods.length
    ? methods
        .map(
          (m, i) =>
            `<label class="method"><input type="radio" name="method" value="${escapeHtml(m.providerId)}"${i === 0 ? ' checked' : ''}> ${escapeHtml(m.providerName)}</label>`,
        )
        .join('')
    : '<p class="note err">This organization has not set up a way to take payments yet.</p>'

  const body = `<span class="badge">${escapeHtml(badge)}</span>
<h1>${escapeHtml(payment.merchantName || 'Payment request')}</h1>
<p class="muted">${escapeHtml(payment.description)}</p>
<div class="amount"><span class="muted">Amount due</span><strong>${money(payment.amount, payment.currency)}</strong></div>
${payment.invoiceRef ? `<dl><dt>Reference</dt><dd>${escapeHtml(payment.invoiceRef)}</dd></dl>` : ''}
<a class="btn" id="open" href="${appLink}">Open in Credentis app</a>
<p class="muted" style="text-align:center;margin-top:6px">The bill is waiting in your Credentis inbox.</p>
<hr><h2 style="font-size:16px;margin:0">Or pay here</h2>
<p class="muted">Sign in with your Credentis phone number and PIN so your invoice and receipt are saved to your records.</p>
<form id="pay" novalidate>
<label>How to pay</label>${methodList}
<label for="phone">Mobile number</label><input id="phone" type="tel" autocomplete="tel" placeholder="e.g. 0771234567" required>
<label for="pin">Credentis PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" required>
<button class="btn" id="submit" type="submit"${methods.length ? '' : ' disabled'}>Pay ${money(payment.amount, payment.currency)}</button>
<div id="status" role="status" aria-live="polite"></div>
</form>
<p class="muted" style="margin-top:16px">No Credentis account yet? Install the Credentis app and sign up with this phone number, then open this link again.</p>`

  const config = JSON.stringify({ code, intentLink }).replace(/</g, '\\u003c')
  const script = `<script>(function(){var C=${config};
if(/Android/i.test(navigator.userAgent)){document.getElementById('open').href=C.intentLink}
var form=document.getElementById('pay'),btn=document.getElementById('submit'),out=document.getElementById('status');
function show(kind,text){out.className='note '+kind;out.textContent=text}
function call(url,body,token){var h={'Content-Type':'application/json'};if(token){h.Authorization='Bearer '+token;h['x-idempotency-key']='web-pay:'+C.code+':'+body.paymentMethod}
return fetch(url,{method:'POST',headers:h,body:JSON.stringify(body),credentials:'omit'}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.message||d.error||('Request failed ('+r.status+')'));return d})})}
function poll(n){fetch('/api/public/pay/'+encodeURIComponent(C.code)).then(function(r){return r.json()}).then(function(d){if(d&&d.found&&d.payment&&d.payment.status==='paid'){location.reload();return}if(n>0)setTimeout(function(){poll(n-1)},4000)}).catch(function(){if(n>0)setTimeout(function(){poll(n-1)},4000)})}
form.addEventListener('submit',function(e){e.preventDefault();
var m=form.querySelector('input[name=method]:checked'),phone=document.getElementById('phone').value.trim(),pin=document.getElementById('pin').value.trim();
if(!m){show('err','Choose how to pay.');return}if(!phone||!pin){show('err','Enter your mobile number and PIN.');return}
btn.disabled=true;show('info','Signing you in…');
call('/api/ssi/auth/login/pin',{phone:phone,pin:pin}).catch(function(){throw new Error('That phone number and PIN did not match a Credentis account.')})
.then(function(auth){show('info','Starting payment…');return call('/api/public/pay/'+encodeURIComponent(C.code)+'/pay',{paymentMethod:m.value,customerMsisdn:phone,saveToWallet:true},auth.token)})
.then(function(r){document.getElementById('pin').value='';
if(r.status==='success'||r.status==='paid'){show('ok',r.message||'Payment complete.');setTimeout(function(){location.reload()},1500);return}
show('info',(r.instructions||r.message||'Payment started. Approve it on your phone.')+' This page updates when the payment is confirmed.');
if(r.checkoutUrl&&/^https:\\/\\//.test(r.checkoutUrl)){var a=document.createElement('a');a.className='btn';a.href=r.checkoutUrl;a.rel='noopener';a.textContent='Continue to payment';out.appendChild(a)}
poll(45)})
.catch(function(err){show('err',err.message||'Payment failed.');btn.disabled=false})});
})();</script>`
  return shell(`Pay ${payment.merchantName || ''}`.trim(), accent, body, script)
}

export function renderPaymentCheckout(code: string, details: Details): { status: number; html: string } {
  if (!details.found) {
    return { status: /not found/i.test(details.error) ? 404 : 410, html: closedPage(details.error) }
  }
  if (details.payment.status === 'paid') return { status: 200, html: paidPage(details.payment) }
  return { status: 200, html: checkoutPage(code, details.payment) }
}

/** Browser checkout for texted pay links (/v/{code} lands here when no app/portal URL is configured). */
export function registerPaymentCheckoutPage(app: Express): void {
  app.get('/pay/:code', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    )
    const code = req.params.code
    if (!PAY_CODE.test(code)) {
      res.status(404).type('html').send(closedPage('This payment link is not valid.'))
      return
    }
    try {
      const details = await new PublicPaymentController().getPaymentDetails(code)
      const page = renderPaymentCheckout(code, details)
      res.status(page.status).type('html').send(page.html)
    } catch {
      res.status(500).type('html').send(closedPage('We could not load this payment right now. Try again shortly.'))
    }
  })
}
