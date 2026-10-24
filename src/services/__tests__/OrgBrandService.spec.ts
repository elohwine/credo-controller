import Database from 'better-sqlite3'
import { jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { DEFAULT_BRAND_COLOR, normalizeBrandColor, orgBrandService, sanitizeBrandInput } from '../OrgBrandService'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)])
const dataUrl = (bytes: Buffer, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`

describe('OrgBrandService', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync(join(process.cwd(), 'migrations/136_org_brand.sql'), 'utf8'))
    db.exec(`
      CREATE TABLE organization_registry (
        id TEXT, tenant_id TEXT, display_name TEXT, logo_url TEXT, website TEXT, contact_phone TEXT,
        contact_email TEXT, address TEXT, updated_at TEXT
      );
      CREATE TABLE organizations (id TEXT, tenant_id TEXT, name TEXT);
      CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, role TEXT, status TEXT);
    `)
    db.prepare(`INSERT INTO organization_registry (id, tenant_id, display_name, contact_phone) VALUES ('r1', 'org-1', 'Sunrise Builders', '+263771234567')`).run()
    db.prepare(`INSERT INTO org_memberships VALUES ('owner', 'org-1', 'owner', 'active'), ('staff', 'org-1', 'member', 'active')`).run()
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
  })

  afterEach(() => {
    restore.mockRestore()
    db.close()
  })

  it('keeps known fields, trims them and drops malformed values', () => {
    const clean = sanitizeBrandInput({
      displayName: '  Sunrise  ',
      primaryColor: 'abc',
      email: 'not-an-email',
      website: 'sunrise.co.zw',
      invoiceDueDays: '14',
      quoteValidityDays: -3,
      receiptFooter: 'x'.repeat(1000),
      evil: '<script>',
    } as any)
    expect(clean).toEqual({
      displayName: 'Sunrise',
      primaryColor: '#AABBCC',
      website: 'https://sunrise.co.zw',
      invoiceDueDays: 14,
      receiptFooter: 'x'.repeat(400),
    })
    expect(normalizeBrandColor('javascript:red')).toBeUndefined()
  })

  it('starts from the organisation name and public contact details before anything is saved', () => {
    const brand = orgBrandService.current('org-1')
    expect(brand).toMatchObject({
      configured: false,
      displayName: 'Sunrise Builders',
      primaryColor: DEFAULT_BRAND_COLOR,
      phone: '+263771234567',
    })
  })

  it('keeps each change as a version so older documents show the brand they were issued under', () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'))
    orgBrandService.save('org-1', { displayName: 'Sunrise v1', primaryColor: '#111111' }, 'owner')
    jest.setSystemTime(new Date('2025-03-01T00:00:00Z'))
    orgBrandService.save('org-1', { displayName: 'Sunrise v2', primaryColor: '#222222' }, 'owner')
    orgBrandService.save('org-1', { displayName: 'Sunrise v2', primaryColor: '#222222' }, 'owner')
    jest.useRealTimers()

    expect(db.prepare('SELECT COUNT(*) AS n FROM org_brand_versions').get()).toEqual({ n: 2 })
    expect(orgBrandService.current('org-1').displayName).toBe('Sunrise v2')
    expect(orgBrandService.at('org-1', '2025-02-01T00:00:00Z').displayName).toBe('Sunrise v1')
    expect(orgBrandService.at('org-1', '2024-06-01T00:00:00Z').displayName).toBe('Sunrise v1')
  })

  it('accepts real images only, serves them back and points the public profile at the logo', () => {
    expect(() => orgBrandService.saveLogo('org-1', dataUrl(Buffer.from('<svg/>'), 'image/svg+xml'))).toThrow(/PNG, JPEG or WebP/)
    expect(() => orgBrandService.saveLogo('org-1', dataUrl(Buffer.alloc(600 * 1024, 0)))).toThrow(/too large/)

    const brand = orgBrandService.saveLogo('org-1', dataUrl(PNG), 'owner')
    expect(brand.logoHash).toMatch(/^[0-9a-f]{64}$/)
    expect(orgBrandService.logo('org-1', brand.logoHash!)).toMatchObject({ mime: 'image/png' })
    expect(orgBrandService.logo('org-2', brand.logoHash!)).toBeUndefined()
    const registry = db.prepare(`SELECT logo_url FROM organization_registry WHERE tenant_id = 'org-1'`).get() as any
    expect(registry.logo_url).toContain(`/api/public/orgs/org-1/brand/logo/${brand.logoHash}`)

    const removed = orgBrandService.removeLogo('org-1', 'owner')
    expect(removed.logoHash).toBeUndefined()
    expect((db.prepare(`SELECT logo_url FROM organization_registry`).get() as any).logo_url).toBeNull()
  })

  it('lets only owners and admins change the brand', () => {
    expect(() => orgBrandService.assertManager('owner', 'org-1')).not.toThrow()
    expect(() => orgBrandService.assertManager('staff', 'org-1')).toThrow(/owners\/admins/)
    expect(() => orgBrandService.assertManager('stranger', 'org-1')).toThrow(/Not a member/)
  })
})
