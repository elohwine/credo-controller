import 'reflect-metadata'

import { OrganizationService } from '../OrganizationService'

describe('member contact names', () => {
  const service = new OrganizationService(undefined as any) as any

  it('treats the wallet default label as a placeholder, not a name', () => {
    expect(OrganizationService.cleanPersonName('Personal wallet')).toBeUndefined()
    expect(OrganizationService.cleanPersonName('Tatenda Moyo')).toBe('Tatenda Moyo')
  })

  it('replaces a stored placeholder with the name on the identity card', () => {
    expect(service.memberContactName('owner', 'Tatenda Moyo', 'Personal wallet')).toBe('Tatenda Moyo')
  })

  it('never keeps the wallet label when no identity name is known', () => {
    expect(service.memberContactName('owner', undefined, 'Personal wallet')).toBe('Organization owner')
    expect(service.memberContactName('field_worker', undefined, 'Personal wallet')).toBe('Team member')
  })

  it('keeps a real name the team saved', () => {
    expect(service.memberContactName('field_worker', undefined, 'Farai Ncube')).toBe('Farai Ncube')
  })
})
