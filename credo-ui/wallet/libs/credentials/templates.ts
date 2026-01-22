export type CredentialTemplateKind =
  | 'identity'
  | 'diploma'
  | 'invoice'
  | 'quote'
  | 'receipt'
  | 'catalog'
  | 'badge'
  | 'generic'

export type TemplateField = {
  label: string
  value: unknown
}

export type TemplateTable = {
  headers: string[]
  rows: Array<Record<string, unknown>>
}

export type CredentialTemplate = {
  kind: CredentialTemplateKind
  title: string
  subtitle?: string
  fields: TemplateField[]
  table?: TemplateTable
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function pickType(vc: any): string | null {
  const directType = vc?.type ?? vc?.vc?.type ?? vc?._credential?.type ?? vc?.credential?.type
  if (Array.isArray(directType)) return asString(directType.at(-1))
  const t = asString(directType)
  if (t) return t

  // SD-JWT-VC often uses `vct` instead of W3C `type`
  const vct = asString(vc?.vct ?? vc?.vc?.vct)
  if (!vct) return null

  // vct can be a URN/URL; normalize to a readable “type-ish” token
  const tail = vct.split('/').at(-1) ?? vct
  return tail.replace('_vc+sd-jwt', '').replace(/[^a-zA-Z0-9_-]/g, '') || vct
}

function normalizeType(type: string | null): string {
  if (!type) return ''
  return type
    .replace(/Credential$/i, '')
    .replace(/VC$/i, '')
    .replace(/_/g, '')
    .toLowerCase()
}

function pickSubject(vc: any): any {
  // Most common shapes:
  // - W3C VC: { credentialSubject: {...} }
  // - Parsed SD-JWT: { claims: {...} }
  // - JWT payload: { vc: { credentialSubject: ... } }
  const subject = vc?.credentialSubject ?? vc?.claims ?? vc?.vc?.credentialSubject ?? vc?.vc?.claims ?? vc
  if (subject?.claims && typeof subject.claims === 'object') {
    return { ...subject, ...subject.claims }
  }
  return subject
}

function pickIssuerName(vc: any): string | null {
  const issuer = vc?.issuer
  if (typeof issuer === 'string') return issuer
  return asString(issuer?.name) ?? asString(issuer?.id) ?? null
}

function pickIssuedDate(vc: any): string | null {
  return asString(vc?.issuanceDate) ?? asString(vc?.validFrom) ?? null
}

function pickExpiryDate(vc: any): string | null {
  return asString(vc?.expirationDate) ?? asString(vc?.validUntil) ?? null
}

function normalizeMoney(amount: unknown, currency: unknown): string | null {
  const a = asString(amount)
  const c = asString(currency)
  if (!a && !c) return null
  if (a && c) return `${a} ${c}`
  return a ?? c
}

function asArray(value: unknown): any[] {
  if (!value) return []
  return Array.isArray(value) ? value : []
}

export function getCredentialTemplate(vc: any): CredentialTemplate {
  const rawType = pickType(vc) ?? 'Credential'
  const type = normalizeType(rawType)
  const subject = pickSubject(vc)
  const issuerName = pickIssuerName(vc)
  const issued = pickIssuedDate(vc)
  const expiry = pickExpiryDate(vc)

  // Base subtitle line
  const subtitleParts = [issued ? `Issued ${issued.slice(0, 10)}` : null, issuerName].filter(Boolean)

  // Map known types → friendly templates
  if (type === 'genericid' || type === 'identity') {
    return {
      kind: 'identity',
      title: asString(subject?.fullName) ?? asString(subject?.holderName) ?? 'Identity Credential',
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'Document #', value: subject?.documentNumber ?? subject?.credentialId ?? vc?.id },
        { label: 'Date of birth', value: subject?.dateOfBirth },
        { label: 'Nationality', value: subject?.nationality },
        { label: 'Expires', value: asString(subject?.expiryDate) ?? (expiry ? expiry.slice(0, 10) : null) },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
    }
  }

  if (type === 'paymentreceipt' || type === 'receipt') {
    const amount = normalizeMoney(subject?.amount, subject?.currency)
    return {
      kind: 'receipt',
      title: asString(subject?.merchantName) ?? 'Payment Receipt',
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'Amount', value: amount },
        { label: 'Transaction ID', value: subject?.transactionId },
        { label: 'Method', value: subject?.paymentMethod },
        { label: 'When', value: subject?.timestamp },
        { label: 'Description', value: subject?.description },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
    }
  }

  if (type === 'openbadge') {
    return {
      kind: 'badge',
      title: asString(subject?.badgeName) ?? 'OpenBadge',
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'Achievement', value: subject?.achievementType },
        { label: 'Date', value: subject?.achievementDate },
        { label: 'Issuer', value: subject?.issuerName ?? issuerName },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
    }
  }

  if (type === 'diploma') {
    return {
      kind: 'diploma',
      title: asString(subject?.fullName) ?? 'Diploma',
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'Degree', value: subject?.degree },
        { label: 'Honours', value: subject?.honours },
        { label: 'Graduated', value: subject?.graduationDate },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
    }
  }

  if (type === 'invoice') {
    const items = asArray(subject?.items)
    return {
      kind: 'invoice',
      title: `Invoice${subject?.invoiceNumber ? ` #${subject.invoiceNumber}` : subject?.invoiceId ? ` #${subject.invoiceId}` : ''}`,
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'From', value: issuerName },
        { label: 'To', value: asString(subject?.holderName) ?? asString(subject?.customerName) ?? asString(vc?.holder?.name) ?? null },
        { label: 'Date', value: subject?.date ?? subject?.timestamp },
        { label: 'Total', value: subject?.total ?? subject?.amount },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
      table: items.length
        ? {
            headers: ['Description', 'Amount'],
            rows: items.map((i) => ({ description: i?.description, amount: i?.amount })),
          }
        : undefined,
    }
  }

  if (type === 'quote') {
    const lines = asArray(subject?.lines)
    return {
      kind: 'quote',
      title: `Quote${subject?.quoteNumber ? ` #${subject.quoteNumber}` : subject?.quoteId ? ` #${subject.quoteId}` : ''}`,
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'From', value: issuerName },
        { label: 'To', value: asString(subject?.holderName) ?? asString(subject?.customerName) ?? asString(vc?.holder?.name) ?? null },
        { label: 'Valid until', value: subject?.validUntil },
        { label: 'Estimated total', value: subject?.estimatedTotal },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
      table: lines.length
        ? {
            headers: ['Description', 'Amount'],
            rows: lines.map((i) => ({ description: i?.description, amount: i?.amount })),
          }
        : undefined,
    }
  }

  if (type === 'catalogitem') {
    return {
      kind: 'catalog',
      title: asString(subject?.title) ?? asString(subject?.name) ?? 'Catalog Item',
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'SKU', value: subject?.sku },
        { label: 'Price', value: normalizeMoney(subject?.price, subject?.currency) },
        { label: 'Merchant', value: subject?.merchantId ?? subject?.merchantDid },
        { label: 'Description', value: subject?.description },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
    }
  }

  // Fallback: show a small curated subset of fields to avoid “JSON soup”.
  const fallbackFields: TemplateField[] = []
  const skip = new Set([
    'id',
    'type',
    '@context',
    'issuer',
    'issuanceDate',
    'expirationDate',
    'proof',
    'credentialSubjectIds',
    'issuerId',
  ])

  if (subject && typeof subject === 'object') {
    for (const [key, value] of Object.entries(subject)) {
      if (fallbackFields.length >= 8) break
      if (skip.has(key) || key.startsWith('@')) continue
      if (value === null || value === undefined || value === '') continue
      if (typeof value === 'object') continue
      fallbackFields.push({ label: key, value })
    }
  }

  return {
    kind: 'generic',
    title: rawType.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
    subtitle: subtitleParts.join(' · ') || undefined,
    fields: fallbackFields,
  }
}
