import { randomBytes } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'

/**
 * ShortlinkService - Generate short verification links for QR codes
 * 
 * Used during driver verification at delivery handover.
 * Flow: ReceiptVC holder shares shortlink → driver scans → sees verified status
 */
export class ShortlinkService {
    private static readonly TABLE = 'shortlinks'
    private static readonly DEFAULT_TTL_HOURS = 24

    /**
     * Initialize the shortlinks table
     */
    static initialize(): void {
        const db = DatabaseManager.getDatabase()
        db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.TABLE} (
        code TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        metadata TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        used_at TEXT
      )
    `)
        // Index for cleanup and lookups
        db.exec(`CREATE INDEX IF NOT EXISTS idx_shortlinks_expires ON ${this.TABLE}(expires_at)`)
    }

    /**
     * Generate a short verification link
     * @param type - Type of link: 'credential' | 'receipt' | 'verification'
     * @param targetId - The credential or transaction ID
     * @param metadata - Optional additional data (e.g., claims preview)
     * @param ttlHours - Time-to-live in hours (default: 24)
     * @returns The short code and full URL
     */
    static create(
        type: 'credential' | 'receipt' | 'verification',
        targetId: string,
        metadata?: Record<string, any>,
        ttlHours: number = this.DEFAULT_TTL_HOURS
    ): { code: string; url: string; expiresAt: string } {
        const db = DatabaseManager.getDatabase()

        // Generate 6-char alphanumeric code (36^6 = ~2B combinations)
        const code = randomBytes(4).toString('base64url').slice(0, 6).toUpperCase()

        const now = new Date()
        const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000)

        db.prepare(`
      INSERT INTO ${this.TABLE} (code, type, target_id, metadata, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            code,
            type,
            targetId,
            metadata ? JSON.stringify(metadata) : null,
            expiresAt.toISOString(),
            now.toISOString()
        )

        const baseUrl = process.env.PUBLIC_BASE_URL || process.env.NGROK_URL || 'http://localhost:3000'
        const url = `${baseUrl}/v/${code}`

        return { code, url, expiresAt: expiresAt.toISOString() }
    }

    /**
     * Resolve a short code to its target
     * @param code - The 6-char short code
     * @returns The shortlink data or null if expired/not found
     */
    static resolve(code: string): {
        type: string
        targetId: string
        metadata: Record<string, any> | null
        expiresAt: string
        createdAt: string
    } | null {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare(`
      SELECT * FROM ${this.TABLE} 
      WHERE code = ? AND expires_at > datetime('now')
    `).get(code.toUpperCase()) as any

        if (!row) return null

        // Mark as used
        db.prepare(`UPDATE ${this.TABLE} SET used_at = ? WHERE code = ?`).run(
            new Date().toISOString(),
            code.toUpperCase()
        )

        return {
            type: row.type,
            targetId: row.target_id,
            metadata: row.metadata ? JSON.parse(row.metadata) : null,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        }
    }

    /**
     * Delete expired shortlinks (cleanup job)
     */
    static cleanup(): number {
        const db = DatabaseManager.getDatabase()
        const result = db.prepare(`DELETE FROM ${this.TABLE} WHERE expires_at < datetime('now')`).run()
        return result.changes
    }

    /**
     * Generate a receipt verification shortlink from payment data
     */
    static createReceiptLink(
        transactionId: string,
        claims: { amount?: string; currency?: string; merchant?: string }
    ): { code: string; url: string; expiresAt: string } {
        return this.create('receipt', transactionId, {
            transactionId,
            ...claims,
            createdAt: new Date().toISOString(),
        })
    }
}
