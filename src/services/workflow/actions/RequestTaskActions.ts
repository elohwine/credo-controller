import type { WorkflowActionContext } from '../ActionRegistry'

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { rootLogger } from '../../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'RequestTaskActions' })

export class RequestTaskActions {
  /**
   * Creates a request_tasks row then throws WORKFLOW_PAUSE so WorkflowService
   * suspends the run. Resume is triggered via PlatformWorkflowService.completeTask().
   */
  public static async waitForTask(context: WorkflowActionContext, config: any = {}): Promise<void> {
    const { taskType = 'review', assigneeRef, dueInSeconds = 86_400 } = config
    const requestId: string | undefined = context.input?.requestId

    if (!requestId) {
      throw new Error('request.wait_for_task requires context.input.requestId')
    }

    const db = DatabaseManager.getDatabase()

    const org = db
      .prepare('SELECT id FROM organizations WHERE tenant_id = ? AND status = ? LIMIT 1')
      .get(context.tenantId, 'active') as { id?: string } | undefined

    let assigneePersonId: string | undefined
    if (assigneeRef && org?.id) {
      const person = db
        .prepare('SELECT id FROM people WHERE organization_id = ? AND subject_ref = ? AND status = ? LIMIT 1')
        .get(org.id, assigneeRef, 'active') as { id?: string } | undefined
      assigneePersonId = person?.id
    }

    const taskId = randomUUID()
    const dueAt = new Date(Date.now() + dueInSeconds * 1000).toISOString()

    db.prepare(
      `INSERT INTO request_tasks (id, request_id, task_type, assignee_person_id, status, due_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).run(taskId, requestId, taskType, assigneePersonId ?? null, dueAt)

    context.state.pendingTaskId = taskId
    logger.info({ taskId, requestId, taskType }, 'Task created; pausing workflow')

    throw Object.assign(new Error('WORKFLOW_PAUSE'), { taskId })
  }

  /**
   * Marks the task (id from resume data or context state) as completed.
   * Runs immediately after the workflow resumes from a wait_for_task pause.
   */
  public static async completeTask(context: WorkflowActionContext, config: any = {}): Promise<void> {
    const taskId: string | undefined = context.input?._resumeData?.taskId ?? context.state.pendingTaskId

    if (!taskId) {
      throw new Error('request.complete_task: no pending task id found in context')
    }

    const { outcomeRef } = config
    const db = DatabaseManager.getDatabase()

    const result = db
      .prepare(
        `UPDATE request_tasks
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, outcome_ref = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(outcomeRef ?? null, taskId)

    if (result.changes !== 1) {
      logger.warn({ taskId }, 'Task was not in pending state; skipping update')
    }

    context.state.completedTaskId = taskId
    context.state.pendingTaskId = undefined
    logger.info({ taskId, outcomeRef }, 'Task completed')
  }
}
