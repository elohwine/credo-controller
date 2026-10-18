export interface RelatedWorkLink {
  kind: 'job' | 'request'
  id: string
  label: string
}

export function jobBillingPath(runId: string, linkId?: string): string {
  const params = new URLSearchParams({ tab: 'ar', runId })
  if (linkId) params.set('linkId', linkId)
  return `/finance?${params.toString()}`
}

/** Relationships recorded by the workflow, never inferred from a title or a matching amount. */
export function handoffLinks(value: unknown): RelatedWorkLink[] {
  if (!Array.isArray(value)) return []
  const links = new Map<string, RelatedWorkLink>()
  for (const handoff of value) {
    if (!handoff || typeof handoff !== 'object' || !Array.isArray(handoff.steps)) continue
    for (const step of handoff.steps) {
      if (typeof step?.requestId !== 'string' || !step.requestId || typeof step.label !== 'string') continue
      links.set(step.requestId, { kind: 'request', id: step.requestId, label: step.label })
    }
  }
  return [...links.values()]
}

export function requestEventLinks(
  family: unknown,
  currentId: string,
  eventType: string,
  childId?: unknown,
): RelatedWorkLink[] {
  const links = familyLinks(family, currentId)
  if (eventType === 'request.handoff') return links.filter((link) => link.kind === 'request' && link.id === childId)
  if (eventType !== 'request.created' || !family || typeof family !== 'object') return []
  const value = family as { chain?: unknown; parent?: unknown; root?: unknown }
  const chain = Array.isArray(value.chain) ? value.chain : []
  const index = chain.findIndex((member) => member?.id === currentId)
  return familyLinks({ ...value, chain: index >= 0 ? chain.slice(0, index) : [] }, currentId)
}

export function handoffLinksForStep(value: unknown, step: string): RelatedWorkLink[] {
  if (!Array.isArray(value)) return []
  const key =
    step === 'receipt' ? 'field_buy_materials' : step === 'site_inspection' ? 'field_quote_extra_work' : undefined
  return key ? handoffLinks(value.filter((handoff) => handoff?.key === key)) : []
}

export function familyLinks(value: unknown, currentId: string): RelatedWorkLink[] {
  if (!value || typeof value !== 'object') return []
  const family = value as { chain?: unknown; parent?: unknown; root?: unknown }
  const members = [...(Array.isArray(family.chain) ? family.chain : []), family.parent, family.root]
  const links = new Map<string, RelatedWorkLink>()
  for (const member of members) {
    if (
      !member ||
      typeof member !== 'object' ||
      !('kind' in member) ||
      (member.kind !== 'job' && member.kind !== 'request') ||
      !('id' in member) ||
      typeof member.id !== 'string' ||
      !member.id ||
      member.id === currentId ||
      !('label' in member) ||
      typeof member.label !== 'string'
    )
      continue
    links.set(`${member.kind}:${member.id}`, { kind: member.kind, id: member.id, label: member.label })
  }
  return [...links.values()]
}
