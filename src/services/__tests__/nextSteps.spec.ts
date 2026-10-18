import { canSeeSetupSteps, rankNextSteps, type NextStepItem } from '../nextSteps'

const inboxCard: NextStepItem = {
  id: 'card-1',
  kind: 'inbox',
  title: 'Sign off the job',
  detail: 'Open your inbox to do this.',
  href: 'inbox',
}

const setupCard: NextStepItem = {
  id: 'who-releases',
  kind: 'setup',
  title: 'Who releases money',
  detail: 'Open setup to finish this.',
  href: 'setup',
}

describe('rankNextSteps', () => {
  it('puts an inbox card ahead of a setup blocker', () => {
    const items = rankNextSteps({ inbox: [inboxCard], setup: [setupCard], includeSetup: true })
    expect(items.map((item) => item.id)).toEqual(['card-1', 'who-releases'])
  })

  it('hides setup blockers from someone who is not an owner or admin', () => {
    expect(canSeeSetupSteps('field_worker')).toBe(false)
    const items = rankNextSteps({ inbox: [inboxCard], setup: [setupCard], includeSetup: canSeeSetupSteps('member') })
    expect(items).toEqual([inboxCard])
  })

  it('returns an empty list when nothing is waiting', () => {
    expect(rankNextSteps({ inbox: [], setup: [], includeSetup: true })).toEqual([])
  })

  it('keeps at most five', () => {
    const inbox = Array.from({ length: 6 }, (_, index) => ({ ...inboxCard, id: `card-${index}` }))
    expect(rankNextSteps({ inbox, setup: [setupCard], includeSetup: true })).toHaveLength(5)
  })
})
