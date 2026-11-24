/**
 * Jobs that are stuck, and who is told.
 *
 * A field job is stuck when it has stopped (failed), is late (booked for a day that has gone), has
 * nobody on it, or has not moved for a while. A mail or hand-written job nobody has booked is stuck
 * too. Nothing in a stuck job fixes itself, so the office hears about it three ways:
 *
 *   - once, as soon as the job is seen to be stuck (owners and admins; the worker too when the job
 *     is theirs and is not moving),
 *   - once a day, one summary of everything still stuck for a day or more,
 *   - once a week, on Monday, one summary of the whole list instead of the daily one.
 *
 * The messages are inbox cards of the kind a finished job already sends (`workflow_update`), so
 * they appear on the phone and go out on WhatsApp through the same trigger as every other card.
 * Jobs are read through `OperationsRegisterService`; nothing here keeps its own copy of a job.
 * `job_attention_log` only remembers what was already said.
 */

import { randomUUID } from 'crypto'

import { fieldJobPriority, OPEN_FIELD_JOB_CATEGORIES } from '../config/fieldJobCategory'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { jobIntakeRepository } from '../persistence/JobIntakeRepository'
import { rootLogger } from '../utils/pinoLogger'
import { jobDashboardSettingsService, type JobResponseTargets } from './JobDashboardSettingsService'

import { operationsRegisterService, type JobSummary } from './OperationsRegisterService'

const logger = rootLogger.child({ module: 'JobAttentionService' })

export type AttentionKind =
  | 'failed'
  | 'overdue'
  | 'unassigned'
  | 'stalled'
  | 'waiting'
  | 'response_at_risk'
  | 'response_breached'

export interface AttentionItem {
  kind: AttentionKind
  /** The job, when there is one. */
  runId?: string
  /** The job waiting to be booked, when it is not a job yet. */
  intakeId?: string
  reference: string
  /** How the job is named in a sentence ("job PO-77"). */
  label: string
  storeNumber?: string
  assigneeId?: string
  /** When it started to be stuck. */
  since: string
  /** Whole days stuck. */
  days: number
  headline: string
  detail: string
  elapsedMinutes?: number
  targetMinutes?: number
}

export const ATTENTION = {
  /** A booked job nobody has been put on. */
  unassignedHours: 24,
  /** A job with a worker that has had no progress. */
  stalledHours: 48,
  /** A step that says it is running but has not finished. */
  runningHours: 1,
  /** A job waiting to be booked. */
  waitingHours: 24,
  /** Older problems are listed but not announced one by one (the first sweep would flood the inbox). */
  announceWithinDays: 14,
  /** Daily and weekly summaries go out from this hour (UTC) on. */
  summaryHourUtc: 6,
  /** Mondays: 1 (UTC day of week). */
  weeklyDay: 1,
  /** A job stuck this long is called out as still stuck. */
  seriousDays: 3,
} as const

const HOUR = 3_600_000
const DAY = 24 * HOUR

const KIND_ORDER: AttentionKind[] = [
  'response_breached',
  'response_at_risk',
  'failed',
  'overdue',
  'unassigned',
  'stalled',
  'waiting',
]
const KIND_WORDS: Record<AttentionKind, string> = {
  failed: 'stopped',
  overdue: 'late',
  unassigned: 'with nobody on them',
  stalled: 'not moving',
  waiting: 'waiting to be booked',
  response_at_risk: 'approaching the first-response target',
  response_breached: 'past the first-response target',
}

/** SQLite stores UTC times without a zone ("2026-11-21 08:00:00"); read them as UTC. */
function time(value: unknown): number {
  const text = String(value || '').trim()
  if (!text) return NaN
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text)
    ? text
    : `${text.replace(' ', 'T')}${text.length === 10 ? 'T00:00:00' : ''}Z`
  return Date.parse(iso)
}

function age(ms: number): string {
  if (ms < DAY) {
    const hours = Math.max(1, Math.floor(ms / HOUR))
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = Math.floor(ms / DAY)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** How a job is named in a message: its PO or reference, or what it is about. Never a raw id. */
export function jobLabel(job: { poNumber?: string; reference?: string; description?: string }): string {
  const ref = String(job.poNumber || job.reference || '').trim()
  if (ref && ref.length <= 40 && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref) && !/^[0-9a-f]{24,}$/i.test(ref))
    return `job ${ref}`
  const what = String(job.description || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
  return what ? `the job "${what}"` : 'a job'
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "2026-W47": the week a summary belongs to (ISO, UTC). */
export function weekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNumber = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - dayNumber)
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / DAY + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

interface Recipient {
  userId: string
  walletTenantId: string
}

export class JobAttentionService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  // ─── What is stuck ─────────────────────────────────────────────────────

  /** Every stuck job and waiting job for the organisation, worst and oldest first. */
  public attention(orgTenantId: string, now = new Date()): AttentionItem[] {
    const items: AttentionItem[] = []
    const jobs = operationsRegisterService.listJobs(orgTenantId)
    const progress = this.progressOf(orgTenantId)
    const responseTargets = jobDashboardSettingsService.responseTargets(orgTenantId)
    const today = now.toISOString().slice(0, 10)

    for (const job of jobs) {
      const item = this.classify(job, progress.get(job.runId), today, now.getTime(), responseTargets)
      if (item) items.push(item)
    }

    for (const intake of jobIntakeRepository.listForTenant(orgTenantId, 'pending')) {
      const since = time(intake.createdAt)
      if (!Number.isFinite(since)) continue
      const reference = intake.payload.reference || intake.payload.poNumber || 'New job'
      const label = jobLabel({
        poNumber: intake.payload.poNumber,
        reference: intake.payload.reference,
        description: intake.payload.description,
      })
      const priority = fieldJobPriority({ input: intake.payload })
      const targetMinutes = priority ? responseTargets[priority] : null
      const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - since) / 60_000))
      if (targetMinutes) {
        if (elapsedMinutes >= targetMinutes * 0.75) {
          const breached = elapsedMinutes >= targetMinutes
          const remaining = Math.max(0, targetMinutes - elapsedMinutes)
          const duration = (minutes: number) =>
            minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`
          items.push({
            kind: breached ? 'response_breached' : 'response_at_risk',
            intakeId: intake.id,
            reference,
            label,
            storeNumber: intake.payload.storeNumber || undefined,
            since: new Date(since).toISOString(),
            days: Math.max(0, Math.floor((now.getTime() - since) / DAY)),
            headline: `${sentence(label)} response ${breached ? 'is late' : 'is at risk'}`,
            detail: breached
              ? `No worker has been assigned after ${duration(elapsedMinutes)}. The ${duration(targetMinutes)} first-response target was missed.`
              : `No worker has been assigned. ${duration(remaining)} remain before the ${duration(targetMinutes)} first-response target.`,
            elapsedMinutes,
            targetMinutes,
          })
        }
        continue
      }
      if (now.getTime() - since < ATTENTION.waitingHours * HOUR) continue
      items.push({
        kind: 'waiting',
        intakeId: intake.id,
        reference,
        label,
        storeNumber: intake.payload.storeNumber || undefined,
        since: new Date(since).toISOString(),
        days: Math.floor((now.getTime() - since) / DAY),
        headline: `${sentence(label)} is still waiting to be booked`,
        detail: `It came in ${age(now.getTime() - since)} ago and nobody has booked it yet.`,
      })
    }

    return items.sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || Date.parse(a.since) - Date.parse(b.since),
    )
  }

  private progressOf(orgTenantId: string): Map<string, { status: string; lastStep?: number; finishedAt?: number }> {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.status, r.completed_at AS finishedAt,
                MAX(COALESCE(s.completed_at, s.started_at, s.created_at)) AS lastStep
           FROM workflow_runs r LEFT JOIN workflow_steps s ON s.run_id = r.id
          WHERE r.tenant_id = ? AND r.status NOT IN ('completed', 'cancelled')
          GROUP BY r.id`,
      )
      .all(orgTenantId) as Array<{ id: string; status: string; finishedAt?: string; lastStep?: string }>
    return new Map(
      rows.map((row) => [
        row.id,
        { status: row.status, lastStep: time(row.lastStep), finishedAt: time(row.finishedAt) },
      ]),
    )
  }

  private classify(
    job: JobSummary,
    progress: { status: string; lastStep?: number; finishedAt?: number } | undefined,
    today: string,
    now: number,
    responseTargets: JobResponseTargets,
  ): AttentionItem | undefined {
    const created = time(job.createdAt)
    const known = [created, progress?.lastStep].filter((value): value is number => Number.isFinite(value))
    // A job with no readable time at all cannot be called old.
    const last = known.length > 0 ? Math.max(...known) : now
    const label = jobLabel(job)
    const base = {
      runId: job.runId,
      reference: job.reference,
      label,
      storeNumber: job.storeNumber,
      assigneeId: job.assigneeId,
    }
    const make = (kind: AttentionKind, since: number, headline: string, detail: string): AttentionItem => ({
      ...base,
      kind,
      since: new Date(since).toISOString(),
      days: Math.max(0, Math.floor((now - since) / DAY)),
      headline,
      detail,
    })

    if (job.failedVisit) {
      const since = time(job.failedVisit.at)
      const at = Number.isFinite(since) ? since : last
      return make(
        'failed',
        at,
        `${sentence(label)}: visit failed`,
        `${job.failedVisit.label}${job.failedVisit.note ? ` (${job.failedVisit.note})` : ''}, ${age(now - at)} ago. Re-book it with a new date.`,
      )
    }
    if (job.category === 'failed') {
      const since = Number.isFinite(progress?.finishedAt) ? progress!.finishedAt! : last
      return make(
        'failed',
        since,
        `${sentence(label)} stopped`,
        `A step could not finish, so nothing is happening on it (${age(now - since)}). Open it to try again, or cancel it.`,
      )
    }
    if (!OPEN_FIELD_JOB_CATEGORIES.has(job.category)) return undefined

    if (progress?.status === 'running' && now - last >= ATTENTION.runningHours * HOUR) {
      return make(
        'stalled',
        last,
        `${sentence(label)} is stuck mid-step`,
        `A step started ${age(now - last)} ago and has not finished. Open it to see where it stopped.`,
      )
    }
    if (job.category === 'pending' && !job.assigneeId && job.priority) {
      const targetMinutes = responseTargets[job.priority]
      const elapsedMinutes = Math.max(0, Math.floor((now - created) / 60_000))
      if (targetMinutes && elapsedMinutes >= targetMinutes * 0.75) {
        const breached = elapsedMinutes >= targetMinutes
        const remaining = Math.max(0, targetMinutes - elapsedMinutes)
        const duration = (minutes: number) =>
          minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`
        return {
          ...make(
            breached ? 'response_breached' : 'response_at_risk',
            created,
            `${sentence(label)} response ${breached ? 'is late' : 'is at risk'}`,
            breached
              ? `No worker has been assigned after ${duration(elapsedMinutes)}. The ${duration(targetMinutes)} first-response target was missed.`
              : `No worker has been assigned. ${duration(remaining)} remain before the ${duration(targetMinutes)} first-response target.`,
          ),
          elapsedMinutes,
          targetMinutes,
        }
      }
    }
    if (job.scheduledDate && job.scheduledDate < today) {
      const due = time(`${job.scheduledDate}T00:00:00`)
      return make(
        'overdue',
        due,
        `${sentence(label)} is late`,
        `It was booked for ${job.scheduledDate} and is not finished. ${job.assigneeId ? 'Check with the worker.' : 'Nobody is on it yet.'}`,
      )
    }
    if (
      job.category === 'pending' &&
      !job.assigneeId &&
      now - created >= ATTENTION.unassignedHours * HOUR &&
      !(job.priority && responseTargets[job.priority])
    ) {
      return make(
        'unassigned',
        created,
        `${sentence(label)} has nobody on it`,
        `It has been booked for ${age(now - created)} and no worker has been chosen.`,
      )
    }
    if (
      job.assigneeId &&
      ['assigned', 'active', 'arrived', 'on_hold'].includes(job.category) &&
      now - last >= ATTENTION.stalledHours * HOUR
    ) {
      return make(
        'stalled',
        last,
        `${sentence(label)} has not moved`,
        `No progress for ${age(now - last)}${job.category === 'on_hold' ? ' while it is on hold' : ''}. Check with the worker.`,
      )
    }
    return undefined
  }

  // ─── Telling people ────────────────────────────────────────────────────

  /** A job just stopped: say so now instead of waiting for the next hourly check. */
  public onRunFailed(runId: string, now = new Date()): void {
    try {
      const run = this.db.prepare(`SELECT tenant_id AS tenantId FROM workflow_runs WHERE id = ?`).get(runId) as
        | { tenantId?: string }
        | undefined
      if (run?.tenantId) this.sweepOrganisation(run.tenantId, now)
    } catch (error: any) {
      logger.warn({ runId, error: error?.message }, 'Could not announce a stopped job')
    }
  }

  /** Every organisation that has jobs or incoming jobs. Run hourly. */
  public sweep(now = new Date()): { organisations: number; announced: number; summaries: number } {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT tenant_id AS tenantId FROM workflow_runs WHERE status NOT IN ('completed', 'cancelled')
         UNION
         SELECT DISTINCT tenant_id FROM job_intakes WHERE status = 'pending'`,
      )
      .all() as Array<{ tenantId: string }>
    const totals = { organisations: 0, announced: 0, summaries: 0 }
    for (const row of rows) {
      try {
        const result = this.sweepOrganisation(row.tenantId, now)
        totals.organisations += 1
        totals.announced += result.announced
        totals.summaries += result.summaries
      } catch (error: any) {
        logger.warn(
          { orgTenantId: row.tenantId, error: error?.message },
          'Job attention check failed for an organisation',
        )
      }
    }
    this.db
      .prepare(
        `DELETE FROM job_attention_log WHERE scope IN ('day', 'week') AND datetime(notified_at) < datetime('now', '-120 days')`,
      )
      .run()
    return totals
  }

  public sweepOrganisation(orgTenantId: string, now = new Date()): { announced: number; summaries: number } {
    const items = this.attention(orgTenantId, now)
    const result = { announced: 0, summaries: 0 }

    // Jobs that are no longer stuck: forget them (so a second time is announced again) and close their cards.
    this.release(orgTenantId, items, now)

    const managers = this.managers(orgTenantId)
    const announceAfter = now.getTime() - ATTENTION.announceWithinDays * DAY
    for (const item of items) {
      const scope = item.runId ? 'run' : 'intake'
      const subject = item.runId || item.intakeId!
      const fresh = this.db
        .prepare(
          `INSERT OR IGNORE INTO job_attention_log (org_tenant_id, scope, subject, kind, notified_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(orgTenantId, scope, subject, item.kind, now.toISOString())
      if (fresh.changes === 0) continue
      if (Date.parse(item.since) < announceAfter) continue // listed in the summaries, not announced one by one

      const recipients = [...managers]
      if (item.runId && item.assigneeId && item.kind !== 'failed') {
        const worker = this.recipient(item.assigneeId)
        if (worker && !recipients.some((entry) => entry.walletTenantId === worker.walletTenantId))
          recipients.push(worker)
      }
      const sent = this.send(orgTenantId, recipients, {
        sourceId: `${scope}:${subject}:attention:${item.kind}:${now.toISOString()}`,
        runId: item.runId,
        title: item.headline,
        body: item.detail,
        metadata: { outcome: item.kind, reference: item.reference, attention: true },
      })
      if (sent > 0) result.announced += 1
    }

    result.summaries += this.summarise(orgTenantId, items, managers, now)
    return result
  }

  /** The daily summary, or on Monday the weekly one. At most one per day. */
  private summarise(orgTenantId: string, items: AttentionItem[], managers: Recipient[], now: Date): number {
    if (managers.length === 0 || now.getUTCHours() < ATTENTION.summaryHourUtc) return 0
    const weekly = now.getUTCDay() === ATTENTION.weeklyDay
    // The daily summary is for things stuck a day or more; the weekly one lists everything.
    const listed = weekly ? items : items.filter((item) => item.days >= 1)
    if (listed.length === 0) return 0

    const scope = weekly ? 'week' : 'day'
    const subject = weekly ? weekKey(now) : now.toISOString().slice(0, 10)
    const fresh = this.db
      .prepare(
        `INSERT OR IGNORE INTO job_attention_log (org_tenant_id, scope, subject, kind, notified_at) VALUES (?, ?, ?, 'summary', ?)`,
      )
      .run(orgTenantId, scope, subject, now.toISOString())
    if (fresh.changes === 0) return 0

    const counts = KIND_ORDER.map((kind) => ({
      kind,
      count: listed.filter((item) => item.kind === kind).length,
    })).filter((entry) => entry.count > 0)
    const oldest = [...listed].sort((a, b) => Date.parse(a.since) - Date.parse(b.since))[0]
    const serious = listed.filter((item) => item.days >= ATTENTION.seriousDays).length
    const stoppedThisWeek = items.filter(
      (item) => item.kind === 'failed' && now.getTime() - Date.parse(item.since) < 7 * DAY,
    ).length

    const title = weekly
      ? `Weekly jobs check: ${plural(listed.length, 'job')} need${listed.length === 1 ? 's' : ''} attention`
      : `${serious > 0 ? 'Still stuck: ' : ''}${plural(listed.length, 'job')} need${listed.length === 1 ? 's' : ''} attention`
    const lines = [
      counts.map((entry) => `${entry.count} ${KIND_WORDS[entry.kind]}`).join(', ') + '.',
      oldest ? `Longest: ${oldest.label}, ${oldest.days >= 1 ? plural(oldest.days, 'day') : 'today'}.` : '',
      serious > 0 ? `${plural(serious, 'job')} stuck for ${ATTENTION.seriousDays} days or more.` : '',
      weekly && stoppedThisWeek > 0 ? `${plural(stoppedThisWeek, 'job')} stopped this week.` : '',
      'Open Jobs to deal with them.',
    ].filter(Boolean)

    // Yesterday's summary is out of date once today's arrives.
    this.db
      .prepare(
        `UPDATE wallet_pending_offers SET resolved_at = ?
          WHERE issuer_tenant_id = ? AND source_type = 'workflow_update' AND source_id LIKE ? AND resolved_at IS NULL`,
      )
      .run(now.toISOString(), orgTenantId, `org:${orgTenantId}:attention-%`)

    const sent = this.send(orgTenantId, managers, {
      sourceId: `org:${orgTenantId}:attention-${scope}:${subject}`,
      title,
      body: lines.join(' '),
      metadata: { outcome: weekly ? 'weekly' : 'daily', count: listed.length, attention: true },
    })
    return sent > 0 ? 1 : 0
  }

  /** Forget jobs that are no longer stuck and close the cards that said so. */
  private release(orgTenantId: string, items: AttentionItem[], now: Date): void {
    const stuck = new Set(
      items.map((item) => `${item.runId ? 'run' : 'intake'}|${item.runId || item.intakeId}|${item.kind}`),
    )
    const logged = this.db
      .prepare(
        `SELECT scope, subject, kind FROM job_attention_log WHERE org_tenant_id = ? AND scope IN ('run', 'intake')`,
      )
      .all(orgTenantId) as Array<{ scope: string; subject: string; kind: string }>
    for (const row of logged) {
      if (stuck.has(`${row.scope}|${row.subject}|${row.kind}`)) continue
      this.db
        .prepare(`DELETE FROM job_attention_log WHERE org_tenant_id = ? AND scope = ? AND subject = ? AND kind = ?`)
        .run(orgTenantId, row.scope, row.subject, row.kind)
      this.db
        .prepare(
          `UPDATE wallet_pending_offers SET resolved_at = ?
            WHERE issuer_tenant_id = ? AND source_type = 'workflow_update' AND source_id LIKE ? AND resolved_at IS NULL`,
        )
        .run(now.toISOString(), orgTenantId, `${row.scope}:${row.subject}:attention:${row.kind}:%`)
    }
  }

  private managers(orgTenantId: string): Recipient[] {
    return this.db
      .prepare(
        `SELECT m.user_id AS userId, u.tenant_id AS walletTenantId
           FROM org_memberships m JOIN ssi_users u ON u.id = m.user_id
          WHERE m.org_tenant_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin')
            AND u.tenant_id IS NOT NULL AND u.tenant_id <> ''`,
      )
      .all(orgTenantId) as Recipient[]
  }

  private recipient(userId: string): Recipient | undefined {
    const row = this.db
      .prepare(`SELECT id AS userId, tenant_id AS walletTenantId FROM ssi_users WHERE id = ?`)
      .get(userId) as Recipient | undefined
    return row?.walletTenantId ? row : undefined
  }

  /** One inbox card per person. The same card id is never written twice. */
  private send(
    orgTenantId: string,
    recipients: Recipient[],
    card: { sourceId: string; runId?: string; title: string; body: string; metadata: Record<string, unknown> },
  ): number {
    const org = this.db.prepare(`SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1`).get(orgTenantId) as
      | { name?: string }
      | undefined
    const createdAt = new Date().toISOString()
    let written = 0
    for (const person of recipients) {
      const inserted = this.db
        .prepare(
          `INSERT INTO wallet_pending_offers (
             id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
             title, body, metadata, workflow_run_id, created_at
           )
           SELECT ?, ?, ?, 'workflow_update', ?, 'WorkflowUpdate', '', ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM wallet_pending_offers
              WHERE tenant_id = ? AND source_type = 'workflow_update' AND source_id = ?
           )`,
        )
        .run(
          randomUUID().replace(/-/g, ''),
          person.walletTenantId,
          orgTenantId,
          card.sourceId,
          card.title,
          card.body,
          JSON.stringify({
            ...card.metadata,
            workflowRunId: card.runId,
            orgTenantId,
            orgName: org?.name || undefined,
          }),
          card.runId || null,
          createdAt,
          person.walletTenantId,
          card.sourceId,
        )
      written += inserted.changes
    }
    return written
  }
}

export const jobAttentionService = new JobAttentionService()
