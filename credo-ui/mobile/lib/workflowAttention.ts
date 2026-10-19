import { stepRequiredLabel } from './uxCopy'

interface WorkflowAttentionOffer {
  id?: string
  offerId?: string
  title?: string
  body?: string
  issuerName?: string
  claims?: {
    stageAction?: string
    requiredAction?: string
    workflowStage?: string
    pauseReason?: string
    reference?: string
    jobReference?: string
    description?: string
    orgName?: string
  }
}

export function workflowAttentionPreview(offer: WorkflowAttentionOffer): {
  title: string
  summary: string
  route: string
} {
  const claims = offer.claims || {}
  const storedTitle = String(offer.title || '').trim()
  const specificTitle = storedTitle && !/^(workflow action|workflow stage action)$/i.test(storedTitle)
  const action = stepRequiredLabel(claims)
  const reference = String(claims.jobReference || claims.reference || '').trim()
  const title = specificTitle ? storedTitle : [action || 'Review workflow item', reference].filter(Boolean).join(' · ')
  const organisation = String(offer.issuerName || claims.orgName || '').trim()
  const detail = String(claims.description || offer.body || '').trim()
  const id = offer.id || offer.offerId
  return {
    title,
    summary: [organisation, detail].filter(Boolean).join(' · ') || 'Open this item to see the next step.',
    route: id ? `/inbox?item=${encodeURIComponent(id)}` : '/inbox',
  }
}
