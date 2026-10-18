/**
 * How a saved card should look and where it sits.
 *
 * Wallet practice (Apple Wallet, Google Wallet, the EU digital-identity wallet rules):
 * a card the issuer ended is kept — it is the record of what was issued — but it must not
 * sit beside live cards or look like one. A card that was replaced or withdrawn is filed
 * under Archived on its own. A card that merely expired stays in view, in grey, and the
 * person is asked to archive it: the expiry is the cue to renew, so hiding it would hide that.
 *
 * The same helper is copied in the portal (`credo-ui/portal/lib/cardLife.ts`).
 */

export type CardLife = 'active' | 'expired' | 'replaced' | 'withdrawn'

export interface CardLifeInfo {
  life: CardLife
  /** Short word on the card. */
  label: string
  /** Sentence under the card when it is opened. */
  note: string
  /** Filed under Archived without asking. True for replaced and withdrawn cards. */
  fileAway: boolean
}

const ARCHIVE_KEY = 'credentis.archivedCards'

export function cardLife(input: {
  withdrawn?: boolean
  revoked?: boolean
  revocationReason?: string
  expiresAt?: string | null
}): CardLifeInfo {
  if (input.withdrawn || input.revoked) {
    const replaced = /replac/i.test(String(input.revocationReason || ''))
    return replaced
      ? {
          life: 'replaced',
          label: 'Replaced',
          note: 'A newer card took the place of this one, so it was filed under Archived. It cannot be used.',
          fileAway: true,
        }
      : {
          life: 'withdrawn',
          label: 'Withdrawn',
          note: 'The organisation withdrew this card, so it was filed under Archived. It cannot be used.',
          fileAway: true,
        }
  }
  if (
    input.expiresAt &&
    Number.isFinite(new Date(input.expiresAt).getTime()) &&
    new Date(input.expiresAt).getTime() < Date.now()
  ) {
    return {
      life: 'expired',
      label: 'Expired',
      note: 'This card is past its end date. Archive it so your live cards stay easy to find.',
      fileAway: false,
    }
  }
  return { life: 'active', label: 'Active', note: '', fileAway: false }
}

export function readArchivedCardIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(ARCHIVE_KEY)
    const ids = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The person's own choice to file a card. Replaced and withdrawn cards are filed without this. */
export function setCardArchived(id: string, archived: boolean): void {
  const next = readArchivedCardIds()
  if (archived) next.add(id)
  else next.delete(id)
  try {
    window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...next]))
  } catch {
    // The card still moves for this visit; a full storage quota must not block the screen.
  }
}
