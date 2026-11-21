/**
 * A link the office sends a client (the store) so they can follow one job without an account:
 * where it stands, the photos, the sign-off, and the bill with its pay link.
 *
 * The link carries a random code; only its hash is stored, and the office can switch it off.
 * The page shows plain words only: no worker ids, no phone numbers, no internal notes.
 */

import { createHash, randomBytes } from 'crypto'

import { fieldJobCategory, fieldJobInput, FIELD_JOB_CATEGORY_LABELS } from '../config/fieldJobCategory'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRunRepository } from '../persistence/WorkflowRunRepository'

import { operationsRegisterService } from './OperationsRegisterService'

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function appUrl(): string {
  return (process.env.MOBILE_APP_URL || process.env.WALLET_PUBLIC_URL || 'http://localhost:3005').replace(/\/+$/, '')
}

function photosOf(evidence: any): string[] {
  const out: string[] = []
  if (typeof evidence?.photoUri === 'string' && evidence.photoUri.startsWith('data:image/')) out.push(evidence.photoUri)
  for (const item of Array.isArray(evidence?.attachments) ? evidence.attachments : []) {
    if (typeof item?.photoUri === 'string' && item.photoUri.startsWith('data:image/')) out.push(item.photoUri)
  }
  return out.slice(0, 8)
}

export interface PublicJobView {
  organisation: string
  reference: string
  storeNumber?: string
  description: string
  location?: string
  scheduledDate?: string
  status: string
  steps: Array<{ label: string; done: boolean; at?: string }>
  workerName?: string
  photos: { before: string[]; after: string[] }
  signature?: { signerName: string; signerRole?: string; signedAt: string; imageDataUrl: string }
  bills: Array<{ kind: 'quote' | 'invoice'; amount: number; currency: string; status: string; payUrl?: string }>
}

export class JobStatusLinkService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  /** A new link for the job. Older links for it keep working until switched off. */
  public create(orgTenantId: string, runId: string, createdBy: string): { url: string; code: string } {
    const run = workflowRunRepository.findRunById(runId)
    if (!run || run.tenantId !== orgTenantId) throw new Error('Job not found')
    const code = randomBytes(18).toString('base64url')
    this.db
      .prepare(`INSERT INTO job_status_links (token_hash, org_tenant_id, run_id, created_by) VALUES (?, ?, ?, ?)`)
      .run(hash(code), orgTenantId, runId, createdBy)
    return { code, url: `${appUrl()}/job/${code}` }
  }

  public revokeAll(orgTenantId: string, runId: string): number {
    return this.db
      .prepare(
        `UPDATE job_status_links SET revoked_at = CURRENT_TIMESTAMP
          WHERE org_tenant_id = ? AND run_id = ? AND revoked_at IS NULL`,
      )
      .run(orgTenantId, runId).changes
  }

  public activeCount(orgTenantId: string, runId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM job_status_links WHERE org_tenant_id = ? AND run_id = ? AND revoked_at IS NULL`)
      .get(orgTenantId, runId) as { n: number }
    return row.n
  }

  private organisationName(orgTenantId: string): string {
    const read = (sql: string) => {
      try {
        const row = this.db.prepare(sql).get(orgTenantId) as { name?: string } | undefined
        return String(row?.name || '').trim()
      } catch {
        return ''
      }
    }
    return (
      read(`SELECT display_name AS name FROM organization_registry WHERE tenant_id = ? LIMIT 1`) ||
      read(`SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1`) ||
      'Your service provider'
    )
  }

  public view(code: string): PublicJobView | undefined {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return undefined
    const link = this.db
      .prepare(`SELECT org_tenant_id AS orgTenantId, run_id AS runId FROM job_status_links WHERE token_hash = ? AND revoked_at IS NULL`)
      .get(hash(code)) as { orgTenantId: string; runId: string } | undefined
    if (!link) return undefined
    const run = workflowRunRepository.findRunById(link.runId)
    if (!run || run.tenantId !== link.orgTenantId) return undefined
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const input = fieldJobInput({ input: run.input, output: state })
    const category = fieldJobCategory({ status: run.status, input: run.input, output: state })
    const stage = String(state.workflowStage || '').toUpperCase()
    const arrived = state.checkpoints?.arrival?.status === 'completed'
    const before = state.evidenceBefore || state.evidence?.before
    const after = state.evidenceAfter || state.evidence?.after
    const signedOff = ['ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED', 'RECONCILED', 'COMPLETED'].includes(stage)
    const job = operationsRegisterService.listJobs(link.orgTenantId).find((item) => item.runId === link.runId)
    const names = operationsRegisterService.memberNamesSafe(link.orgTenantId)
    const worker = job?.assigneeId ? String(names.get(job.assigneeId) || '').split(/\s+/)[0] : ''
    const signature = state.storeSignature
    const bills = operationsRegisterService.billsForRuns(link.orgTenantId, [link.runId])
    return {
      organisation: this.organisationName(link.orgTenantId),
      reference: String(input.reference || input.poNumber || 'Job'),
      storeNumber: input.storeNumber ? String(input.storeNumber) : undefined,
      description: String(input.description || '').slice(0, 500),
      location: input.location ? String(input.location).slice(0, 300) : undefined,
      scheduledDate: input.scheduledDate ? String(input.scheduledDate).slice(0, 10) : undefined,
      status: category === 'failed' ? 'Being re-booked' : FIELD_JOB_CATEGORY_LABELS[category],
      steps: [
        { label: 'Job booked', done: true, at: run.createdAt ? new Date(run.createdAt).toISOString() : undefined },
        { label: 'Worker on site', done: arrived || Boolean(before?.evidenceHash), at: state.checkpoints?.arrival?.completedAt },
        { label: 'Before photos taken', done: Boolean(before?.evidenceHash), at: before?.capturedAt },
        { label: 'Work finished', done: Boolean(after?.evidenceHash), at: after?.capturedAt },
        { label: 'Signed off', done: signedOff || Boolean(signature), at: signature?.signedAt },
        { label: 'Closed', done: category === 'completed' || category === 'reconciled', at: run.completedAt ? new Date(run.completedAt).toISOString() : undefined },
      ],
      ...(worker && !/^team$/i.test(worker) ? { workerName: worker } : {}),
      photos: { before: photosOf(before), after: photosOf(after) },
      ...(signature?.imageDataUrl
        ? {
            signature: {
              signerName: String(signature.signerName || ''),
              ...(signature.signerRole ? { signerRole: String(signature.signerRole) } : {}),
              signedAt: String(signature.signedAt || ''),
              imageDataUrl: String(signature.imageDataUrl),
            },
          }
        : {}),
      bills: bills.map((bill) => ({
        kind: bill.kind,
        amount: bill.amount,
        currency: bill.currency,
        status: bill.status,
        ...(bill.payUrl && !['paid', 'cancelled'].includes(bill.status) ? { payUrl: bill.payUrl } : {}),
      })),
    }
  }
}

export const jobStatusLinkService = new JobStatusLinkService()
