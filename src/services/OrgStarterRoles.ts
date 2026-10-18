/**
 * Roles the Roles page should already show, taken from the setup answers and from
 * roles already given to people. Nothing here is typed in by hand.
 *
 * Office + "Owner handles money" → Owner.
 * "Sends people out" → Field worker and Supervisor as well.
 * "Manager, then finance" / "Director confirms once" → the money roles that choice names.
 * A shop also gets Cashier.
 */

import crypto from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { orgSetupProfileService } from './OrgSetupProfileService'

export interface StarterRole {
  membershipRole: string
  name: string
  description: string
  permissions: string[]
}

const CATALOG: Record<string, StarterRole> = {
  owner: {
    membershipRole: 'owner',
    name: 'Owner',
    description: 'Runs the organisation. This role is set when the organisation is created.',
    permissions: [
      'request.read',
      'request.submit',
      'request.approve',
      'finance.release',
      'field.assign',
      'audit.read',
      'report.read',
    ],
  },
  auditor: {
    membershipRole: 'auditor',
    name: 'Auditor',
    description: 'Reviews audit trails and exports reports. Cannot change jobs or approve payments.',
    permissions: ['audit.read', 'report.read'],
  },
  field_worker: {
    membershipRole: 'field_worker',
    name: 'Field worker',
    description: 'Goes out and does the job.',
    permissions: ['request.read', 'field.execute', 'request.complete'],
  },
  supervisor: {
    membershipRole: 'supervisor',
    name: 'Supervisor',
    description: 'Checks the site and signs off the finished work.',
    permissions: ['request.read', 'field.inspect', 'request.complete'],
  },
  manager: {
    membershipRole: 'manager',
    name: 'Manager',
    description: 'Confirms a request before finance does.',
    permissions: ['request.read', 'request.approve'],
  },
  finance_manager: {
    membershipRole: 'finance_manager',
    name: 'Finance officer',
    description: 'Confirms the money and records payments.',
    permissions: ['request.read', 'finance.pay', 'finance.receipt', 'finance.release'],
  },
  director: {
    membershipRole: 'director',
    name: 'Director',
    description: 'Confirms a request, or releases the money, depending on the setup.',
    permissions: ['request.read', 'request.approve', 'finance.release'],
  },
  cashier: {
    membershipRole: 'cashier',
    name: 'Cashier',
    description: 'Takes payment at the counter.',
    permissions: ['request.read', 'finance.pay', 'finance.receipt'],
  },
}

function humanize(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** The roles this organisation's answers call for, plus any role already given to someone. */
export function starterRolesForOrganization(orgTenantId: string): StarterRole[] {
  const profile = orgSetupProfileService.get(orgTenantId)
  const kinds = new Set(profile.kinds)
  const preset = profile.approvalPresetId || 'owner_handles_money'
  const chosen: StarterRole[] = [CATALOG.owner, CATALOG.auditor]

  if (kinds.has('field')) {
    chosen.push(CATALOG.field_worker, CATALOG.supervisor)
  }
  if (kinds.has('shop')) chosen.push(CATALOG.cashier)
  // People & payroll: leave and expense claims need a manager to decide them, so the owner
  // is not the only person they can fall to.
  if (profile.modules.includes('people_payroll') && !chosen.includes(CATALOG.manager)) chosen.push(CATALOG.manager)
  if (preset === 'finance_team') {
    chosen.push(CATALOG.manager, CATALOG.finance_manager, CATALOG.director)
  } else if (preset === 'director_signs_once') {
    chosen.push(CATALOG.director, CATALOG.finance_manager)
  }

  try {
    const inUse = DatabaseManager.getDatabase()
      .prepare(`SELECT DISTINCT role FROM org_memberships WHERE org_tenant_id = ? AND status = 'active'`)
      .all(orgTenantId) as Array<{ role: string }>
    for (const row of inUse) {
      const slug = String(row.role || '')
        .trim()
        .toLowerCase()
      if (!slug || chosen.some((role) => role.membershipRole === slug)) continue
      chosen.push(
        CATALOG[slug] || {
          membershipRole: slug,
          name: humanize(slug),
          description: 'Already given to someone on the team.',
          permissions: ['request.read'],
        },
      )
    }
  } catch {
    // Memberships are optional here; the answers still decide the list.
  }

  const seen = new Set<string>()
  return chosen.filter((role) => {
    if (seen.has(role.membershipRole)) return false
    seen.add(role.membershipRole)
    return true
  })
}

/**
 * Insert any missing starter role. Safe to call often: a role already stored
 * (same membership role, or the same name) is left as the owner edited it.
 */
export function ensureStarterRoles(orgTenantId: string, organizationId: string): void {
  if (!organizationId) return
  const db = DatabaseManager.getDatabase()
  const existing = db
    .prepare(`SELECT name, membership_role FROM roles WHERE organization_id = ?`)
    .all(organizationId) as Array<{ name: string; membership_role: string | null }>
  const byRole = new Set(existing.map((row) => String(row.membership_role || '').toLowerCase()).filter(Boolean))
  const byName = new Set(existing.map((row) => row.name.trim().toLowerCase()))
  const insert = db.prepare(
    `INSERT INTO roles (id, organization_id, name, description_ref, permissions, membership_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = new Date().toISOString()
  for (const role of starterRolesForOrganization(orgTenantId)) {
    if (byRole.has(role.membershipRole) || byName.has(role.name.toLowerCase())) continue
    insert.run(
      crypto.randomUUID(),
      organizationId,
      role.name,
      role.description,
      JSON.stringify(role.permissions),
      role.membershipRole,
      now,
    )
    byRole.add(role.membershipRole)
    byName.add(role.name.toLowerCase())
  }
}
