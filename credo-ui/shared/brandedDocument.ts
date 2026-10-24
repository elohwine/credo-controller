/**
 * Quotes, invoices and receipts laid out with the issuing organisation's brand.
 * Shared by the phone app and the portal: `documentFromClaims` reads a card or bill,
 * `renderDocumentHtml` draws it for the screen and printing, `renderDocumentPdf` writes a PDF.
 */

export type DocumentKind = 'quote' | 'invoice' | 'receipt'

export interface DocumentBrand {
  displayName: string
  primaryColor?: string
  logoUrl?: string
  tagline?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  registrationNumber?: string
  taxNumber?: string
  vatNumber?: string
  bankDetails?: string
  mobileMoney?: string
  quoteTerms?: string
  quoteValidityDays?: number
  invoiceTerms?: string
  invoiceDueDays?: number
  receiptFooter?: string
  configured?: boolean
}

export interface DocumentLine {
  description: string
  quantity?: number
  unitPrice?: number
  amount: number
}

export type DocumentStatus = 'paid' | 'unpaid' | 'overdue' | 'expired' | 'declined' | 'accepted' | 'withdrawn'

export interface DocumentModel {
  kind: DocumentKind
  number?: string
  issuedAt?: string
  dueDate?: string
  validUntil?: string
  paidAt?: string
  status?: DocumentStatus
  billTo?: { name?: string; phone?: string; email?: string }
  description?: string
  lines: DocumentLine[]
  subtotal?: number
  discount?: number
  tax?: number
  total: number
  currency: string
  paymentRef?: string
  paymentMethod?: string
  /** What this document refers to: the invoice a receipt settles, the job an invoice bills. */
  reference?: { label: string; value: string }
  verification?: { credentialId?: string; issuerDid?: string; verifyUrl?: string; signed: boolean }
}

export const DOCUMENT_TITLES: Record<DocumentKind, string> = {
  quote: 'Quotation',
  invoice: 'Tax invoice',
  receipt: 'Receipt',
}

export const FALLBACK_BRAND_COLOR = '#0F766E'

const pick = (claims: Record<string, any>, keys: string[]): any => {
  for (const key of keys) {
    const value = claims?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return undefined
}

const text = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined
  const out = String(value).trim()
  return out || undefined
}

export function toAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/[^0-9.-]/g, '')
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

const typeList = (types: unknown): string[] =>
  (Array.isArray(types) ? types : [types]).map((t) => String(t || '').toLowerCase()).filter(Boolean)

/** Material receipts from field jobs are evidence, not proof of payment. */
const looksLikeMaterialReceipt = (claims: Record<string, any>) =>
  Boolean(pick(claims, ['supplier', 'receiptRef', 'billRef', 'evidenceHash', 'photoHash', 'purchases']))

const hasPaymentFacts = (claims: Record<string, any>) =>
  toAmount(pick(claims, ['amount', 'total', 'grandTotal', 'amountPaid'])) !== undefined &&
  Boolean(pick(claims, ['paymentRef', 'transactionId', 'paidAt', 'invoiceId', 'invoiceRef', 'receiptId', 'providerRef']))

/** Whether a card is a quote, an invoice or a payment receipt; undefined for anything else. */
export function documentKindOf(types: unknown, claims: Record<string, any> = {}): DocumentKind | undefined {
  const list = typeList(types)
  if (list.some((t) => t.includes('quote') || t.includes('quotation'))) return 'quote'
  if (list.some((t) => t.includes('invoice'))) return 'invoice'
  if (list.some((t) => t.includes('receipt'))) {
    if (looksLikeMaterialReceipt(claims) && !pick(claims, ['paymentRef', 'transactionId'])) return undefined
    return hasPaymentFacts(claims) ? 'receipt' : undefined
  }
  return undefined
}

function linesFrom(claims: Record<string, any>): DocumentLine[] {
  const raw = pick(claims, ['lineItems', 'items', 'lines'])
  let list: any[] = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) list = parsed
    } catch {
      list = []
    }
  }
  return list
    .map((item): DocumentLine | undefined => {
      if (!item || typeof item !== 'object') return undefined
      const quantity = toAmount(item.qty ?? item.quantity)
      const unitPrice = toAmount(item.unitPrice ?? item.price ?? item.rate)
      const amount =
        toAmount(item.lineTotal ?? item.amount ?? item.total) ??
        (quantity !== undefined && unitPrice !== undefined ? quantity * unitPrice : undefined)
      const description = text(item.description ?? item.name ?? item.title ?? item.sku) || 'Item'
      if (amount === undefined) return undefined
      return { description, quantity, unitPrice, amount }
    })
    .filter((line): line is DocumentLine => Boolean(line))
}

const isoOrUndefined = (value: unknown): string | undefined => {
  const raw = text(value)
  if (!raw) return undefined
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : date.toISOString()
}

const addDays = (iso: string | undefined, days: number | undefined): string | undefined => {
  if (!iso || days === undefined) return undefined
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export interface DocumentSource {
  kind: DocumentKind
  claims: Record<string, any>
  issuedAt?: string
  credentialId?: string
  issuerDid?: string
  withdrawn?: boolean
  /** A signed card (true) or a bill shown before anything was signed (false). */
  signed?: boolean
  brand?: Pick<DocumentBrand, 'quoteValidityDays' | 'invoiceDueDays'>
}

/** A document from a card's claims. Claim names vary between issuers, so several are accepted for each field. */
export function documentFromClaims(source: DocumentSource): DocumentModel {
  const c = source.claims || {}
  const kind = source.kind
  const lines = linesFrom(c)
  const total =
    toAmount(pick(c, ['grandTotal', 'total', 'amount', 'amountPaid', 'totalAmount'])) ??
    lines.reduce((sum, line) => sum + line.amount, 0)
  const description = text(pick(c, ['description', 'purpose', 'feeType', 'title', 'serviceName', 'itemName']))
  if (!lines.length && total) {
    const parts = [description, text(c.studentName), text(c.term)].filter(Boolean)
    lines.push({ description: parts.join(' · ') || DOCUMENT_TITLES[kind], amount: total })
  }
  const issuedAt = isoOrUndefined(pick(c, ['issuedAt', 'issueDate', 'timestamp', 'createdAt'])) || source.issuedAt
  const number = text(
    kind === 'quote'
      ? pick(c, ['quoteId', 'quoteNumber', 'quoteRef', 'reference'])
      : kind === 'invoice'
        ? pick(c, ['invoiceId', 'invoiceNumber', 'invoiceRef', 'reference'])
        : pick(c, ['receiptId', 'receiptNumber', 'transactionId', 'paymentRef']),
  )
  const paidAt = kind === 'receipt' ? isoOrUndefined(pick(c, ['paidAt', 'timestamp'])) || issuedAt : undefined
  const dueDate =
    kind === 'invoice'
      ? isoOrUndefined(pick(c, ['dueDate', 'due', 'payBy'])) || addDays(issuedAt, source.brand?.invoiceDueDays)
      : undefined
  const validUntil =
    kind === 'quote'
      ? isoOrUndefined(pick(c, ['validUntil', 'expiresAt', 'expiry'])) || addDays(issuedAt, source.brand?.quoteValidityDays)
      : undefined

  let reference: DocumentModel['reference']
  if (kind === 'receipt') {
    const invoice = text(pick(c, ['invoiceRef', 'invoiceId', 'invoiceNumber']))
    if (invoice) reference = { label: 'For invoice', value: invoice }
  } else if (kind === 'invoice') {
    const ref = text(pick(c, ['jobRef', 'jobId', 'cartRef', 'cartId', 'orderId', 'quoteRef']))
    if (ref && ref !== number) reference = { label: 'Reference', value: ref }
  }
  if (!reference && text(c.studentName)) reference = { label: 'Student', value: String(c.studentName) }

  const status: DocumentStatus | undefined = source.withdrawn
    ? 'withdrawn'
    : kind === 'receipt'
      ? 'paid'
      : (() => {
          const raw = String(c.status || '').toLowerCase()
          if (['paid', 'settled', 'completed'].includes(raw)) return 'paid'
          if (raw === 'declined' || raw === 'cancelled') return 'declined'
          if (raw === 'accepted') return 'accepted'
          if (raw === 'expired') return 'expired'
          if (kind === 'invoice' && dueDate && new Date(dueDate).getTime() < Date.now()) return 'overdue'
          return kind === 'invoice' ? 'unpaid' : undefined
        })()

  return {
    kind,
    number,
    issuedAt,
    dueDate,
    validUntil,
    paidAt,
    status,
    billTo: {
      name: text(pick(c, ['payerName', 'customerName', 'clientName', 'buyerName', 'holderName', 'studentName'])),
      phone: text(pick(c, ['payerPhone', 'buyerPhone', 'customerPhone', 'clientPhone', 'phone'])),
      email: text(pick(c, ['payerEmail', 'customerEmail', 'clientEmail', 'email'])),
    },
    description,
    lines,
    subtotal: toAmount(c.subtotal),
    discount: toAmount(pick(c, ['discountAmount', 'discount'])),
    tax: toAmount(pick(c, ['taxAmount', 'tax', 'vat'])),
    total,
    currency: text(c.currency) || 'USD',
    paymentRef: text(pick(c, ['paymentRef', 'transactionId', 'providerRef'])),
    paymentMethod: text(pick(c, ['paymentMethod', 'method', 'provider', 'rail'])),
    reference,
    verification: {
      credentialId: source.credentialId,
      issuerDid: source.issuerDid,
      verifyUrl: text(pick(c, ['verifyUrl', 'verificationUrl'])),
      signed: source.signed !== false,
    },
  }
}

// ---------- formatting ----------

export function formatMoney(amount: number | undefined, currency: string): string {
  if (amount === undefined) return ''
  try {
    return new Intl.NumberFormat('en-ZW', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function formatDocDate(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function safeBrandColor(value?: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : FALLBACK_BRAND_COLOR
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  )

const multiline = (value?: string) => escapeHtml(value || '').replace(/\n/g, '<br/>')

const safeImageUrl = (value?: string): string | undefined => {
  if (!value) return undefined
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value
  return /^https?:\/\//i.test(value) ? value : undefined
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  expired: 'Expired',
  declined: 'Declined',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
}

export function documentStatusLabel(status?: DocumentStatus): string | undefined {
  return status ? STATUS_LABEL[status] : undefined
}

export function documentFileName(model: DocumentModel, brand: DocumentBrand, extension = 'pdf'): string {
  const base = [brand.displayName, DOCUMENT_TITLES[model.kind], model.number].filter(Boolean).join('-')
  return `${base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'}.${extension}`
}

/** Text lines under the document: terms for quotes and invoices, the footer for receipts. */
export function documentClosingText(model: DocumentModel, brand: DocumentBrand): string | undefined {
  if (model.kind === 'quote') return brand.quoteTerms
  if (model.kind === 'invoice') return brand.invoiceTerms
  return brand.receiptFooter
}

function brandContactLines(brand: DocumentBrand): string[] {
  return [
    brand.address,
    [brand.phone, brand.email].filter(Boolean).join(' · '),
    brand.website,
    [
      brand.registrationNumber ? `Reg. ${brand.registrationNumber}` : '',
      brand.taxNumber ? `BP ${brand.taxNumber}` : '',
      brand.vatNumber ? `VAT ${brand.vatNumber}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  ].filter((line): line is string => Boolean(line && line.trim()))
}

/** The note at the bottom: how to check a signed record, or what an unsigned copy is. */
export function documentFooterLines(model: DocumentModel): string[] {
  const v = model.verification
  if (v?.signed) {
    return [
      `Digitally signed record${v.credentialId ? ` · ID ${v.credentialId}` : ''}`,
      v.issuerDid ? `Signed by ${v.issuerDid}` : '',
      v.verifyUrl ? `Check it at ${v.verifyUrl}` : '',
    ].filter(Boolean)
  }
  if (model.kind === 'receipt') return ['Payment confirmation. The signed receipt is kept in the payer\'s Credentis wallet.']
  return ['Copy of the bill. A signed receipt is issued once it is paid.']
}

function metaRows(model: DocumentModel): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  if (model.number) rows.push([model.kind === 'receipt' ? 'Receipt no.' : model.kind === 'quote' ? 'Quote no.' : 'Invoice no.', model.number])
  if (model.issuedAt) rows.push(['Date', formatDocDate(model.issuedAt)])
  if (model.validUntil) rows.push(['Valid until', formatDocDate(model.validUntil)])
  if (model.dueDate) rows.push(['Due', formatDocDate(model.dueDate)])
  if (model.paidAt && model.kind === 'receipt') rows.push(['Paid on', formatDocDate(model.paidAt)])
  if (model.reference) rows.push([model.reference.label, model.reference.value])
  return rows
}

function paymentRows(model: DocumentModel, brand: DocumentBrand): Array<[string, string]> {
  if (model.kind === 'receipt') {
    return [
      ['Amount received', formatMoney(model.total, model.currency)],
      ...(model.paymentMethod ? ([['Paid by', model.paymentMethod]] as Array<[string, string]>) : []),
      ...(model.paymentRef ? ([['Payment reference', model.paymentRef]] as Array<[string, string]>) : []),
    ]
  }
  if (model.kind !== 'invoice') return []
  const rows: Array<[string, string]> = []
  if (brand.mobileMoney) rows.push(['Mobile money', brand.mobileMoney])
  if (brand.bankDetails) rows.push(['Bank', brand.bankDetails])
  return rows
}

/** A complete, self-contained HTML page (inline styles, A4 print rules). Every value is escaped. */
export function renderDocumentHtml(model: DocumentModel, brand: DocumentBrand): string {
  const color = safeBrandColor(brand.primaryColor)
  const logo = safeImageUrl(brand.logoUrl)
  const title = DOCUMENT_TITLES[model.kind]
  const status = documentStatusLabel(model.status)
  const showQty = model.lines.some((line) => line.quantity !== undefined || line.unitPrice !== undefined)
  const closing = documentClosingText(model, brand)
  const payment = paymentRows(model, brand)
  const billTo = [model.billTo?.name, model.billTo?.phone, model.billTo?.email].filter(Boolean)

  const lineRows = model.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.description)}</td>
        ${showQty ? `<td class="num">${line.quantity ?? ''}</td><td class="num">${line.unitPrice !== undefined ? escapeHtml(formatMoney(line.unitPrice, model.currency)) : ''}</td>` : ''}
        <td class="num">${escapeHtml(formatMoney(line.amount, model.currency))}</td>
      </tr>`,
    )
    .join('')

  const totals: Array<[string, number | undefined]> = [
    ['Subtotal', model.subtotal],
    ['Discount', model.discount ? -model.discount : undefined],
    ['Tax', model.tax],
  ]
  const totalRows = totals
    .filter(([, value]) => value !== undefined && value !== 0 && model.subtotal !== undefined)
    .map(([label, value]) => `<tr><td>${label}</td><td class="num">${escapeHtml(formatMoney(value, model.currency))}</td></tr>`)
    .join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(`${title} ${model.number || ''} · ${brand.displayName}`)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background: #fff; font-size: 13px; line-height: 1.45; }
  .doc { max-width: 760px; margin: 0 auto; padding: 24px; }
  .band { height: 6px; background: ${color}; border-radius: 3px; margin-bottom: 20px; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .org { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .org img { max-height: 64px; max-width: 140px; object-fit: contain; }
  .org h1 { margin: 0; font-size: 18px; color: #111827; }
  .org .tag { color: #6b7280; font-size: 12px; }
  .org .contact { color: #4b5563; font-size: 11.5px; margin-top: 4px; }
  .title { text-align: right; }
  .title h2 { margin: 0; font-size: 22px; letter-spacing: 0.5px; color: ${color}; text-transform: uppercase; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid ${color}; color: ${color}; }
  .badge.paid { background: #ecfdf5; border-color: #059669; color: #047857; }
  .badge.overdue, .badge.withdrawn, .badge.declined { background: #fef2f2; border-color: #dc2626; color: #b91c1c; }
  .grid { display: flex; justify-content: space-between; gap: 16px; margin: 22px 0 16px; flex-wrap: wrap; }
  .box h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; }
  .meta td { padding: 1px 0; } .meta td:first-child { color: #6b7280; padding-right: 12px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.lines th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; background: ${color}; padding: 8px; }
  table.lines td { padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  table.lines th.num { text-align: right; }
  .totals { margin-left: auto; margin-top: 8px; min-width: 240px; border-collapse: collapse; }
  .totals td { padding: 4px 8px; }
  .totals tr.grand td { font-size: 16px; font-weight: 700; border-top: 2px solid ${color}; padding-top: 8px; }
  .section { margin-top: 18px; }
  .section h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; }
  .terms { color: #374151; font-size: 12px; }
  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 10.5px; word-break: break-all; }
  @media print { .doc { padding: 0; } }
</style></head>
<body><div class="doc">
  <div class="band"></div>
  <header>
    <div class="org">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.displayName)} logo"/>` : ''}
      <div>
        <h1>${escapeHtml(brand.displayName)}</h1>
        ${brand.tagline ? `<div class="tag">${escapeHtml(brand.tagline)}</div>` : ''}
        <div class="contact">${brandContactLines(brand).map(escapeHtml).join('<br/>')}</div>
      </div>
    </div>
    <div class="title">
      <h2>${escapeHtml(title)}</h2>
      ${status ? `<div class="badge ${escapeHtml(model.status)}">${escapeHtml(status)}</div>` : ''}
    </div>
  </header>
  <div class="grid">
    <div class="box">
      <h3>${model.kind === 'receipt' ? 'Received from' : model.kind === 'quote' ? 'Prepared for' : 'Bill to'}</h3>
      <div>${billTo.length ? billTo.map(escapeHtml).join('<br/>') : '—'}</div>
    </div>
    <div class="box"><table class="meta">${metaRows(model)
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
      .join('')}</table></div>
  </div>
  <table class="lines">
    <thead><tr><th>Description</th>${showQty ? '<th class="num">Qty</th><th class="num">Unit price</th>' : ''}<th class="num">Amount</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <table class="totals">
    ${totalRows}
    <tr class="grand"><td>${model.kind === 'receipt' ? 'Total paid' : 'Total'}</td><td class="num">${escapeHtml(formatMoney(model.total, model.currency))}</td></tr>
  </table>
  ${
    payment.length
      ? `<div class="section"><h3>${model.kind === 'receipt' ? 'Payment' : 'How to pay'}</h3><table class="meta">${payment
          .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${multiline(v)}</td></tr>`)
          .join('')}</table></div>`
      : ''
  }
  ${closing ? `<div class="section"><h3>${model.kind === 'receipt' ? 'Note' : 'Terms'}</h3><div class="terms">${multiline(closing)}</div></div>` : ''}
  <footer>${documentFooterLines(model).map(escapeHtml).join('<br/>')}</footer>
</div></body></html>`
}

// ---------- PDF ----------

/** The parts of jsPDF used here, so this shared file does not import the library itself. */
export interface PdfDoc {
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
  setFont(name: string, style?: string): unknown
  setFontSize(size: number): unknown
  setTextColor(r: number, g?: number, b?: number): unknown
  setDrawColor(r: number, g?: number, b?: number): unknown
  setFillColor(r: number, g?: number, b?: number): unknown
  setLineWidth(width: number): unknown
  text(text: string | string[], x: number, y: number, options?: Record<string, unknown>): unknown
  rect(x: number, y: number, w: number, h: number, style?: string): unknown
  line(x1: number, y1: number, x2: number, y2: number): unknown
  splitTextToSize(text: string, maxWidth: number): string[]
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): unknown
  addPage(): unknown
  output(type: 'datauristring' | 'arraybuffer'): any
}

const hexToRgb = (hex: string): [number, number, number] => {
  const raw = safeBrandColor(hex).slice(1)
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)]
}

export interface PdfLogo {
  dataUrl: string
  width: number
  height: number
}

/**
 * Draw the document into a fresh jsPDF (A4, millimetres). `logo` must already be a data URL:
 * fetch it with `loadLogoForPdf` first.
 */
export function renderDocumentPdf(doc: PdfDoc, model: DocumentModel, brand: DocumentBrand, logo?: PdfLogo): void {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const margin = 16
  const right = width - margin
  const [r, g, b] = hexToRgb(brand.primaryColor || FALLBACK_BRAND_COLOR)
  const grey = () => doc.setTextColor(107, 114, 128)
  const ink = () => doc.setTextColor(31, 41, 55)
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > height - margin) {
      doc.addPage()
      y = margin
    }
  }

  doc.setFillColor(r, g, b)
  doc.rect(margin, y, width - margin * 2, 1.6, 'F')
  y += 8

  let textX = margin
  if (logo) {
    const maxH = 18
    const maxW = 40
    const scale = Math.min(maxW / logo.width, maxH / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    const format = /^data:image\/png/i.test(logo.dataUrl) ? 'PNG' : 'JPEG'
    try {
      doc.addImage(logo.dataUrl, format, margin, y - 2, w, h)
      textX = margin + w + 4
    } catch {
      textX = margin
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  ink()
  doc.text(brand.displayName, textX, y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  grey()
  let contactY = y + 8
  for (const line of [brand.tagline, ...brandContactLines(brand)].filter(Boolean) as string[]) {
    const wrapped = doc.splitTextToSize(line, right - textX - 60)
    doc.text(wrapped, textX, contactY)
    contactY += 3.8 * wrapped.length
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(r, g, b)
  doc.text(DOCUMENT_TITLES[model.kind].toUpperCase(), right, y + 3, { align: 'right' })
  const status = documentStatusLabel(model.status)
  if (status) {
    doc.setFontSize(9)
    if (model.status === 'paid') doc.setTextColor(4, 120, 87)
    else if (model.status === 'overdue' || model.status === 'withdrawn' || model.status === 'declined')
      doc.setTextColor(185, 28, 28)
    doc.text(status.toUpperCase(), right, y + 9, { align: 'right' })
  }
  y = Math.max(contactY, y + 20) + 4

  const columnTop = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  grey()
  doc.text(model.kind === 'receipt' ? 'RECEIVED FROM' : model.kind === 'quote' ? 'PREPARED FOR' : 'BILL TO', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  ink()
  let leftY = y + 5
  const billTo = [model.billTo?.name, model.billTo?.phone, model.billTo?.email].filter(Boolean) as string[]
  for (const line of billTo.length ? billTo : ['—']) {
    doc.text(line, margin, leftY)
    leftY += 4.6
  }

  let rightY = columnTop
  doc.setFontSize(9)
  for (const [label, value] of metaRows(model)) {
    grey()
    doc.text(label, right - 62, rightY)
    ink()
    doc.text(doc.splitTextToSize(value, 34), right, rightY, { align: 'right' })
    rightY += 4.8
  }
  y = Math.max(leftY, rightY) + 4

  const showQty = model.lines.some((line) => line.quantity !== undefined || line.unitPrice !== undefined)
  const amountX = right - 2
  const unitX = right - 34
  const qtyX = right - 64
  const descWidth = (showQty ? qtyX - 14 : amountX - 36) - margin

  doc.setFillColor(r, g, b)
  doc.rect(margin, y, width - margin * 2, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text('DESCRIPTION', margin + 2, y + 4.8)
  if (showQty) {
    doc.text('QTY', qtyX, y + 4.8, { align: 'right' })
    doc.text('UNIT PRICE', unitX, y + 4.8, { align: 'right' })
  }
  doc.text('AMOUNT', amountX, y + 4.8, { align: 'right' })
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.2)
  for (const line of model.lines) {
    const wrapped = doc.splitTextToSize(line.description, descWidth)
    const rowH = Math.max(7, 4.4 * wrapped.length + 3)
    ensureSpace(rowH)
    ink()
    doc.text(wrapped, margin + 2, y + 4.8)
    if (showQty) {
      if (line.quantity !== undefined) doc.text(String(line.quantity), qtyX, y + 4.8, { align: 'right' })
      if (line.unitPrice !== undefined)
        doc.text(formatMoney(line.unitPrice, model.currency), unitX, y + 4.8, { align: 'right' })
    }
    doc.text(formatMoney(line.amount, model.currency), amountX, y + 4.8, { align: 'right' })
    y += rowH
    doc.line(margin, y, right, y)
  }

  y += 4
  ensureSpace(30)
  const totalLabelX = right - 70
  if (model.subtotal !== undefined) {
    const extras: Array<[string, number | undefined]> = [
      ['Subtotal', model.subtotal],
      ['Discount', model.discount ? -model.discount : undefined],
      ['Tax', model.tax],
    ]
    for (const [label, value] of extras) {
      if (value === undefined || value === 0) continue
      grey()
      doc.text(label, totalLabelX, y + 4)
      ink()
      doc.text(formatMoney(value, model.currency), amountX, y + 4, { align: 'right' })
      y += 5.5
    }
  }
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.6)
  doc.line(totalLabelX, y + 1, right, y + 1)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  ink()
  doc.text(model.kind === 'receipt' ? 'Total paid' : 'Total', totalLabelX, y + 7)
  doc.text(formatMoney(model.total, model.currency), amountX, y + 7, { align: 'right' })
  y += 14

  const section = (heading: string, rows: Array<[string, string]> | string) => {
    const body = typeof rows === 'string' ? doc.splitTextToSize(rows, width - margin * 2) : []
    ensureSpace(10 + (typeof rows === 'string' ? body.length * 4.2 : rows.length * 5))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    grey()
    doc.text(heading.toUpperCase(), margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    ink()
    if (typeof rows === 'string') {
      doc.text(body, margin, y)
      y += body.length * 4.2 + 3
      return
    }
    for (const [label, value] of rows) {
      const wrapped = doc.splitTextToSize(value, width - margin * 2 - 45)
      grey()
      doc.text(label, margin, y)
      ink()
      doc.text(wrapped, margin + 45, y)
      y += Math.max(5, wrapped.length * 4.2 + 1)
    }
    y += 2
  }

  const payment = paymentRows(model, brand)
  if (payment.length) section(model.kind === 'receipt' ? 'Payment' : 'How to pay', payment)
  const closing = documentClosingText(model, brand)
  if (closing) section(model.kind === 'receipt' ? 'Note' : 'Terms', closing)

  const footer = documentFooterLines(model)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  grey()
  const footerLines = footer.flatMap((line) => doc.splitTextToSize(line, width - margin * 2))
  const footerY = height - margin - footerLines.length * 3.4
  if (y > footerY - 4) {
    doc.addPage()
  }
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.2)
  doc.line(margin, footerY - 3, right, footerY - 3)
  doc.text(footerLines, margin, footerY)
}

/** Load a logo for the PDF: fetch it, draw it to a canvas and hand back a PNG data URL with its size. */
export async function loadLogoForPdf(url?: string): Promise<PdfLogo | undefined> {
  if (!url || typeof window === 'undefined') return undefined
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return undefined
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = objectUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || 1
      canvas.height = image.naturalHeight || 1
      const context = canvas.getContext('2d')
      if (!context) return undefined
      context.drawImage(image, 0, 0)
      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return undefined
  }
}

type PdfConstructor = new (options: { unit: 'mm'; format: 'a4'; orientation: 'portrait' }) => PdfDoc

/** The finished PDF as bytes plus a base64 copy (the Android share sheet needs base64). */
export async function buildDocumentPdf(
  JsPdf: PdfConstructor,
  model: DocumentModel,
  brand: DocumentBrand,
): Promise<{ bytes: Uint8Array; base64: () => string; fileName: string }> {
  const doc = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  renderDocumentPdf(doc, model, brand, await loadLogoForPdf(brand.logoUrl))
  const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  const base64 = () => {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)))
    }
    return btoa(binary)
  }
  return { bytes, base64, fileName: documentFileName(model, brand) }
}
