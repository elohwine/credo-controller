import { describe, expect, test } from '@jest/globals'

import { keyBelongsToAccount, queryKeys, sessionScope } from '../credo-ui/mobile/lib/queries/keys'
import { useUiStore } from '../credo-ui/mobile/lib/state/ui'
import { useSyncStore } from '../credo-ui/mobile/lib/state/sync'
import { useActivityStore } from '../credo-ui/mobile/lib/state/activity'

describe('mobile shared state', () => {
  test('cached answers are filed per account and context', () => {
    const personal = sessionScope('acc-1', 'personal', null)
    const org = sessionScope('acc-1', 'org', 'org-9')
    const other = sessionScope('acc-2', 'org', 'org-9')
    expect(personal).toBe('acc-1|personal')
    expect(org).toBe('acc-1|org:org-9')
    expect(new Set([personal, org, other]).size).toBe(3)
    // Organisation mode without an organisation is the personal context.
    expect(sessionScope('acc-1', 'org', null)).toBe(personal)
    expect(sessionScope(null, 'personal', null)).toBe('signed-out|personal')

    expect(queryKeys.inbox(org)).toEqual(['acc-1|org:org-9', 'inbox'])
    expect(queryKeys.fieldRuns(org)).toEqual(['acc-1|org:org-9', 'field-runs', 'all'])
    expect(queryKeys.fieldRun(org, 'run-1')).toEqual(['acc-1|org:org-9', 'field-run', 'run-1'])
  })

  test('signing one account out only matches that account', () => {
    expect(keyBelongsToAccount(queryKeys.inbox('acc-1|personal'), 'acc-1')).toBe(true)
    expect(keyBelongsToAccount(queryKeys.home('acc-1|org:x'), 'acc-1')).toBe(true)
    expect(keyBelongsToAccount(queryKeys.inbox('acc-10|personal'), 'acc-1')).toBe(false)
    expect(keyBelongsToAccount(queryKeys.inbox('acc-2|personal'), 'acc-1')).toBe(false)
    expect(keyBelongsToAccount(['no-scope'], 'acc-1')).toBe(false)
  })

  test('only the screen that is still showing can be cleared by its owner', () => {
    const ui = useUiStore.getState()
    ui.block({ key: 'open-job', title: 'Opening the job…' })
    expect(useUiStore.getState().blocking?.key).toBe('open-job')
    useUiStore.getState().unblock('switch-org')
    expect(useUiStore.getState().blocking?.key).toBe('open-job')
    useUiStore.getState().unblock('open-job')
    expect(useUiStore.getState().blocking).toBeNull()
  })

  test('server-call counter never goes below zero', () => {
    const sync = useSyncStore.getState()
    sync.requestStarted()
    sync.requestStarted()
    expect(useSyncStore.getState().inflight).toBe(2)
    useSyncStore.getState().requestEnded()
    useSyncStore.getState().requestEnded()
    useSyncStore.getState().requestEnded()
    expect(useSyncStore.getState().inflight).toBe(0)
  })

  test('activity count is kept per scope and forgotten per account', () => {
    const activity = useActivityStore.getState()
    activity.setInboxNew('acc-1|personal', 3)
    activity.setInboxNew('acc-1|org:x', 2.7)
    activity.setInboxNew('acc-2|personal', -4)
    expect(useActivityStore.getState().inboxNewByScope).toEqual({
      'acc-1|personal': 3,
      'acc-1|org:x': 2,
      'acc-2|personal': 0,
    })
    useActivityStore.getState().forgetScopePrefix('acc-1|')
    expect(useActivityStore.getState().inboxNewByScope).toEqual({ 'acc-2|personal': 0 })
  })
})
