import { describe, expect, it } from '@jest/globals'

import { suggestOrgSetup } from '../orgModules'
import {
  editionAllowsKind,
  editionAllowsModule,
  editionAlwaysOn,
  editionHasPresetSetup,
  editionPresetSetup,
  PRODUCT_NAME,
  withEditionModules,
} from '../productEdition'

describe('SGK product edition', () => {
  it('offers jobs, the team, and the modules a job uses', () => {
    expect(PRODUCT_NAME).toBe('LDK iFacilities')
    expect(editionAllowsKind('field')).toBe(true)
    expect(editionAllowsModule('field_jobs')).toBe(true)
    expect(editionAllowsModule('purchases')).toBe(true)
    expect(editionAllowsModule('payables')).toBe(true)
    expect(editionAllowsModule('collections')).toBe(true)
    expect(editionAllowsModule('people_payroll')).toBe(true)
  })

  it('does not offer school fees, the shop, or an office-only setup', () => {
    expect(editionAllowsKind('school')).toBe(false)
    expect(editionAllowsKind('shop')).toBe(false)
    expect(editionAllowsKind('office')).toBe(false)
    expect(editionAllowsModule('school_fees')).toBe(false)
    expect(editionAllowsModule('commerce')).toBe(false)
    expect(suggestOrgSetup(['school', 'shop', 'field'], 'internal').map((item) => item.id)).toEqual([
      'field_jobs',
      'purchases',
      'payables',
      'collections',
      'people_payroll',
    ])
  })

  it('runs a preset setup, so nobody answers the setup questions', () => {
    expect(editionHasPresetSetup()).toBe(true)
    expect(editionPresetSetup()).toEqual({
      kinds: ['field'],
      modules: ['field_jobs', 'purchases', 'payables', 'collections', 'people_payroll'],
    })
  })

  it('always keeps jobs and the team on, even if an older setup left them off', () => {
    expect(withEditionModules(['purchases'])).toEqual(['purchases', 'field_jobs', 'people_payroll'])
    expect(editionAlwaysOn('field_jobs')).toBe(true)
    expect(editionAlwaysOn('people_payroll')).toBe(true)
    expect(editionAlwaysOn('purchases')).toBe(false)
  })
})
