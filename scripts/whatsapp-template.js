#!/usr/bin/env node
/**
 * Submit (or check) the Credentis transactional WhatsApp template.
 *
 *   WABA_TOKEN=... node scripts/whatsapp-template.js          # submit for approval
 *   WABA_TOKEN=... node scripts/whatsapp-template.js --check  # show approval status
 *
 * WABA_BUSINESS_ACCOUNT_ID defaults to the platform WABA. The token is read from the
 * environment only; never pass it as an argument (it would land in shell history).
 * The body must keep exactly two positional parameters: {{1}} notice, {{2}} HTTPS inbox link.
 */
const axios = require('axios')

const version = process.env.WHATSAPP_GRAPH_VERSION || 'v26.0'
const waba = process.env.WABA_BUSINESS_ACCOUNT_ID || '1376175484008383'
const token = process.env.WABA_TOKEN
const name = process.env.WHATSAPP_TEMPLATE_NAME || 'credentis_inbox_update'
const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US'

if (!token) {
  console.error('Set WABA_TOKEN in the environment first.')
  process.exit(1)
}

const graph = axios.create({
  baseURL: `https://graph.facebook.com/${version}/`,
  headers: { Authorization: `Bearer ${token}` },
  timeout: 20000,
})

async function check() {
  const { data } = await graph.get(`${waba}/message_templates`, {
    params: { name, fields: 'name,language,status,category,rejected_reason' },
  })
  const rows = (data.data || []).filter((row) => row.name === name)
  if (!rows.length) console.log(`No template named ${name} on WABA ${waba}.`)
  for (const row of rows) {
    console.log(
      `${row.name} [${row.language}] ${row.category} → ${row.status}${row.rejected_reason && row.rejected_reason !== 'NONE' ? ` (${row.rejected_reason})` : ''}`,
    )
  }
}

async function submit() {
  const { data } = await graph.post(`${waba}/message_templates`, {
    name,
    language,
    category: 'UTILITY',
    parameter_format: 'POSITIONAL',
    components: [
      {
        type: 'BODY',
        text: 'Credentis account update: {{1}}\n\nOpen your inbox here: {{2}}\n\nYou get this because you turned on WhatsApp alerts. Reply STOP to turn them off.',
        example: {
          body_text: [
            ['There is an update in your Credentis inbox. Sign in to view it.', 'https://credentis.fly.dev/inbox'],
          ],
        },
      },
    ],
  })
  console.log(`Submitted ${name} [${language}]: id=${data.id} status=${data.status} category=${data.category}`)
  if (data.category && data.category !== 'UTILITY') {
    console.log('Meta recategorised it. Notifications only use UTILITY templates; edit the wording and resubmit.')
  }
}

;(process.argv.includes('--check') ? check() : submit()).catch((error) => {
  const meta = error?.response?.data?.error
  console.error(meta ? `Meta error ${meta.code}: ${meta.error_user_msg || meta.message}` : error.message)
  process.exit(1)
})
