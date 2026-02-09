#!/usr/bin/env npx ts-node
/**
 * Seed Catalog Items for MVP Fastlane Demo
 * 
 * Seeds 2 products into the catalog for the shop demo:
 * 1. Fresh Vegetables Bundle - Essential groceries
 * 2. Mobile Airtime Voucher - Digital service
 * 
 * Usage:
 *   npx ts-node scripts/seed-catalog-items.ts --backend http://localhost:3000
 *   npx ts-node scripts/seed-catalog-items.ts --backend http://172.19.0.10:3000
 */

import axios from 'axios'

const BACKEND = process.env.BACKEND_URL || process.argv.find(a => a.startsWith('--backend='))?.split('=')[1] || 'http://localhost:3000'

// MVP Fastlane Catalog Items - Zimbabwe context
const CATALOG_ITEMS = [
    {
        title: 'Fresh Vegetables Bundle',
        description: 'Locally sourced vegetables: tomatoes, onions, leafy greens. Perfect for a family meal. Delivered fresh from Mbare Market.',
        price: 15.00,
        currency: 'USD',
        sku: 'VEG-BUNDLE-001',
        category: 'Groceries',
        images: ['https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400']
    },
    {
        title: 'EcoCash Airtime $5',
        description: 'Econet airtime voucher. Instant delivery via SMS. Valid for calls, data, and bundles.',
        price: 5.00,
        currency: 'USD',
        sku: 'AIRTIME-ECO-005',
        category: 'Digital Services',
        images: ['https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400']
    }
]

async function getMerchantId(): Promise<string> {
    // Try to get a tenant ID to use as merchant
    // The catalog API doesn't require auth for item creation in dev mode
    try {
        // Check if we have a portal tenant already
        const searchRes = await axios.get(`${BACKEND}/api/catalog/search?q=`)
        if (searchRes.data && searchRes.data.length > 0) {
            // Use existing merchant ID from first item
            return searchRes.data[0].merchantId
        }
    } catch (e) {
        // Ignore, will use default
    }
    
    // Default merchant ID for portal demo
    return 'portal-merchant-demo'
}

async function seedCatalog() {
    console.log(`\n🌱 Seeding Catalog Items`)
    console.log(`   Backend: ${BACKEND}`)
    console.log(`   Items: ${CATALOG_ITEMS.length}\n`)

    const merchantId = await getMerchantId()
    console.log(`   Merchant ID: ${merchantId}\n`)

    // Check existing items
    try {
        const existing = await axios.get(`${BACKEND}/api/catalog/search?q=`)
        if (existing.data && existing.data.length > 0) {
            console.log(`⚠️  Catalog already has ${existing.data.length} items:`)
            existing.data.forEach((item: any) => {
                console.log(`   - ${item.title} ($${item.price} ${item.currency})`)
            })
            console.log(`\n   Skipping seed to avoid duplicates.`)
            console.log(`   To re-seed, clear the catalog_items table first.\n`)
            return
        }
    } catch (e: any) {
        console.log(`   Note: Could not check existing items: ${e.message}`)
    }

    // Seed items
    let success = 0
    for (const item of CATALOG_ITEMS) {
        try {
            const res = await axios.post(
                `${BACKEND}/api/catalog/merchant/${merchantId}/items`,
                item,
                { headers: { 'Content-Type': 'application/json' } }
            )
            console.log(`✅ Created: ${item.title}`)
            console.log(`   ID: ${res.data.id}`)
            console.log(`   Price: $${item.price} ${item.currency}`)
            console.log(`   SKU: ${item.sku}\n`)
            success++
        } catch (e: any) {
            console.error(`❌ Failed to create "${item.title}":`, e.response?.data || e.message)
        }
    }

    console.log(`\n✅ Seeded ${success}/${CATALOG_ITEMS.length} items successfully!`)
    console.log(`\n📱 Visit the shop at: http://localhost:5000/shop`)
    console.log(`   or via docker: http://<portal-ip>:5000/shop\n`)
}

seedCatalog().catch(console.error)
