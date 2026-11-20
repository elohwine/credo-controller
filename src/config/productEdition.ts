/**
 * This branch is the SGK pilot, not the multi-organisation platform.
 * Offered: field jobs, the team (staff cards and people), and the modules a job uses
 * (materials, supplier bills, the client's payment).
 * School fees, the shop and public discovery stay in the code and are not offered.
 */

export const PRODUCT_NAME = 'SGK'
export const PRODUCT_EDITION = 'sgk' as const

const KINDS = ['field'] as const
const MODULES = ['field_jobs', 'purchases', 'payables', 'collections', 'people_payroll'] as const

export function editionAllowsKind(kind: string): boolean {
  return (KINDS as readonly string[]).includes(kind)
}

export function editionAllowsModule(module: string): boolean {
  return (MODULES as readonly string[]).includes(module)
}

export function editionKinds<T extends string>(kinds: readonly T[]): T[] {
  return kinds.filter((kind) => editionAllowsKind(kind))
}

export function editionModules<T extends string>(modules: readonly T[]): T[] {
  return modules.filter((module) => editionAllowsModule(module))
}
