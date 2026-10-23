// Submits the branded WhatsApp templates (src/services/whatsAppTemplates.ts) to Meta for approval.
//
//   node scripts/whatsapp-templates.js            # dry run: print the payloads and current Meta status
//   node scripts/whatsapp-templates.js --submit   # upload each banner and create any template not on Meta yet
//   node scripts/whatsapp-templates.js --prune    # also delete the retired text-header templates
//
// Needs WABA_TOKEN, WABA_BUSINESS_ACCOUNT_ID and WALLET_PUBLIC_URL (the button links and the banner
// images use its origin, so deploy the API first). WHATSAPP_APP_ID is optional; it is read from the token.
// Optional: --catalog <path to compiled whatsAppTemplates.js> (defaults to build/services/whatsAppTemplates.js).

const path = require('path')

const args = process.argv.slice(2)
const submit = args.includes('--submit')
const prune = args.includes('--prune')
const catalogArg = args.indexOf('--catalog')
const catalogPath =
  catalogArg >= 0 ? path.resolve(args[catalogArg + 1]) : path.join(__dirname, '../build/services/whatsAppTemplates.js')
const { RICH_TEMPLATES, RETIRED_TEMPLATE_NAMES, metaTemplateDefinition, headerImageUrl } = require(catalogPath)

const token = process.env.WABA_TOKEN
const waba = process.env.WABA_BUSINESS_ACCOUNT_ID
const version = (process.env.WHATSAPP_GRAPH_VERSION || 'v26.0').trim()
const origin = new URL(process.env.WALLET_PUBLIC_URL || '').origin
if (!token || !/^\d+$/.test(waba || '') || !origin.startsWith('https://')) {
  console.error('Set WABA_TOKEN, WABA_BUSINESS_ACCOUNT_ID and an https WALLET_PUBLIC_URL')
  process.exit(1)
}

const graphUrl = (route) => `https://graph.facebook.com/${version}/${route}`
const graph = (route, init = {}) =>
  fetch(graphUrl(route), {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(async (res) => ({ status: res.status, body: await res.json() }))

async function appId() {
  if (/^\d+$/.test(process.env.WHATSAPP_APP_ID || '')) return process.env.WHATSAPP_APP_ID
  const { body } = await graph(`debug_token?input_token=${encodeURIComponent(token)}`)
  if (!body?.data?.app_id) throw new Error('Could not read the app ID from the token; set WHATSAPP_APP_ID')
  return body.data.app_id
}

/** Meta needs a sample of the header image as an upload handle (Resumable Upload API). */
async function uploadBanner(app, event) {
  const res = await fetch(headerImageUrl(origin, event))
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/png'))
    throw new Error(`Banner ${event}.png is not served at ${origin}/wa/ (deploy the API first)`)
  const file = Buffer.from(await res.arrayBuffer())
  const session = await graph(`${app}/uploads?file_name=${event}.png&file_length=${file.length}&file_type=image/png`, {
    method: 'POST',
  })
  if (!session.body?.id) throw new Error(`Upload session failed: ${JSON.stringify(session.body)}`)
  const uploaded = await fetch(graphUrl(session.body.id), {
    method: 'POST',
    headers: { Authorization: 'OAuth ' + token, file_offset: '0' },
    body: file,
  }).then((r) => r.json())
  if (!uploaded?.h) throw new Error(`Upload failed: ${JSON.stringify(uploaded)}`)
  return uploaded.h
}

async function main() {
  const app = submit ? await appId() : undefined
  for (const definition of Object.values(RICH_TEMPLATES)) {
    const existing = await graph(
      `${waba}/message_templates?name=${definition.name}&fields=name,language,status,category,rejected_reason`,
    )
    const match = (existing.body.data || []).find(
      (t) => t.name === definition.name && t.language === definition.language,
    )
    if (match) {
      console.log(
        `${definition.name}: already on Meta (${match.status}, ${match.category}${match.rejected_reason && match.rejected_reason !== 'NONE' ? `, ${match.rejected_reason}` : ''})`,
      )
      continue
    }
    if (!submit) {
      console.log(
        `${definition.name}: not on Meta yet. Would submit:\n${JSON.stringify(metaTemplateDefinition(definition, origin), null, 2)}\n`,
      )
      continue
    }
    const handle = await uploadBanner(app, definition.event)
    const payload = metaTemplateDefinition(definition, origin, handle)
    const created = await graph(`${waba}/message_templates`, { method: 'POST', body: JSON.stringify(payload) })
    if (created.body.error) {
      const e = created.body.error
      console.log(`${definition.name}: rejected (${e.code}) ${e.error_user_msg || e.message}`)
    } else {
      console.log(`${definition.name}: submitted (${created.body.status}, ${created.body.category})`)
    }
  }
  if (!prune) return
  for (const name of RETIRED_TEMPLATE_NAMES) {
    const removed = await graph(`${waba}/message_templates?name=${name}`, { method: 'DELETE' })
    console.log(`${name}: ${removed.body.success ? 'deleted' : removed.body.error?.message || 'not found'}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
