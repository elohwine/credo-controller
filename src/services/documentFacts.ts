/**
 * What every signed quote, invoice and receipt carries besides its own amounts: the issuing
 * organisation's details (name, address, contact, registration, tax and VAT numbers, brand
 * version) and the VAT inside the amount. Every issuer calls `documentClaims`, so a workflow
 * added later gets the same record by issuing one of the document types.
 *
 * Existing claims always win; nothing here changes an amount that was charged.
 */

import { rootLogger } from '../utils/pinoLogger'

import { issuerClaimsOf, orgBrandService, vatBreakdown, vatOf, type OrgBrandView } from './OrgBrandService'

const logger = rootLogger.child({ module: 'documentFacts' })

/** Records that are documents a customer, payer or supplier keeps. */
export const DOCUMENT_CREDENTIAL_TYPES = new Set([
  'QuoteVC',
  'InvoiceVC',
  'ReceiptVC',
  'PaymentReceiptVC',
  'SchoolFeeReceiptVC',
  'RemittanceAdviceVC',
])

/** What a wallet calls each document record. */
export const DOCUMENT_RECORD_NAMES: Record<string, string> = {
  QuoteVC: 'Quotation',
  InvoiceVC: 'Invoice',
  ReceiptVC: 'Receipt',
  PaymentReceiptVC: 'Payment receipt',
  SchoolFeeReceiptVC: 'School fee receipt',
  RemittanceAdviceVC: 'Remittance advice',
}

/** Documents that can show VAT. School fee receipts and remittance advice never do. */
const TAXABLE_TYPES = new Set(['QuoteVC', 'InvoiceVC', 'ReceiptVC', 'PaymentReceiptVC'])

const SCHOOL_FEE_WORKFLOWS = new Set(['education_fee_payment', 'school_fee_payment', 'school_fees', 'tpl-education-fee'])

/** School fees are VAT exempt; everything else follows the organisation's VAT setting. */
export function isTaxExempt(hint: {
  transactionType?: unknown
  sector?: unknown
  centre?: unknown
  workflowType?: unknown
  credentialType?: unknown
}): boolean {
  return (
    hint.transactionType === 'fee_assessment' ||
    hint.sector === 'education' ||
    hint.centre === 'school_fees' ||
    hint.credentialType === 'SchoolFeeReceiptVC' ||
    SCHOOL_FEE_WORKFLOWS.has(String(hint.workflowType || '').toLowerCase())
  )
}

/** VAT already worked out when the price was set (FinanceActions.calculateInvoice), kept on the bill. */
export interface StoredTax {
  rate: number
  amount: number
  included: boolean
  subtotal?: number
}

export function storedTaxOf(value: unknown): StoredTax | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const rate = Number(v.rate)
  const amount = Number(v.amount)
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount)) return undefined
  const subtotal = Number(v.subtotal)
  return { rate, amount, included: v.included !== false, ...(Number.isFinite(subtotal) ? { subtotal } : {}) }
}

/** The tax facts for a finished price, for the bill metadata. Undefined when no VAT was charged. */
export function taxFromFinance(finance: unknown): StoredTax | undefined {
  if (!finance || typeof finance !== 'object') return undefined
  const f = finance as Record<string, unknown>
  const rate = Number(f.taxRate)
  const amount = Number(f.taxAmount)
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount) || amount <= 0) return undefined
  const subtotal = Number(f.subtotal) - Number(f.discountAmount || 0)
  return {
    rate,
    amount: Math.round(amount * 100) / 100,
    included: f.taxIncluded === true,
    ...(Number.isFinite(subtotal) ? { subtotal: Math.round((f.taxIncluded === true ? subtotal - amount : subtotal) * 100) / 100 } : {}),
  }
}

const num = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Material receipts from field jobs are evidence of a purchase, not a bill: no VAT line. */
const isEvidenceReceipt = (claims: Record<string, any>) =>
  Boolean(claims.evidenceHash || claims.photoUri || claims.photoHash || claims.requisitionId)

function brandAt(orgTenantId: string | undefined, when?: string): OrgBrandView | undefined {
  if (!orgTenantId || orgTenantId === 'default') return undefined
  try {
    return orgBrandService.at(orgTenantId, when)
  } catch (error) {
    logger.debug({ err: error, orgTenantId }, 'No brand for this document')
    return undefined
  }
}

export interface DocumentClaimOptions {
  /** True for records that never carry VAT (school fees). */
  exempt?: boolean
  /** VAT worked out when the price was set. Wins over the organisation's current setting. */
  tax?: StoredTax
  /** When the document was issued, so the brand of that day is used. */
  when?: string
}

/**
 * The claims for a document record with the issuer's facts and the VAT added. Not a document
 * type: the claims come back unchanged.
 */
export function documentClaims(
  credentialType: string,
  claims: Record<string, any>,
  orgTenantId: string | undefined,
  options: DocumentClaimOptions = {},
): Record<string, any> {
  if (!DOCUMENT_CREDENTIAL_TYPES.has(credentialType)) return claims
  const brand = brandAt(orgTenantId, options.when)
  const out: Record<string, any> = { ...(brand ? issuerClaimsOf(brand) : {}), ...claims }
  if (brand && !out.orgName) out.orgName = brand.displayName

  const taxable =
    TAXABLE_TYPES.has(credentialType) && !options.exempt && !isTaxExempt({ credentialType }) && !isEvidenceReceipt(out)
  if (!taxable || (out.taxAmount !== undefined && out.taxAmount !== null && Number(out.taxAmount) !== 0)) return out

  if (options.tax) {
    out.taxRate = options.tax.rate
    out.taxAmount = options.tax.amount
    out.taxIncluded = options.tax.included
    if (options.tax.subtotal !== undefined) out.subtotal = options.tax.subtotal
    return out
  }
  const vat = brand ? vatOf(brand) : undefined
  const gross = num(out.grandTotal ?? out.amount ?? out.amountPaid ?? out.total)
  if (!vat || !gross || gross <= 0) return out
  // The amount on a bill is what the payer is asked for, so VAT is read out of it, never added.
  const split = vatBreakdown(gross, { rate: vat.rate, included: true })
  out.taxRate = split.taxRate
  out.taxAmount = split.taxAmount
  out.taxIncluded = true
  out.subtotal = split.subtotal
  return out
}

/**
 * What a workflow's price step worked out (`state.finance`), for a document issued in that run:
 * the priced lines and, when VAT was charged, the VAT. Only keys the record does not set itself.
 */
export function financeClaims(finance: unknown, claims: Record<string, any>): Record<string, any> {
  if (!finance || typeof finance !== 'object') return {}
  const f = finance as Record<string, any>
  const out: Record<string, any> = {}
  const lines = documentLineItems(f.lineItems)
  if (lines && claims.items === undefined && claims.lineItems === undefined) out.lineItems = lines
  const tax = taxFromFinance(f)
  if (tax && (claims.taxAmount === undefined || claims.taxAmount === null)) {
    out.taxRate = tax.rate
    out.taxAmount = tax.amount
    out.taxIncluded = tax.included
    if (tax.subtotal !== undefined && claims.subtotal === undefined) out.subtotal = tax.subtotal
  }
  const discount = Number(f.discountAmount)
  if (Number.isFinite(discount) && discount > 0 && claims.discountAmount === undefined) out.discountAmount = discount
  return out
}

interface BillRow {
  merchant_id: string
  sector?: string | null
  metadata?: string | Record<string, any> | null
  created_at?: string | null
}

function metadataOf(value: BillRow['metadata']): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Line items in the shape the documents read (description, qty, unitPrice, lineTotal). */
export function documentLineItems(items: unknown): Array<Record<string, any>> | undefined {
  if (!Array.isArray(items)) return undefined
  const lines = items
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => {
      const qty = num(item.qty ?? item.quantity)
      const unitPrice = num(item.unitPrice ?? item.price)
      const lineTotal = num(item.lineTotal ?? item.amount ?? item.total) ?? (qty !== undefined && unitPrice !== undefined ? qty * unitPrice : undefined)
      const description = String(item.description ?? item.name ?? item.title ?? '').trim()
      if (!description && lineTotal === undefined) return undefined
      return {
        description: description || 'Item',
        ...(qty !== undefined ? { qty } : {}),
        ...(unitPrice !== undefined ? { unitPrice } : {}),
        ...(lineTotal !== undefined ? { lineTotal: Math.round(lineTotal * 100) / 100 } : {}),
      }
    })
    .filter(Boolean) as Array<Record<string, any>>
  return lines.length ? lines : undefined
}

/**
 * The document claims for a pay link: its lines, who it is for, the VAT and the issuer. Used for
 * the quote and invoice records, the receipt, the bill card in the payer's inbox and the pay page,
 * so all of them show the same document.
 */
export function billDocumentClaims(
  credentialType: string,
  link: BillRow,
  claims: Record<string, any>,
): Record<string, any> {
  const metadata = metadataOf(link.metadata)
  const lineItems = documentLineItems(metadata.items)
  const base: Record<string, any> = {
    ...(lineItems ? { lineItems } : {}),
    ...(typeof metadata.payerName === 'string' && metadata.payerName.trim() ? { payerName: metadata.payerName.trim() } : {}),
    ...claims,
  }
  return documentClaims(credentialType, base, link.merchant_id, {
    exempt: isTaxExempt({ sector: link.sector, centre: metadata.centre, transactionType: metadata.transactionType }),
    tax: storedTaxOf(metadata.tax),
    when: link.created_at || undefined,
  })
}
