import { getOfflineStorageAdapter, OfflineStorageAdapter } from './storage'
import { getContextMode } from '@/lib/auth'
import { evaluateOrgActionPolicy, getCachedOrgContextBundle } from './orgContextBundle'

export type OfflineQueueStatus = 'queued' | 'syncing' | 'synced' | 'failed' | 'conflict'

export interface OfflineQueueContext {
  tenantId: string
  actorId: string
  deviceId: string
  workflowRunId?: string
  stepKey: string
  attempt: number
}

export interface OfflineQueueItem {
  id: string
  idempotencyKey: string
  payloadHash: string
  signature?: string
  tenantId: string
  actorId: string
  deviceId: string
  workflowRunId?: string
  stepKey: string
  attempt: number
  actionType: string
  payload: Record<string, unknown>
  status: OfflineQueueStatus
  createdAt: string
  updatedAt: string
  attempts: number
  lastError?: string
  syncResult?: Record<string, unknown>
}

export interface EnqueueOfflineActionInput {
  actionType: string
  payload: Record<string, unknown>
  signature?: string
  tenantId: string
  actorId: string
  deviceId: string
  workflowRunId?: string
  stepKey: string
  attempt?: number
  idempotencyKey?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function extractAmount(payload: Record<string, unknown>): number | null {
  const amount =
    (payload.amount as number | undefined) ??
    (payload.approvalAmount as number | undefined) ??
    (payload.invoiceAmount as number | undefined) ??
    (payload.waiverAmount as number | undefined)

  return typeof amount === 'number' && Number.isFinite(amount) ? amount : null
}

function hasEvidence(payload: Record<string, unknown>): boolean {
  const directCandidates = [
    payload.evidence,
    payload.evidenceHash,
    payload.evidenceId,
    payload.evidenceUrl,
    payload.photoUri,
    payload.signature,
    payload.proof,
  ]

  if (
    directCandidates.some((value) => {
      if (typeof value === 'string') return value.trim().length > 0
      if (typeof value === 'number') return Number.isFinite(value)
      if (Array.isArray(value)) return value.length > 0
      if (value && typeof value === 'object') return Object.keys(value).length > 0
      return value === true
    })
  ) {
    return true
  }

  const arrayCandidates = [payload.evidenceRefs, payload.evidenceIds, payload.attachments]
  return arrayCandidates.some((value) => Array.isArray(value) && value.length > 0)
}

function computePayloadHash(payload: Record<string, unknown>): string {
  const raw = JSON.stringify(payload ?? {})
  let hash = 0

  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(index)) | 0
  }

  return `mhash-${Math.abs(hash).toString(16)}-${raw.length}`
}

function newId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildOfflineIdempotencyKey(context: OfflineQueueContext): string {
  return [
    context.tenantId,
    context.actorId,
    context.deviceId,
    context.workflowRunId || 'no-run',
    context.stepKey,
    String(context.attempt),
  ].join(':')
}

export class MobileOfflineQueueService {
  public constructor(private readonly adapter: OfflineStorageAdapter = getOfflineStorageAdapter()) {}

  public enqueue(input: EnqueueOfflineActionInput): OfflineQueueItem {
    if (getContextMode() === 'org') {
      const orgBundle = getCachedOrgContextBundle(input.tenantId)
      const policyDecision = evaluateOrgActionPolicy(orgBundle, {
        actionType: input.actionType || input.stepKey,
        amount: extractAmount(input.payload),
        evidenceProvided: hasEvidence(input.payload),
        actionTimestamp: nowIso(),
      })

      if (!policyDecision.allowed) {
        const escalationHint = policyDecision.suggestedEscalationRole
          ? ` Escalate to ${policyDecision.suggestedEscalationRole}.`
          : ''
        throw new Error(`${policyDecision.reason || 'Offline action denied by org policy.'}${escalationHint}`)
      }
    }

    const attempt = input.attempt || 1
    const idempotencyKey =
      input.idempotencyKey ||
      buildOfflineIdempotencyKey({
        tenantId: input.tenantId,
        actorId: input.actorId,
        deviceId: input.deviceId,
        workflowRunId: input.workflowRunId,
        stepKey: input.stepKey,
        attempt,
      })

    const existing = this.adapter.get<OfflineQueueItem>('offline_queue', idempotencyKey)
    if (existing) {
      return existing
    }

    const timestamp = nowIso()
    const item: OfflineQueueItem = {
      id: newId(),
      idempotencyKey,
      payloadHash: computePayloadHash(input.payload),
      signature: input.signature,
      tenantId: input.tenantId,
      actorId: input.actorId,
      deviceId: input.deviceId,
      workflowRunId: input.workflowRunId,
      stepKey: input.stepKey,
      attempt,
      actionType: input.actionType,
      payload: input.payload,
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
      attempts: 0,
    }

    this.adapter.set('offline_queue', idempotencyKey, item)
    return item
  }

  public get(idempotencyKey: string): OfflineQueueItem | null {
    return this.adapter.get<OfflineQueueItem>('offline_queue', idempotencyKey)
  }

  public list(status?: OfflineQueueStatus): OfflineQueueItem[] {
    const items = this.adapter
      .list<OfflineQueueItem>('offline_queue')
      .map((entry) => entry.value)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

    if (!status) return items
    return items.filter((item) => item.status === status)
  }

  public markSyncing(idempotencyKey: string): OfflineQueueItem | null {
    return this.update(idempotencyKey, {
      status: 'syncing',
      attemptsDelta: 1,
      lastError: undefined,
    })
  }

  public markSynced(idempotencyKey: string, syncResult?: Record<string, unknown>): OfflineQueueItem | null {
    return this.update(idempotencyKey, {
      status: 'synced',
      syncResult,
      lastError: undefined,
    })
  }

  public markFailed(idempotencyKey: string, errorMessage: string): OfflineQueueItem | null {
    return this.update(idempotencyKey, {
      status: 'failed',
      lastError: errorMessage,
    })
  }

  public markConflict(idempotencyKey: string, errorMessage: string): OfflineQueueItem | null {
    return this.update(idempotencyKey, {
      status: 'conflict',
      lastError: errorMessage,
    })
  }

  public remove(idempotencyKey: string): void {
    this.adapter.remove('offline_queue', idempotencyKey)
  }

  public clearSynced(): number {
    const synced = this.list('synced')
    synced.forEach((item) => this.remove(item.idempotencyKey))
    return synced.length
  }

  private update(
    idempotencyKey: string,
    patch: {
      status?: OfflineQueueStatus
      syncResult?: Record<string, unknown>
      lastError?: string
      attemptsDelta?: number
    },
  ): OfflineQueueItem | null {
    const current = this.get(idempotencyKey)
    if (!current) return null

    const next: OfflineQueueItem = {
      ...current,
      status: patch.status || current.status,
      syncResult: patch.syncResult !== undefined ? patch.syncResult : current.syncResult,
      lastError: patch.lastError,
      attempts: current.attempts + (patch.attemptsDelta || 0),
      updatedAt: nowIso(),
    }

    this.adapter.set('offline_queue', idempotencyKey, next)
    return next
  }
}

let defaultQueueService: MobileOfflineQueueService | null = null

export function getOfflineQueueService(): MobileOfflineQueueService {
  if (!defaultQueueService) {
    defaultQueueService = new MobileOfflineQueueService()
  }

  return defaultQueueService
}

export function setOfflineQueueService(service: MobileOfflineQueueService): void {
  defaultQueueService = service
}
