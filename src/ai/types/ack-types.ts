/**
 * ACK Protocol Type Definitions
 *
 * Types aligned with the Agent Commerce Kit (ACK) specifications:
 * - ACK-ID: https://www.agentcommercekit.com/ack-id
 * - ACK-Pay: https://www.agentcommercekit.com/ack-pay
 *
 * Note: These types supplement the official @agentcommercekit/* packages
 * with Credo-specific extensions for this platform.
 */

// ============================================================================
// ACK-ID Types (Agent Identity)
// ============================================================================

/**
 * Agent status in the registry lifecycle
 */
export type AiAgentStatus = 'active' | 'suspended' | 'revoked'

/**
 * Agent roles/scopes for policy enforcement
 */
export type AiAgentScope =
  | 'catalog.read'
  | 'catalog.write'
  | 'payment.initiate'
  | 'payment.refund'
  | 'credential.issue'
  | 'credential.verify'
  | 'workflow.execute'
  | 'trust.read'
  | 'trust.write'

/**
 * AI Agent registry record (persisted)
 */
export interface AiAgentRecord {
  id: string
  tenantId: string
  agentDid: string
  ownerDid: string
  controllerCredentialJwt: string
  label: string
  roles: AiAgentScope[]
  status: AiAgentStatus
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/**
 * Parameters for provisioning a new AI agent (ACK-ID aligned)
 */
export interface ProvisionAiAgentParams {
  tenantId: string
  ownerDid: string
  label: string
  roles: AiAgentScope[]
  metadata?: Record<string, unknown>
}

/**
 * Result of agent provisioning
 */
export interface ProvisionAiAgentResult {
  id: string
  agentDid: string
  controllerCredentialJwt: string
  status: AiAgentStatus
}

// ============================================================================
// ACK-Pay Types (Payments)
// ============================================================================

/**
 * Payment option schema (from ACK-Pay spec)
 */
export interface AckPaymentOption {
  id: string
  amount: number | string
  decimals: number
  currency: string
  recipient: string
  network?: string
  paymentService?: string
  receiptService?: string
}

/**
 * Payment request schema (from ACK-Pay spec)
 */
export interface AckPaymentRequest {
  id: string
  description?: string
  serviceCallback?: string
  expiresAt?: string
  paymentOptions: AckPaymentOption[]
}

/**
 * Payment receipt claim (credentialSubject of PaymentReceiptCredential)
 */
export interface AckPaymentReceiptClaim {
  id?: string // payer DID
  paymentRequestToken: string
  paymentOptionId: string
  metadata?: Record<string, unknown>
}

/**
 * Payment reconciliation states
 */
export type PaymentReconciliationState =
  | 'initiated'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'

/**
 * Payment record for tracking (platform-specific)
 */
export interface PaymentRecord {
  id: string
  tenantId: string
  paymentRequestToken: string
  paymentOptionId: string
  providerRef?: string // e.g., ecocashRef, mneeTxHash
  payerDid: string
  merchantDid: string
  amount: number
  currency: string
  state: PaymentReconciliationState
  receiptCredentialId?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Delegation Types (ACK-ID extension)
// ============================================================================

/**
 * Delegation limits for scoped agent authorization
 */
export interface DelegationLimits {
  maxAmountPerTx?: number
  maxDailyAmount?: number
  currency?: string
  allowedRecipients?: string[]
  allowedWorkflows?: string[]
}

/**
 * Delegation credential subject (ACK-ID compatible extension)
 */
export interface DelegationCredentialSubject {
  id: string // agent DID
  controller: string // owner DID
  scopes: AiAgentScope[]
  limits?: DelegationLimits
  validUntil?: string
}

// ============================================================================
// ACK-Pay Adapter Interface
// ============================================================================

/**
 * Provider-agnostic payment adapter interface (ACK-Pay aligned)
 */
export interface AckPayAdapter {
  readonly providerId: string
  readonly providerName: string

  /**
   * Create a signed PaymentRequest per ACK-Pay spec
   */
  createPaymentRequest(params: {
    id: string
    description?: string
    paymentOptions: AckPaymentOption[]
    expiresAt?: Date
    serviceCallback?: string
    issuerDid: string
  }): Promise<{ paymentRequestToken: string; paymentRequest: AckPaymentRequest }>

  /**
   * Initiate payment via provider (EcoCash, MNEE, etc.)
   */
  initiatePayment(params: {
    paymentRequestToken: string
    paymentOptionId: string
    payerDid: string
    idempotencyKey: string
  }): Promise<{
    status: 'pending' | 'success' | 'failed'
    providerRef: string
    instructions?: string
  }>

  /**
   * Verify payment with provider
   */
  verifyPayment(params: {
    providerRef: string
    expectedAmount: number
    expectedCurrency: string
  }): Promise<{
    verified: boolean
    settledAt?: string
    failureReason?: string
  }>

  /**
   * Issue PaymentReceiptCredential after verification
   */
  issueReceipt(params: {
    paymentRequestToken: string
    paymentOptionId: string
    providerRef: string
    payerDid: string
    issuerDid: string
    metadata?: Record<string, unknown>
  }): Promise<{ receiptCredentialJwt: string }>
}

// ============================================================================
// Policy Engine Types
// ============================================================================

/**
 * Policy decision request
 */
export interface PolicyDecisionRequest {
  actorDid: string
  actorType: 'user' | 'ai-agent' | 'service'
  tenantId: string
  action: string
  resource: string
  amount?: number
  currency?: string
  context?: Record<string, unknown>
}

/**
 * Policy decision result
 */
export interface PolicyDecisionResult {
  allowed: boolean
  reason?: string
  requiredStepUp?: 'mfa' | 'manager-approval' | 'human-review'
  appliedPolicies: string[]
}
