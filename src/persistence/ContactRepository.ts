import crypto from 'crypto'

import { DatabaseManager } from './DatabaseManager'

export interface OrgContact {
  id: string
  orgTenantId: string
  contactScope: 'internal' | 'external'
  name: string
  phone?: string
  email?: string
  /** Holder's SSI DID — set when known (self-sovereign) */
  did?: string
  notes?: string
  /** Linked holder wallet tenant ID, if the contact has claimed the link */
  walletTenantId?: string
  /** When the holder linked their wallet to this contact */
  linkedAt?: string
  /**
   * Whether this phone or email already belongs to someone who has signed up.
   * Computed on read, the way a messenger checks an address book. Not stored.
   */
  appStatus?: 'in_app' | 'invite' | 'no_phone'
  createdAt: string
  updatedAt: string
}

interface ContactRow {
  id: string
  org_tenant_id: string
  contact_scope: 'internal' | 'external' | null
  name: string
  phone: string | null
  email: string | null
  did: string | null
  notes: string | null
  wallet_tenant_id: string | null
  linked_at: string | null
  link_token: string | null
  link_token_expires_at: string | null
  created_at: string
  updated_at: string
}

function toContact(row: ContactRow): OrgContact {
  return {
    id: row.id,
    orgTenantId: row.org_tenant_id,
    contactScope: row.contact_scope === 'internal' ? 'internal' : 'external',
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    did: row.did ?? undefined,
    notes: row.notes ?? undefined,
    walletTenantId: row.wallet_tenant_id ?? undefined,
    linkedAt: row.linked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) return `263${digits.slice(1)}`
  return digits
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function phoneHashes(phone: string): string[] {
  const normalized = normalizePhone(phone)
  return [sha256(normalized), sha256(normalized.toLowerCase()), sha256(phone.trim().toLowerCase())]
}

function knownHashes(column: 'phone_hash' | 'email_hash', hashes: string[]): Set<string> {
  const found = new Set<string>()
  if (hashes.length === 0) return found
  const db = DatabaseManager.getDatabase()
  for (let index = 0; index < hashes.length; index += 400) {
    const chunk = hashes.slice(index, index + 400)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = db
      .prepare(`SELECT ${column} as hash FROM ssi_users WHERE ${column} IN (${placeholders})`)
      .all(...chunk) as Array<{ hash: string | null }>
    for (const row of rows) {
      if (row.hash) found.add(row.hash)
    }
  }
  return found
}

/**
 * Match saved contacts against people who have already signed up.
 * A saved phone is not enough: until it matches an account, the contact still needs an invite.
 */
export function annotateAppStatus(contacts: OrgContact[]): OrgContact[] {
  const phoneCandidates = new Set<string>()
  const emailCandidates = new Set<string>()
  for (const contact of contacts) {
    if (contact.phone) phoneHashes(contact.phone).forEach((hash) => phoneCandidates.add(hash))
    if (contact.email?.trim()) emailCandidates.add(sha256(contact.email.trim().toLowerCase()))
  }
  const knownPhones = knownHashes('phone_hash', [...phoneCandidates])
  const knownEmails = knownHashes('email_hash', [...emailCandidates])
  return contacts.map((contact) => {
    const onPhone = Boolean(contact.phone && phoneHashes(contact.phone).some((hash) => knownPhones.has(hash)))
    const onEmail = Boolean(contact.email?.trim() && knownEmails.has(sha256(contact.email.trim().toLowerCase())))
    const alreadyLinked = Boolean(contact.walletTenantId)
    const appStatus =
      onPhone || onEmail || alreadyLinked ? 'in_app' : contact.phone || contact.email ? 'invite' : 'no_phone'
    return { ...contact, appStatus }
  })
}

export function listContacts(orgTenantId: string, contactScope?: 'internal' | 'external'): OrgContact[] {
  const db = DatabaseManager.getDatabase()
  const rows = contactScope
    ? (db
        .prepare('SELECT * FROM org_contacts WHERE org_tenant_id = ? AND contact_scope = ? ORDER BY name ASC')
        .all(orgTenantId, contactScope) as ContactRow[])
    : (db
        .prepare('SELECT * FROM org_contacts WHERE org_tenant_id = ? ORDER BY name ASC')
        .all(orgTenantId) as ContactRow[])
  return annotateAppStatus(rows.map(toContact))
}

export function getContactById(id: string, orgTenantId: string): OrgContact | undefined {
  const db = DatabaseManager.getDatabase()
  const row = db.prepare('SELECT * FROM org_contacts WHERE id = ? AND org_tenant_id = ?').get(id, orgTenantId) as
    | ContactRow
    | undefined
  return row ? annotateAppStatus([toContact(row)])[0] : undefined
}

export function findContactById(contactId: string, orgTenantId: string): OrgContact | undefined {
  return getContactById(contactId, orgTenantId)
}

export function findContactByIdGlobal(contactId: string): OrgContact | undefined {
  const db = DatabaseManager.getDatabase()
  const row = db.prepare('SELECT * FROM org_contacts WHERE id = ?').get(contactId) as ContactRow | undefined
  return row ? toContact(row) : undefined
}

export function findContactByDid(orgTenantId: string, did: string): OrgContact | undefined {
  const db = DatabaseManager.getDatabase()
  const row = db
    .prepare('SELECT * FROM org_contacts WHERE org_tenant_id = ? AND did = ? ORDER BY updated_at DESC LIMIT 1')
    .get(orgTenantId, did) as ContactRow | undefined
  return row ? toContact(row) : undefined
}

export function findContactByWalletTenantId(orgTenantId: string, walletTenantId: string): OrgContact | undefined {
  const db = DatabaseManager.getDatabase()
  const row = db
    .prepare(
      'SELECT * FROM org_contacts WHERE org_tenant_id = ? AND wallet_tenant_id = ? ORDER BY updated_at DESC LIMIT 1',
    )
    .get(orgTenantId, walletTenantId) as ContactRow | undefined
  return row ? toContact(row) : undefined
}

export interface UpsertContactInput {
  id?: string
  orgTenantId: string
  contactScope?: 'internal' | 'external'
  name: string
  phone?: string
  email?: string
  did?: string
  notes?: string
  walletTenantId?: string
  linkedAt?: string
}

export function upsertContact(input: UpsertContactInput): OrgContact {
  const db = DatabaseManager.getDatabase()
  const id = input.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `
    INSERT INTO org_contacts (
      id, org_tenant_id, contact_scope, name, phone, email, did, notes,
      wallet_tenant_id, linked_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      contact_scope = excluded.contact_scope,
      name       = excluded.name,
      phone      = excluded.phone,
      email      = excluded.email,
      did        = excluded.did,
      notes      = excluded.notes,
      wallet_tenant_id = excluded.wallet_tenant_id,
      linked_at   = excluded.linked_at,
      updated_at = excluded.updated_at
  `,
  ).run(
    id,
    input.orgTenantId,
    input.contactScope ?? 'external',
    input.name,
    input.phone ?? null,
    input.email ?? null,
    input.did ?? null,
    input.notes ?? null,
    input.walletTenantId ?? null,
    input.linkedAt ?? null,
    now,
    now,
  )
  const saved = getContactById(id, input.orgTenantId)!
  if (saved.contactScope === 'internal' && saved.walletTenantId) {
    void import('../services/OrgMembershipCredentialService')
      .then(({ orgMembershipCredentialService }) => {
        orgMembershipCredentialService.ensureEmployeeCredentialForWallet({
          orgTenantId: saved.orgTenantId,
          walletTenantId: saved.walletTenantId!,
          displayName: saved.name,
        })
      })
      .catch(() => undefined)
  }
  return saved
}

export function getContactByLinkToken(token: string): OrgContact | undefined {
  const db = DatabaseManager.getDatabase()
  const row = db
    .prepare(
      `
      SELECT * FROM org_contacts
      WHERE link_token = ?
        AND link_token_expires_at IS NOT NULL
        AND link_token_expires_at > ?
      LIMIT 1
    `,
    )
    .get(token, new Date().toISOString()) as ContactRow | undefined
  return row ? toContact(row) : undefined
}

export function createContactLinkToken(contactId: string, orgTenantId: string, expiresAt: string): string {
  const db = DatabaseManager.getDatabase()
  const token = crypto.randomUUID()
  db.prepare(
    `
    UPDATE org_contacts
    SET link_token = ?,
        link_token_expires_at = ?,
        updated_at = ?
    WHERE id = ? AND org_tenant_id = ?
  `,
  ).run(token, expiresAt, new Date().toISOString(), contactId, orgTenantId)
  return token
}

export function claimContactLink(params: {
  token: string
  walletTenantId: string
  did?: string
}): OrgContact | undefined {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  const row = db
    .prepare(
      `
      SELECT * FROM org_contacts
      WHERE link_token = ?
        AND link_token_expires_at IS NOT NULL
        AND link_token_expires_at > ?
      LIMIT 1
    `,
    )
    .get(params.token, now) as ContactRow | undefined

  if (!row) return undefined

  db.prepare(
    `
    UPDATE org_contacts
    SET wallet_tenant_id = ?,
        did = COALESCE(?, did),
        linked_at = ?,
        link_token = NULL,
        link_token_expires_at = NULL,
        updated_at = ?
    WHERE id = ? AND org_tenant_id = ?
  `,
  ).run(params.walletTenantId, params.did ?? null, now, now, row.id, row.org_tenant_id)

  return getContactById(row.id, row.org_tenant_id)
}

export function deleteContact(id: string, orgTenantId: string): boolean {
  const db = DatabaseManager.getDatabase()
  const result = db.prepare('DELETE FROM org_contacts WHERE id = ? AND org_tenant_id = ?').run(id, orgTenantId)
  return result.changes > 0
}

export const contactRepository = {
  list: listContacts,
  getById: getContactById,
  findById: findContactByIdGlobal,
  findByIdInOrg: findContactById,
  findByDid: findContactByDid,
  findByWalletTenantId: findContactByWalletTenantId,
  upsert: upsertContact,
  getByLinkToken: getContactByLinkToken,
  createLinkToken: createContactLinkToken,
  claimLink: claimContactLink,
  delete: deleteContact,
}
