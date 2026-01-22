/**
 * IdenEx Credentis - Service Provider Controller
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * API endpoints for managing external service provider integrations.
 * Tenants can register their own provider configurations (API keys,
 * endpoints) while system providers are pre-configured.
 * 
 * System Providers (pre-configured):
 * - EcoCash: Mobile money payments (Zimbabwe)
 * - InnBucks: Mobile money payments (Zimbabwe)
 * - SMTP: Email notifications
 * - SMS Gateway: SMS notifications
 * - ZIMRA: Tax authority integration
 * 
 * @module controllers/provider/ProviderController
 * @copyright 2024-2026 IdenEx Credentis
 */

import { Controller, Get, Post, Put, Delete, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'
import { providerRepository, ServiceProvider, ProviderConfig } from '../../persistence/ProviderRepository'
import { Request as ExRequest } from 'express'

interface CreateProviderRequest {
    name: string
    type: 'payment' | 'identity' | 'verification' | 'notification' | 'custom'
    description?: string
    baseUrl?: string
    authType?: 'api_key' | 'oauth2' | 'basic' | 'none'
    configSchema?: any
}

interface CreateConfigRequest {
    providerId: string
    name: string
    config: Record<string, any>
    environment?: 'sandbox' | 'production'
    isDefault?: boolean
}

@Route('providers')
@Tags('Service Providers')
export class ProviderController extends Controller {

    /**
     * List available service providers (system + tenant-specific)
     */
    @Get('')
    @Security('jwt', ['tenant'])
    public async listProviders(
        @Request() request: ExRequest,
        @Query() type?: string
    ): Promise<ServiceProvider[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return providerRepository.listProviders(tenantId, type)
    }

    /**
     * Get a specific provider by ID
     */
    @Get('{providerId}')
    @Security('jwt', ['tenant'])
    public async getProvider(
        @Path() providerId: string
    ): Promise<ServiceProvider | null> {
        const provider = providerRepository.findProviderById(providerId)
        if (!provider) {
            this.setStatus(404)
            return null
        }
        return provider
    }

    /**
     * Register a custom service provider for your organization
     */
    @Post('')
    @Security('jwt', ['tenant'])
    public async createProvider(
        @Body() body: CreateProviderRequest,
        @Request() request: ExRequest
    ): Promise<ServiceProvider> {
        const tenantId = (request as any).user?.tenantId || 'default'

        const provider = providerRepository.saveProvider({
            tenantId,
            name: body.name,
            type: body.type,
            description: body.description,
            baseUrl: body.baseUrl,
            authType: body.authType || 'api_key',
            configSchema: body.configSchema,
            isSystem: false,
            status: 'active'
        })

        this.setStatus(201)
        return provider
    }

    /**
     * Update a custom provider (cannot modify system providers)
     */
    @Put('{providerId}')
    @Security('jwt', ['tenant'])
    public async updateProvider(
        @Path() providerId: string,
        @Body() body: Partial<CreateProviderRequest>,
        @Request() request: ExRequest
    ): Promise<ServiceProvider | { error: string }> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const existing = providerRepository.findProviderById(providerId)

        if (!existing) {
            this.setStatus(404)
            return { error: 'Provider not found' }
        }

        if (existing.isSystem) {
            this.setStatus(403)
            return { error: 'Cannot modify system providers' }
        }

        if (existing.tenantId !== tenantId) {
            this.setStatus(403)
            return { error: 'Not authorized to modify this provider' }
        }

        return providerRepository.saveProvider({
            ...existing,
            ...body
        })
    }

    /**
     * Delete a custom provider
     */
    @Delete('{providerId}')
    @Security('jwt', ['tenant'])
    public async deleteProvider(
        @Path() providerId: string,
        @Request() request: ExRequest
    ): Promise<{ success: boolean; error?: string }> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const existing = providerRepository.findProviderById(providerId)

        if (!existing) {
            this.setStatus(404)
            return { success: false, error: 'Provider not found' }
        }

        if (existing.isSystem) {
            this.setStatus(403)
            return { success: false, error: 'Cannot delete system providers' }
        }

        if (existing.tenantId !== tenantId) {
            this.setStatus(403)
            return { success: false, error: 'Not authorized to delete this provider' }
        }

        const deleted = providerRepository.deleteProvider(providerId)
        return { success: deleted }
    }

    // ==================== Provider Configs ====================

    /**
     * List configurations for providers
     */
    @Get('configs')
    @Security('jwt', ['tenant'])
    public async listConfigs(
        @Request() request: ExRequest,
        @Query() providerId?: string
    ): Promise<ProviderConfig[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return providerRepository.listConfigs(tenantId, providerId)
    }

    /**
     * Get a specific configuration
     */
    @Get('configs/{configId}')
    @Security('jwt', ['tenant'])
    public async getConfig(
        @Path() configId: string,
        @Request() request: ExRequest
    ): Promise<ProviderConfig | { error: string }> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const config = providerRepository.findConfigById(configId)

        if (!config) {
            this.setStatus(404)
            return { error: 'Config not found' }
        }

        if (config.tenantId !== tenantId) {
            this.setStatus(403)
            return { error: 'Not authorized to view this config' }
        }

        return config
    }

    /**
     * Create a configuration for a provider (e.g., your EcoCash API key)
     */
    @Post('configs')
    @Security('jwt', ['tenant'])
    public async createConfig(
        @Body() body: CreateConfigRequest,
        @Request() request: ExRequest
    ): Promise<ProviderConfig> {
        const tenantId = (request as any).user?.tenantId || 'default'

        // Verify provider exists
        const provider = providerRepository.findProviderById(body.providerId)
        if (!provider) {
            this.setStatus(400)
            throw new Error('Provider not found')
        }

        const config = providerRepository.saveConfig({
            tenantId,
            providerId: body.providerId,
            name: body.name,
            config: body.config,
            environment: body.environment || 'sandbox',
            isDefault: body.isDefault || false,
            status: 'active'
        })

        this.setStatus(201)
        return config
    }

    /**
     * Update a provider configuration
     */
    @Put('configs/{configId}')
    @Security('jwt', ['tenant'])
    public async updateConfig(
        @Path() configId: string,
        @Body() body: Partial<CreateConfigRequest>,
        @Request() request: ExRequest
    ): Promise<ProviderConfig | { error: string }> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const existing = providerRepository.findConfigById(configId)

        if (!existing) {
            this.setStatus(404)
            return { error: 'Config not found' }
        }

        if (existing.tenantId !== tenantId) {
            this.setStatus(403)
            return { error: 'Not authorized to modify this config' }
        }

        return providerRepository.saveConfig({
            ...existing,
            ...body
        })
    }

    /**
     * Delete a provider configuration
     */
    @Delete('configs/{configId}')
    @Security('jwt', ['tenant'])
    public async deleteConfig(
        @Path() configId: string,
        @Request() request: ExRequest
    ): Promise<{ success: boolean; error?: string }> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const existing = providerRepository.findConfigById(configId)

        if (!existing) {
            this.setStatus(404)
            return { success: false, error: 'Config not found' }
        }

        if (existing.tenantId !== tenantId) {
            this.setStatus(403)
            return { success: false, error: 'Not authorized to delete this config' }
        }

        const deleted = providerRepository.deleteConfig(configId)
        return { success: deleted }
    }
}
