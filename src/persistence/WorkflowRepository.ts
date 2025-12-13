import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

export interface WorkflowRecord {
    id: string
    tenantId: string
    name: string
    category: string
    provider: string
    description: string
    inputSchema: any
    actions: any[] // Ordered list of actions
    createdAt?: Date
}

export class WorkflowRepository {
    private logger = rootLogger.child({ module: 'WorkflowRepository' })

    save(record: WorkflowRecord): void {
        const db = DatabaseManager.getDatabase()

        const stmt = db.prepare(`
      INSERT INTO workflows (
        id, tenant_id, name, category, provider, description,
        input_schema, actions, created_at
      ) VALUES (
        @id, @tenantId, @name, @category, @provider, @description,
        @inputSchema, @actions, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        name = @name,
        category = @category,
        provider = @provider,
        description = @description,
        input_schema = @inputSchema,
        actions = @actions
    `)

        try {
            stmt.run({
                id: record.id,
                tenantId: record.tenantId,
                name: record.name,
                category: record.category,
                provider: record.provider,
                description: record.description,
                inputSchema: JSON.stringify(record.inputSchema),
                actions: JSON.stringify(record.actions),
            })

            this.logger.debug(`Saved workflow: ${record.id}`)
        } catch (error) {
            this.logger.error({ error, workflowId: record.id }, 'Failed to save workflow')
            throw error
        }
    }

    findById(id: string): WorkflowRecord | undefined {
        const db = DatabaseManager.getDatabase()

        const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, name, category, provider, description,
        input_schema as inputSchema, actions, created_at as createdAt
      FROM workflows
      WHERE id = ?
    `)

        const row = stmt.get(id) as any

        if (row) {
            return {
                ...row,
                inputSchema: JSON.parse(row.inputSchema),
                actions: JSON.parse(row.actions),
                createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
            }
        }

        return undefined
    }

    list(tenantId?: string, category?: string): WorkflowRecord[] {
        const db = DatabaseManager.getDatabase()

        let query = `
      SELECT 
        id, tenant_id as tenantId, name, category, provider, description,
        input_schema as inputSchema, actions, created_at as createdAt
      FROM workflows
    `
        const params: any[] = []
        const conditions: string[] = []

        if (tenantId) {
            conditions.push('tenant_id = ?')
            params.push(tenantId)
        }
        if (category) {
            conditions.push('category = ?')
            params.push(category)
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ')
        }

        query += ' ORDER BY created_at DESC'

        const stmt = db.prepare(query)
        const rows = stmt.all(...params) as any[]

        return rows.map((row) => ({
            ...row,
            inputSchema: JSON.parse(row.inputSchema),
            actions: JSON.parse(row.actions),
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        }))
    }

    deleteById(id: string): boolean {
        const db = DatabaseManager.getDatabase()
        const stmt = db.prepare('DELETE FROM workflows WHERE id = ?')
        const result = stmt.run(id)
        return result.changes > 0
    }
}

export const workflowRepository = new WorkflowRepository()
