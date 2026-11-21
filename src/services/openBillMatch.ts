import { normalizeContactPhone } from './ssi/contactHash'

/**
 * A bill belongs to a contact when it was raised against that contact, or when the number on the
 * bill is the contact's number. `0772…` and `+263772…` are the same number.
 */
export function paymentLinkMatchesContact(
  row: { payer_phone?: string | null; metadata?: string | null },
  contact: { id: string; phone?: string | null },
): boolean {
  const phone = normalizeContactPhone(String(contact.phone || ''))
  if (phone && normalizeContactPhone(String(row.payer_phone || '')) === phone) return true
  try {
    return (row.metadata ? JSON.parse(row.metadata) : {})?.contactId === contact.id
  } catch {
    return false
  }
}
