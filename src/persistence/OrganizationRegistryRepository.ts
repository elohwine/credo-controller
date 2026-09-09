/**
 * IdenEx Credentis - Organization Registry & Service Catalog Repository
 * 
 * Persistence layer for public service discovery and VC request management.
 * Enables holders to discover organizations and request VCs independently of workflows.
 * 
 * @module persistence/OrganizationRegistryRepository
 * @copyright 2024-2026 IdenEx Credentis
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'OrganizationRegistryRepository' })

export type OrganizationCategory = 
  | 'government' 
  | 'education' 
  | 'telecom' 
  | 'supplier' 
  | 'finance'
  | 'healthcare' 
  | 'insurance' 
  | 'employer' 
  | 'logistics' 
  | 'other'

export type VerificationStatus = 'verified' | 'unverified' | 'pending' | 'suspended'

export type ServiceType = 'vc_issuance' | 'verification' | 'workflow' | 'payment' | 'other'

export type VcRequestStatus = 
  | 'pending' 
  | 'submitted' 
  | 'under_review' 
  | 'approved' 
  | 'rejected' 
  | 'issued' 
  | 'failed' 
  | 'expired'

export interface OrganizationRegistry {
    id: string
    tenantId: string
    displayName: string
    description?: string
    logoUrl?: string
    category: OrganizationCategory
    subCategory?: string
    isPublic: boolean
    trustScore: number
    verificationStatus: VerificationStatus
    issuerDid: string
    verifierDid?: string
    website?: string
    contactPhone?: string
    contactEmail?: string
    address?: string
    country: string
    metadata: Record<string, any>
    createdAt: Date
    updatedAt: Date
}

export interface ServiceCatalogEntry {
    id: string
    orgId: string
    serviceType: ServiceType
    vcType?: string
    workflowTemplateId?: string
    name: string
    description?: string
    requirements: string[]
    turnaroundTime?: string
    turnaroundHours?: number
    feeAmount: number
    feeCurrency: string
    isActive: boolean
    requestSchema: Record<string, any>
    sampleCredential?: string
    metadata: Record<string, any>
    createdAt: Date
    updatedAt: Date
}

export interface VcRequest {
    id: string
    requesterTenantId: string
    requesterDid?: string
    targetOrgId: string
    serviceId: string
    vcType: string
    requestPayload: Record<string, any>
    status: VcRequestStatus
    credentialId?: string
    credentialOfferUrl?: string
    rejectionReason?: string
    notes?: string
    feePaid: boolean
    paymentRef?: string
    estimatedCompletion?: Date
    submittedAt?: Date
    approvedAt?: Date
    issuedAt?: Date
    expiresAt?: Date
    createdAt: Date
    updatedAt: Date
}

export class OrganizationRegistryRepository {
    private get db() {
        return DatabaseManager.getDatabase()
    }

    // ==================== Organization Registry ====================

    createOrganization(org: Partial<OrganizationRegistry> & {
        tenantId: string
        displayName: string
        category: OrganizationCategory
        issuerDid: string
    }): OrganizationRegistry {
        const id = org.id || `org-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const now = new Date().toISOString()

        this.db.prepare(`
            INSERT INTO organization_registry (
                id, tenant_id, display_name, description, logo_url, category, sub_category,
                is_public, trust_score, verification_status, issuer_did, verifier_did,
                website, contact_phone, contact_email, address, country, metadata,
                created_at, updated_at
            ) VALUES (
                @id, @tenantId, @displayName, @description, @logoUrl, @category, @subCategory,
                @isPublic, @trustScore, @verificationStatus, @issuerDid, @verifierDid,
                @website, @contactPhone, @contactEmail, @address, @country, @metadata,
                @createdAt, @updatedAt
            )
        `).run({
            id,
            tenantId: org.tenantId,
            displayName: org.displayName,
            description: org.description || null,
            logoUrl: org.logoUrl || null,
            category: org.category,
            subCategory: org.subCategory || null,
            isPublic: org.isPublic ? 1 : 0,
            trustScore: org.trustScore || 0,
            verificationStatus: org.verificationStatus || 'unverified',
            issuerDid: org.issuerDid,
            verifierDid: org.verifierDid || null,
            website: org.website || null,
            contactPhone: org.contactPhone || null,
            contactEmail: org.contactEmail || null,
            address: org.address || null,
            country: org.country || 'ZW',
            metadata: JSON.stringify(org.metadata || {}),
            createdAt: now,
            updatedAt: now
        })

        logger.info({ orgId: id, name: org.displayName, category: org.category }, 'Organization registered')
        return this.findOrganizationById(id)!
    }

    findOrganizationById(id: string): OrganizationRegistry | undefined {
        const row = this.db.prepare(`
            SELECT * FROM organization_registry WHERE id = ?
        `).get(id)

        return row ? this.rowToOrganization(row) : undefined
    }

    findOrganizationByTenantId(tenantId: string): OrganizationRegistry | undefined {
        const row = this.db.prepare(`
            SELECT * FROM organization_registry WHERE tenant_id = ?
        `).get(tenantId)

        return row ? this.rowToOrganization(row) : undefined
    }

    listPublicOrganizations(filters?: {
        category?: OrganizationCategory
        subCategory?: string
        country?: string
        verifiedOnly?: boolean
        minTrustScore?: number
        limit?: number
    }): OrganizationRegistry[] {
        let sql = `SELECT * FROM organization_registry WHERE is_public = 1`
        const params: any[] = []

        if (filters?.category) {
            sql += ' AND category = ?'
            params.push(filters.category)
        }

        if (filters?.subCategory) {
            sql += ' AND sub_category = ?'
            params.push(filters.subCategory)
        }

        if (filters?.country) {
            sql += ' AND country = ?'
            params.push(filters.country)
        }

        if (filters?.verifiedOnly) {
            sql += ' AND verification_status = ?'
            params.push('verified')
        }

        if (filters?.minTrustScore) {
            sql += ' AND trust_score >= ?'
            params.push(filters.minTrustScore)
        }

        sql += ' ORDER BY trust_score DESC, display_name ASC'

        if (filters?.limit) {
            sql += ' LIMIT ?'
            params.push(filters.limit)
        }

        const rows = this.db.prepare(sql).all(...params)
        return rows.map(r => this.rowToOrganization(r))
    }

    searchOrganizations(query: string, options?: {
        publicOnly?: boolean
        category?: OrganizationCategory
        limit?: number
    }): OrganizationRegistry[] {
        const searchPattern = `%${query}%`
        let sql = `
            SELECT * FROM organization_registry 
            WHERE (display_name LIKE ? OR description LIKE ? OR category LIKE ?)
        `
        const params: any[] = [searchPattern, searchPattern, searchPattern]

        if (options?.publicOnly) {
            sql += ' AND is_public = 1'
        }

        if (options?.category) {
            sql += ' AND category = ?'
            params.push(options.category)
        }

        sql += ' ORDER BY trust_score DESC LIMIT ?'
        params.push(options?.limit || 20)

        const rows = this.db.prepare(sql).all(...params)
        return rows.map(r => this.rowToOrganization(r))
    }

    updateOrganization(id: string, updates: Partial<Omit<OrganizationRegistry, 'id' | 'tenantId' | 'createdAt'>>): void {
        const updateFields: string[] = []
        const params: any = { id, updatedAt: new Date().toISOString() }

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id' && key !== 'tenantId' && key !== 'createdAt') {
                const snakeKey = this.camelToSnake(key)
                updateFields.push(`${snakeKey} = @${key}`)
                
                // Handle different value types for SQLite
                if (typeof value === 'boolean') {
                    params[key] = value ? 1 : 0
                } else if (typeof value === 'object' && value !== null) {
                    params[key] = JSON.stringify(value)
                } else {
                    params[key] = value
                }
            }
        })

        if (updateFields.length === 0) return

        updateFields.push('updated_at = @updatedAt')

        const sql = `UPDATE organization_registry SET ${updateFields.join(', ')} WHERE id = @id`
        this.db.prepare(sql).run(params)

        logger.info({ orgId: id }, 'Organization updated')
    }

    // ==================== Service Catalog ====================

    createService(service: Partial<ServiceCatalogEntry> & {
        orgId: string
        serviceType: ServiceType
        name: string
    }): ServiceCatalogEntry {
        const id = service.id || `svc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const now = new Date().toISOString()

        this.db.prepare(`
            INSERT INTO service_catalog (
                id, org_id, service_type, vc_type, workflow_template_id, name, description, requirements,
                turnaround_time, turnaround_hours, fee_amount, fee_currency, is_active,
                request_schema, sample_credential, metadata, created_at, updated_at
            ) VALUES (
                @id, @orgId, @serviceType, @vcType, @workflowTemplateId, @name, @description, @requirements,
                @turnaroundTime, @turnaroundHours, @feeAmount, @feeCurrency, @isActive,
                @requestSchema, @sampleCredential, @metadata, @createdAt, @updatedAt
            )
        `).run({
            id,
            orgId: service.orgId,
            serviceType: service.serviceType,
            vcType: service.vcType || null,
            workflowTemplateId: service.workflowTemplateId || null,
            name: service.name,
            description: service.description || null,
            requirements: JSON.stringify(service.requirements || []),
            turnaroundTime: service.turnaroundTime || null,
            turnaroundHours: service.turnaroundHours || null,
            feeAmount: service.feeAmount || 0,
            feeCurrency: service.feeCurrency || 'USD',
            isActive: service.isActive !== false ? 1 : 0,
            requestSchema: JSON.stringify(service.requestSchema || {}),
            sampleCredential: service.sampleCredential || null,
            metadata: JSON.stringify(service.metadata || {}),
            createdAt: now,
            updatedAt: now
        })

        logger.info({ serviceId: id, orgId: service.orgId, name: service.name }, 'Service created')
        return this.findServiceById(id)!
    }

    findServiceById(id: string): ServiceCatalogEntry | undefined {
        const row = this.db.prepare(`
            SELECT * FROM service_catalog WHERE id = ?
        `).get(id)

        return row ? this.rowToService(row) : undefined
    }

    listServicesByOrganization(orgId: string, activeOnly = true): ServiceCatalogEntry[] {
        let sql = `SELECT * FROM service_catalog WHERE org_id = ?`
        const params: any[] = [orgId]

        if (activeOnly) {
            sql += ' AND is_active = 1'
        }

        sql += ' ORDER BY name ASC'

        const rows = this.db.prepare(sql).all(...params)
        return rows.map(r => this.rowToService(r))
    }

    listServicesByVcType(vcType: string, activeOnly = true): ServiceCatalogEntry[] {
        let sql = `SELECT * FROM service_catalog WHERE vc_type = ?`
        const params: any[] = [vcType]

        if (activeOnly) {
            sql += ' AND is_active = 1'
        }

        sql += ' ORDER BY fee_amount ASC, turnaround_hours ASC'

        const rows = this.db.prepare(sql).all(...params)
        return rows.map(r => this.rowToService(r))
    }

    updateService(id: string, updates: Partial<Omit<ServiceCatalogEntry, 'id' | 'orgId' | 'createdAt'>>): void {
        const updateFields: string[] = []
        const params: any = { id, updatedAt: new Date().toISOString() }

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id' && key !== 'orgId' && key !== 'createdAt') {
                const snakeKey = this.camelToSnake(key)
                updateFields.push(`${snakeKey} = @${key}`)
                params[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value
            }
        })

        if (updateFields.length === 0) return

        updateFields.push('updated_at = @updatedAt')

        const sql = `UPDATE service_catalog SET ${updateFields.join(', ')} WHERE id = @id`
        this.db.prepare(sql).run(params)

        logger.info({ serviceId: id }, 'Service updated')
    }

    deleteService(id: string): void {
        this.db.prepare(`DELETE FROM service_catalog WHERE id = ?`).run(id)
        logger.info({ serviceId: id }, 'Service deleted')
    }

    // ==================== VC Requests ====================

    createVcRequest(request: Partial<VcRequest> & {
        requesterTenantId: string
        targetOrgId: string
        serviceId: string
        vcType: string
        requestPayload: Record<string, any>
    }): VcRequest {
        const id = request.id || `vcreq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const now = new Date().toISOString()
        const expiresAt = request.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

        this.db.prepare(`
            INSERT INTO vc_requests (
                id, requester_tenant_id, requester_did, target_org_id, service_id, vc_type,
                request_payload, status, fee_paid, payment_ref, estimated_completion,
                expires_at, created_at, updated_at
            ) VALUES (
                @id, @requesterTenantId, @requesterDid, @targetOrgId, @serviceId, @vcType,
                @requestPayload, @status, @feePaid, @paymentRef, @estimatedCompletion,
                @expiresAt, @createdAt, @updatedAt
            )
        `).run({
            id,
            requesterTenantId: request.requesterTenantId,
            requesterDid: request.requesterDid || null,
            targetOrgId: request.targetOrgId,
            serviceId: request.serviceId,
            vcType: request.vcType,
            requestPayload: JSON.stringify(request.requestPayload),
            status: request.status || 'pending',
            feePaid: request.feePaid ? 1 : 0,
            paymentRef: request.paymentRef || null,
            estimatedCompletion: request.estimatedCompletion?.toISOString() || null,
            expiresAt,
            createdAt: now,
            updatedAt: now
        })

        logger.info({ requestId: id, vcType: request.vcType, requester: request.requesterTenantId }, 'VC request created')
        return this.findVcRequestById(id)!
    }

    findVcRequestById(id: string): VcRequest | undefined {
        const row = this.db.prepare(`
            SELECT * FROM vc_requests WHERE id = ?
        `).get(id)

        return row ? this.rowToVcRequest(row) : undefined
    }

    listVcRequestsByRequester(requesterTenantId: string, filters?: {
        status?: VcRequestStatus
        vcType?: string
        limit?: number
    }): VcRequest[] {
        let sql = `SELECT * FROM vc_requests WHERE requester_tenant_id = ?`
        const params: any[] = [requesterTenantId]

        if (filters?.status) {
            sql += ' AND status = ?'
            params.push(filters.status)
        }

        if (filters?.vcType) {
            sql += ' AND vc_type = ?'
            params.push(filters.vcType)
        }

        sql += ' ORDER BY created_at DESC'

        if (filters?.limit) {
            sql += ' LIMIT ?'
            params.push(filters.limit)
        }

        const rows = this.db.prepare(sql).all(...params)
        return rows.map(r => this.rowToVcRequest(r))
    }

    listVcRequestsByOrganization(targetOrgId: string, filters?: {
        status?: VcRequestStatus
        vcType?: string
        limit?: number
    }): VcRequest[] {
        let sql = `SELECT * FROM vc_requests WHERE target_org_id = ?`
        const params: any[] = [targetOrgId]

        if (filters?.status) {
            sql += ' AND status = ?'
            params.push(filters.status)
        }

        if (filters?.vcType) {
            sql += ' AND vc_type = ?'
            params.push(filters.vcType)
        }

        sql += ' ORDER BY created_at DESC'

        if (filters?.limit) {
            sql += ' LIMIT ?'
            params.push(filters.limit)
        }

        const rows = this.db.prepare(sql).all(...params)
        return rows.map(r => this.rowToVcRequest(r))
    }

    updateVcRequestStatus(id: string, status: VcRequestStatus, metadata?: {
        credentialId?: string
        credentialOfferUrl?: string
        rejectionReason?: string
        notes?: string
    }): void {
        const now = new Date().toISOString()
        const updates: string[] = ['status = @status', 'updated_at = @updatedAt']
        const params: any = { id, status, updatedAt: now }

        if (status === 'submitted') {
            updates.push('submitted_at = @submittedAt')
            params.submittedAt = now
        }

        if (status === 'approved') {
            updates.push('approved_at = @approvedAt')
            params.approvedAt = now
        }

        if (status === 'issued') {
            updates.push('issued_at = @issuedAt')
            params.issuedAt = now
            if (metadata?.credentialId) {
                updates.push('credential_id = @credentialId')
                params.credentialId = metadata.credentialId
            }
            if (metadata?.credentialOfferUrl) {
                updates.push('credential_offer_url = @credentialOfferUrl')
                params.credentialOfferUrl = metadata.credentialOfferUrl
            }
        }

        if (status === 'rejected' && metadata?.rejectionReason) {
            updates.push('rejection_reason = @rejectionReason')
            params.rejectionReason = metadata.rejectionReason
        }

        if (metadata?.notes) {
            updates.push('notes = @notes')
            params.notes = metadata.notes
        }

        const sql = `UPDATE vc_requests SET ${updates.join(', ')} WHERE id = @id`
        this.db.prepare(sql).run(params)

        logger.info({ requestId: id, status }, 'VC request status updated')
    }

    expirePendingVcRequests(): number {
        const result = this.db.prepare(`
            UPDATE vc_requests 
            SET status = 'expired', updated_at = CURRENT_TIMESTAMP
            WHERE status IN ('pending', 'submitted', 'under_review') 
            AND expires_at < CURRENT_TIMESTAMP
        `).run()

        if (result.changes > 0) {
            logger.info({ expired: result.changes }, 'Expired pending VC requests')
        }

        return result.changes
    }

    // ==================== Helpers ====================

    private rowToOrganization(row: any): OrganizationRegistry {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            displayName: row.display_name,
            description: row.description || undefined,
            logoUrl: row.logo_url || undefined,
            category: row.category as OrganizationCategory,
            subCategory: row.sub_category || undefined,
            isPublic: row.is_public === 1,
            trustScore: row.trust_score,
            verificationStatus: row.verification_status as VerificationStatus,
            issuerDid: row.issuer_did,
            verifierDid: row.verifier_did || undefined,
            website: row.website || undefined,
            contactPhone: row.contact_phone || undefined,
            contactEmail: row.contact_email || undefined,
            address: row.address || undefined,
            country: row.country,
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        }
    }

    private rowToService(row: any): ServiceCatalogEntry {
        return {
            id: row.id,
            orgId: row.org_id,
            serviceType: row.service_type as ServiceType,
            vcType: row.vc_type || undefined,
            workflowTemplateId: row.workflow_template_id || undefined,
            name: row.name,
            description: row.description || undefined,
            requirements: JSON.parse(row.requirements || '[]'),
            turnaroundTime: row.turnaround_time || undefined,
            turnaroundHours: row.turnaround_hours || undefined,
            feeAmount: row.fee_amount,
            feeCurrency: row.fee_currency,
            isActive: row.is_active === 1,
            requestSchema: JSON.parse(row.request_schema || '{}'),
            sampleCredential: row.sample_credential || undefined,
            metadata: JSON.parse(row.metadata || '{}'),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        }
    }

    private rowToVcRequest(row: any): VcRequest {
        return {
            id: row.id,
            requesterTenantId: row.requester_tenant_id,
            requesterDid: row.requester_did || undefined,
            targetOrgId: row.target_org_id,
            serviceId: row.service_id,
            vcType: row.vc_type,
            requestPayload: JSON.parse(row.request_payload),
            status: row.status as VcRequestStatus,
            credentialId: row.credential_id || undefined,
            credentialOfferUrl: row.credential_offer_url || undefined,
            rejectionReason: row.rejection_reason || undefined,
            notes: row.notes || undefined,
            feePaid: row.fee_paid === 1,
            paymentRef: row.payment_ref || undefined,
            estimatedCompletion: row.estimated_completion ? new Date(row.estimated_completion) : undefined,
            submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
            approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
            issuedAt: row.issued_at ? new Date(row.issued_at) : undefined,
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        }
    }

    private camelToSnake(str: string): string {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    }
}

export const organizationRegistryRepository = new OrganizationRegistryRepository()
