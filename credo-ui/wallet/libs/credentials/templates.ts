export type CredentialTemplateKind =
  | 'identity'
  | 'diploma'
  | 'invoice'
  | 'quote'
  | 'receipt'
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
  const t = vc?.type
  if (Array.isArray(t)) return asString(t.at(-1))
  return asString(t)
}

function pickSubject(vc: any): any {
  return vc?.credentialSubject ?? vc?.claims ?? vc
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
  const type = pickType(vc) ?? 'Credential'
  const subject = pickSubject(vc)
  const issuerName = pickIssuerName(vc)
  const issued = pickIssuedDate(vc)
  const expiry = pickExpiryDate(vc)

  // Base subtitle line
  const subtitleParts = [issued ? `Issued ${issued.slice(0, 10)}` : null, issuerName].filter(Boolean)

  // Map known types → friendly templates
  if (type === 'GenericIDCredential' || type === 'Identity' || type === 'IdentityCredential') {
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

  if (type === 'PaymentReceipt' || type === 'PaymentReceiptCredential' || type === 'Receipt') {
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

  if (type === 'OpenBadge') {
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

  if (type === 'Diploma' || type === 'DiplomaCredential') {
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

  if (type === 'Invoice' || type === 'InvoiceCredential') {
    const items = asArray(subject?.items)
    return {
      kind: 'invoice',
      title: `Invoice${subject?.invoiceNumber ? ` #${subject.invoiceNumber}` : ''}`,
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'From', value: issuerName },
        { label: 'To', value: asString(subject?.holderName) ?? asString(vc?.holder?.name) ?? null },
        { label: 'Date', value: subject?.date },
        { label: 'Total', value: subject?.total },
      ].filter((f) => f.value !== null && f.value !== undefined && f.value !== ''),
      table: items.length
        ? {
            headers: ['Description', 'Amount'],
            rows: items.map((i) => ({ description: i?.description, amount: i?.amount })),
          }
        : undefined,
    }
  }

  if (type === 'Quote' || type === 'QuoteCredential') {
    const lines = asArray(subject?.lines)
    return {
      kind: 'quote',
      title: `Quote${subject?.quoteNumber ? ` #${subject.quoteNumber}` : ''}`,
      subtitle: subtitleParts.join(' · ') || undefined,
      fields: [
        { label: 'From', value: issuerName },
        { label: 'To', value: asString(subject?.holderName) ?? asString(vc?.holder?.name) ?? null },
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
    title: type.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
    subtitle: subtitleParts.join(' · ') || undefined,
    fields: fallbackFields,
  }
}
