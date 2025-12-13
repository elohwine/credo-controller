import 'reflect-metadata'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { FinanceActions } from '../src/services/workflow/actions/FinanceActions'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { unlinkSync, existsSync } from 'fs'

// Mock CredentialActions to avoid DB/Controller dependencies in unit test
ActionRegistry.register('credential.issue', async (context) => {
    context.state.offer = { mock: 'offer' }
})

const TEST_DB = './data/test_workflow.db'

describe('Workflow Engine', () => {
    beforeAll(() => {
        if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
        DatabaseManager.initialize({ path: TEST_DB })
    })

    afterAll(() => {
        DatabaseManager.close()
        if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    })

    test('Should register and execute a Finance Quote Workflow', async () => {
        // 1. Register Workflow
        const workflowDef = {
            id: 'finance-quote-test',
            tenantId: 'default',
            name: 'Test Quote Workflow',
            category: 'Finance',
            provider: 'Generic',
            description: 'Test workflow',
            inputSchema: {},
            actions: [
                {
                    action: 'finance.calculate_invoice',
                    config: {
                        taxRate: 15, // 15% Tax
                        taxInclusive: false
                    }
                },
                {
                    action: 'credential.issue',
                    config: {
                        type: 'QuoteVC'
                    }
                }
            ]
        }

        await workflowService.registerWorkflow(workflowDef)

        // 2. Execute Workflow
        const input = {
            items: [
                { description: 'Item 1', unitPrice: 100, qty: 2 }, // 200
                { description: 'Item 2', unitPrice: 50, qty: 1 }   // 50
            ],
            discount: 10 // Fixed $10 discount
        }

        const result = await workflowService.executeWorkflow('finance-quote-test', input)

        // 3. Verify Calculation
        // Subtotal: 250
        // Discount: 10
        // Taxable: 240
        // Tax (15%): 36
        // Total: 276

        expect(result.finance).toBeDefined()
        expect(result.finance.subtotal).toBe(250)
        expect(result.finance.discountAmount).toBe(10)
        expect(result.finance.taxAmount).toBe(36)
        expect(result.finance.grandTotal).toBe(276)

        // Verify Credential Action ran
        expect(result.offer).toBeDefined()
    })
})
