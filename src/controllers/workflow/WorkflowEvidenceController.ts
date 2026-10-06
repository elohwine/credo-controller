import 'reflect-metadata'

import type { Request as ExRequest } from 'express'

import { randomUUID } from 'crypto'
import { Body, Controller, Post, Request, Route, Security, Tags } from 'tsoa'

import { workflowRepository } from '../../persistence/WorkflowRepository'
import { workflowRunRepository } from '../../persistence/WorkflowRunRepository'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

interface EvidenceCaptureRequest {
  imageBase64: string
  mimeType: string
  gpsLat: number | null
  gpsLng: number | null
  timestamp: string
  sha256: string
  notes: string
  providerRef?: string
  workflowLabel?: string
}

interface EvidenceCaptureResponse {
  providerRef: string
  runId: string
  status: 'completed'
}

@Route('api/workflows')
@Tags('Workflow Evidence')
export class WorkflowEvidenceController extends Controller {
  @Post('evidence')
  @Security('jwt', ['tenant'])
  public async captureEvidence(
    @Request() request: ExRequest,
    @Body() body: EvidenceCaptureRequest,
  ): Promise<EvidenceCaptureResponse> {
    const tenantId = ((request as any).user?.tenantId as string | undefined) || 'default'
    const providerRef =
      typeof body.providerRef === 'string' && body.providerRef.trim()
        ? body.providerRef.trim()
        : `evidence-${Date.now()}-${randomUUID().slice(0, 8)}`

    // Keep FEPT run progression strictly in-flow.
    // If providerRef resolves to an active FEPT run awaiting evidence, callers must use run resume APIs.
    const db = DatabaseManager.getDatabase()
    const feptRun = db
      .prepare(
        `SELECT id, workflow_id, status, output
         FROM workflow_runs
         WHERE tenant_id = ?
           AND (id = ? OR trigger_ref = ?)
         ORDER BY datetime(created_at) DESC
         LIMIT 1`
      )
      .get(tenantId, providerRef, providerRef) as
      | { id: string; workflow_id: string; status: string; output?: string | null }
      | undefined

    if (feptRun && !String(feptRun.workflow_id || '').startsWith('field-evidence-capture-')) {
      let pauseReason = ''
      try {
        const parsedOutput = feptRun.output ? JSON.parse(feptRun.output) : {}
        pauseReason = String(parsedOutput?.pauseReason || '').toLowerCase()
      } catch {
        pauseReason = ''
      }

      const isAwaitingEvidence = pauseReason === 'await_evidence_before' || pauseReason === 'await_evidence_after'
      const runStatus = String(feptRun.status || '').toLowerCase()
      const isFeptActive = ['paused', 'running', 'pending'].includes(runStatus)

      if (isAwaitingEvidence && isFeptActive) {
        this.setStatus(409)
        throw new Error(
          `Provider reference ${providerRef} is bound to FEPT run ${feptRun.id}. Use /workflows/runs/${feptRun.id}/resume for in-flow evidence capture.`
        )
      }
    }

    // FEPT §8: idempotency by content-hash — same image+sha256 from same actor
    // must not create duplicate workflow run records.
    const idempotencyAction = `capture-evidence:${body.sha256}`
    const idempotencyCheck = IdempotencyGuard.guard(db, request, tenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response as EvidenceCaptureResponse
    }

    const workflowId = `field-evidence-capture-${tenantId}`
    const imageDataUrl = `data:${body.mimeType};base64,${body.imageBase64}`
    const now = new Date()

    workflowRepository.save({
      id: workflowId,
      tenantId,
      name: 'Field Evidence Capture',
      category: 'field_execution',
      provider: 'credentis',
      description: 'Captures field evidence attachments for audit timelines.',
      inputSchema: {
        type: 'object',
        required: ['imageBase64', 'mimeType', 'timestamp', 'sha256'],
      },
      actions: [
        {
          action: 'field.capture_evidence',
          description: 'Persist captured field evidence',
          config: { workflowLabel: body.workflowLabel || 'Field Evidence' },
        },
      ],
    })

    const inputState = {
      providerRef,
      workflowLabel: body.workflowLabel || 'Field Evidence',
      imageDataUrl,
      mimeType: body.mimeType,
      gpsLat: body.gpsLat,
      gpsLng: body.gpsLng,
      timestamp: body.timestamp,
      evidenceHash: body.sha256,
      notes: body.notes,
    }

    const run = workflowRunRepository.createRun({
      workflowId,
      tenantId,
      status: 'completed',
      input: inputState,
      output: {
        providerRef,
        evidenceHash: body.sha256,
        status: 'completed',
        evidenceImage: imageDataUrl,
      },
      triggerType: 'manual',
      triggerRef: providerRef,
      actionsSnapshot: [
        {
          action: 'field.capture_evidence',
          config: { workflowLabel: body.workflowLabel || 'Field Evidence' },
        },
      ],
      currentStep: 1,
      totalSteps: 1,
      startedAt: now,
      completedAt: now,
    })

    const step = workflowRunRepository.createStep({
      runId: run.id,
      stepIndex: 0,
      actionName: 'field.capture_evidence',
      status: 'completed',
      config: { workflowLabel: body.workflowLabel || 'Field Evidence' },
      inputState,
      outputState: {
        providerRef,
        status: 'completed',
        evidenceImage: imageDataUrl,
        evidenceHash: body.sha256,
        notes: body.notes,
      },
      startedAt: now,
      completedAt: now,
      durationMs: 1,
    })

    workflowRunRepository.updateStep(step.id, {
      status: 'completed',
      outputState: {
        providerRef,
        status: 'completed',
        evidenceImage: imageDataUrl,
        evidenceHash: body.sha256,
        notes: body.notes,
      },
      durationMs: 1,
      completedAt: now,
    })

    const response: EvidenceCaptureResponse = {
      providerRef,
      runId: run.id,
      status: 'completed',
    }

    // FEPT §8: record first successful response so replays return the same outcome.
    if (idempotencyCheck.key) {
      IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, idempotencyAction, response)
    }

    return response
  }
}