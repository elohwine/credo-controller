// The claim rows and the step words moved to the mirrored `recordCheck` helper so the check
// page and the wallet read a record the same way. Re-exported because screens import them here.
export { credentialClaimRows, plainStep } from '@/lib/recordCheck'

export function formatDate(value?: string | null): string {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Cards the team list already names in plain words. Same labels on portal and phone. */
const CARD_LABELS: Record<string, string> = {
  EmployeeCredential: 'Staff card',
  PlatformIdentityCredential: 'Identity card',
  PlatformIdentityVC: 'Identity card',
  OrgWorkflowActorCredential: 'Role card (older)',
  LeaveApprovalVC: 'Leave approved',
  ExpenseApprovalVC: 'Expense approved',
}

export function formatCredentialType(raw?: string | string[] | null): string {
  const value = Array.isArray(raw) ? raw.join(' ') : String(raw ?? 'Credential')
  const match = value.split(/\s+/).find((token) => token && token !== 'VerifiableCredential') || value
  if (CARD_LABELS[match]) return CARD_LABELS[match]

  // Organisation-defined record types arrive as e.g. `CourseCertificateRecord`; read them as
  // the label the organisation typed ("Course certificate").
  if (/^[A-Z][A-Za-z0-9]*[a-z0-9]Record$/.test(match)) {
    const words = match
      .replace(/Record$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([a-z])([0-9])/, '$1 $2')
      .trim()
    if (words) return words.charAt(0) + words.slice(1).toLowerCase()
  }

  return (
    match
      .replace(/VC$/i, '')
      .replace(/Credential$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim() || 'Credential'
  )
}

export function formatIssuerName(didOrName?: string | null): string {
  if (!didOrName) return 'Unknown issuer'
  if (!didOrName.startsWith('did:')) return didOrName

  const method = didOrName.split(':')[1] ?? ''

  if (method === 'web') {
    // did:web:registry.gov.zw → "registry.gov.zw"
    // did:web:credentis.io:tenants:abc123 → "credentis.io"
    const hostPart = didOrName.split(':')[2] ?? ''
    // Decode percent-encoded colons used in did:web paths
    const decoded = decodeURIComponent(hostPart)
    if (decoded) {
      // Capitalise first label for readability e.g. "registry.gov.zw" → "Registry (gov.zw)"
      const labels = decoded.split('.')
      const first = labels[0] ? labels[0].charAt(0).toUpperCase() + labels[0].slice(1) : ''
      const rest = labels.slice(1).join('.')
      return rest ? `${first} (${rest})` : first
    }
  }

  if (method === 'key') return 'Cryptographic Key Issuer'
  if (method === 'peer') return 'Peer Identity'
  if (method === 'ethr' || method === 'eth') return 'On-chain Identity'
  if (method === 'ion') return 'Decentralised Identity'

  // Generic fallback: capitalise the method name
  return `${method.charAt(0).toUpperCase() + method.slice(1)} Issuer`
}

/**
 * Who gave the person this record, in words they recognise: the organisation, school or shop
 * named on the card. Falls back to the issuer identifier description.
 */
export function credentialIssuerLabel(subject: Record<string, any> | undefined, issuer?: string | null): string {
  const named =
    subject?.orgName ||
    subject?.merchantName ||
    subject?.schoolName ||
    subject?.organizationName ||
    subject?.platformName
  if (typeof named === 'string' && named.trim()) return named.trim()
  return formatIssuerName(issuer)
}
