/**
 * Starting org structure suggested from the setup answers. Pure data, shared by the server
 * (`OrgStarterDepartments`) and both apps (`credo-ui/shared/orgProfile.ts`).
 */

export const DEFAULT_DEPARTMENT_NAME = 'General'
export const MAX_SETUP_DEPARTMENTS = 20
export const MAX_DEPARTMENT_NAME_LENGTH = 60

export interface OrgStructureAnswers {
  kinds: readonly string[]
  modules: readonly string[]
  approvalPresetId?: string
}

/** Teams the setup answers suggest. "General" is always first. */
export function suggestedDepartmentsFor(answers: OrgStructureAnswers): string[] {
  const kinds = new Set(answers.kinds)
  const modules = new Set(answers.modules)
  const names = [DEFAULT_DEPARTMENT_NAME]
  if (kinds.has('field') || modules.has('field_jobs')) names.push('Field operations')
  if (kinds.has('shop') || modules.has('commerce')) names.push('Sales')
  if (kinds.has('school') || modules.has('school_fees')) names.push('Bursary')
  if (
    answers.approvalPresetId === 'finance_team' ||
    answers.approvalPresetId === 'director_signs_once' ||
    modules.has('payables') ||
    modules.has('collections')
  ) {
    names.push('Finance')
  }
  if (modules.has('people_payroll')) names.push('HR')
  return names
}

/** Trim, drop blanks and case-insensitive duplicates, cap length and count. */
export function cleanDepartmentNames(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const value of values) {
    const name = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DEPARTMENT_NAME_LENGTH)
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= MAX_SETUP_DEPARTMENTS) break
  }
  return names
}
