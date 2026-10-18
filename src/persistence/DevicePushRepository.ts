import crypto from 'crypto'

import { DatabaseManager } from './DatabaseManager'

const MAX_DEVICES_PER_PERSON = 5

export function saveDevicePushToken(input: { tenantId: string; platform: string; token: string }): void {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO device_push_tokens (id, tenant_id, platform, token, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, token) DO UPDATE SET
       platform = excluded.platform,
       updated_at = excluded.updated_at`,
  ).run(crypto.randomUUID(), input.tenantId, input.platform, input.token, now)

  db.prepare(
    `DELETE FROM device_push_tokens
     WHERE tenant_id = ?
       AND id NOT IN (
         SELECT id FROM device_push_tokens
         WHERE tenant_id = ?
         ORDER BY updated_at DESC
         LIMIT ?
       )`,
  ).run(input.tenantId, input.tenantId, MAX_DEVICES_PER_PERSON)
}

export function deleteDevicePushToken(tenantId: string, token: string): void {
  DatabaseManager.getDatabase()
    .prepare('DELETE FROM device_push_tokens WHERE tenant_id = ? AND token = ?')
    .run(tenantId, token)
}

export function listDevicePushTokens(tenantId: string): string[] {
  const rows = DatabaseManager.getDatabase()
    .prepare('SELECT token FROM device_push_tokens WHERE tenant_id = ? ORDER BY updated_at DESC')
    .all(tenantId) as Array<{ token: string }>
  return rows.map((row) => row.token).filter((token) => token.length > 0)
}

export function deleteDevicePushTokenValue(token: string): void {
  DatabaseManager.getDatabase().prepare('DELETE FROM device_push_tokens WHERE token = ?').run(token)
}
