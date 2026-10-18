/**
 * How people are offered on a job. Shared by the portal and the mobile app.
 */

export type JobContact = {
  name: string
  phone: string
  contactScope?: 'internal' | 'external'
}

export function jobContactOption(contact: JobContact): { value: string; label: string } {
  const scope = contact.contactScope === 'internal' ? 'internal' : 'external'
  const tag = scope === 'internal' ? 'on the team' : 'outside contact'
  return {
    value: `contact:${scope}:${contact.phone}`,
    label: `${contact.name} (${tag})`,
  }
}

export function parseJobContactSelection(selection: string): { scope: 'internal' | 'external'; phone: string } | null {
  if (!selection.startsWith('contact:')) return null
  const rest = selection.slice('contact:'.length)
  if (rest.startsWith('internal:')) return { scope: 'internal', phone: rest.slice('internal:'.length) }
  if (rest.startsWith('external:')) return { scope: 'external', phone: rest.slice('external:'.length) }
  return { scope: 'internal', phone: rest }
}

export const OUTSIDE_CONTACT_NEEDS_APP =
  'They are not in the app yet. An outside contact is not added to the team. They can receive the job assignment record once they have the app.'

/** Select value meaning "use the field worker chosen under Who does what". */
export const STAGE_ACTOR_CHOICE = 'stage-actor'

export const CHOOSE_FIELD_WORKER = 'Choose who goes out. Nobody is set up for field work under Who does what yet.'

/**
 * Whether the organisation already named someone to go out on jobs.
 * Mirrors the API rule in `field.assign`: the owner fallback is not an assignment.
 * `actorsView` is the response of `GET /api/organizations/{orgTenantId}/workflows/actors`.
 */
export function hasConfiguredFieldWorker(actorsView: unknown): boolean {
  return fieldWorkerStageSet(fieldJobStages(actorsView))
}

/** Same rule for a field workflow's stage list that a page has already loaded. */
export function fieldWorkerStageSet(stages: unknown): boolean {
  return Boolean(stageActorUserId(stages, 'assign_field_worker'))
}

/** Stage list of the field job workflow in a `/workflows/actors` response. */
export function fieldJobStages(actorsView: unknown): unknown[] {
  const workflows = Array.isArray((actorsView as any)?.workflows) ? (actorsView as any).workflows : []
  const field = workflows.find((workflow: any) => /field_execution|fept/i.test(String(workflow?.workflowType || '')))
  return Array.isArray(field?.stages) ? field.stages : []
}

/**
 * The person already chosen for a stage, or undefined when nobody is.
 * The owner fallback is not a choice, matching the API rule in `field.assign`.
 */
export function stageActorUserId(stages: unknown, stageAction: string): string | undefined {
  const list = Array.isArray(stages) ? stages : []
  const stage = list.find((item: any) => String(item?.stageAction || '').toLowerCase() === stageAction)
  const actor = stage?.actor
  if (!actor || actor.mode === 'owner_fallback' || actor.mode === 'unassigned') return undefined
  return actor.userId ? String(actor.userId) : actor.walletTenantId ? String(actor.walletTenantId) : undefined
}

/** Field job stages whose person can be left as already chosen. */
export const FIELD_WORKER_STAGE = 'assign_field_worker'
export const FIELD_CHECKER_STAGE = 'acknowledge_execution'

/** Label for the "already chosen" option that names the person, so nobody is picked blind. */
export function stageActorChoiceLabel(userId: string | undefined, members: OrgMemberNameSource[]): string {
  if (!userId) return 'Use the person already chosen'
  const member = members.find((item) => item.userId === userId)
  return member ? `${orgMemberName(member)} (already chosen)` : 'Use the person already chosen'
}

/**
 * Label for a stage actor choice. If no direct user is set, infer from role when there is
 * exactly one active person with that role.
 */
export function stageActorChoiceLabelForStage(
  stages: unknown,
  stageAction: string,
  members: OrgMemberNameSource[],
): string {
  const list = Array.isArray(stages) ? stages : []
  const stage = list.find((item: any) => String(item?.stageAction || '').toLowerCase() === stageAction)
  const actor = stage?.actor
  if (!actor) return 'Use the person already chosen'

  const direct = stageActorUserId(stages, stageAction)
  if (direct) return stageActorChoiceLabel(direct, members)

  const role = String(actor.role || '')
    .trim()
    .toLowerCase()
  if (!role || role === 'owner' || role === 'member') return 'Use the person already chosen'
  const matches = members.filter(
    (member) =>
      String(member.role || '')
        .trim()
        .toLowerCase() === role,
  )
  if (matches.length === 1) return `${orgMemberName(matches[0])} (already chosen)`

  return 'Use the person already chosen'
}

export interface OrgMemberNameSource {
  userId: string
  role?: string | null
  displayName?: string | null
  phone?: string | null
}

/** A person's name for pickers: their name, else their phone, never a raw id when avoidable. */
export function orgMemberName(member: OrgMemberNameSource): string {
  const name = String(member.displayName || '').trim()
  const generic = !name || /^organization owner$/i.test(name)
  if (!generic) return name
  if (member.phone) return member.phone
  if (String(member.role || '').toLowerCase() === 'owner') return 'Organization owner'
  return `Team member · ${member.userId.slice(0, 6)}`
}

export function orgMemberLabel(member: OrgMemberNameSource): string {
  const role = String(member.role || 'member').replace(/_/g, ' ')
  return `${orgMemberName(member)} (${role})`
}
