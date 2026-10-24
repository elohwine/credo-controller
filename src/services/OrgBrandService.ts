import { createHash } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

/**
 * An organisation's brand and the standing wording on its quotes, invoices and receipts.
 * Every change is kept as a new version so a document can be shown with the brand it was issued under.
 */
export interface OrgBrandProfile {
  displayName: string
  primaryColor: string
  logoHash?: string
  logoUrl?: string
  tagline?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  registrationNumber?: string
  taxNumber?: string
  vatNumber?: string
  bankDetails?: string
  mobileMoney?: string
  quoteTerms?: string
  quoteValidityDays?: number
  invoiceTerms?: string
  invoiceDueDays?: number
  receiptFooter?: string
}

export type OrgBrandInput = Partial<Omit<OrgBrandProfile, 'logoHash' | 'logoUrl'>>

export interface OrgBrandView extends OrgBrandProfile {
  orgTenantId: string
  /** False until an owner or admin has saved the brand at least once. */
  configured: boolean
  version?: number
  updatedAt?: string
}

export const DEFAULT_BRAND_COLOR = '#0F766E'
export const MAX_LOGO_BYTES = 512 * 1024

const TEXT_LIMITS: Record<string, number> = {
  displayName: 120,
  tagline: 160,
  phone: 40,
  email: 120,
  website: 200,
  address: 300,
  registrationNumber: 60,
  taxNumber: 60,
  vatNumber: 60,
  bankDetails: 400,
  mobileMoney: 120,
  quoteTerms: 1200,
  invoiceTerms: 1200,
  receiptFooter: 400,
}

const LOGO_TYPES: Array<{ mime: string; matches: (bytes: Buffer) => boolean }> = [
  { mime: 'image/png', matches: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { mime: 'image/jpeg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    matches: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
]

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!text) return undefined
  return text.slice(0, max)
}

function cleanDays(value: unknown, max: number): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  const days = Math.round(n)
  return days >= 0 && days <= max ? days : undefined
}

export function normalizeBrandColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`
  }
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : undefined
}

function cleanWebsite(value: unknown): string | undefined {
  const text = cleanText(value, TEXT_LIMITS.website)
  if (!text) return undefined
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().replace(/\/$/, '') : undefined
  } catch {
    return undefined
  }
}

/** Keeps only known fields, trims text to sensible lengths and drops anything malformed. */
export function sanitizeBrandInput(input: OrgBrandInput | Record<string, unknown>): OrgBrandInput {
  const source = (input || {}) as Record<string, unknown>
  const out: OrgBrandInput = {}
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (key === 'website') continue
    const text = cleanText(source[key], max)
    if (text) (out as any)[key] = text
  }
  const website = cleanWebsite(source.website)
  if (website) out.website = website
  const color = normalizeBrandColor(source.primaryColor)
  if (color) out.primaryColor = color
  const quoteDays = cleanDays(source.quoteValidityDays, 365)
  if (quoteDays !== undefined) out.quoteValidityDays = quoteDays
  const dueDays = cleanDays(source.invoiceDueDays, 365)
  if (dueDays !== undefined) out.invoiceDueDays = dueDays
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) delete out.email
  return out
}

export function detectLogoMime(bytes: Buffer): string | undefined {
  return LOGO_TYPES.find((t) => t.matches(bytes))?.mime
}

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function brandLogoUrl(orgTenantId: string, hash: string): string {
  return `${publicBase()}/api/public/orgs/${encodeURIComponent(orgTenantId)}/brand/logo/${hash}`
}

interface VersionRow {
  id: number
  org_tenant_id: string
  profile: string
  logo_hash: string | null
  created_at: string
}

class OrgBrandService {
  private db() {
    return DatabaseManager.getDatabase()
  }

  private orgName(orgTenantId: string): string {
    const db = this.db()
    const registry = db
      .prepare(`SELECT display_name FROM organization_registry WHERE tenant_id = ? LIMIT 1`)
      .get(orgTenantId) as { display_name?: string } | undefined
    if (registry?.display_name) return registry.display_name
    try {
      const org = db.prepare(`SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1`).get(orgTenantId) as
        | { name?: string }
        | undefined
      if (org?.name) return org.name
    } catch {
      // Older databases may not have the organizations table.
    }
    return 'Organisation'
  }

  private registryDefaults(orgTenantId: string): Partial<OrgBrandProfile> {
    const row = this.db()
      .prepare(
        `SELECT logo_url, website, contact_phone, contact_email, address FROM organization_registry WHERE tenant_id = ? LIMIT 1`,
      )
      .get(orgTenantId) as
      | { logo_url?: string; website?: string; contact_phone?: string; contact_email?: string; address?: string }
      | undefined
    if (!row) return {}
    return {
      logoUrl: row.logo_url || undefined,
      website: row.website || undefined,
      phone: row.contact_phone || undefined,
      email: row.contact_email || undefined,
      address: row.address || undefined,
    }
  }

  private toView(orgTenantId: string, row: VersionRow | undefined): OrgBrandView {
    if (!row) {
      const defaults = this.registryDefaults(orgTenantId)
      return {
        orgTenantId,
        configured: false,
        displayName: this.orgName(orgTenantId),
        primaryColor: DEFAULT_BRAND_COLOR,
        ...defaults,
      }
    }
    let saved: OrgBrandInput = {}
    try {
      saved = sanitizeBrandInput(JSON.parse(row.profile))
    } catch {
      saved = {}
    }
    return {
      orgTenantId,
      configured: true,
      version: row.id,
      updatedAt: row.created_at,
      ...saved,
      displayName: saved.displayName || this.orgName(orgTenantId),
      primaryColor: saved.primaryColor || DEFAULT_BRAND_COLOR,
      logoHash: row.logo_hash || undefined,
      logoUrl: row.logo_hash ? brandLogoUrl(orgTenantId, row.logo_hash) : undefined,
    }
  }

  private latestRow(orgTenantId: string): VersionRow | undefined {
    return this.db()
      .prepare(`SELECT * FROM org_brand_versions WHERE org_tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
      .get(orgTenantId) as VersionRow | undefined
  }

  current(orgTenantId: string): OrgBrandView {
    return this.toView(orgTenantId, this.latestRow(orgTenantId))
  }

  /**
   * The brand as it stood at a moment. Documents issued before the first save use the first saved
   * brand, which is closer to what the organisation meant than the empty default.
   */
  at(orgTenantId: string, when?: string | Date): OrgBrandView {
    const time = when ? new Date(when) : undefined
    if (!time || Number.isNaN(time.getTime())) return this.current(orgTenantId)
    const db = this.db()
    const row =
      (db
        .prepare(
          `SELECT * FROM org_brand_versions WHERE org_tenant_id = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get(orgTenantId, time.toISOString()) as VersionRow | undefined) ||
      (db
        .prepare(`SELECT * FROM org_brand_versions WHERE org_tenant_id = ? ORDER BY created_at ASC, id ASC LIMIT 1`)
        .get(orgTenantId) as VersionRow | undefined)
    return this.toView(orgTenantId, row)
  }

  private appendVersion(orgTenantId: string, profile: OrgBrandInput, logoHash: string | null, userId?: string) {
    const latest = this.latestRow(orgTenantId)
    const serialized = JSON.stringify(profile)
    if (latest && latest.profile === serialized && (latest.logo_hash || null) === logoHash) return
    this.db()
      .prepare(
        `INSERT INTO org_brand_versions (org_tenant_id, profile, logo_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(orgTenantId, serialized, logoHash, userId || null, new Date().toISOString())
    this.syncRegistry(orgTenantId, logoHash)
  }

  private savedProfile(orgTenantId: string): { profile: OrgBrandInput; logoHash: string | null } {
    const latest = this.latestRow(orgTenantId)
    if (!latest) return { profile: {}, logoHash: null }
    try {
      return { profile: sanitizeBrandInput(JSON.parse(latest.profile)), logoHash: latest.logo_hash }
    } catch {
      return { profile: {}, logoHash: latest.logo_hash }
    }
  }

  /** The public profile, storefront and discovery read the registry logo, so keep it in step. */
  private syncRegistry(orgTenantId: string, logoHash: string | null) {
    try {
      this.db()
        .prepare(`UPDATE organization_registry SET logo_url = ?, updated_at = ? WHERE tenant_id = ?`)
        .run(logoHash ? brandLogoUrl(orgTenantId, logoHash) : null, new Date().toISOString(), orgTenantId)
    } catch {
      // Not every organisation has a public registry entry yet.
    }
  }

  save(orgTenantId: string, input: OrgBrandInput, userId?: string): OrgBrandView {
    const profile = sanitizeBrandInput(input)
    if (!profile.displayName) profile.displayName = this.orgName(orgTenantId)
    if (!profile.primaryColor) profile.primaryColor = DEFAULT_BRAND_COLOR
    this.appendVersion(orgTenantId, profile, this.savedProfile(orgTenantId).logoHash, userId)
    return this.current(orgTenantId)
  }

  saveLogo(orgTenantId: string, dataUrl: string, userId?: string): OrgBrandView {
    const match = /^data:([a-z/+.-]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim())
    if (!match) throw new StatusException('Send the logo as a PNG, JPEG or WebP image.', 400)
    const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
    if (!bytes.length) throw new StatusException('The logo image is empty.', 400)
    if (bytes.length > MAX_LOGO_BYTES) throw new StatusException('The logo is too large. Use an image under 512 KB.', 413)
    const mime = detectLogoMime(bytes)
    if (!mime) throw new StatusException('Send the logo as a PNG, JPEG or WebP image.', 400)
    const hash = createHash('sha256').update(bytes).digest('hex')
    this.db()
      .prepare(
        `INSERT OR IGNORE INTO org_brand_logos (hash, org_tenant_id, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(hash, orgTenantId, mime, bytes, new Date().toISOString())
    const { profile } = this.savedProfile(orgTenantId)
    if (!profile.displayName) profile.displayName = this.orgName(orgTenantId)
    if (!profile.primaryColor) profile.primaryColor = DEFAULT_BRAND_COLOR
    this.appendVersion(orgTenantId, profile, hash, userId)
    return this.current(orgTenantId)
  }

  removeLogo(orgTenantId: string, userId?: string): OrgBrandView {
    const { profile, logoHash } = this.savedProfile(orgTenantId)
    if (logoHash) this.appendVersion(orgTenantId, profile, null, userId)
    return this.current(orgTenantId)
  }

  logo(orgTenantId: string, hash: string): { mime: string; bytes: Buffer } | undefined {
    if (!/^[0-9a-f]{64}$/.test(hash)) return undefined
    const row = this.db()
      .prepare(`SELECT mime, bytes FROM org_brand_logos WHERE hash = ? AND org_tenant_id = ? LIMIT 1`)
      .get(hash, orgTenantId) as { mime: string; bytes: Buffer } | undefined
    return row ? { mime: row.mime, bytes: Buffer.from(row.bytes) } : undefined
  }

  /** Whether this person may change the brand: active owners and admins only. */
  assertManager(userId: string, orgTenantId: string): void {
    const row = this.db()
      .prepare(
        `SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`,
      )
      .get(userId, orgTenantId) as { role?: string } | undefined
    if (!row) throw new StatusException('Not a member of this organization', 403)
    if (row.role !== 'owner' && row.role !== 'admin') {
      throw new StatusException('Only org owners/admins can change the brand', 403)
    }
  }
}

export const orgBrandService = new OrgBrandService()
