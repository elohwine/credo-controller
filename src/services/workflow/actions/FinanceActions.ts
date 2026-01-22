/**
 * IdenEx Credentis - Finance Workflow Actions
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Workflow actions for financial calculations:
 * - Invoice totals with tax (VAT/GST) handling
 * - Discount application (percentage or fixed)
 * - Line item processing
 * - Multi-currency support (USD, ZWL, ZiG)
 * 
 * @module services/workflow/actions/FinanceActions
 * @copyright 2024-2026 IdenEx Credentis
 */

import { WorkflowActionContext } from '../ActionRegistry'
import { rootLogger } from '../../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'FinanceActions' })

export class FinanceActions {
    /**
     * Calculates invoice totals based on line items, tax, and discounts.
     * 
     * Config:
     * - taxRate: number (percentage)
     * - taxInclusive: boolean
     * - discount: number (fixed amount) or string (percentage "10%")
     */
    static async calculateInvoice(context: WorkflowActionContext, config: any = {}) {
        const items = context.input.items || []
        const taxRate = config.taxRate || context.input.taxRate || 0
        const taxInclusive = config.taxInclusive ?? context.input.taxInclusive ?? false
        const discountConfig = config.discount || context.input.discount || 0

        logger.info({ itemsCount: items.length, taxRate, taxInclusive }, 'Calculating invoice')

        let subtotal = 0
        const lineItems = items.map((item: any) => {
            const lineTotal = (item.unitPrice || 0) * (item.qty || 0)
            subtotal += lineTotal
            return { ...item, lineTotal }
        })

        // Calculate Discount
        let discountAmount = 0
        if (typeof discountConfig === 'string' && discountConfig.endsWith('%')) {
            const percent = parseFloat(discountConfig)
            discountAmount = subtotal * (percent / 100)
        } else {
            discountAmount = Number(discountConfig)
        }

        // Calculate Tax
        let taxAmount = 0
        let taxableAmount = subtotal - discountAmount

        if (taxInclusive) {
            // Tax is inside the total: Tax = Total - (Total / (1 + Rate))
            // But usually "tax inclusive" means the unit prices include tax.
            // If we assume unit prices are tax-inclusive:
            // Total (inc tax) = taxableAmount
            // Tax = taxableAmount - (taxableAmount / (1 + rate/100))
            taxAmount = taxableAmount - (taxableAmount / (1 + taxRate / 100))
            // Adjust taxable amount to be exclusive for reporting if needed, 
            // but "Grand Total" stays as is.
        } else {
            // Tax is added on top
            taxAmount = taxableAmount * (taxRate / 100)
        }

        const grandTotal = taxInclusive
            ? taxableAmount // If inclusive, the discounted subtotal IS the grand total (conceptually)
            : taxableAmount + taxAmount

        // Update Context State
        context.state.finance = {
            lineItems,
            subtotal,
            discountAmount,
            taxAmount,
            grandTotal,
            currency: context.input.currency || 'USD'
        }

        logger.info({ subtotal, discountAmount, taxAmount, grandTotal }, 'Invoice calculation complete')
    }
}
