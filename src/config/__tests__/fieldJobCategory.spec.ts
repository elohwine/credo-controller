import { fieldJobCategory, fieldJobUrgent, isFieldJobRun } from '../fieldJobCategory'

const assigned = { workflowInput: { assigneeId: 'worker-1' } }

describe('fieldJobCategory: arrived on site', () => {
  it('is arrived once arrival proof is in and until the after photos are taken', () => {
    const state = {
      ...assigned,
      workflowStage: 'IN_PROGRESS',
      pauseReason: 'await_site_inspection',
      checkpoints: { arrival: { status: 'completed' } },
    }
    expect(fieldJobCategory({ status: 'paused', output: state })).toBe('arrived')

    const finished = { ...state, pauseReason: 'await_completion_review', evidenceAfter: { evidenceHash: 'h' } }
    expect(fieldJobCategory({ status: 'paused', output: finished })).toBe('active')
  })

  it('counts before photos as arrival when arrival proof is switched off', () => {
    const state = {
      ...assigned,
      workflowStage: 'IN_PROGRESS',
      checkpoints: { arrival: { status: 'waived' } },
      evidenceBefore: { evidenceHash: 'h' },
    }
    expect(fieldJobCategory({ status: 'running', output: state })).toBe('arrived')
  })

  it('is still in progress while waiting for the worker to arrive', () => {
    const state = { ...assigned, workflowStage: 'IN_PROGRESS', pauseReason: 'await_arrival' }
    expect(fieldJobCategory({ status: 'paused', output: state })).toBe('active')
  })

  it('lets a hold or a failed visit win over being on site', () => {
    const onSite = { ...assigned, workflowStage: 'IN_PROGRESS', checkpoints: { arrival: { status: 'completed' } } }
    expect(fieldJobCategory({ status: 'paused', output: { ...onSite, pauseReason: 'await_handoff:materials' } })).toBe(
      'on_hold',
    )
    expect(fieldJobCategory({ status: 'failed', output: onSite })).toBe('failed')
  })

  it('does not use arrival from a failed visit after it has been rebooked', () => {
    const state = {
      ...assigned,
      workflowStage: 'IN_PROGRESS',
      checkpoints: { arrival: { status: 'completed', completedAt: '2026-01-01T10:00:00Z' } },
      failedVisits: [{ status: 'rebooked', rebookedAt: '2026-01-02T10:00:00Z' }],
    }
    expect(fieldJobCategory({ status: 'paused', output: state })).toBe('active')
    expect(
      fieldJobCategory({
      status: 'paused',
      output: { ...state, evidenceBefore: { evidenceHash: 'h', capturedAt: '2026-01-03T10:00:00Z' } },
      }),
    ).toBe('arrived')
    expect(
      fieldJobCategory({
      status: 'paused',
      output: { ...state, failedVisits: [{ status: 'rebooked' }] },
      }),
    ).toBe('active')
  })
})

describe('isFieldJobRun', () => {
  it('lists field workflows and runs already on a job stage, not other workflows', () => {
    expect(isFieldJobRun({ workflowId: 'field-execution' })).toBe(true)
    expect(isFieldJobRun({ workflowId: 'custom', output: { workflowStage: 'COMPLETED' } })).toBe(true)
    expect(isFieldJobRun({ workflowId: 'purchase-request', output: { stage: 'SUBMITTED' } })).toBe(false)
  })
})

describe('fieldJobUrgent', () => {
  it('marks call-outs and imported urgent priorities, not normal ones', () => {
    expect(fieldJobUrgent({ input: { callOut: true } })).toBe(true)
    expect(fieldJobUrgent({ output: { workflowInput: { importedDetails: { priority: 'Emergency' } } } })).toBe(true)
    expect(fieldJobUrgent({ input: { importedDetails: { priority: 'Normal' } } })).toBe(false)
    expect(fieldJobUrgent({ input: { callOut: true, priority: 'Out of hours' } })).toBe(false)
    expect(fieldJobUrgent({ input: {} })).toBe(false)
  })
})
