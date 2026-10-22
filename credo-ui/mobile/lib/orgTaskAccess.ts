import api from './api'
import { applyOrgContext, getPersonalWalletToken, getWalletToken, setTaskPass } from './auth'

export type OrgTaskPurpose = 'job' | 'request' | 'requisition' | 'payable' | 'collection'

export interface OpenOrganizationForTaskInput {
  orgId: string
  orgNameHint?: string
  purpose: OrgTaskPurpose
  /** The item's ids (run, request, requisition, transaction). Empty values are ignored. */
  refs: Array<string | null | undefined>
  /** Runs after the server answers and before the context changes (for example a stale-screen guard). */
  beforeApply?: () => void
}

export interface OpenOrganizationForTaskResult {
  orgName: string
  orgRole?: string
  /** True for a member: the session works for this one item only. */
  taskPass: boolean
}

export function taskRefs(...values: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const value of values) {
    const ref = typeof value === 'string' ? value.trim() : ''
    if (ref && !out.includes(ref)) out.push(ref)
  }
  return out
}

/**
 * Opens the organisation for one task from the personal inbox. Owners and admins get the
 * organisation context; other members get a task pass bound to this item (the server decides).
 */
export async function openOrganizationForTask(input: OpenOrganizationForTaskInput): Promise<OpenOrganizationForTaskResult> {
  const holderToken = getPersonalWalletToken() || getWalletToken()
  if (!holderToken) throw new Error('Sign in to your wallet first.')
  const refs = taskRefs(...input.refs)
  if (refs.length === 0) throw new Error('This item is not ready yet. Refresh your inbox and try again.')

  const res = await api.post(
    `/api/organizations/${encodeURIComponent(input.orgId)}/task-access`,
    { purpose: input.purpose, refs },
    { headers: { Authorization: 'Bearer ' + holderToken }, skipAuthRedirect: true } as any,
  )
  const data = res.data || {}
  if (!data.token) throw new Error('Could not open this task. Try again.')
  input.beforeApply?.()
  const orgName = data.orgName || data.name || input.orgNameHint || input.orgId
  applyOrgContext({
    orgId: input.orgId,
    orgName,
    orgToken: data.token,
    orgRole: data.orgRole,
    sector: data.sector,
    workflowTypes: data.workflowTypes,
  })
  if (data.taskPass) {
    setTaskPass({ orgId: input.orgId, purpose: data.purpose || input.purpose, refs: data.refs || refs, expiresAt: data.expiresAt })
  }
  return { orgName, orgRole: data.orgRole, taskPass: Boolean(data.taskPass) }
}
