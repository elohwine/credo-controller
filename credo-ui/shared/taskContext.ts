export const TASK_CONTEXT_KEY = 'credoTaskContext'
export const TASK_CONTEXT_MAX_AGE_MS = 2 * 60 * 60 * 1000

export function captureOrganizationSwitchContext(storage: Storage) {
  const keys = [
    'walletToken',
    'authToken',
    'auth.token',
    'tenantToken',
    'credoTenantToken',
    'tenantId',
    'credoTenantId',
    'credoOrgToken',
    'credoActiveOrg',
    'credoContextMode',
    TASK_CONTEXT_KEY,
  ]
  const before = keys.map((key) => storage.getItem(key))
  const isCurrent = () => keys.every((key, index) => storage.getItem(key) === before[index])
  const assertCurrent = () => {
    if (!isCurrent()) {
      throw new Error('Your account or task changed. Open the inbox item again to continue.')
    }
  }
  return Object.assign(assertCurrent, { isCurrent })
}

export interface InboxTaskContext {
  orgId: string
  returnTo: '/inbox'
  startedAt: number
  target?: string
  linkedTargets?: string[]
}

const ITEM_KEYS = [
  'runId',
  'requisitionId',
  'requestId',
  'request',
  'transactionId',
  'planId',
  'paymentCode',
  'linkId',
  'invoiceRef',
  'code',
]

export function taskUrl(value: string): URL {
  return new URL(value, 'https://task.invalid')
}

function hasAmbiguousTaskParameters(url: URL): boolean {
  const runId = url.searchParams.get('runId')
  const workflowRunId = url.searchParams.get('workflowRunId')
  return (
    Boolean(
      url.searchParams.has('request') &&
        url.searchParams.has('requestId') &&
        url.searchParams.get('request') !== url.searchParams.get('requestId'),
    ) ||
    Boolean(runId && workflowRunId && runId !== workflowRunId) ||
    [
      ...ITEM_KEYS,
      'workflowRunId',
      'orgTenantId',
      'tab',
      'ref',
      'request_uri',
      'mode',
      'presentationRequestRef',
      'presentationRequestUrl',
      'proofStage',
      'returnTo',
    ].some((key) => url.searchParams.getAll(key).length > 1)
  )
}

export function isInitialTaskPath(value: string): boolean {
  const url = taskUrl(value)
  if (url.origin !== 'https://task.invalid' || hasAmbiguousTaskParameters(url)) return false
  const path = url.pathname.replace(/\/+$/, '')
  if (/^\/pay\/[^/]+$/.test(path)) return true
  if (path === '/present') return Boolean(url.searchParams.get('request_uri'))
  if (path === '/pay') return Boolean(url.searchParams.get('code') || url.searchParams.get('paymentCode'))
  if (path === '/requests') return Boolean(url.searchParams.get('requestId') || url.searchParams.get('request'))
  return (
    ['/finance', '/finance/job-cards'].includes(path) && ITEM_KEYS.some((key) => Boolean(url.searchParams.get(key)))
  )
}

function isTaskPathForOrganization(value: string, orgId: string): boolean {
  const url = taskUrl(value)
  return (
    isInitialTaskPath(value) && (!url.searchParams.has('orgTenantId') || url.searchParams.get('orgTenantId') === orgId)
  )
}

export function isBoundTaskPath(task: InboxTaskContext, value: string): boolean {
  if (task.linkedTargets?.length) {
    return [task.target, ...task.linkedTargets].some(
      (target) => target && isBoundTaskPath({ ...task, target, linkedTargets: undefined }, value),
    )
  }
  const next = taskUrl(value)
  if (hasAmbiguousTaskParameters(next)) return false
  if (next.searchParams.has('orgTenantId') && next.searchParams.get('orgTenantId') !== task.orgId) return false
  if (!task.target) return isInitialTaskPath(value)
  const original = taskUrl(task.target)
  if (next.origin !== original.origin) return false
  const originalPath = original.pathname.replace(/\/+$/, '')
  const path = next.pathname.replace(/\/+$/, '')
  const walletProof = path === '/wallet' && next.searchParams.get('mode') === 'approval'
  if (path === '/wallet') {
    const proofSources = ['presentationRequestRef', 'presentationRequestUrl', 'request_uri'].filter((key) =>
      Boolean(next.searchParams.get(key)),
    )
    if (!walletProof || next.searchParams.get('orgTenantId') !== task.orgId || proofSources.length !== 1) return false
  }
  const originalRunId = original.searchParams.get('runId') || original.searchParams.get('workflowRunId')
  for (const key of [...ITEM_KEYS, 'workflowRunId']) {
    if (!next.searchParams.has(key)) continue
    // A presentation's requestId identifies its proof session, not the business item.
    if ((path === '/present' || walletProof) && key === 'requestId') continue
    const expected =
      key === 'runId' || key === 'workflowRunId'
        ? originalRunId
        : key === 'request' || key === 'requestId'
          ? original.searchParams.get('requestId') || original.searchParams.get('request')
          : original.searchParams.get(key)
    if (next.searchParams.get(key) !== expected) return false
  }
  const requisitionId = original.searchParams.get('requisitionId')
  if (/^\/pay\/[^/]+$/.test(path) && ['/finance', '/finance/job-cards'].includes(originalPath)) {
    const code =
      original.searchParams.get('paymentCode') ||
      original.searchParams.get('code') ||
      original.searchParams.get('linkId')
    return code !== null && path === `/pay/${encodeURIComponent(code)}`
  }
  if (
    path === '/present' ||
    walletProof ||
    (path === '/scan' && next.searchParams.get('mode') === 'approve-requisition')
  ) {
    if (path === '/present' && !next.searchParams.get('request_uri')) return false
    const nextRunId = next.searchParams.get('runId') || next.searchParams.get('workflowRunId')
    const businessKeys = ['requisitionId', 'transactionId', 'planId', 'paymentCode']
    if (Boolean(originalRunId) && nextRunId === originalRunId) return true
    if (
      businessKeys.some(
        (key) =>
          Boolean(original.searchParams.get(key)) && next.searchParams.get(key) === original.searchParams.get(key),
      )
    )
      return true
    return original.pathname === next.pathname && original.search === next.search
  }
  if (path === '/activity') {
    return (
      Boolean(original.searchParams.get('runId')) && next.searchParams.get('ref') === original.searchParams.get('runId')
    )
  }
  if (requisitionId && path === `/finance/requisitions/${encodeURIComponent(requisitionId)}`) return true
  const originalRequestId = original.searchParams.get('requestId') || original.searchParams.get('request')
  if (originalRequestId && path === '/requests') {
    return (
      (next.searchParams.get('requestId') || next.searchParams.get('request')) === originalRequestId &&
      (!next.searchParams.has('tab') || next.searchParams.get('tab') === 'requisitions')
    )
  }
  if (['/finance', '/finance/job-cards'].includes(path) && ['/finance', '/finance/job-cards'].includes(originalPath)) {
    if (path === '/finance/job-cards' && !originalRunId) return false
    if (
      (original.searchParams.has('tab') || originalRunId) &&
      next.searchParams.has('tab') &&
      next.searchParams.get('tab') !== (original.searchParams.get('tab') || 'field')
    )
      return false
    if (path === originalPath && original.searchParams.has('tab') && !next.searchParams.has('tab')) return false
    return ITEM_KEYS.some(
      (key) => Boolean(original.searchParams.get(key)) && original.searchParams.get(key) === next.searchParams.get(key),
    )
  }
  if (path !== originalPath) return false
  return original.pathname === next.pathname && original.search === next.search
}

export function readInboxTask(storage: Storage): InboxTaskContext | null {
  const raw = storage.getItem(TASK_CONTEXT_KEY)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const task = value as Partial<InboxTaskContext>
    const orgId = task.orgId
    if (
      typeof orgId !== 'string' ||
      !orgId ||
      task.returnTo !== '/inbox' ||
      typeof task.startedAt !== 'number' ||
      !Number.isFinite(task.startedAt) ||
      (task.target !== undefined &&
        (typeof task.target !== 'string' || !isTaskPathForOrganization(task.target, orgId))) ||
      (task.linkedTargets !== undefined &&
        (!task.target ||
          !Array.isArray(task.linkedTargets) ||
          task.linkedTargets.length > 50 ||
          task.linkedTargets.some((path) => typeof path !== 'string' || !isTaskPathForOrganization(path, orgId))))
    )
      return null
    return task as InboxTaskContext
  } catch {
    return null
  }
}

/** Navigation scope only: callers supply links from the current item's authenticated API response. */
export function registerLinkedTaskPath(
  storage: Storage,
  currentPath: string,
  targetPath: string,
  relatedPaths: readonly string[],
): void {
  const task = readInboxTask(storage)
  if (!task?.target) throw new Error('Open the inbox item again before continuing to related work.')
  if (
    Date.now() - task.startedAt >= TASK_CONTEXT_MAX_AGE_MS ||
    task.startedAt > Date.now() ||
    !isBoundTaskPath(task, currentPath) ||
    !relatedPaths.includes(targetPath) ||
    !isTaskPathForOrganization(targetPath, task.orgId)
  ) {
    throw new Error('This item is not linked to the current task. Open it from your inbox.')
  }
  if (isBoundTaskPath(task, targetPath)) return
  const linkedTargets = [...new Set([...(task.linkedTargets || []), targetPath])]
  if (linkedTargets.length > 50) throw new Error('Open this item separately from your inbox to continue.')
  storage.setItem(TASK_CONTEXT_KEY, JSON.stringify({ ...task, linkedTargets }))
}
