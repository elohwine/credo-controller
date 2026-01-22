/**
 * IdenEx Credentis - Workflow Run Repository
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Persistence layer for workflow execution tracking.
 * Records every workflow run, individual step execution, and triggers
 * for complete audit trail and debugging.
 * 
 * Run States:
 * - pending: Queued for execution
 * - running: Currently executing
 * - paused: Awaiting external input (e.g., payment confirmation)
 * - completed: Successfully finished
 * - failed: Execution error
 * - cancelled: Manually stopped
 * 
 * @module persistence/WorkflowRunRepository
 * @copyright 2024-2026 IdenEx Credentis
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { v4 as uuid } from 'uuid'

const logger = rootLogger.child({ module: 'WorkflowRunRepository' })

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type TriggerType = 'manual' | 'webhook' | 'schedule' | 'workflow'

export interface WorkflowRun {
    id: string
    workflowId: string
    tenantId: string
    status: WorkflowRunStatus
    input?: any
    output?: any
    error?: string
    triggerType: TriggerType
    triggerRef?: string
    currentStep: number
    totalSteps: number
    startedAt?: Date
    completedAt?: Date
    createdAt?: Date
}

export interface WorkflowStep {
    id: string
    runId: string
    stepIndex: number
    actionName: string
    config?: any
    status: WorkflowStepStatus
    inputState?: any
    outputState?: any
    error?: string
    durationMs?: number
    startedAt?: Date
    completedAt?: Date
    createdAt?: Date
}

export interface WorkflowTrigger {
    id: string
    workflowId: string
    tenantId: string
    triggerType: 'webhook' | 'schedule' | 'event'
    triggerConfig?: any
    isActive: boolean
    lastTriggeredAt?: Date
    createdAt?: Date
}

export class WorkflowRunRepository {
    // ==================== Workflow Runs ====================

    createRun(run: Partial<WorkflowRun> & { workflowId: string; tenantId: string }): WorkflowRun {
        const db = DatabaseManager.getDatabase()
        const id = run.id || uuid()

        const stmt = db.prepare(`
            INSERT INTO workflow_runs (
                id, workflow_id, tenant_id, status, input, output, error,
                trigger_type, trigger_ref, current_step, total_steps, started_at
            ) VALUES (
                @id, @workflowId, @tenantId, @status, @input, @output, @error,
                @triggerType, @triggerRef, @currentStep, @totalSteps, @startedAt
            )
        `)

        stmt.run({
            id,
            workflowId: run.workflowId,
            tenantId: run.tenantId,
            status: run.status || 'pending',
            input: run.input ? JSON.stringify(run.input) : null,
            output: run.output ? JSON.stringify(run.output) : null,
            error: run.error || null,
            triggerType: run.triggerType || 'manual',
            triggerRef: run.triggerRef || null,
            currentStep: run.currentStep || 0,
            totalSteps: run.totalSteps || 0,
            startedAt: run.startedAt?.toISOString() || null
        })

        logger.info({ runId: id, workflowId: run.workflowId }, 'Workflow run created')
        return this.findRunById(id)!
    }

    updateRun(id: string, updates: Partial<WorkflowRun>): WorkflowRun | undefined {
        const db = DatabaseManager.getDatabase()

        const setClauses: string[] = []
        const params: any = { id }

        if (updates.status !== undefined) {
            setClauses.push('status = @status')
            params.status = updates.status
        }
        if (updates.output !== undefined) {
            setClauses.push('output = @output')
            params.output = JSON.stringify(updates.output)
        }
        if (updates.error !== undefined) {
            setClauses.push('error = @error')
            params.error = updates.error
        }
        if (updates.currentStep !== undefined) {
            setClauses.push('current_step = @currentStep')
            params.currentStep = updates.currentStep
        }
        if (updates.startedAt !== undefined) {
            setClauses.push('started_at = @startedAt')
            params.startedAt = updates.startedAt?.toISOString() || null
        }
        if (updates.completedAt !== undefined) {
            setClauses.push('completed_at = @completedAt')
            params.completedAt = updates.completedAt?.toISOString() || null
        }

        if (setClauses.length === 0) return this.findRunById(id)

        const stmt = db.prepare(`UPDATE workflow_runs SET ${setClauses.join(', ')} WHERE id = @id`)
        stmt.run(params)

        return this.findRunById(id)
    }

    findRunById(id: string): WorkflowRun | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT id, workflow_id as workflowId, tenant_id as tenantId, status,
                   input, output, error, trigger_type as triggerType, trigger_ref as triggerRef,
                   current_step as currentStep, total_steps as totalSteps,
                   started_at as startedAt, completed_at as completedAt, created_at as createdAt
            FROM workflow_runs WHERE id = ?
        `).get(id) as any

        if (!row) return undefined

        return {
            ...row,
            input: row.input ? JSON.parse(row.input) : undefined,
            output: row.output ? JSON.parse(row.output) : undefined,
            startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
            completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }
    }

    listRuns(tenantId: string, workflowId?: string, status?: WorkflowRunStatus, limit = 50): WorkflowRun[] {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT id, workflow_id as workflowId, tenant_id as tenantId, status,
                   input, output, error, trigger_type as triggerType, trigger_ref as triggerRef,
                   current_step as currentStep, total_steps as totalSteps,
                   started_at as startedAt, completed_at as completedAt, created_at as createdAt
            FROM workflow_runs WHERE tenant_id = ?
        `
        const params: any[] = [tenantId]

        if (workflowId) {
            query += ' AND workflow_id = ?'
            params.push(workflowId)
        }
        if (status) {
            query += ' AND status = ?'
            params.push(status)
        }

        query += ' ORDER BY created_at DESC LIMIT ?'
        params.push(limit)

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(row => ({
            ...row,
            input: row.input ? JSON.parse(row.input) : undefined,
            output: row.output ? JSON.parse(row.output) : undefined,
            startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
            completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }))
    }

    // ==================== Workflow Steps ====================

    createStep(step: Partial<WorkflowStep> & { runId: string; stepIndex: number; actionName: string }): WorkflowStep {
        const db = DatabaseManager.getDatabase()
        const id = step.id || uuid()

        const stmt = db.prepare(`
            INSERT INTO workflow_steps (
                id, run_id, step_index, action_name, config, status, input_state
            ) VALUES (
                @id, @runId, @stepIndex, @actionName, @config, @status, @inputState
            )
        `)

        stmt.run({
            id,
            runId: step.runId,
            stepIndex: step.stepIndex,
            actionName: step.actionName,
            config: step.config ? JSON.stringify(step.config) : null,
            status: step.status || 'pending',
            inputState: step.inputState ? JSON.stringify(step.inputState) : null
        })

        return this.findStepById(id)!
    }

    updateStep(id: string, updates: Partial<WorkflowStep>): WorkflowStep | undefined {
        const db = DatabaseManager.getDatabase()

        const setClauses: string[] = []
        const params: any = { id }

        if (updates.status !== undefined) {
            setClauses.push('status = @status')
            params.status = updates.status
        }
        if (updates.outputState !== undefined) {
            setClauses.push('output_state = @outputState')
            params.outputState = JSON.stringify(updates.outputState)
        }
        if (updates.error !== undefined) {
            setClauses.push('error = @error')
            params.error = updates.error
        }
        if (updates.durationMs !== undefined) {
            setClauses.push('duration_ms = @durationMs')
            params.durationMs = updates.durationMs
        }
        if (updates.startedAt !== undefined) {
            setClauses.push('started_at = @startedAt')
            params.startedAt = updates.startedAt?.toISOString() || null
        }
        if (updates.completedAt !== undefined) {
            setClauses.push('completed_at = @completedAt')
            params.completedAt = updates.completedAt?.toISOString() || null
        }

        if (setClauses.length === 0) return this.findStepById(id)

        const stmt = db.prepare(`UPDATE workflow_steps SET ${setClauses.join(', ')} WHERE id = @id`)
        stmt.run(params)

        return this.findStepById(id)
    }

    findStepById(id: string): WorkflowStep | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT id, run_id as runId, step_index as stepIndex, action_name as actionName,
                   config, status, input_state as inputState, output_state as outputState,
                   error, duration_ms as durationMs, started_at as startedAt, 
                   completed_at as completedAt, created_at as createdAt
            FROM workflow_steps WHERE id = ?
        `).get(id) as any

        if (!row) return undefined

        return {
            ...row,
            config: row.config ? JSON.parse(row.config) : undefined,
            inputState: row.inputState ? JSON.parse(row.inputState) : undefined,
            outputState: row.outputState ? JSON.parse(row.outputState) : undefined,
            startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
            completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }
    }

    listSteps(runId: string): WorkflowStep[] {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
            SELECT id, run_id as runId, step_index as stepIndex, action_name as actionName,
                   config, status, input_state as inputState, output_state as outputState,
                   error, duration_ms as durationMs, started_at as startedAt, 
                   completed_at as completedAt, created_at as createdAt
            FROM workflow_steps WHERE run_id = ? ORDER BY step_index ASC
        `).all(runId) as any[]

        return rows.map(row => ({
            ...row,
            config: row.config ? JSON.parse(row.config) : undefined,
            inputState: row.inputState ? JSON.parse(row.inputState) : undefined,
            outputState: row.outputState ? JSON.parse(row.outputState) : undefined,
            startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
            completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }))
    }

    // ==================== Workflow Triggers ====================

    saveTrigger(trigger: Partial<WorkflowTrigger> & { workflowId: string; tenantId: string; triggerType: string }): WorkflowTrigger {
        const db = DatabaseManager.getDatabase()
        const id = trigger.id || uuid()

        const stmt = db.prepare(`
            INSERT INTO workflow_triggers (
                id, workflow_id, tenant_id, trigger_type, trigger_config, is_active
            ) VALUES (
                @id, @workflowId, @tenantId, @triggerType, @triggerConfig, @isActive
            )
            ON CONFLICT(id) DO UPDATE SET
                trigger_type = @triggerType,
                trigger_config = @triggerConfig,
                is_active = @isActive
        `)

        stmt.run({
            id,
            workflowId: trigger.workflowId,
            tenantId: trigger.tenantId,
            triggerType: trigger.triggerType,
            triggerConfig: trigger.triggerConfig ? JSON.stringify(trigger.triggerConfig) : null,
            isActive: trigger.isActive !== false ? 1 : 0
        })

        return this.findTriggerById(id)!
    }

    findTriggerById(id: string): WorkflowTrigger | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT id, workflow_id as workflowId, tenant_id as tenantId,
                   trigger_type as triggerType, trigger_config as triggerConfig,
                   is_active as isActive, last_triggered_at as lastTriggeredAt, created_at as createdAt
            FROM workflow_triggers WHERE id = ?
        `).get(id) as any

        if (!row) return undefined

        return {
            ...row,
            triggerConfig: row.triggerConfig ? JSON.parse(row.triggerConfig) : undefined,
            isActive: !!row.isActive,
            lastTriggeredAt: row.lastTriggeredAt ? new Date(row.lastTriggeredAt) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }
    }

    listTriggers(tenantId: string, workflowId?: string): WorkflowTrigger[] {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT id, workflow_id as workflowId, tenant_id as tenantId,
                   trigger_type as triggerType, trigger_config as triggerConfig,
                   is_active as isActive, last_triggered_at as lastTriggeredAt, created_at as createdAt
            FROM workflow_triggers WHERE tenant_id = ?
        `
        const params: any[] = [tenantId]

        if (workflowId) {
            query += ' AND workflow_id = ?'
            params.push(workflowId)
        }

        query += ' ORDER BY created_at DESC'

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(row => ({
            ...row,
            triggerConfig: row.triggerConfig ? JSON.parse(row.triggerConfig) : undefined,
            isActive: !!row.isActive,
            lastTriggeredAt: row.lastTriggeredAt ? new Date(row.lastTriggeredAt) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }))
    }

    deleteTrigger(id: string): boolean {
        const db = DatabaseManager.getDatabase()
        const result = db.prepare('DELETE FROM workflow_triggers WHERE id = ?').run(id)
        return result.changes > 0
    }
}

export const workflowRunRepository = new WorkflowRunRepository()
