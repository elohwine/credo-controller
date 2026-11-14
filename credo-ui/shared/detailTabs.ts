/**
 * The tabs a details view shows, the same on jobs, requests and money items, on the website and
 * the phone. Details and History always; Photos, Receipts and Documents when the flow uses them
 * (it captures photos, moves money, issues records) or something was already added.
 */
export type DetailTabKey = 'details' | 'photos' | 'receipts' | 'documents' | 'history'

export interface DetailTab {
  key: DetailTabKey
  label: string
}

export interface DetailTabInput {
  /** The flow has a photo step (field jobs). */
  capturesPhotos?: boolean
  /** The flow moves money (payment, payout, purchase, invoice). */
  movesMoney?: boolean
  /** The flow issues records or carries attachments. */
  issuesRecords?: boolean
  photos?: number
  receipts?: number
  documents?: number
  /** Wording for the documents tab ("Records" on the phone). */
  documentsLabel?: string
  /** Panels this view can show; tabs outside it are left out. Default: all. */
  panels?: DetailTabKey[]
}

const count = (value?: number) => (Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0)

export function detailTabsFor(input: DetailTabInput = {}): DetailTab[] {
  const photos = count(input.photos)
  const receipts = count(input.receipts)
  const documents = count(input.documents)
  const tabs: DetailTab[] = [{ key: 'details', label: 'Details' }]
  if (input.capturesPhotos || photos > 0) tabs.push({ key: 'photos', label: `Photos (${photos})` })
  if (input.movesMoney || receipts > 0) tabs.push({ key: 'receipts', label: `Receipts (${receipts})` })
  if (input.issuesRecords || documents > 0) {
    tabs.push({ key: 'documents', label: `${input.documentsLabel || 'Documents & records'} (${documents})` })
  }
  tabs.push({ key: 'history', label: 'History' })
  return input.panels ? tabs.filter((tab) => input.panels!.includes(tab.key)) : tabs
}

/** Request types whose flow moves money, so their details show receipts. */
export function requestMovesMoney(requestType: unknown, amount?: unknown): boolean {
  const type = String(requestType || '').toLowerCase()
  return (
    /^(finance\.|procurement\.)|requisition|payment|payout|purchase|invoice|quote|salary_advance|expense/.test(type) ||
    (typeof amount === 'number' && amount > 0)
  )
}
