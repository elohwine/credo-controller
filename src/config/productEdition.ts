/**
 * This branch is LDK iFacilities: LDK's white-label jobs platform, set up for its client SGK.
 * It is not the multi-organisation platform (that lives on its own branch).
 * Offered: field jobs, the team (staff cards and people), and the modules a job uses
 * (materials, supplier bills, the client's payment).
 * School fees, the shop and public discovery stay in the code and are not offered.
 */

/** The platform name people see. SGK is the client organisation on it, not the product. */
export const PRODUCT_NAME = 'LDK iFacilities'
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

/** Always on in this edition: the jobs, and the team who do them (staff, leave, payroll). */
export const EDITION_ALWAYS_ON_MODULES = ['field_jobs', 'people_payroll'] as const

export function editionAlwaysOn(module: string): boolean {
  return (EDITION_ALWAYS_ON_MODULES as readonly string[]).includes(module)
}

export function withEditionModules<T extends string>(modules: readonly T[]): T[] {
  return Array.from(new Set([...modules, ...(EDITION_ALWAYS_ON_MODULES as readonly string[] as readonly T[])]))
}

/**
 * The setup this edition runs with. The organisation is set up with it when it is created, so
 * nobody answers the setup questions and the onboarding screens are not shown.
 * The multi-organisation platform has no preset (`null`) and keeps the questions.
 */
export type EditionPresetSetup = { kinds: readonly string[]; modules: readonly string[] }

export const EDITION_PRESET_SETUP: EditionPresetSetup | null = {
  kinds: KINDS,
  modules: MODULES,
}

let presetSetup: EditionPresetSetup | null = EDITION_PRESET_SETUP

export function editionPresetSetup(): EditionPresetSetup | null {
  return presetSetup
}

export function editionHasPresetSetup(): boolean {
  return presetSetup !== null
}

/** Tests of the platform's setup questions switch the preset off, then restore `EDITION_PRESET_SETUP`. */
export function setEditionPresetSetup(value: EditionPresetSetup | null): void {
  presetSetup = value
}
