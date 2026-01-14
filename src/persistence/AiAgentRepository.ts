/**
 * AI Agent Repository
 *
 * Database operations for ACK-ID aligned agent registry.
 * Manages agent lifecycle: provision → active → suspended → revoked
 *
 * Reference: https://www.agentcommercekit.com/ack-id
 */

import { injectable } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseManager } from './DatabaseManager'
import type {
  AiAgentRecord,
  AiAgentStatus,
  AiAgentScope,
  ProvisionAiAgentParams,
} from '../ai/types/ack-types'

@injectable()
export class AiAgentRepository {
  /**
   * Create a new AI agent record
   */
  async createAgent(
    params: ProvisionAiAgentParams & {
      agentDid: string
      controllerCredentialJwt: string
    }
  ): Promise<AiAgentRecord> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    const id = uuidv4()

    const record: AiAgentRecord = {
      id,
      tenantId: params.tenantId,
      agentDid: params.agentDid,
      ownerDid: params.ownerDid,
      controllerCredentialJwt: params.controllerCredentialJwt,
      label: params.label,
      roles: params.roles,
      status: 'active',
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    }

    db.prepare(`
      INSERT INTO ai_agents (
        id, tenant_id, agent_did, owner_did, controller_credential_jwt,
        label, roles, status, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.tenantId,
      record.agentDid,
      record.ownerDid,
      record.controllerCredentialJwt,
      record.label,
      JSON.stringify(record.roles),
      record.status,
      record.metadata ? JSON.stringify(record.metadata) : null,
      record.createdAt,
      record.updatedAt
    )

    return record
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id: string): Promise<AiAgentRecord | null> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(id) as any

    if (!row) return null
    return this.mapRowToRecord(row)
  }

  /**
   * Get agent by DID
   */
  async getAgentByDid(agentDid: string): Promise<AiAgentRecord | null> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT * FROM ai_agents WHERE agent_did = ?').get(agentDid) as any

    if (!row) return null
    return this.mapRowToRecord(row)
  }

  /**
   * List agents for a tenant
   */
  async listAgentsByTenant(
    tenantId: string,
    options?: { status?: AiAgentStatus; limit?: number; offset?: number }
  ): Promise<AiAgentRecord[]> {
    const db = DatabaseManager.getDatabase()
    let query = 'SELECT * FROM ai_agents WHERE tenant_id = ?'
    const params: any[] = [tenantId]

    if (options?.status) {
      query += ' AND status = ?'
      params.push(options.status)
    }

    query += ' ORDER BY created_at DESC'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)
    }

    if (options?.offset) {
      query += ' OFFSET ?'
      params.push(options.offset)
    }

    const rows = db.prepare(query).all(...params) as any[]
    return rows.map((row) => this.mapRowToRecord(row))
  }

  /**
   * List agents by owner DID
   */
  async listAgentsByOwner(ownerDid: string): Promise<AiAgentRecord[]> {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare('SELECT * FROM ai_agents WHERE owner_did = ? ORDER BY created_at DESC')
      .all(ownerDid) as any[]

    return rows.map((row) => this.mapRowToRecord(row))
  }

  /**
   * Update agent status (active/suspended/revoked)
   */
  async updateAgentStatus(id: string, status: AiAgentStatus): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()

    db.prepare('UPDATE ai_agents SET status = ?, updated_at = ? WHERE id = ?').run(
      status,
      now,
      id
    )
  }

  /**
   * Update agent controller credential (for key rotation)
   */
  async updateControllerCredential(
    id: string,
    controllerCredentialJwt: string
  ): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()

    db.prepare(
      'UPDATE ai_agents SET controller_credential_jwt = ?, updated_at = ? WHERE id = ?'
    ).run(controllerCredentialJwt, now, id)
  }

  /**
   * Update agent roles
   */
  async updateAgentRoles(id: string, roles: AiAgentScope[]): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()

    db.prepare('UPDATE ai_agents SET roles = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(roles),
      now,
      id
    )
  }

  /**
   * Delete agent (hard delete - use status update for soft delete)
   */
  async deleteAgent(id: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    db.prepare('DELETE FROM ai_agents WHERE id = ?').run(id)
  }

  /**
   * Check if an agent DID exists
   */
  async agentDidExists(agentDid: string): Promise<boolean> {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare('SELECT 1 FROM ai_agents WHERE agent_did = ?')
      .get(agentDid)
    return !!row
  }

  private mapRowToRecord(row: any): AiAgentRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      agentDid: row.agent_did,
      ownerDid: row.owner_did,
      controllerCredentialJwt: row.controller_credential_jwt,
      label: row.label,
      roles: JSON.parse(row.roles) as AiAgentScope[],
      status: row.status as AiAgentStatus,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
