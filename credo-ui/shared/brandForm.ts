import type { DocumentBrand, DocumentKind, DocumentModel } from './brandedDocument'

/** What the brand endpoints return (`GET /api/organizations/{id}/brand`). */
export interface OrgBrandView extends DocumentBrand {
  orgTenantId: string
  logoHash?: string
  configured: boolean
  version?: number
  updatedAt?: string
}

export type BrandTextField = Exclude<
  keyof DocumentBrand,
  'logoUrl' | 'configured' | 'quoteValidityDays' | 'invoiceDueDays' | 'primaryColor'
>

export interface BrandFieldDef {
  key: BrandTextField
  label: string
  placeholder?: string
  multiline?: boolean
  description?: string
}

/** The editable fields, grouped the way the setup screens show them. */
export const BRAND_FIELD_GROUPS: Array<{ title: string; fields: BrandFieldDef[] }> = [
  {
    title: 'Name and contact',
    fields: [
      { key: 'displayName', label: 'Name on documents', placeholder: 'Acme Plumbing (Pvt) Ltd' },
      { key: 'tagline', label: 'Tagline', placeholder: 'Fast, licensed plumbing in Harare' },
      { key: 'phone', label: 'Phone', placeholder: '+263 77 123 4567' },
      { key: 'email', label: 'Email', placeholder: 'accounts@example.co.zw' },
      { key: 'website', label: 'Website', placeholder: 'example.co.zw' },
      { key: 'address', label: 'Address', multiline: true },
    ],
  },
  {
    title: 'Registration and tax',
    fields: [
      { key: 'registrationNumber', label: 'Company registration number' },
      { key: 'taxNumber', label: 'Tax number (BP / TIN)' },
      { key: 'vatNumber', label: 'VAT number' },
    ],
  },
  {
    title: 'How to pay you',
    fields: [
      { key: 'mobileMoney', label: 'Mobile money', placeholder: 'EcoCash merchant 123456' },
      { key: 'bankDetails', label: 'Bank details', multiline: true, placeholder: 'Bank, branch, account name and number' },
    ],
  },
  {
    title: 'Wording on documents',
    fields: [
      { key: 'quoteTerms', label: 'Quotation terms', multiline: true, placeholder: 'Prices include labour. 50% deposit to start.' },
      { key: 'invoiceTerms', label: 'Invoice terms', multiline: true, placeholder: 'Please pay by the due date.' },
      { key: 'receiptFooter', label: 'Receipt footer', multiline: true, placeholder: 'Thank you for your business.' },
    ],
  },
]

export type BrandDraft = Omit<OrgBrandView, 'orgTenantId' | 'configured' | 'version' | 'updatedAt' | 'logoHash'>

/** The fields sent on save. A save replaces the whole profile, so a blank field is left out and so cleared. Logo changes go through the logo endpoint. */
export function brandSavePayload(draft: BrandDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (draft.primaryColor) payload.primaryColor = draft.primaryColor
  for (const group of BRAND_FIELD_GROUPS) {
    for (const field of group.fields) {
      const value = String((draft[field.key] as string | undefined) ?? '').trim()
      if (value) payload[field.key] = value
    }
  }
  if (typeof draft.quoteValidityDays === 'number') payload.quoteValidityDays = draft.quoteValidityDays
  if (typeof draft.invoiceDueDays === 'number') payload.invoiceDueDays = draft.invoiceDueDays
  return payload
}

/** A made-up document so the owner can see the brand before any real bill goes out. */
export function sampleBrandDocument(kind: DocumentKind = 'invoice'): DocumentModel {
  const issuedAt = new Date().toISOString()
  const add = (days: number) => new Date(Date.now() + days * 86400000).toISOString()
  return {
    kind,
    number: kind === 'quote' ? 'Q-0001' : kind === 'receipt' ? 'R-0001' : 'INV-0001',
    issuedAt,
    dueDate: kind === 'invoice' ? add(7) : undefined,
    validUntil: kind === 'quote' ? add(14) : undefined,
    paidAt: kind === 'receipt' ? issuedAt : undefined,
    status: kind === 'receipt' ? 'paid' : 'unpaid',
    currency: 'USD',
    billTo: { name: 'Sample customer', phone: '+263 77 000 0000' },
    description: 'Sample — this is how your documents will look',
    lines: [
      { description: 'Call-out and inspection', quantity: 1, unitPrice: 25, amount: 25 },
      { description: 'Parts', quantity: 2, unitPrice: 12.5, amount: 25 },
    ],
    subtotal: 50,
    total: 50,
    paymentRef: kind === 'receipt' ? 'MP240101.1234.A00001' : undefined,
    paymentMethod: kind === 'receipt' ? 'EcoCash' : undefined,
  }
}

/**
 * Shrink and re-encode a picked image in the browser so it fits the 512 KB logo limit.
 * Returns a PNG (or JPEG when PNG is still too big) data URL.
 */
export async function prepareLogoDataUrl(file: Blob, maxSide = 512, maxBytes = 500 * 1024): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the picture.'))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file is not a picture we can use. Try a PNG or JPG.'))
    img.src = source
  })
  const bytesOf = (dataUrl: string) => Math.ceil(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)
  let side = maxSide
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((image.naturalWidth || side) * scale))
    canvas.height = Math.max(1, Math.round((image.naturalHeight || side) * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This device cannot prepare the picture.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = canvas.toDataURL('image/png')
    if (bytesOf(png) <= maxBytes) return png
    const jpeg = canvas.toDataURL('image/jpeg', 0.85)
    if (bytesOf(jpeg) <= maxBytes) return jpeg
    side = Math.round(side * 0.7)
  }
  throw new Error('The picture is too large. Try a smaller logo.')
}
