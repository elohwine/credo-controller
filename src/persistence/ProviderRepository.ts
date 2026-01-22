/**
 * IdenEx Credentis - Provider Repository
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Persistence layer for external service provider registry.
 * Manages integrations with payment providers (EcoCash, InnBucks),
 * identity verifiers, notification services, and custom APIs.
 * 
 * Provider Types:
 * - payment: EcoCash, InnBucks, MNEE, bank transfers
 * - identity: National ID verification, KYC providers
 * - verification: Document verification, address checks
 * - notification: SMS, WhatsApp, email channels
 * - custom: Tenant-specific integrations
 * 
 * @module persistence/ProviderRepository
 * @copyright 2024-2026 IdenEx Credentis
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { v4 as uuid } from 'uuid'

const logger = rootLogger.child({ module: 'ProviderRepository' })

export interface ServiceProvider {
    id: string
    tenantId: string
    name: string
    type: 'payment' | 'identity' | 'verification' | 'notification' | 'custom'
    description?: string
    baseUrl?: string
    authType: 'api_key' | 'oauth2' | 'basic' | 'none'
    configSchema?: any
    isSystem: boolean
    status: 'active' | 'inactive' | 'deprecated'
    createdAt?: Date
    updatedAt?: Date
}

export interface ProviderConfig {
    id: string
    tenantId: string
    providerId: string
    name: string
    config: Record<string, any>
    environment: 'sandbox' | 'production'
    isDefault: boolean
    status: 'active' | 'inactive'
    createdAt?: Date
    updatedAt?: Date
}

export class ProviderRepository {
    // ==================== Service Providers ====================

    saveProvider(provider: Partial<ServiceProvider> & { name: string; type: string; tenantId: string }): ServiceProvider {
        const db = DatabaseManager.getDatabase()
        const id = provider.id || uuid()

        const stmt = db.prepare(`
            INSERT INTO service_providers (
                id, tenant_id, name, type, description, base_url, auth_type, 
                config_schema, is_system, status, updated_at
            ) VALUES (
                @id, @tenantId, @name, @type, @description, @baseUrl, @authType,
                @configSchema, @isSystem, @status, CURRENT_TIMESTAMP
            )
            ON CONFLICT(id) DO UPDATE SET
                name = @name,
                description = @description,
                base_url = @baseUrl,
                auth_type = @authType,
                config_schema = @configSchema,
                status = @status,
                updated_at = CURRENT_TIMESTAMP
        `)

        stmt.run({
            id,
            tenantId: provider.tenantId,
            name: provider.name,
            type: provider.type,
            description: provider.description || null,
            baseUrl: provider.baseUrl || null,
            authType: provider.authType || 'api_key',
            configSchema: provider.configSchema ? JSON.stringify(provider.configSchema) : null,
            isSystem: provider.isSystem ? 1 : 0,
            status: provider.status || 'active'
        })

        logger.info({ providerId: id }, 'Provider saved')
        return this.findProviderById(id)!
    }

    findProviderById(id: string): ServiceProvider | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT id, tenant_id as tenantId, name, type, description, 
                   base_url as baseUrl, auth_type as authType, config_schema as configSchema,
                   is_system as isSystem, status, created_at as createdAt, updated_at as updatedAt
            FROM service_providers WHERE id = ?
        `).get(id) as any

        if (!row) return undefined

        return {
            ...row,
            configSchema: row.configSchema ? JSON.parse(row.configSchema) : undefined,
            isSystem: !!row.isSystem
        }
    }

    listProviders(tenantId: string, type?: string): ServiceProvider[] {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT id, tenant_id as tenantId, name, type, description, 
                   base_url as baseUrl, auth_type as authType, config_schema as configSchema,
                   is_system as isSystem, status, created_at as createdAt, updated_at as updatedAt
            FROM service_providers 
            WHERE (tenant_id = ? OR is_system = 1) AND status != 'deprecated'
        `
        const params: any[] = [tenantId]

        if (type) {
            query += ' AND type = ?'
            params.push(type)
        }

        query += ' ORDER BY is_system DESC, name ASC'

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(row => ({
            ...row,
            configSchema: row.configSchema ? JSON.parse(row.configSchema) : undefined,
            isSystem: !!row.isSystem
        }))
    }

    deleteProvider(id: string): boolean {
        const db = DatabaseManager.getDatabase()
        const result = db.prepare('DELETE FROM service_providers WHERE id = ? AND is_system = 0').run(id)
        return result.changes > 0
    }

    // ==================== Provider Configs ====================

    saveConfig(config: Partial<ProviderConfig> & { tenantId: string; providerId: string; name: string; config: any }): ProviderConfig {
        const db = DatabaseManager.getDatabase()
        const id = config.id || uuid()

        // If setting as default, unset other defaults for this provider+tenant
        if (config.isDefault) {
            db.prepare(`
                UPDATE provider_configs SET is_default = 0 
                WHERE tenant_id = ? AND provider_id = ?
            `).run(config.tenantId, config.providerId)
        }

        const stmt = db.prepare(`
            INSERT INTO provider_configs (
                id, tenant_id, provider_id, name, config, environment, is_default, status, updated_at
            ) VALUES (
                @id, @tenantId, @providerId, @name, @config, @environment, @isDefault, @status, CURRENT_TIMESTAMP
            )
            ON CONFLICT(id) DO UPDATE SET
                name = @name,
                config = @config,
                environment = @environment,
                is_default = @isDefault,
                status = @status,
                updated_at = CURRENT_TIMESTAMP
        `)

        stmt.run({
            id,
            tenantId: config.tenantId,
            providerId: config.providerId,
            name: config.name,
            config: JSON.stringify(config.config),
            environment: config.environment || 'sandbox',
            isDefault: config.isDefault ? 1 : 0,
            status: config.status || 'active'
        })

        logger.info({ configId: id, providerId: config.providerId }, 'Provider config saved')
        return this.findConfigById(id)!
    }

    findConfigById(id: string): ProviderConfig | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT id, tenant_id as tenantId, provider_id as providerId, name, config,
                   environment, is_default as isDefault, status, 
                   created_at as createdAt, updated_at as updatedAt
            FROM provider_configs WHERE id = ?
        `).get(id) as any

        if (!row) return undefined

        return {
            ...row,
            config: JSON.parse(row.config),
            isDefault: !!row.isDefault
        }
    }

    findDefaultConfig(tenantId: string, providerId: string): ProviderConfig | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT id, tenant_id as tenantId, provider_id as providerId, name, config,
                   environment, is_default as isDefault, status,
                   created_at as createdAt, updated_at as updatedAt
            FROM provider_configs 
            WHERE tenant_id = ? AND provider_id = ? AND is_default = 1 AND status = 'active'
        `).get(tenantId, providerId) as any

        if (!row) return undefined

        return {
            ...row,
            config: JSON.parse(row.config),
            isDefault: !!row.isDefault
        }
    }

    listConfigs(tenantId: string, providerId?: string): ProviderConfig[] {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT id, tenant_id as tenantId, provider_id as providerId, name, config,
                   environment, is_default as isDefault, status,
                   created_at as createdAt, updated_at as updatedAt
            FROM provider_configs WHERE tenant_id = ?
        `
        const params: any[] = [tenantId]

        if (providerId) {
            query += ' AND provider_id = ?'
            params.push(providerId)
        }

        query += ' ORDER BY is_default DESC, name ASC'

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(row => ({
            ...row,
            config: JSON.parse(row.config),
            isDefault: !!row.isDefault
        }))
    }

    deleteConfig(id: string): boolean {
        const db = DatabaseManager.getDatabase()
        const result = db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id)
        return result.changes > 0
    }
}

export const providerRepository = new ProviderRepository()
