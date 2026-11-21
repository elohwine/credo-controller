/**
 * What the office sets up for field jobs, and what the worker fills in on site:
 *  - rate cards: priced lines the office picks to build a client price;
 *  - job sheets: per problem type, the checks, measurements and notes a worker records;
 *  - on a job: the filled-in sheet with the items used, and the store person's signature.
 *
 * The sheet and the signature live in the job run's state (`jobSheet`, `storeSignature`), next to
 * the photos and the failed visits, so the job card, the audit trail and the client's job page
 * read one record. Neither one moves a step: the flow is unchanged for jobs that skip them.
 */

import { randomUUID } from 'crypto'

import {
  DEFAULT_JOB_SHEET,
  MAX_SIGNATURE_DATA_URL,
  jobSheetItemsError,
  type JobSheetAnswer,
  type JobSheetItem,
  type JobSheetMaterial,
  type JobSheetRecord,
  type RateCard,
  type StoreSignature,
} from '../config/jobSheet'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRunRepository } from '../persistence/WorkflowRunRepository'

import { ReconciliationService } from './ReconciliationService'
import { jobEventReference } from './WorkflowAuditService'

function clean(value: unknown, max = 200): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

const CLOSED_STAGES = new Set(['CANCELLED', 'REVOKED'])

export class FieldJobSheetService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  // ─── Rate cards ────────────────────────────────────────────────────────

  public listRateCards(orgTenantId: string, includeArchived = false): RateCard[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, unit, unit_price AS unitPrice, currency, problem_type AS problemType, active
           FROM org_rate_cards WHERE org_tenant_id = ? ${includeArchived ? '' : 'AND active = 1'}
          ORDER BY name`,
      )
      .all(orgTenantId) as Array<Omit<RateCard, 'active'> & { active: number; problemType?: string | null }>
    return rows.map((row) => ({ ...row, problemType: row.problemType || undefined, active: row.active === 1 }))
  }

  public saveRateCard(
    orgTenantId: string,
    input: { id?: string; name?: string; unit?: string; unitPrice?: number; currency?: string; problemType?: string; active?: boolean },
  ): RateCard {
    const existing = input.id ? this.listRateCards(orgTenantId, true).find((card) => card.id === input.id) : undefined
    if (input.id && !existing) throw new Error('Rate not found')
    const name = clean(input.name ?? existing?.name, 160)
    if (!name) throw new Error('Name the rate (for example "Call-out" or "Labour per hour")')
    const unitPrice = Number(input.unitPrice ?? existing?.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('The price must be zero or more')
    const currency = clean(input.currency ?? existing?.currency ?? 'USD', 3).toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code')
    const unit = clean(input.unit ?? existing?.unit ?? 'each', 40) || 'each'
    const problemType = clean(input.problemType ?? existing?.problemType, 120)
    const active = input.active ?? existing?.active ?? true
    const id = existing?.id || randomUUID()
    const taken = this.listRateCards(orgTenantId, true).some(
      (card) => card.id !== id && card.name.toLowerCase() === name.toLowerCase(),
    )
    if (taken) throw new Error(`"${name}" is already saved`)
    try {
      this.db
        .prepare(
          `INSERT INTO org_rate_cards (id, org_tenant_id, name, unit, unit_price, currency, problem_type, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, unit = excluded.unit, unit_price = excluded.unit_price,
             currency = excluded.currency, problem_type = excluded.problem_type, active = excluded.active,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .run(id, orgTenantId, name, unit, unitPrice, currency, problemType || null, active ? 1 : 0)
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error)
      if (/UNIQUE/i.test(message)) throw new Error(`"${name}" is already saved`)
      throw error
    }
    return this.listRateCards(orgTenantId, true).find((card) => card.id === id)!
  }

  // ─── Job sheets per problem type ───────────────────────────────────────

  public listSheets(orgTenantId: string): Array<{ problemType: string; items: JobSheetItem[] }> {
    const rows = this.db
      .prepare(`SELECT problem_type AS problemType, items_json AS itemsJson FROM org_job_sheets WHERE org_tenant_id = ? ORDER BY problem_type`)
      .all(orgTenantId) as Array<{ problemType: string; itemsJson: string }>
    return rows.map((row) => ({ problemType: row.problemType, items: JSON.parse(row.itemsJson) }))
  }

  /** The sheet for a problem type, or the general one when the office has not set one. */
  public sheetFor(orgTenantId: string, problemType?: string): { problemType?: string; items: JobSheetItem[]; general: boolean } {
    const key = clean(problemType, 120).toLowerCase()
    const match = key ? this.listSheets(orgTenantId).find((sheet) => sheet.problemType.toLowerCase() === key) : undefined
    return match ? { problemType: match.problemType, items: match.items, general: false } : { items: DEFAULT_JOB_SHEET, general: true }
  }

  public saveSheet(orgTenantId: string, problemType: string, items: JobSheetItem[]): { problemType: string; items: JobSheetItem[] } {
    const type = clean(problemType, 120)
    if (!type) throw new Error('Say which problem type this sheet is for')
    const error = jobSheetItemsError(items)
    if (error) throw new Error(error)
    const tidy = items.map((item) => ({
      id: item.id,
      label: clean(item.label, 160),
      kind: item.kind,
      ...(item.kind === 'measure' && clean(item.unit, 20) ? { unit: clean(item.unit, 20) } : {}),
      ...(item.required ? { required: true } : {}),
    }))
    this.db
      .prepare(
        `INSERT INTO org_job_sheets (id, org_tenant_id, problem_type, items_json) VALUES (?, ?, ?, ?)
         ON CONFLICT (org_tenant_id, problem_type) DO UPDATE SET items_json = excluded.items_json, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(randomUUID(), orgTenantId, type, JSON.stringify(tidy))
    return { problemType: type, items: tidy }
  }

  // ─── On a job ──────────────────────────────────────────────────────────

  private openRun(runId: string, orgTenantId: string) {
    const run = workflowRunRepository.findRunById(runId)
    if (!run || run.tenantId !== orgTenantId) throw new Error('Job not found')
    const state = (run.output && typeof run.output === 'object' ? { ...run.output } : {}) as Record<string, any>
    if (CLOSED_STAGES.has(String(state.workflowStage || '').toUpperCase()) || run.status === 'cancelled') {
      throw new Error('This job was cancelled')
    }
    const input = (state.workflowInput || run.input || {}) as Record<string, any>
    return { run, state, input }
  }

  private saveState(runId: string, state: Record<string, any>): void {
    this.db.prepare(`UPDATE workflow_runs SET output = ? WHERE id = ?`).run(JSON.stringify(state), runId)
  }

  public saveJobSheet(
    orgTenantId: string,
    runId: string,
    body: { answers?: Record<string, JobSheetAnswer>; materials?: JobSheetMaterial[] },
    savedBy: string,
  ): JobSheetRecord {
    const { state, input } = this.openRun(runId, orgTenantId)
    const sheet = this.sheetFor(orgTenantId, input.problemType)
    const answers: Record<string, JobSheetAnswer> = {}
    for (const item of sheet.items) {
      const answer = body.answers?.[item.id]
      if (!answer) continue
      if (item.kind === 'check') {
        if (typeof answer.ok === 'boolean') answers[item.id] = { ok: answer.ok, ...(clean(answer.value, 500) ? { value: clean(answer.value, 500) } : {}) }
      } else {
        const value = clean(answer.value, item.kind === 'measure' ? 60 : 2000)
        if (item.kind === 'measure' && value && !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`"${item.label}" must be a number`)
        if (value) answers[item.id] = { value }
      }
    }
    const materials = (Array.isArray(body.materials) ? body.materials : []).slice(0, 60).map((material) => {
      const name = clean(material?.name, 160)
      const quantity = Number(material?.quantity)
      if (!name) throw new Error('Name each item used')
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Say how many "${name}" were used`)
      return { name, quantity, ...(clean(material.unit, 20) ? { unit: clean(material.unit, 20) } : {}) }
    })
    const record: JobSheetRecord = {
      ...(sheet.problemType ? { problemType: sheet.problemType } : {}),
      items: sheet.items,
      answers,
      materials,
      savedAt: new Date().toISOString(),
      savedBy,
    }
    state.jobSheet = record
    this.saveState(runId, state)
    new ReconciliationService().recordEvent(jobEventReference(input, runId), 'JOB_SHEET_SAVED', 'workflow', {
      tenantId: orgTenantId,
      runId,
      savedBy,
      materials: materials.length,
    })
    return record
  }

  public saveStoreSignature(
    orgTenantId: string,
    runId: string,
    body: { signerName?: string; signerRole?: string; imageDataUrl?: string },
    by: string,
  ): StoreSignature {
    const { state, input } = this.openRun(runId, orgTenantId)
    const signerName = clean(body.signerName, 160)
    if (!signerName) throw new Error('Write the name of the person signing')
    const image = String(body.imageDataUrl || '')
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new Error('Ask them to sign in the box first')
    if (image.length > MAX_SIGNATURE_DATA_URL) throw new Error('The signature is too large. Clear it and sign again.')
    const signature: StoreSignature = {
      signerName,
      ...(clean(body.signerRole, 120) ? { signerRole: clean(body.signerRole, 120) } : {}),
      imageDataUrl: image,
      signedAt: new Date().toISOString(),
      by,
    }
    state.storeSignature = signature
    this.saveState(runId, state)
    new ReconciliationService().recordEvent(jobEventReference(input, runId), 'STORE_SIGNED', 'workflow', {
      tenantId: orgTenantId,
      runId,
      signerName,
      by,
    })
    return signature
  }
}

export const fieldJobSheetService = new FieldJobSheetService()
