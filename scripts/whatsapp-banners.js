// Renders the WhatsApp template header images (assets/whatsapp/<event>.png, 800x418, 1.91:1).
//
//   node scripts/whatsapp-banners.js
//
// Needs `sharp`; it uses the copy installed for the mobile app when the root has none.
// The images are committed; re-run only when the artwork changes.

const fs = require('fs')
const path = require('path')

function loadSharp() {
  for (const base of [__dirname, path.join(__dirname, '../credo-ui/mobile')]) {
    try {
      return require(require.resolve('sharp', { paths: [base] }))
    } catch {}
  }
  throw new Error('Install sharp (or the mobile app dependencies) first')
}

const W = 800
const H = 418
const BLUE = '#2188CA'
const INK = '#0B2540'

// Simple line icons drawn on a 120x120 grid, centred in the right-hand badge.
const ICONS = {
  task: `
    <rect x="22" y="16" width="76" height="92" rx="10" fill="none" stroke="#fff" stroke-width="6"/>
    <rect x="42" y="8" width="36" height="16" rx="6" fill="#fff"/>
    <path d="M36 52 l8 8 l14 -16" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M66 54 h18" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
    <path d="M36 82 l8 8 l14 -16" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M66 84 h18" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  vc_offer: `
    <rect x="8" y="24" width="104" height="72" rx="10" fill="none" stroke="#fff" stroke-width="6"/>
    <circle cx="38" cy="54" r="12" fill="#fff"/>
    <path d="M20 84 q18 -20 36 0" fill="#fff"/>
    <path d="M66 46 h32 M66 60 h32 M66 74 h20" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  proof_request: `
    <path d="M60 10 l40 14 v30 c0 28 -18 46 -40 56 c-22 -10 -40 -28 -40 -56 v-30 z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="56" cy="56" r="14" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="M66 66 l14 14" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  payment_link: `
    <rect x="8" y="26" width="104" height="70" rx="10" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="M8 46 h104" stroke="#fff" stroke-width="10"/>
    <path d="M22 76 h30" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
    <circle cx="92" cy="76" r="8" fill="#fff"/>`,
  remittance: `
    <circle cx="60" cy="60" r="46" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="M38 60 l15 15 l30 -32" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  invite: `
    <circle cx="48" cy="40" r="18" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="M14 104 c4 -28 20 -40 34 -40 s30 12 34 40" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
    <path d="M94 34 v32 M78 50 h32" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
}

const BANNERS = {
  task: {
    kicker: 'ACTION NEEDED',
    title: 'A task is waiting',
    line: 'Review it and take the next step',
    accent: '#F59E0B',
  },
  vc_offer: {
    kicker: 'NEW RECORD',
    title: 'A record for you',
    line: 'Signed by the issuer. Yours to keep',
    accent: '#10B981',
  },
  proof_request: {
    kicker: 'CHECK REQUEST',
    title: 'Share a record?',
    line: 'Nothing is shared until you agree',
    accent: '#8B5CF6',
  },
  payment_link: {
    kicker: 'PAYMENT REQUEST',
    title: 'A bill to pay',
    line: 'Pay and get a signed receipt',
    accent: '#F97316',
  },
  remittance: {
    kicker: 'PAYMENT RECEIVED',
    title: 'You have been paid',
    line: 'Signed proof of payment',
    accent: '#10B981',
  },
  invite: { kicker: 'TEAM INVITE', title: 'You are invited', line: 'Join your team on Credentis', accent: BLUE },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function svg(event) {
  const b = BANNERS[event]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="1" stop-color="#123E66"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 60}" cy="-40" r="220" fill="${BLUE}" opacity="0.18"/>
  <circle cx="${W - 150}" cy="${H + 60}" r="160" fill="${b.accent}" opacity="0.14"/>
  <rect x="0" y="0" width="12" height="${H}" fill="${b.accent}"/>
  <g transform="translate(38 60)">
    <g transform="translate(22 0) scale(0.42)">
      <path d="M100 20 A80 80 0 0 1 170 70" stroke="${BLUE}" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M170 130 A80 80 0 0 1 100 180" stroke="${BLUE}" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M30 130 A80 80 0 0 1 30 70" stroke="${BLUE}" stroke-width="12" fill="none" stroke-linecap="round"/>
      <circle cx="100" cy="20" r="12" fill="${BLUE}"/><circle cx="170" cy="100" r="12" fill="${BLUE}"/>
      <circle cx="30" cy="100" r="12" fill="${BLUE}"/><circle cx="100" cy="100" r="22" fill="#fff"/>
    </g>
    <text x="118" y="52" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">Credentis</text>
  </g>
  <text x="56" y="200" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="${b.accent}">${esc(b.kicker)}</text>
  <text x="56" y="256" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="700" fill="#fff">${esc(b.title)}</text>
  <text x="56" y="304" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#C9DCEE">${esc(b.line)}</text>
  <text x="56" y="370" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" fill="#7FA6C9">Verified records you keep</text>
  <g transform="translate(${W - 230} 150)">
    <circle cx="80" cy="80" r="92" fill="${b.accent}"/>
    <g transform="translate(20 20)">${ICONS[event]}</g>
  </g>
</svg>`
}

async function main() {
  const sharp = loadSharp()
  const out = path.join(__dirname, '../assets/whatsapp')
  fs.mkdirSync(out, { recursive: true })
  for (const event of Object.keys(BANNERS)) {
    const file = path.join(out, `${event}.png`)
    await sharp(Buffer.from(svg(event)))
      .png({ compressionLevel: 9 })
      .toFile(file)
    console.log(`${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
