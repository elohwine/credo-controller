import { describe, expect, it } from '@jest/globals'

import { enrolledJobMembers, jobPeopleOptions, selectedJobMember } from '../credo-ui/shared/jobPeople'

describe('job member pickers', () => {
  const clive = {
    userId: 'clive',
    displayName: 'Clive Madande',
    role: 'field_worker',
    status: 'active',
    invitePending: false,
  }

  it('includes an enrolled field worker and excludes pending, inactive and unverified entries', () => {
    const members = [
      clive,
      { ...clive, userId: 'pending', invitePending: true },
      { ...clive, userId: 'inactive', status: 'inactive' },
      { ...clive, userId: 'unknown', invitePending: undefined },
      { ...clive, userId: '' },
    ]
    expect(enrolledJobMembers(members)).toEqual([clive])
    expect(jobPeopleOptions(members)).toEqual([{ value: 'clive', label: 'Clive Madande (field worker)' }])
  })

  it('keeps distinct enrolled people with the same phone and deduplicates repeated member IDs', () => {
    const samePhone = { ...clive, phone: '+447700900000' }
    const other = { ...samePhone, userId: 'other', displayName: 'Other worker' }
    expect(jobPeopleOptions([samePhone, samePhone, other]).map((option) => option.value)).toEqual(['clive', 'other'])
  })

  it('refuses unlisted contacts and pending invite selections without onboarding anyone as a side effect', () => {
    const pending = { ...clive, userId: 'pending', invitePending: true }
    expect(selectedJobMember('clive', [clive, pending])).toBe('clive')
    expect(selectedJobMember('stage-actor', [clive])).toBeUndefined()
    expect(() => selectedJobMember('pending', [clive, pending])).toThrow('completed their invitation')
    expect(() => selectedJobMember('contact:internal:0770000000', [clive])).toThrow('completed their invitation')
  })
})
