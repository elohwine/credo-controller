import { describe, expect, it } from '@jest/globals'

import * as mobile from '../../../credo-ui/mobile/lib/workflowCapabilities'
import * as portal from '../../../credo-ui/portal/lib/workflowCapabilities'
import * as mobileCopy from '../../../credo-ui/mobile/lib/uxCopy'
import * as mobileSteps from '../../../credo-ui/mobile/lib/nextSteps'
import * as portalSteps from '../../../credo-ui/portal/lib/nextSteps'
import * as portalStages from '../../../credo-ui/portal/components/finance/financeStages'

describe('workflow centre classification', () => {
  const cases: Array<[Parameters<typeof portal.classifyBusinessCentre>[0], string, string[]]> = [
    [{ workflowType: 'field_execution_fept' }, 'field_jobs', ['receivables', 'payables', 'payments', 'fulfilment']],
    [{ requestType: 'procurement.requisition' }, 'purchases', ['payables', 'payments', 'fulfilment']],
    [{ workflowType: 'education_fee_payment' }, 'school_fees', ['receivables', 'payments']],
    [{ workflowType: 'ecommerce_delivery' }, 'commerce', ['receivables', 'payments', 'fulfilment']],
    [{ requestType: 'hr.leave' }, 'people', []],
    [{ workflowType: 'tpl-payroll-reporting' }, 'people', ['payables', 'payments']],
    [{ workflowType: 'payment_collection' }, 'standalone_collection', ['receivables', 'payments']],
  ]

  it.each(cases)('classifies %j by owning centre before shared layers', (input, centre, layers) => {
    expect(portal.classifyBusinessCentre(input)).toEqual({ centre, layers })
    expect(mobile.classifyBusinessCentre(input)).toEqual({ centre, layers })
  })

  it('keeps enabled centre navigation identical on portal and phone', () => {
    const templates = [
      { workflowType: 'field_execution_fept' },
      { workflowType: 'education_fee_payment' },
      { workflowType: 'hr_requests' },
      { workflowType: 'accounts-receivable' },
    ]
    const portalFlags = portal.getWorkflowCapabilityFlags(templates)
    const mobileFlags = mobile.getWorkflowCapabilityFlags(templates)
    expect(portalFlags).toEqual(mobileFlags)
    expect(portal.enabledBusinessCentres(portalFlags)).toEqual([
      'purchases',
      'field_jobs',
      'school_fees',
      'people',
      'standalone_collection',
    ])
    expect(mobile.enabledBusinessCentres(mobileFlags)).toEqual(portal.enabledBusinessCentres(portalFlags))
  })

  it('opens setup-driven centres even before template metadata is loaded', () => {
    const emptyFlags = portal.getWorkflowCapabilityFlags([])
    expect(portal.enabledBusinessCentres(emptyFlags, ['field', 'school', 'shop'])).toEqual([
      'purchases',
      'field_jobs',
      'school_fees',
      'commerce',
    ])
    expect(mobile.enabledBusinessCentres(emptyFlags, ['field', 'school', 'shop'])).toEqual(
      portal.enabledBusinessCentres(emptyFlags, ['field', 'school', 'shop']),
    )
  })
})

describe('school fee progress', () => {
  const feeSteps = [
    { action: 'client.request_payment', config: { kind: 'invoice', transactionType: 'fee_assessment' } },
  ]
  const waiting = {
    workflowId: 'education_fee_payment-org-1',
    status: 'paused',
    input: { studentName: 'Tatenda Moyo', term: 'Term 3 2026' },
    output: { clientBill: { status: 'sent', instalments: 3, sentAt: '2026-10-12T10:00:00.000Z' } },
    actionsSnapshot: feeSteps,
  }
  const paid = {
    ...waiting,
    status: 'completed',
    output: {
      clientBill: { status: 'paid', instalments: 1 },
      payment: { status: 'completed' },
      issuedCredentials: { SchoolFeeReceiptVC: { issuedAt: '2026-10-12T11:00:00.000Z' } },
    },
  }

  it('reads progress from the run, the same on portal and phone', () => {
    for (const run of [
      waiting,
      paid,
      {
        ...waiting,
        status: 'completed',
        output: { clientBill: { status: 'not_sent', reason: 'No client phone on the job' } },
      },
    ]) {
      expect(mobileCopy.schoolFeeProgress(run)).toEqual(portalStages.schoolFeeProgress(run))
      expect(mobileCopy.schoolFeeStatusWords(run)).toEqual(portalStages.schoolFeeStatusWords(run))
      expect(mobileCopy.schoolFeeTitle(run)).toEqual(portalStages.schoolFeeTitle(run))
    }
    expect(portalStages.schoolFeeProgress(waiting).map((step) => [step.label, step.status])).toEqual([
      ['Fee set', 'done'],
      ['Pay link sent to parent', 'done'],
      ['First instalment paid (1 of 3)', 'active'],
      ['Receipt kept', 'pending'],
    ])
    expect(portalStages.schoolFeeStatusWords(waiting).label).toBe('Waiting for the parent to pay')
    expect(portalStages.schoolFeeProgress(paid).every((step) => step.status === 'done')).toBe(true)
    expect(portalStages.schoolFeeTitle(waiting)).toBe('Tatenda Moyo · Term 3 2026')
    const withPayer = { ...paid, input: { ...paid.input, payerName: 'Rudo Moyo' } }
    expect(portalStages.schoolFeeProgress(withPayer).find((step) => step.key === 'PAID')?.by).toBe('Rudo Moyo (parent)')
    expect(mobileCopy.schoolFeeProgress(withPayer)).toEqual(portalStages.schoolFeeProgress(withPayer))
    for (const link of [{ sector: 'education' }, { sector: 'general' }, undefined]) {
      expect(mobileCopy.moneyInKindWord(link)).toBe(portalStages.moneyInKindWord(link))
    }
    expect(portalStages.moneyInKindWord({ sector: 'education' })).toBe('School fee')
    expect(
      mobileCopy.actorsForWorkflow(
        [{ workflowType: 'education_fee_payment', stages: [{ stageAction: 'issue_receipt_vc' }] }],
        ['school', 'fee'],
      ),
    ).toHaveLength(1)
  })

  it('picks fee runs out of the run list on both apps', () => {
    const fieldJob = { workflowId: 'tpl-fept-field-execution-org-1', input: { reference: 'FR-1' }, actionsSnapshot: [] }
    expect(portalStages.isSchoolFeeRun(waiting)).toBe(true)
    expect(portalStages.isSchoolFeeRun(fieldJob)).toBe(false)
    expect(mobileCopy.isSchoolFeeRun(waiting)).toBe(true)
    expect(mobileCopy.isSchoolFeeRun(fieldJob)).toBe(false)
  })

  it('writes the same next-step card on both apps', () => {
    const items = [
      {
        id: '1',
        kind: 'inbox' as const,
        title: 'Sign off the job',
        detail: 'Open your inbox to do this.',
        href: 'inbox' as const,
      },
      {
        id: '2',
        kind: 'setup' as const,
        title: 'Who releases money',
        detail: 'Open setup to finish this.',
        href: 'setup' as const,
      },
    ]
    const phone = mobileSteps.nextStepCard(items, 'phone')
    const portal = portalSteps.nextStepCard(items, 'portal')
    expect(phone?.sentence).toBe(portal?.sentence)
    expect(phone?.sentence).toBe('Sign off the job')
    expect(phone?.href).toBe('/inbox')
    expect(portal?.href).toBe('/inbox')
    expect(phone?.moreLabel).toBe('and 1 more')
    expect(mobileSteps.nextStepCard([], 'phone')).toBeNull()
    expect(portalSteps.nextStepCard([{ ...items[1] }], 'portal')?.sentence).toBe('Finish setup: Who releases money')
    expect(portalSteps.nextStepCard([{ ...items[1] }], 'portal')?.href).toBe('/organization/setup')
    expect(mobileSteps.nextStepCard([{ ...items[1] }], 'phone')?.href).toBe('/settings/org')
  })
})
