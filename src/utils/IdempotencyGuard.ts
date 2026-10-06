/**
 * Idempotency guard for state-changing endpoints.
 */
import type Database from 'better-sqlite3'
import type { Request as ExRequest } from 'express'

import { rootLogger } from './pinoLogger'

const logger = rootLogger.child({ module: 'IdempotencyGuard' })

export interface StoredIdempotencyResult {
  response: any
  createdAt: string
}

export class IdempotencyGuard {
  public static extractKey(request: ExRequest): string | null {
    const key =
      (request.headers['x-idempotency-key'] as string) || (request.headers['idempotency-key'] as string) || null

    return key?.trim() || null
  }

  public static checkAndReturn(
    db: Database.Database,
    key: string,
    tenantId: string,
    action: string,
  ): StoredIdempotencyResult | null {
    const row = db
      .prepare(
        `SELECT response, created_at as createdAt
         FROM workflow_idempotency_keys
         WHERE idempotency_key = ? AND tenant_id = ? AND action = ?`,
      )
      .get(key, tenantId, action) as { response: string | null; createdAt: string } | undefined

    if (!row) return null

    logger.info({ key, tenantId, action }, 'Idempotency replay hit')
    return {
      response: row.response ? JSON.parse(row.response) : {},
      createdAt: row.createdAt,
    }
  }

  public static record(db: Database.Database, key: string, tenantId: string, action: string, response: any): void {
    db.prepare(
      `INSERT OR IGNORE INTO workflow_idempotency_keys
       (idempotency_key, tenant_id, action, response, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(key, tenantId, action, JSON.stringify(response), new Date().toISOString())
  }

  public static guard(
    db: Database.Database,
    request: ExRequest,
    tenantId: string,
    action: string,
  ): { duplicate: true; response: any } | { duplicate: false; key: string | null } {
    const key = this.extractKey(request)
    if (!key) return { duplicate: false, key: null }

    const stored = this.checkAndReturn(db, key, tenantId, action)
    if (stored) {
      return { duplicate: true, response: stored.response }
    }

    return { duplicate: false, key }
  }
}
