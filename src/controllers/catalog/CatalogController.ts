import { Controller, Post, Get, Route, Tags, Body, Path, Query, Security, Request } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { randomUUID } from 'crypto'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { SCOPES } from '../../enums'
import { credentialIssuanceService } from '../../services/CredentialIssuanceService'

export interface CreateCatalogItemRequest {
    title: string
    description?: string
    images?: string[]
    price: number
    currency?: string
    sku?: string
    category?: string
}

export interface CatalogItem {
    id: string
    merchantId: string
    title: string
    description?: string
    images: string[]
    price: number
    currency: string
    sku?: string
    category?: string
    createdAt: string
    catalogItemVcOffer?: {
        offerId: string
        credential_offer_uri: string
        credential_offer_deeplink: string
        expiresAt: string
        credentialType: string[]
    }
}

@Route('api/catalog')
@Tags('Unified Catalog')
export class CatalogController extends Controller {

    /**
     * Add a new item to the merchant's catalog.
     */
    @Post('merchant/{merchantId}/items')
    // @Security('jwt', [SCOPES.TENANT_AGENT]) // Copilot Note: Enable security when authentication flows are fully tested
    public async createItem(
        @Path() merchantId: string,
        @Body() body: CreateCatalogItemRequest,
        @Request() request: ExRequest
    ): Promise<CatalogItem> {
        const db = DatabaseManager.getDatabase()
        const id = `ITM-${randomUUID()}`
        const timestamp = new Date().toISOString()

        const item: CatalogItem = {
            id,
            merchantId,
            title: body.title,
            description: body.description,
            images: body.images || [],
            price: body.price,
            currency: body.currency || 'USD',
            sku: body.sku,
            category: body.category,
            createdAt: timestamp
        }

        try {
            db.prepare(`
                INSERT INTO catalog_items (id, merchant_id, title, description, images, price, currency, sku, category, created_at, updated_at)
                VALUES (@id, @merchantId, @title, @description, @images, @price, @currency, @sku, @category, @createdAt, @createdAt)
            `).run({
                ...item,
                images: JSON.stringify(item.images)
            })

            // Issue a CatalogItemVC offer for the merchant (optional, best-effort)
            let catalogItemVcOffer: CatalogItem['catalogItemVcOffer'] | undefined
            try {
                catalogItemVcOffer = await credentialIssuanceService.createOffer({
                    credentialType: 'CatalogItemVC',
                    tenantId: merchantId,
                    claims: {
                        itemId: item.id,
                        title: item.title,
                        description: item.description,
                        images: item.images,
                        price: item.price,
                        currency: item.currency,
                        sku: item.sku,
                        category: item.category,
                        merchantId: item.merchantId,
                        createdAt: item.createdAt
                    }
                })
            } catch (e: any) {
                console.warn('[Catalog] Failed to create CatalogItemVC offer:', e?.message || e)
            }

            this.setStatus(201)
            return { ...item, catalogItemVcOffer }
        } catch (error: any) {
            this.setStatus(500)
            throw new Error(`Failed to create item: ${error.message}`)
        }
    }


    /**
     * Import multiple items to the merchant's catalog.
     */
    @Post('merchant/{merchantId}/import')
    public async importItems(
        @Path() merchantId: string,
        @Body() items: CreateCatalogItemRequest[]
    ): Promise<{ imported: number }> {
        const db = DatabaseManager.getDatabase()
        const timestamp = new Date().toISOString()

        const insertStmt = db.prepare(`
            INSERT INTO catalog_items (id, merchant_id, title, description, images, price, currency, sku, category, created_at, updated_at)
            VALUES (@id, @merchantId, @title, @description, @images, @price, @currency, @sku, @category, @createdAt, @createdAt)
        `)

        const importTx = db.transaction((itemList: CreateCatalogItemRequest[]) => {
            for (const item of itemList) {
                insertStmt.run({
                    id: `ITM-${randomUUID()}`,
                    merchantId,
                    title: item.title,
                    description: item.description,
                    images: JSON.stringify(item.images || []),
                    price: item.price,
                    currency: item.currency || 'USD',
                    sku: item.sku,
                    category: item.category,
                    createdAt: timestamp
                })
            }
        })

        try {
            importTx(items)
            return { imported: items.length }
        } catch (error: any) {
            this.setStatus(500)
            throw new Error(`Failed to import items: ${error.message}`)
        }
    }

    /**
     * Search the unified catalog.
     */
    @Get('search')
    public async searchItems(
        @Query() q?: string
    ): Promise<CatalogItem[]> {
        const db = DatabaseManager.getDatabase()
        const query = q ? `%${q}%` : '%'

        try {
            const rows = db.prepare(`
                SELECT * FROM catalog_items 
                WHERE title LIKE ? OR description LIKE ? OR sku LIKE ?
                ORDER BY created_at DESC
                LIMIT 50
            `).all(query, query, query) as any[]

            return rows.map(row => ({
                id: row.id,
                merchantId: row.merchant_id,
                title: row.title,
                description: row.description,
                images: JSON.parse(row.images || '[]'),
                price: row.price,
                currency: row.currency,
                sku: row.sku,
                category: row.category,
                createdAt: row.created_at
            }))
        } catch (error: any) {
            this.setStatus(500)
            throw new Error(`Failed to search items: ${error.message}`)
        }
    }
}
