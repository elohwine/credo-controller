/** Queued offers that are commercial documents: receipts, invoices and quotes. */
export function isCommercialDocumentOffer(sourceType?: string | null, credentialType?: string | null): boolean {
  const source = String(sourceType || '').toLowerCase()
  if (source === 'invoice_offer' || source === 'quote_offer' || source === 'receipt_offer' || source === 'payment') {
    return true
  }
  return source === 'workflow_vc_offer' && /receipt|invoice|quote/i.test(String(credentialType || ''))
}

export interface OfferFailure {
  /** The issuer no longer has this offer (404/410, expired pre-authorized code). */
  gone: boolean
  /** The offer exists but cannot be redeemed as is; a fresh one may be sent. */
  unusable: boolean
  /** Network trouble or an issuer outage: the offer itself is fine, try again later. */
  unreachable: boolean
  /** None of the supplied forms was a credential offer. */
  notAnOffer: boolean
}

export function classifyOfferFailure(message: string): OfferFailure {
  const msg = String(message || '')
  const gone = /unsuccessful response with status '(404|410)'/i.test(msg) || msg.includes('Credential offer not found')
  const expiredOrInvalid =
    gone ||
    msg.includes('Invalid Credential Offer Request') ||
    /pre-authorized code has expired/i.test(msg) ||
    (msg.includes('invalid_grant') && msg.includes('expired'))
  const unreachable =
    /fetch failed|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|unsuccessful response with status '5\d\d'|token error response with status 5\d\d/i.test(
      msg,
    )
  return {
    gone,
    unusable:
      !unreachable &&
      (expiredOrInvalid || msg.includes('proof_types_supported') || msg.includes('Invalid state for credential offer')),
    unreachable,
    notAnOffer: msg.includes("did not contain either 'credential_offer'"),
  }
}

/**
 * Several URI forms of one offer are tried. A form that is simply not an offer URI fails with a
 * format error; that says nothing about the offer, so report the first real failure instead.
 */
export function pickOfferResolutionError(errors: any[]): Error {
  const isFormatError = (error: any) => classifyOfferFailure(String(error?.message || error)).notAnOffer
  return errors.find((error) => error && !isFormatError(error)) || errors[0] || new Error('Missing offer URI')
}
