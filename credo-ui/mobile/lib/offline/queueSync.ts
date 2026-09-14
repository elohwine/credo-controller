import api from '@/lib/api'
import { getContextTokenStrict } from '@/lib/auth'

import { getOfflineQueueService, OfflineQueueItem } from './queue'

type OfflineEnvelopeState = 'queued' | 'processing' | 'applied' | 'rejected' | 'conflict'

interface OfflineSubmitBatchEnvelope {
  tenantId: string
  actorId: string
  deviceId: string
  workflowRunId?: string
  stepKey: string
  attempt: number
  idempotencyKey: string
  payloadHash: string
  signature?: string
}

interface OfflineSubmitBatchResult {
  envelopeId: string
  idempotencyKey: string
  state: OfflineEnvelopeState
  processedAt?: string
  result?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
}

interface OfflineSubmitBatchResponse {
  accepted: number
  rejected: number
  results: OfflineSubmitBatchResult[]
}

export interface OfflineQueueFlushSummary {
  submitted: number
  synced: number
  failed: number
  conflicted: number
  rejected: number
  skipped: number
}

function toEnvelope(item: OfflineQueueItem): OfflineSubmitBatchEnvelope {
  return {
    tenantId: item.tenantId,
    actorId: item.actorId,
    deviceId: item.deviceId,
    workflowRunId: item.workflowRunId,
    stepKey: item.stepKey,
    attempt: item.attempt || 1,
    idempotencyKey: item.idempotencyKey,
    payloadHash: item.payloadHash,
    signature: item.signature,
  }
}

export async function flushOfflineQueueToServer(): Promise<OfflineQueueFlushSummary> {
  const queue = getOfflineQueueService()
  const token = getContextTokenStrict()
  const candidates = queue
    .list()
    .filter((item) => item.status === 'queued' || item.status === 'failed' || item.status === 'syncing')

  if (!token || candidates.length === 0) {
    return {
      submitted: 0,
      synced: 0,
      failed: 0,
      conflicted: 0,
      rejected: 0,
      skipped: candidates.length,
    }
  }

  candidates.forEach((item) => {
    queue.markSyncing(item.idempotencyKey)
  })

  try {
    const response = await api.post<OfflineSubmitBatchResponse>(
      '/offline/envelopes/submit-batch',
      { envelopes: candidates.map(toEnvelope) },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        skipAuthRedirect: true,
      } as any,
    )

    const results = Array.isArray(response.data?.results) ? response.data.results : []
    const resultMap = new Map(results.map((result) => [result.idempotencyKey, result]))

    let synced = 0
    let failed = 0
    let conflicted = 0
    let rejected = 0

    candidates.forEach((item) => {
      const result = resultMap.get(item.idempotencyKey)
      if (!result) {
        queue.markFailed(item.idempotencyKey, 'No result returned for queued envelope')
        failed += 1
        return
      }

      if (result.state === 'queued' || result.state === 'processing' || result.state === 'applied') {
        queue.markSynced(item.idempotencyKey, {
          envelopeId: result.envelopeId,
          state: result.state,
          processedAt: result.processedAt,
          result: result.result,
        })
        synced += 1
        return
      }

      if (result.state === 'conflict') {
        queue.markConflict(
          item.idempotencyKey,
          result.errorMessage || result.errorCode || 'Conflict during reconciliation',
        )
        conflicted += 1
        return
      }

      queue.markFailed(item.idempotencyKey, result.errorMessage || result.errorCode || 'Envelope rejected')
      failed += 1
      rejected += 1
    })

    return {
      submitted: candidates.length,
      synced,
      failed,
      conflicted,
      rejected,
      skipped: 0,
    }
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || 'Failed to submit offline queue'
    candidates.forEach((item) => {
      queue.markFailed(item.idempotencyKey, message)
    })

    return {
      submitted: candidates.length,
      synced: 0,
      failed: candidates.length,
      conflicted: 0,
      rejected: 0,
      skipped: 0,
    }
  }
}
