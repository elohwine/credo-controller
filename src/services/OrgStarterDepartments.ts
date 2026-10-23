/**
 * Departments an organisation starts with.
 *
 * Every organisation gets one "General" department the first time anything reads its
 * departments, so routing never waits on the owner typing one in. The setup questions
 * suggest more teams from what the organisation does; the owner keeps or drops them.
 * An archived department is never brought back by the default, only by naming it again.
 */

import crypto from 'crypto'

import { cleanDepartmentNames, DEFAULT_DEPARTMENT_NAME, suggestedDepartmentsFor } from '../config/orgStructure'
import { DatabaseManager } from '../persistence/DatabaseManager'

export { DEFAULT_DEPARTMENT_NAME, suggestedDepartmentsFor, cleanDepartmentNames }

interface DepartmentRow {
  id: string
  name: string
  status: string
}

function departmentRows(organizationId: string): DepartmentRow[] {
  return DatabaseManager.getDatabase()
    .prepare(`SELECT id, name, status FROM departments WHERE organization_id = ? ORDER BY created_at ASC`)
    .all(organizationId) as DepartmentRow[]
}

function insertDepartment(organizationId: string, name: string): void {
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO departments (id, organization_id, name, code, status, created_at) VALUES (?, ?, ?, NULL, 'active', ?)`,
    )
    .run(crypto.randomUUID(), organizationId, name, new Date().toISOString())
}

/** Give an organisation that has never had a department its "General" one. Safe to call often. */
export function ensureDefaultDepartment(organizationId: string): boolean {
  if (!organizationId) return false
  if (departmentRows(organizationId).length > 0) return false
  insertDepartment(organizationId, DEFAULT_DEPARTMENT_NAME)
  return true
}

export type DepartmentPlanStatus = 'existing' | 'new' | 'restored'

export interface DepartmentPlanItem {
  name: string
  status: DepartmentPlanStatus
}

/** What naming these departments would do, without writing anything. */
export function planDepartments(organizationId: string | undefined, names: readonly string[]): DepartmentPlanItem[] {
  const rows = organizationId ? departmentRows(organizationId) : []
  const plan: DepartmentPlanItem[] = rows
    .filter((row) => row.status === 'active')
    .map((row) => ({ name: row.name, status: 'existing' as const }))
  for (const name of cleanDepartmentNames(names)) {
    const key = name.toLowerCase()
    if (plan.some((item) => item.name.toLowerCase() === key)) continue
    const archived = rows.find((row) => row.status !== 'active' && row.name.trim().toLowerCase() === key)
    plan.push({ name: archived?.name || name, status: archived ? 'restored' : 'new' })
  }
  if (plan.length === 0) return planDepartments(organizationId, [DEFAULT_DEPARTMENT_NAME])
  return plan
}

/**
 * Create the named departments that are missing; bring back archived ones with the same name.
 * Existing departments are left alone (nothing is archived here). Falls back to "General" when
 * the organisation would otherwise have none.
 */
export function ensureDepartments(organizationId: string, names: readonly string[]): DepartmentPlanItem[] {
  const db = DatabaseManager.getDatabase()
  const plan = planDepartments(organizationId, names)
  const rows = departmentRows(organizationId)
  db.transaction(() => {
    for (const item of plan) {
      if (item.status === 'restored') {
        const archived = rows.find(
          (row) => row.status !== 'active' && row.name.trim().toLowerCase() === item.name.toLowerCase(),
        )
        if (archived) db.prepare(`UPDATE departments SET status = 'active' WHERE id = ?`).run(archived.id)
      } else if (item.status === 'new') {
        insertDepartment(organizationId, item.name)
      }
    }
  })()
  return plan
}
