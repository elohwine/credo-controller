/**
 * IdenEx Credentis - Workflow Request Repository
 *
 * Persistence layer for holder→org workflow initiation requests.
 * Supports contacts-driven workflows: quote requests, invoice requests,
 * VC issuance requests, requisitions, service requests.
 *
 * @module persistence/WorkflowRequestRepository
 * @copyright 2024-2026 IdenEx Credentis
 */

import { ensureTenantMirrorsForFk } from '../services/PersistenceTenantMirrorService'
import { rootLogger } from '../utils/pinoLogger'

import { DatabaseManager } from './DatabaseManager'

const logger = rootLogger.child({ module: 'WorkflowRequestRepository' })

export type WorkflowRequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled' | 'expired'

export type WorkflowRequestType = 'quote' | 'invoice' | 'vc_issuance' | 'service' | 'requisition' | 'payment_link'

export interface WorkflowRequest {
  id: string
  requesterTenantId: string
  requesterDid?: string
  targetOrgTenantId: string
  contactId?: string
  requestType: WorkflowRequestType
  workflowType?: string
  workflowId?: string
  payload: Record<string, any>
  status: WorkflowRequestStatus
  requestVcId?: string
  responseVcId?: string
  rejectionReason?: string
  approverId?: string
  approverRole?: string
  assigneeUserId?: string
  assigneeWalletTenantId?: string
  assigneeRole?: string
  assignedAt?: Date
  assignmentMode?: string
  assignmentNote?: string
  fulfilledAt?: Date
  approvedAt?: Date
  rejectedAt?: Date
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface ContactCapability {
  id: string
  contactId: string
  orgTenantId: string
  capabilityType: string
  vcTypes?: string[]
  enabled: boolean
  metadata: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export class WorkflowRequestRepository {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  // ==================== Workflow Requests ====================

  public create(
    request: Partial<WorkflowRequest> & {
      requesterTenantId: string
      targetOrgTenantId: string
      requestType: WorkflowRequestType
      payload: Record<string, any>
    },
  ): WorkflowRequest {
    const id = request.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = new Date().toISOString()
    const expiresAt = request.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days default

    ensureTenantMirrorsForFk([request.requesterTenantId, request.targetOrgTenantId], { db: this.db })

    try {
      this.db
        .prepare(
          `
                INSERT INTO workflow_requests (
                    id, requester_tenant_id, requester_did, target_org_tenant_id, contact_id,
                    request_type, workflow_type, payload, status,
                    assignee_user_id, assignee_wallet_tenant_id, assignee_role, assigned_at, assignment_mode, assignment_note,
                    expires_at,
                    created_at, updated_at
                ) VALUES (
                    @id, @requesterTenantId, @requesterDid, @targetOrgTenantId, @contactId,
                    @requestType, @workflowType, @payload, @status,
                    @assigneeUserId, @assigneeWalletTenantId, @assigneeRole, @assignedAt, @assignmentMode, @assignmentNote,
                    @expiresAt,
                    @createdAt, @updatedAt
                )
            `,
        )
        .run({
          id,
          requesterTenantId: request.requesterTenantId,
          requesterDid: request.requesterDid || null,
          targetOrgTenantId: request.targetOrgTenantId,
          contactId: request.contactId || null,
          requestType: request.requestType,
          workflowType: request.workflowType || null,
          payload: JSON.stringify(request.payload),
          status: request.status || 'pending',
          assigneeUserId: request.assigneeUserId || null,
          assigneeWalletTenantId: request.assigneeWalletTenantId || null,
          assigneeRole: request.assigneeRole || null,
          assignedAt: request.assignedAt || null,
          assignmentMode: request.assignmentMode || null,
          assignmentNote: request.assignmentNote || null,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
    } catch (error: any) {
      if (String(error?.message || '').includes('FOREIGN KEY constraint failed')) {
        throw new Error(
          `Workflow request tenant FK validation failed for requester=${request.requesterTenantId}, target=${request.targetOrgTenantId}`,
        )
      }
      throw error
    }

    logger.info(
      {
        requestId: id,
        type: request.requestType,
        requester: request.requesterTenantId,
        targetOrg: request.targetOrgTenantId,
      },
      'Workflow request created',
    )

    return this.findById(id)!
  }

  public findById(id: string): WorkflowRequest | undefined {
    const row = this.db
      .prepare(
        `
            SELECT * FROM workflow_requests WHERE id = ?
        `,
      )
      .get(id)

    return row ? this.rowToRequest(row) : undefined
  }

  public listInbound(
    targetOrgTenantId: string,
    filters?: {
      status?: WorkflowRequestStatus
      requestType?: WorkflowRequestType
      limit?: number
    },
  ): WorkflowRequest[] {
    let sql = `SELECT * FROM workflow_requests WHERE target_org_tenant_id = ?`
    const params: any[] = [targetOrgTenantId]

    if (filters?.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters?.requestType) {
      sql += ' AND request_type = ?'
      params.push(filters.requestType)
    }

    sql += ' ORDER BY created_at DESC'

    if (filters?.limit) {
      sql += ' LIMIT ?'
      params.push(filters.limit)
    }

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map((r: any) => this.rowToRequest(r))
  }

  public listOutbound(
    requesterTenantId: string,
    filters?: {
      status?: WorkflowRequestStatus
      requestType?: WorkflowRequestType
      limit?: number
    },
  ): WorkflowRequest[] {
    let sql = `SELECT * FROM workflow_requests WHERE requester_tenant_id = ?`
    const params: any[] = [requesterTenantId]

    if (filters?.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters?.requestType) {
      sql += ' AND request_type = ?'
      params.push(filters.requestType)
    }

    sql += ' ORDER BY created_at DESC'

    if (filters?.limit) {
      sql += ' LIMIT ?'
      params.push(filters.limit)
    }

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map((r: any) => this.rowToRequest(r))
  }

  public updateStatus(
    id: string,
    status: WorkflowRequestStatus,
    metadata?: {
      approverId?: string
      approverRole?: string
      rejectionReason?: string
      responseVcId?: string
      workflowId?: string
    },
  ): void {
    const now = new Date().toISOString()
    const updates: string[] = ['status = @status', 'updated_at = @updatedAt']
    const params: any = { id, status, updatedAt: now }

    if (status === 'approved') {
      updates.push('approved_at = @approvedAt')
      params.approvedAt = now
      if (metadata?.approverId) {
        updates.push('approver_id = @approverId')
        params.approverId = metadata.approverId
      }
      if (metadata?.approverRole) {
        updates.push('approver_role = @approverRole')
        params.approverRole = metadata.approverRole
      }
      if (metadata?.workflowId) {
        updates.push('workflow_id = @workflowId')
        params.workflowId = metadata.workflowId
      }
    }

    if (status === 'rejected') {
      updates.push('rejected_at = @rejectedAt')
      params.rejectedAt = now
      if (metadata?.rejectionReason) {
        updates.push('rejection_reason = @rejectionReason')
        params.rejectionReason = metadata.rejectionReason
      }
    }

    if (status === 'fulfilled') {
      updates.push('fulfilled_at = @fulfilledAt')
      params.fulfilledAt = now
      if (metadata?.responseVcId) {
        updates.push('response_vc_id = @responseVcId')
        params.responseVcId = metadata.responseVcId
      }
    }

    const sql = `UPDATE workflow_requests SET ${updates.join(', ')} WHERE id = @id`
    this.db.prepare(sql).run(params)

    logger.info({ requestId: id, status, metadata }, 'Workflow request status updated')
  }

  public assignRequest(
    id: string,
    assignment: {
      assigneeUserId?: string
      assigneeWalletTenantId?: string
      assigneeRole?: string
      assignmentMode?: string
      assignmentNote?: string
    },
  ): void {
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
            UPDATE workflow_requests
            SET
                assignee_user_id = @assigneeUserId,
                assignee_wallet_tenant_id = @assigneeWalletTenantId,
                assignee_role = @assigneeRole,
                assigned_at = @assignedAt,
                assignment_mode = @assignmentMode,
                assignment_note = @assignmentNote,
                updated_at = @updatedAt
            WHERE id = @id
        `,
      )
      .run({
        id,
        assigneeUserId: assignment.assigneeUserId || null,
        assigneeWalletTenantId: assignment.assigneeWalletTenantId || null,
        assigneeRole: assignment.assigneeRole || null,
        assignedAt: now,
        assignmentMode: assignment.assignmentMode || 'manual',
        assignmentNote: assignment.assignmentNote || null,
        updatedAt: now,
      })

    logger.info(
      {
        requestId: id,
        assigneeUserId: assignment.assigneeUserId,
        assigneeWalletTenantId: assignment.assigneeWalletTenantId,
        assigneeRole: assignment.assigneeRole,
        assignmentMode: assignment.assignmentMode,
      },
      'Workflow request assigned',
    )
  }

  public listAssignedToApprover(
    assignee: {
      userId?: string
      walletTenantId?: string
    },
    filters?: {
      status?: WorkflowRequestStatus
      requestType?: WorkflowRequestType
      limit?: number
    },
  ): WorkflowRequest[] {
    const conditions: string[] = []
    const params: any[] = []

    if (assignee.userId) {
      conditions.push('assignee_user_id = ?')
      params.push(assignee.userId)
    }

    if (assignee.walletTenantId) {
      conditions.push('assignee_wallet_tenant_id = ?')
      params.push(assignee.walletTenantId)
    }

    if (conditions.length === 0) {
      return []
    }

    let sql = `SELECT * FROM workflow_requests WHERE (${conditions.join(' OR ')})`

    if (filters?.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters?.requestType) {
      sql += ' AND request_type = ?'
      params.push(filters.requestType)
    }

    sql += ' ORDER BY created_at DESC'

    if (filters?.limit) {
      sql += ' LIMIT ?'
      params.push(filters.limit)
    }

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map((r: any) => this.rowToRequest(r))
  }

  public expirePending(): number {
    const result = this.db
      .prepare(
        `
            UPDATE workflow_requests 
            SET status = 'expired', updated_at = CURRENT_TIMESTAMP
            WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP
        `,
      )
      .run()

    if (result.changes > 0) {
      logger.info({ expired: result.changes }, 'Expired pending workflow requests')
    }

    return result.changes
  }

  // ==================== Contact Capabilities ====================

  public addCapability(
    capability: Partial<ContactCapability> & {
      contactId: string
      orgTenantId: string
      capabilityType: string
    },
  ): ContactCapability {
    const id = capability.id || `cap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
            INSERT INTO contact_capabilities (
                id, contact_id, org_tenant_id, capability_type, vc_types, enabled, metadata,
                created_at, updated_at
            ) VALUES (
                @id, @contactId, @orgTenantId, @capabilityType, @vcTypes, @enabled, @metadata,
                @createdAt, @updatedAt
            )
        `,
      )
      .run({
        id,
        contactId: capability.contactId,
        orgTenantId: capability.orgTenantId,
        capabilityType: capability.capabilityType,
        vcTypes: capability.vcTypes ? JSON.stringify(capability.vcTypes) : null,
        enabled: capability.enabled !== undefined ? (capability.enabled ? 1 : 0) : 1,
        metadata: JSON.stringify(capability.metadata || {}),
        createdAt: now,
        updatedAt: now,
      })

    return this.findCapabilityById(id)!
  }

  public findCapabilityById(id: string): ContactCapability | undefined {
    const row = this.db
      .prepare(
        `
            SELECT * FROM contact_capabilities WHERE id = ?
        `,
      )
      .get(id)

    return row ? this.rowToCapability(row) : undefined
  }

  public listCapabilitiesByContact(contactId: string): ContactCapability[] {
    const rows = this.db
      .prepare(
        `
            SELECT * FROM contact_capabilities WHERE contact_id = ? AND enabled = 1
        `,
      )
      .all(contactId)

    return rows.map((r: any) => this.rowToCapability(r))
  }

  public listCapabilitiesByOrg(orgTenantId: string): ContactCapability[] {
    const rows = this.db
      .prepare(
        `
            SELECT * FROM contact_capabilities WHERE org_tenant_id = ? AND enabled = 1
        `,
      )
      .all(orgTenantId)

    return rows.map((r: any) => this.rowToCapability(r))
  }

  // ==================== Helpers ====================

  private rowToRequest(row: any): WorkflowRequest {
    return {
      id: row.id,
      requesterTenantId: row.requester_tenant_id,
      requesterDid: row.requester_did || undefined,
      targetOrgTenantId: row.target_org_tenant_id,
      contactId: row.contact_id || undefined,
      requestType: row.request_type as WorkflowRequestType,
      workflowType: row.workflow_type || undefined,
      workflowId: row.workflow_id || undefined,
      payload: JSON.parse(row.payload),
      status: row.status as WorkflowRequestStatus,
      requestVcId: row.request_vc_id || undefined,
      responseVcId: row.response_vc_id || undefined,
      rejectionReason: row.rejection_reason || undefined,
      approverId: row.approver_id || undefined,
      approverRole: row.approver_role || undefined,
      assigneeUserId: row.assignee_user_id || undefined,
      assigneeWalletTenantId: row.assignee_wallet_tenant_id || undefined,
      assigneeRole: row.assignee_role || undefined,
      assignedAt: row.assigned_at ? new Date(row.assigned_at) : undefined,
      assignmentMode: row.assignment_mode || undefined,
      assignmentNote: row.assignment_note || undefined,
      fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : undefined,
      approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
      rejectedAt: row.rejected_at ? new Date(row.rejected_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private rowToCapability(row: any): ContactCapability {
    return {
      id: row.id,
      contactId: row.contact_id,
      orgTenantId: row.org_tenant_id,
      capabilityType: row.capability_type,
      vcTypes: row.vc_types ? JSON.parse(row.vc_types) : undefined,
      enabled: row.enabled === 1,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

export const workflowRequestRepository = new WorkflowRequestRepository()
