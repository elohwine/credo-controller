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

export function formatCredentialType(raw?: string | string[] | null): string {
  const value = Array.isArray(raw) ? raw.join(' ') : String(raw ?? 'Credential')
  const match = value.split(/\s+/).find((token) => token && token !== 'VerifiableCredential') || value

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
