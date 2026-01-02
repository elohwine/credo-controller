import { Controller, Post, Get, Route, Tags, Body, Path, Query, Security, Request } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { randomUUID } from 'crypto'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { SCOPES } from '../../enums'

export interface CreateCatalogItemRequest {
    title: string
    description?: string
    images?: string[]
    price: number
    currency?: string
    sku?: string
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
    createdAt: string
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
            createdAt: timestamp
        }

        try {
            db.prepare(`
                INSERT INTO catalog_items (id, merchant_id, title, description, images, price, currency, sku, created_at, updated_at)
                VALUES (@id, @merchantId, @title, @description, @images, @price, @currency, @sku, @createdAt, @createdAt)
            `).run({
                ...item,
                images: JSON.stringify(item.images)
            })

            this.setStatus(201)
            return item
        } catch (error: any) {
            this.setStatus(500)
            throw new Error(`Failed to create item: ${error.message}`)
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
                createdAt: row.created_at
            }))
        } catch (error: any) {
            this.setStatus(500)
            throw new Error(`Failed to search items: ${error.message}`)
        }
    }
}
