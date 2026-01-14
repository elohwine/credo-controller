/**
 * Request Validation Schemas using Zod
 * Phase 9A: Production Hardening - Input Validation
 * 
 * These schemas provide runtime validation for critical API endpoints.
 */
import { z } from 'zod'

// ============================================
// Common Schemas
// ============================================

export const UUIDSchema = z.string().uuid()

export const DIDSchema = z.string().regex(
    /^did:[a-z0-9]+:.+$/,
    { message: 'Invalid DID format (must be did:method:identifier)' }
)

export const EmailSchema = z.string().email()

export const PhoneSchema = z.string().regex(
    /^\+?[1-9]\d{6,14}$/,
    { message: 'Invalid phone number (E.164 format expected)' }
)

export const CurrencyCodeSchema = z.enum(['USD', 'ZWL', 'EUR', 'GBP', 'ZAR'])

export const MoneyAmountSchema = z.number()
    .positive()
    .finite()
    .multipleOf(0.01)

export const PaginationSchema = z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(20),
})

// ============================================
// Authentication & Wallet
// ============================================

export const WalletRegistrationSchema = z.object({
    email: EmailSchema,
    password: z.string()
        .min(8, { message: 'Password must be at least 8 characters' })
        .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
        .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
        .regex(/[0-9]/, { message: 'Password must contain at least one number' }),
    displayName: z.string().min(1).max(100).optional(),
})

export const WalletLoginSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1),
})

// ============================================
// Credential Issuance
// ============================================

export const CredentialOfferRequestSchema = z.object({
    credentialType: z.string().min(1),
    claims: z.record(z.string(), z.unknown()).optional(),
    subjectDid: DIDSchema.optional(),
    expiresAt: z.string().optional(),
})

export const CredentialAcceptSchema = z.object({
    offerUri: z.string().url(),
    walletId: UUIDSchema.optional(),
})

// ============================================
// Finance - Invoices & Receipts
// ============================================

export const LineItemSchema = z.object({
    sku: z.string().min(1),
    description: z.string().min(1).max(500),
    quantity: z.number().int().positive(),
    unitPrice: MoneyAmountSchema,
    taxRate: z.number().min(0).max(1).default(0), // 0-100%
})

export const InvoiceCreateSchema = z.object({
    cartId: UUIDSchema.optional(),
    buyerDid: DIDSchema.optional(),
    buyerName: z.string().min(1).max(200),
    buyerEmail: EmailSchema.optional(),
    buyerPhone: PhoneSchema.optional(),
    lineItems: z.array(LineItemSchema).min(1),
    currency: CurrencyCodeSchema.default('USD'),
    dueDate: z.string().optional(),
    notes: z.string().max(1000).optional(),
})

export const ReceiptIssueSchema = z.object({
    invoiceId: UUIDSchema,
    paymentMethod: z.enum(['ecocash', 'card', 'bank_transfer', 'cash', 'crypto']),
    paymentReference: z.string().min(1).max(100),
    amountPaid: MoneyAmountSchema,
    currency: CurrencyCodeSchema.default('USD'),
    payerPhone: PhoneSchema.optional(),
})

// ============================================
// Inventory
// ============================================

export const LocationCreateSchema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['warehouse', 'shop', 'transit', 'virtual']),
    address: z.string().max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

export const GoodsReceiveSchema = z.object({
    locationId: UUIDSchema,
    items: z.array(z.object({
        sku: z.string().min(1).max(100),
        quantity: z.number().int().positive(),
        unitCost: MoneyAmountSchema,
        batchNumber: z.string().max(100).optional(),
        serialNumbers: z.array(z.string()).optional(),
        expiryDate: z.string().optional(),
    })).min(1),
    supplierRef: z.string().max(100).optional(),
    purchaseOrderRef: z.string().max(100).optional(),
    actorId: z.string().optional(),
    issueVC: z.boolean().default(false),
})

export const StockReserveSchema = z.object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
    referenceType: z.enum(['cart', 'invoice', 'order']),
    referenceId: UUIDSchema,
    locationId: UUIDSchema.optional(),
    actorId: z.string().optional(),
})

export const StockAdjustSchema = z.object({
    locationId: UUIDSchema,
    sku: z.string().min(1),
    quantityDelta: z.number().int().refine(n => n !== 0, { message: 'Quantity delta cannot be zero' }),
    reason: z.enum(['shrinkage', 'damage', 'recount', 'correction', 'theft', 'other']),
    notes: z.string().max(500).optional(),
    actorId: z.string().optional(),
})

// ============================================
// HR & Payroll
// ============================================

export const EmployeeCreateSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: EmailSchema,
    phone: PhoneSchema.optional(),
    nationalId: z.string().min(1).max(50),
    dateOfBirth: z.string(),
    startDate: z.string(),
    department: z.string().max(100).optional(),
    position: z.string().max(100).optional(),
    baseSalary: MoneyAmountSchema,
    currency: CurrencyCodeSchema.default('USD'),
    bankAccount: z.string().max(50).optional(),
    ecocashNumber: PhoneSchema.optional(),
})

export const PayrollRunSchema = z.object({
    periodStart: z.string(),
    periodEnd: z.string(),
    employeeIds: z.array(UUIDSchema).optional(), // null = all employees
    dryRun: z.boolean().default(false),
})

export const LeaveRequestSchema = z.object({
    employeeId: UUIDSchema,
    leaveType: z.enum(['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'other']),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().max(500).optional(),
})

export const ExpenseClaimSchema = z.object({
    employeeId: UUIDSchema,
    category: z.enum(['travel', 'meals', 'supplies', 'equipment', 'training', 'other']),
    amount: MoneyAmountSchema,
    currency: CurrencyCodeSchema.default('USD'),
    description: z.string().min(1).max(500),
    receiptUrl: z.string().url().optional(),
    dateIncurred: z.string(),
})

// ============================================
// Trust & Escalation
// ============================================

export const EscalationCreateSchema = z.object({
    merchantId: z.string().min(1),
    reason: z.enum(['fraud', 'non_delivery', 'counterfeit', 'dispute', 'compliance', 'other']),
    description: z.string().min(10).max(2000),
    evidenceRefs: z.array(z.string()).optional(),
    reporterDid: DIDSchema.optional(),
    reporterContact: z.string().max(200).optional(),
})

// ============================================
// Tenant Management
// ============================================

export const TenantCreateSchema = z.object({
    config: z.object({
        label: z.string().min(1).max(100),
        walletKey: z.string().min(8).optional(),
    }),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

// ============================================
// WhatsApp / Commerce
// ============================================

export const CartCreateSchema = z.object({
    merchantId: z.string().min(1),
    items: z.array(z.object({
        catalogItemId: UUIDSchema,
        quantity: z.number().int().positive(),
    })).min(1),
    buyerPhone: PhoneSchema.optional(),
    buyerName: z.string().max(200).optional(),
})

export const CatalogItemCreateSchema = z.object({
    merchantId: z.string().min(1),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    sku: z.string().min(1).max(100),
    price: MoneyAmountSchema,
    currency: CurrencyCodeSchema.default('USD'),
    category: z.string().max(100).optional(),
    imageUrl: z.string().url().optional(),
    inStock: z.boolean().default(true),
})

// ============================================
// Validation Helper
// ============================================

export type ValidationResult<T> = 
    | { success: true; data: T }
    | { success: false; errors: z.ZodIssue[] }

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
    const result = schema.safeParse(data)
    if (result.success) {
        return { success: true, data: result.data }
    }
    return { success: false, errors: result.error.issues }
}

/**
 * Express middleware factory for validating request bodies
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
    return (req: any, res: any, next: any) => {
        const result = validate(schema, req.body)
        if (!result.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: result.errors.map((e: z.ZodIssue) => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            })
        }
        req.validatedBody = result.data
        next()
    }
}

export default {
    // Auth
    WalletRegistrationSchema,
    WalletLoginSchema,
    // Credentials
    CredentialOfferRequestSchema,
    CredentialAcceptSchema,
    // Finance
    InvoiceCreateSchema,
    ReceiptIssueSchema,
    LineItemSchema,
    // Inventory
    LocationCreateSchema,
    GoodsReceiveSchema,
    StockReserveSchema,
    StockAdjustSchema,
    // HR
    EmployeeCreateSchema,
    PayrollRunSchema,
    LeaveRequestSchema,
    ExpenseClaimSchema,
    // Trust
    EscalationCreateSchema,
    // Tenant
    TenantCreateSchema,
    // Commerce
    CartCreateSchema,
    CatalogItemCreateSchema,
    // Helpers
    validate,
    validateBody,
}
