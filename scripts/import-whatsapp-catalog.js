// Copy the WhatsApp product catalog into an organisation's shop.
//
//   node scripts/import-whatsapp-catalog.js <orgTenantId>
//
// Reads WABA_TOKEN and WABA_BUSINESS_ACCOUNT_ID from the environment (or .env). Prints counts only.
const { readFileSync } = require('fs')
const path = require('path')

const tenantId = process.argv[2]
if (!tenantId) {
  console.error('Usage: node scripts/import-whatsapp-catalog.js <orgTenantId>')
  process.exit(1)
}

if (!process.env.WABA_TOKEN) {
  const envPath = path.join(__dirname, '../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    const key = line.slice(0, index).trim()
    if (process.env[key]) continue
    process.env[key] = line.slice(index + 1).trim().replace(/^"|"$/g, '')
  }
}

const { orgOfferingsService } = require(path.join(__dirname, '../build/services/OrgOfferingsService.js'))

orgOfferingsService
  .pullWhatsAppCatalog(tenantId)
  .then((result) => {
    console.log(`Imported ${result.imported} products. Updated ${result.updated}.`)
  })
  .catch((error) => {
    console.error(error.message || 'The catalog was not imported.')
    process.exit(1)
  })
