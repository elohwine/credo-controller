export type WalletQrKind = 'credential-offer' | 'presentation-request' | 'unknown'

/** Protocol, not the user's scan mode, determines which wallet exchange is run. */
export function walletQrKind(value: string): WalletQrKind {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return 'unknown'
  }
  if (
    url.protocol === 'openid-credential-offer:' ||
    url.protocol === 'openid-initiate-issuance:' ||
    url.searchParams.has('credential_offer_uri') ||
    url.searchParams.has('credential_offer_url') ||
    url.searchParams.has('credential_offer')
  )
    return 'credential-offer'
  if (
    url.protocol === 'openid4vp:' ||
    url.protocol === 'openid-vc:' ||
    url.searchParams.has('presentation_request_url') ||
    url.searchParams.has('request_uri')
  )
    return 'presentation-request'
  return 'unknown'
}

export function shouldAcceptScannedOffer(kind: WalletQrKind, mode: string | null): boolean {
  return kind === 'credential-offer' || (mode === 'save-credential' && kind === 'unknown')
}
