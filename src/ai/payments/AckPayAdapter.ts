/**
 * ACK-Pay Adapter Interface
 *
 * Provider-agnostic payment adapter following ACK-Pay patterns.
 * Each payment provider (EcoCash, MNEE, etc.) implements this interface.
 *
 * Reference: https://www.agentcommercekit.com/ack-pay
 */

import type {
  AckPayAdapter,
  AckPaymentOption,
  AckPaymentRequest,
} from '../types/ack-types'

/**
 * Base class for ACK-Pay adapters with common utilities
 */
export abstract class BaseAckPayAdapter implements AckPayAdapter {
  abstract readonly providerId: string
  abstract readonly providerName: string

  /**
   * Build payment options array for this provider
   */
  protected buildPaymentOptions(params: {
    amount: number
    currency: string
    recipient: string
    network?: string
  }): AckPaymentOption[] {
    return [
      {
        id: `${this.providerId}-option`,
        amount: params.amount,
        decimals: 2, // Default to 2 decimal places
        currency: params.currency,
        recipient: params.recipient,
        network: params.network ?? this.providerId,
        paymentService: this.getPaymentServiceUrl(),
        receiptService: this.getReceiptServiceUrl(),
      },
    ]
  }

  /**
   * Get the payment service URL for this provider
   */
  protected abstract getPaymentServiceUrl(): string

  /**
   * Get the receipt service URL for this provider
   */
  protected abstract getReceiptServiceUrl(): string

  // Abstract methods from interface
  abstract createPaymentRequest(params: {
    id: string
    description?: string
    paymentOptions: AckPaymentOption[]
    expiresAt?: Date
    serviceCallback?: string
    issuerDid: string
  }): Promise<{ paymentRequestToken: string; paymentRequest: AckPaymentRequest }>

  abstract initiatePayment(params: {
    paymentRequestToken: string
    paymentOptionId: string
    payerDid: string
    idempotencyKey: string
  }): Promise<{
    status: 'pending' | 'success' | 'failed'
    providerRef: string
    instructions?: string
  }>

  abstract verifyPayment(params: {
    providerRef: string
    expectedAmount: number
    expectedCurrency: string
  }): Promise<{
    verified: boolean
    settledAt?: string
    failureReason?: string
  }>

  abstract issueReceipt(params: {
    paymentRequestToken: string
    paymentOptionId: string
    providerRef: string
    payerDid: string
    issuerDid: string
    metadata?: Record<string, unknown>
  }): Promise<{ receiptCredentialJwt: string }>
}

/**
 * Registry of available payment adapters
 */
export class AckPayAdapterRegistry {
  private adapters: Map<string, AckPayAdapter> = new Map()

  /**
   * Register a payment adapter
   */
  register(adapter: AckPayAdapter): void {
    this.adapters.set(adapter.providerId, adapter)
  }

  /**
   * Get adapter by provider ID
   */
  get(providerId: string): AckPayAdapter | undefined {
    return this.adapters.get(providerId)
  }

  /**
   * List all registered provider IDs
   */
  listProviders(): string[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(providerId: string): boolean {
    return this.adapters.has(providerId)
  }
}

// Singleton registry instance
export const ackPayAdapterRegistry = new AckPayAdapterRegistry()
