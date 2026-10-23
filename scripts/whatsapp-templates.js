// Submits the branded WhatsApp utility templates (src/services/whatsAppTemplates.ts) to Meta for approval.
//
//   node scripts/whatsapp-templates.js            # dry run: print the payloads and current Meta status
//   node scripts/whatsapp-templates.js --submit   # create any template that does not exist yet
//
// Needs WABA_TOKEN, WABA_BUSINESS_ACCOUNT_ID and WALLET_PUBLIC_URL (the button links use its origin).
// Optional: --catalog <path to compiled whatsAppTemplates.js> (defaults to build/services/whatsAppTemplates.js).

const path = require('path')

const args = process.argv.slice(2)
const submit = args.includes('--submit')
const catalogArg = args.indexOf('--catalog')
const catalogPath = catalogArg >= 0 ? path.resolve(args[catalogArg + 1]) : path.join(__dirname, '../build/services/whatsAppTemplates.js')
const { RICH_TEMPLATES, metaTemplateDefinition } = require(catalogPath)

const token = process.env.WABA_TOKEN
const waba = process.env.WABA_BUSINESS_ACCOUNT_ID
const version = (process.env.WHATSAPP_GRAPH_VERSION || 'v26.0').trim()
const origin = new URL(process.env.WALLET_PUBLIC_URL || '').origin
if (!token || !/^\d+$/.test(waba || '') || !origin.startsWith('https://')) {
  console.error('Set WABA_TOKEN, WABA_BUSINESS_ACCOUNT_ID and an https WALLET_PUBLIC_URL')
  process.exit(1)
}

const graph = (route, init = {}) =>
  fetch(`https://graph.facebook.com/${version}/${route}`, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(async (res) => ({ status: res.status, body: await res.json() }))

async function main() {
  for (const definition of Object.values(RICH_TEMPLATES)) {
    const payload = metaTemplateDefinition(definition, origin)
    const existing = await graph(`${waba}/message_templates?name=${definition.name}&fields=name,language,status,category`)
    const match = (existing.body.data || []).find((t) => t.name === definition.name && t.language === definition.language)
    if (match) {
      console.log(`${definition.name}: already on Meta (${match.status}, ${match.category})`)
      continue
    }
    if (!submit) {
      console.log(`${definition.name}: not on Meta yet. Would submit:\n${JSON.stringify(payload, null, 2)}\n`)
      continue
    }
    const created = await graph(`${waba}/message_templates`, { method: 'POST', body: JSON.stringify(payload) })
    if (created.body.error) {
      const e = created.body.error
      console.log(`${definition.name}: rejected (${e.code}) ${e.error_user_msg || e.message}`)
    } else {
      console.log(`${definition.name}: submitted (${created.body.status}, ${created.body.category})`)
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
