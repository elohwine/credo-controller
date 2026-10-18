import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import {
  beginTaskContext,
  bindTaskPath,
  clearTaskContext,
  endTaskContext,
  getTaskContext,
} from '../credo-ui/mobile/lib/auth'
import {
  isBoundTaskPath,
  isInitialTaskPath,
  captureOrganizationSwitchContext,
  registerLinkedTaskPath,
  readInboxTask,
  TASK_CONTEXT_KEY,
  TASK_CONTEXT_MAX_AGE_MS,
  type InboxTaskContext,
} from '../credo-ui/shared/taskContext'
import { jobBillingPath } from '../credo-ui/shared/relatedWork'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      sessionStorage,
      dispatchEvent: () => true,
    },
  })
  storage.setItem('credoContextMode', 'org')
  storage.setItem('credoActiveOrg', JSON.stringify({ orgTenantId: 'org-a' }))
  storage.setItem(
    'credoOrgToken',
    `header.${Buffer.from(JSON.stringify({ tenantId: 'org-a' })).toString('base64url')}.signature`,
  )
})
afterEach(() => {
  jest.restoreAllMocks()
  for (const key of ['localStorage', 'sessionStorage', 'window']) Reflect.deleteProperty(globalThis, key)
})

describe('shared item-scoped routing contract', () => {
  const task: InboxTaskContext = {
    orgId: 'org-a',
    returnTo: '/inbox',
    startedAt: 1,
    target: '/finance?tab=field&runId=job-a',
  }
  test('explicit linked navigation preserves the parent without opening unrelated organisation pages', () => {
    const parent = { ...task, startedAt: Date.now() }
    const child = '/finance?tab=requisitions&requestId=purchase-a&source=platform'
    storage.setItem(TASK_CONTEXT_KEY, JSON.stringify(parent))
    expect(isBoundTaskPath(parent, child)).toBe(false)
    registerLinkedTaskPath(storage, parent.target, child, [child])
    const linked = readInboxTask(storage)!
    expect(isBoundTaskPath(linked, child)).toBe(true)
    expect(isBoundTaskPath(linked, parent.target)).toBe(true)
    expect(linked.startedAt).toBe(parent.startedAt)
    expect(linked.returnTo).toBe('/inbox')
    for (const path of [
      '/finance?tab=requisitions',
      '/finance?tab=requisitions&requestId=other',
      `${child}&runId=other`,
      '/settings',
      '/finance?tab=field&runId=other',
    ]) {
      expect(isBoundTaskPath(linked, path)).toBe(false)
    }
  })
  test('unlinked, cross-organisation, expired and stale-source navigation cannot extend the task', () => {
    const parent = { ...task, startedAt: Date.now() }
    const child = '/finance?tab=requisitions&requestId=purchase-a'
    storage.setItem(TASK_CONTEXT_KEY, JSON.stringify(parent))
    expect(() => registerLinkedTaskPath(storage, parent.target, child, [])).toThrow('not linked')
    expect(() => registerLinkedTaskPath(storage, '/finance?runId=other', child, [child])).toThrow('not linked')
    const otherOrg = `${child}&orgTenantId=org-b`
    expect(() => registerLinkedTaskPath(storage, parent.target, otherOrg, [otherOrg])).toThrow('not linked')
    storage.setItem(TASK_CONTEXT_KEY, JSON.stringify({ ...parent, startedAt: Date.now() - TASK_CONTEXT_MAX_AGE_MS }))
    expect(() => registerLinkedTaskPath(storage, parent.target, child, [child])).toThrow('not linked')
    expect(readInboxTask(storage)?.linkedTargets).toBeUndefined()
  })
  test('billing admits only the recorded job and link, preserving return and reload scope', () => {
    const parent = { ...task, startedAt: Date.now() }
    const billing = jobBillingPath('job-a', 'link-a')
    storage.setItem(TASK_CONTEXT_KEY, JSON.stringify(parent))
    expect(isBoundTaskPath(parent, billing)).toBe(false)
    registerLinkedTaskPath(storage, parent.target, billing, [billing])
    const restored = readInboxTask(storage)!
    expect(restored.startedAt).toBe(parent.startedAt)
    expect(restored.returnTo).toBe('/inbox')
    expect(isBoundTaskPath(restored, billing)).toBe(true)
    expect(isBoundTaskPath(restored, '/finance/job-cards?runId=job-a')).toBe(true)
    for (const path of [
      '/finance?tab=ar',
      jobBillingPath('job-b', 'link-a'),
      jobBillingPath('job-a', 'link-b'),
      `${billing}&orgTenantId=org-b`,
      `${billing}&linkId=other`,
      `${billing}&transactionId=other`,
      '/finance?tab=ap&runId=job-a',
    ])
      expect(isBoundTaskPath(restored, path)).toBe(false)
    expect(jobBillingPath('job/a', 'link/b')).toBe('/finance?tab=ar&runId=job%2Fa&linkId=link%2Fb')
  })
  test('malformed linked markers fail closed', () => {
    for (const linkedTargets of [['/settings'], ['/finance?runId=x&orgTenantId=org-b'], 'all', [null]]) {
      storage.setItem(TASK_CONTEXT_KEY, JSON.stringify({ ...task, linkedTargets }))
      expect(readInboxTask(storage)).toBeNull()
    }
  })
  test('portal request aliases stay bound to one admitted child across reload', () => {
    const parent = { ...task, startedAt: Date.now() }
    const child = '/requests?requestId=purchase-a'
    storage.setItem(TASK_CONTEXT_KEY, JSON.stringify(parent))
    registerLinkedTaskPath(storage, parent.target, child, [child])
    const restored = readInboxTask(storage)!
    expect(isBoundTaskPath(restored, '/requests?request=purchase-a')).toBe(true)
    expect(isBoundTaskPath(restored, parent.target)).toBe(true)
    for (const path of [
      '/requests',
      '/requests?request=other',
      '/requests?request=purchase-a&requestId=other',
      '/requests?request=purchase-a&runId=other',
      '/requests?requestId=purchase-a&tab=ap',
    ])
      expect(isBoundTaskPath(restored, path)).toBe(false)
  })
  test('allows the same job and its photo page, not the whole finance area or another job', () => {
    expect(isBoundTaskPath(task, '/finance/?tab=field&runId=job-a')).toBe(true)
    expect(isBoundTaskPath(task, '/finance/job-cards?runId=job-a')).toBe(true)
    expect(isBoundTaskPath(task, '/activity?ref=job-a&capture=1')).toBe(true)
    for (const path of [
      '/finance',
      '/finance/reports',
      '/finance?runId=job-b',
      '/activity?ref=job-b',
      '/settings',
      '/inbox',
    ]) {
      expect(isBoundTaskPath(task, path)).toBe(false)
    }
  })

  describe('organisation switch response ownership', () => {
    test.each(['walletToken', 'credoActiveOrg', 'credoContextMode', TASK_CONTEXT_KEY])(
      'rejects a delayed switch after %s changes without overwriting the new choice',
      (key) => {
        const assertCurrent = captureOrganizationSwitchContext(storage)
        expect(assertCurrent.isCurrent()).toBe(true)
        storage.setItem(key, 'new-choice')
        expect(assertCurrent.isCurrent()).toBe(false)
        expect(assertCurrent).toThrow('account or task changed')
        expect(storage.getItem(key)).toBe('new-choice')
      },
    )

    test('allows an unchanged initiating context', () => {
      const assertCurrent = captureOrganizationSwitchContext(storage)
      expect(assertCurrent.isCurrent()).toBe(true)
      expect(assertCurrent).not.toThrow()
    })

    test('the shared switch check also rejects context changes while consent is open', () => {
      const assertCurrent = captureOrganizationSwitchContext(storage)
      storage.setItem('credoContextMode', 'personal')
      expect(assertCurrent).toThrow('account or task changed')
    })
  })

  test('adding another item or changing tabs cannot escape the target binding', () => {
    expect(isBoundTaskPath(task, '/finance?tab=field&runId=job-a&transactionId=other')).toBe(false)
    expect(isBoundTaskPath(task, '/finance?tab=ap&runId=job-a')).toBe(false)
  })

  test.each([
    '/activity?ref=job-a&transactionId=other',
    '/activity?ref=job-a&runId=job-b',
    '/finance/job-cards?tab=ap&runId=job-a',
    '/finance?tab=field&runId=job-a&runId=job-b',
    '/present?request_uri=proof&workflowRunId=job-a&workflowRunId=job-b',
    '/present?request_uri=proof&workflowRunId=job-a&invoiceRef=other',
  ])('rejects conflicting task identifiers on %s', (path) => {
    expect(isBoundTaskPath(task, path)).toBe(false)
  })

  test('payment and requisition detail links cannot introduce another item', () => {
    const invoice = { ...task, target: '/finance?tab=invoices&paymentCode=payment-a&invoiceRef=invoice-a' }
    expect(isBoundTaskPath(invoice, '/pay/payment-a?runId=job-b')).toBe(false)
    expect(isBoundTaskPath(invoice, '/pay/payment-a?invoiceRef=invoice-b')).toBe(false)
    const requisition = { ...task, target: '/finance?tab=requisitions&requisitionId=req-a' }
    expect(isBoundTaskPath(requisition, '/finance/requisitions/req-a?requisitionId=req-b')).toBe(false)
  })

  test('initial tasks reject duplicate parameters and conflicting run aliases', () => {
    expect(isInitialTaskPath('/finance?runId=job-a&runId=job-b')).toBe(false)
    expect(isInitialTaskPath('/finance?runId=job-a&workflowRunId=job-b')).toBe(false)
    expect(isInitialTaskPath('/finance?runId=job-a&workflowRunId=job-a')).toBe(true)
  })

  test('checkout paths remain scoped to their own payment code', () => {
    beginTaskContext({ orgId: 'org-a' })
    expect(bindTaskPath('/pay/payment-a?orgTenantId=org-a')).toBe(true)
    expect(bindTaskPath('/pay/payment-b?orgTenantId=org-a')).toBe(false)
    const invoice = { ...task, target: '/finance?tab=invoices&paymentCode=payment-a&invoiceRef=invoice-a' }
    expect(isBoundTaskPath(invoice, '/pay/payment-a?invoiceRef=invoice-a')).toBe(true)
    expect(isBoundTaskPath(invoice, '/pay/payment-b?invoiceRef=invoice-a')).toBe(false)
  })

  test('wallet proof navigation keeps the same job and organization', () => {
    expect(
      isBoundTaskPath(task, '/present?request_uri=proof&workflowRunId=job-a&requestId=session-a&orgTenantId=org-a'),
    ).toBe(true)
    expect(isBoundTaskPath(task, '/present?request_uri=proof&workflowRunId=job-b')).toBe(false)
    expect(isBoundTaskPath(task, '/present?request_uri=proof&workflowRunId=job-a&orgTenantId=org-b')).toBe(false)
    expect(isBoundTaskPath(task, '/present?request_uri=proof&workflowRunId=job-a&transactionId=other')).toBe(false)
    expect(isBoundTaskPath(task, '/present?workflowRunId=job-a')).toBe(false)
  })

  test('portal wallet review admits only an approval proof for the same item and organization', () => {
    const proof =
      '/wallet?mode=approval&presentationRequestRef=vp-review-1&workflowRunId=job-a&requestId=session-a&orgTenantId=org-a'
    expect(isBoundTaskPath(task, proof)).toBe(true)
    expect(
      isBoundTaskPath(
        task,
        proof.replace(
          'presentationRequestRef=vp-review-1',
          'presentationRequestUrl=openid4vp%3A%2F%2Fauthorize%3Frequest_uri%3Dproof',
        ),
      ),
    ).toBe(true)
    for (const path of [
      '/wallet',
      proof.replace('mode=approval', 'mode=share'),
      proof.replace('workflowRunId=job-a', 'workflowRunId=job-b'),
      proof.replace('orgTenantId=org-a', 'orgTenantId=org-b'),
      proof.replace('&orgTenantId=org-a', ''),
      proof.replace('presentationRequestRef=vp-review-1&', ''),
      `${proof}&presentationRequestRef=other`,
      `${proof}&mode=other`,
      `${proof}&transactionId=other`,
      `${proof}&presentationRequestUrl=other`,
    ])
      expect(isBoundTaskPath(task, path)).toBe(false)
    const requisition = { ...task, target: '/finance?tab=requisitions&requisitionId=req-a' }
    expect(isBoundTaskPath(requisition, proof.replace('workflowRunId=job-a', 'requisitionId=req-a'))).toBe(true)
    expect(isInitialTaskPath(proof)).toBe(false)
  })

  test('requisition proof and scanner use the business ID, not the proof session ID', () => {
    const requisition = { ...task, target: '/finance?tab=requisitions&requisitionId=req-a&requestId=legacy-a' }
    expect(isBoundTaskPath(requisition, '/present?request_uri=proof&requisitionId=req-a&requestId=session-a')).toBe(
      true,
    )
    expect(isBoundTaskPath(requisition, '/scan?mode=approve-requisition&requisitionId=req-a')).toBe(true)
    expect(isBoundTaskPath(requisition, '/scan?mode=approve-requisition&requisitionId=req-b')).toBe(false)
    expect(isBoundTaskPath(requisition, '/finance/requisitions/req-a')).toBe(true)
    expect(isBoundTaskPath(requisition, '/finance/requisitions/req-b')).toBe(false)
  })

  test('an initial navigation must name an item', () => {
    beginTaskContext({ orgId: 'org-a' })
    expect(bindTaskPath('/finance')).toBe(false)
    expect(bindTaskPath('/finance?runId=job-a')).toBe(true)
    expect(getTaskContext()?.target).toBe('/finance?runId=job-a')
    expect(bindTaskPath('/finance?runId=job-b')).toBe(false)
  })

  test('expiry restores personal context, rather than forgetting only the task marker', () => {
    beginTaskContext({ orgId: 'org-a', target: '/finance?runId=job-a' })
    const current = getTaskContext()!
    storage.setItem(TASK_CONTEXT_KEY, JSON.stringify({ ...current, startedAt: Date.now() - TASK_CONTEXT_MAX_AGE_MS }))
    expect(getTaskContext()).toBeNull()
    expect(storage.getItem('credoContextMode')).toBe('personal')
    expect(storage.getItem('credoOrgToken')).toBeNull()
  })

  test('reload reads the shared marker and finishing clears the shared organisation context', () => {
    beginTaskContext({ orgId: 'org-a', target: '/finance?runId=job-a' })
    expect(storage.getItem(TASK_CONTEXT_KEY)).not.toBeNull()
    expect(getTaskContext()?.orgId).toBe('org-a')
    expect(endTaskContext()).toBe('/inbox')
    expect(storage.getItem('credoOrgToken')).toBeNull()
    expect(storage.getItem(TASK_CONTEXT_KEY)).toBeNull()
  })

  test('malformed markers fail back to personal and cannot redirect to arbitrary destinations', () => {
    storage.setItem(TASK_CONTEXT_KEY, '{"orgId":"org-a","returnTo":"https://elsewhere.example"}')
    expect(getTaskContext()).toBeNull()
    expect(storage.getItem('credoContextMode')).toBe('personal')
  })

  test('a manual context choice clears the marker without reverting the chosen organisation', () => {
    beginTaskContext({ orgId: 'org-a' })
    clearTaskContext()
    expect(getTaskContext()).toBeNull()
    expect(storage.getItem('credoContextMode')).toBe('org')
  })
})
