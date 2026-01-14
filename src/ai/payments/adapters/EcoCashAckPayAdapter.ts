/**
 * EcoCash ACK-Pay Adapter
 *
 * Implements ACK-Pay interface for EcoCash mobile money payments.
 * Issues PaymentReceiptCredential on successful payment verification.
 *
 * Reference: https://www.agentcommercekit.com/ack-pay
 */

import { injectable, inject } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { BaseAckPayAdapter } from '../AckPayAdapter'
import type { AckPaymentOption, AckPaymentRequest } from '../../types/ack-types'
import { DatabaseManager } from '../../../persistence/DatabaseManager'

// Note: Import from @agentcommercekit/ack-pay when installed
// import { createPaymentReceipt, createSignedPaymentRequest } from '@agentcommercekit/ack-pay'

@injectable()
export class EcoCashAckPayAdapter extends BaseAckPayAdapter {
  readonly providerId = 'ecocash'
  readonly providerName = 'EcoCash'

  private baseUrl: string

  constructor(
    @inject(DatabaseManager) private dbManager: DatabaseManager,
    @inject('ECOCASH_BASE_URL') baseUrl?: string
  ) {
    super()
    this.baseUrl = baseUrl ?? process.env.ECOCASH_BASE_URL ?? 'https://api.ecocash.co.zw'
  }

  protected getPaymentServiceUrl(): string {
    return `${this.baseUrl}/payment-service`
  }

  protected getReceiptServiceUrl(): string {
    // Our own receipt service endpoint
    return process.env.API_BASE_URL
      ? `${process.env.API_BASE_URL}/ai/payments/receipts`
      : 'http://localhost:3001/ai/payments/receipts'
  }

  /**
   * Create a signed PaymentRequest per ACK-Pay spec
   */
  async createPaymentRequest(params: {
    id: string
    description?: string
    paymentOptions: AckPaymentOption[]
    expiresAt?: Date
    serviceCallback?: string
    issuerDid: string
  }): Promise<{ paymentRequestToken: string; paymentRequest: AckPaymentRequest }> {
    const paymentRequest: AckPaymentRequest = {
      id: params.id,
      description: params.description,
      serviceCallback: params.serviceCallback,
      expiresAt: params.expiresAt?.toISOString(),
      paymentOptions: params.paymentOptions,
    }

    // TODO: When @agentcommercekit/ack-pay is installed, use:
    // const { paymentRequestToken } = await createSignedPaymentRequest(paymentRequest, {
    //   issuer: params.issuerDid,
    //   signer: this.getJwtSigner(params.issuerDid),
    //   algorithm: 'ES256K'
    // })

    // For now, create a simple JWT placeholder
    const paymentRequestToken = await this.createPaymentRequestToken(
      paymentRequest,
      params.issuerDid
    )

    return { paymentRequestToken, paymentRequest }
  }

  /**
   * Initiate payment via EcoCash
   *
   * This would typically:
   * 1. Call EcoCash API to create a payment request
   * 2. Return USSD/push instructions for the payer
   */
  async initiatePayment(params: {
    paymentRequestToken: string
    paymentOptionId: string
    payerDid: string
    idempotencyKey: string
  }): Promise<{
    status: 'pending' | 'success' | 'failed'
    providerRef: string
    instructions?: string
  }> {
    // Check idempotency - prevent duplicate initiations
    const existing = await this.getPaymentByIdempotencyKey(params.idempotencyKey)
    if (existing) {
      return {
        status: existing.state as 'pending' | 'success' | 'failed',
        providerRef: existing.provider_ref,
      }
    }

    // Generate EcoCash reference
    const providerRef = `ECOCASH-${uuidv4().slice(0, 8).toUpperCase()}`

    // TODO: Call actual EcoCash API
    // const ecocashResponse = await this.ecocashClient.initiatePayment({...})

    // Store payment record
    await this.storePaymentRecord({
      id: uuidv4(),
      paymentRequestToken: params.paymentRequestToken,
      paymentOptionId: params.paymentOptionId,
      payerDid: params.payerDid,
      providerRef,
      idempotencyKey: params.idempotencyKey,
      state: 'pending',
    })

    return {
      status: 'pending',
      providerRef,
      instructions: `Dial *151*2*1# and enter reference: ${providerRef}`,
    }
  }

  /**
   * Verify payment with EcoCash
   *
   * Called from webhook handler or polling service.
   */
  async verifyPayment(params: {
    providerRef: string
    expectedAmount: number
    expectedCurrency: string
  }): Promise<{
    verified: boolean
    settledAt?: string
    failureReason?: string
  }> {
    // TODO: Call actual EcoCash verification API
    // const verification = await this.ecocashClient.verifyPayment(params.providerRef)

    // For now, simulate verification
    // In production, this would check the EcoCash transaction status

    return {
      verified: true,
      settledAt: new Date().toISOString(),
    }
  }

  /**
   * Issue PaymentReceiptCredential after verification
   */
  async issueReceipt(params: {
    paymentRequestToken: string
    paymentOptionId: string
    providerRef: string
    payerDid: string
    issuerDid: string
    metadata?: Record<string, unknown>
  }): Promise<{ receiptCredentialJwt: string }> {
    // TODO: When @agentcommercekit/ack-pay is installed, use:
    // const receipt = createPaymentReceipt({
    //   paymentRequestToken: params.paymentRequestToken,
    //   paymentOptionId: params.paymentOptionId,
    //   issuer: params.issuerDid,
    //   payerDid: params.payerDid,
    //   metadata: { ecocashRef: params.providerRef, ...params.metadata }
    // })
    // const receiptCredentialJwt = await signCredential(receipt, { ... })

    // For now, create a placeholder receipt
    const receipt = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiableCredential', 'PaymentReceiptCredential'],
      issuer: { id: params.issuerDid },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: params.payerDid,
        paymentRequestToken: params.paymentRequestToken,
        paymentOptionId: params.paymentOptionId,
        metadata: {
          ecocashRef: params.providerRef,
          ...params.metadata,
        },
      },
    }

    // Placeholder JWT - replace with actual signing
    const receiptCredentialJwt = `eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ.${Buffer.from(
      JSON.stringify(receipt)
    ).toString('base64url')}.placeholder`

    // Update payment record with receipt
    await this.updatePaymentWithReceipt(params.providerRef, receiptCredentialJwt)

    return { receiptCredentialJwt }
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private async createPaymentRequestToken(
    paymentRequest: AckPaymentRequest,
    issuerDid: string
  ): Promise<string> {
    // Placeholder JWT creation - replace with actual signing
    const header = { typ: 'JWT', alg: 'ES256K' }
    const payload = {
      iss: issuerDid,
      iat: Math.floor(Date.now() / 1000),
      paymentRequest,
    }

    return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(
      JSON.stringify(payload)
    ).toString('base64url')}.placeholder`
  }

  private async getPaymentByIdempotencyKey(key: string): Promise<any | null> {
    const db = DatabaseManager.getDatabase()
    return db
      .prepare('SELECT * FROM ack_payments WHERE idempotency_key = ?')
      .get(key) as any
  }

  private async storePaymentRecord(params: {
    id: string
    paymentRequestToken: string
    paymentOptionId: string
    payerDid: string
    providerRef: string
    idempotencyKey: string
    state: string
  }): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO ack_payments (
        id, tenant_id, payment_request_token, payment_option_id,
        provider_ref, payer_did, merchant_did, amount, currency,
        state, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.id,
      'default', // TODO: get from context
      params.paymentRequestToken,
      params.paymentOptionId,
      params.providerRef,
      params.payerDid,
      'unknown', // TODO: extract from payment request
      0, // TODO: extract from payment request
      'USD', // TODO: extract from payment request
      params.state,
      params.idempotencyKey,
      now,
      now
    )
  }

  private async updatePaymentWithReceipt(
    providerRef: string,
    receiptJwt: string
  ): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()

    // Update payment state
    db.prepare(
      'UPDATE ack_payments SET state = ?, updated_at = ? WHERE provider_ref = ?'
    ).run('paid', now, providerRef)

    // Get payment ID
    const payment = db
      .prepare('SELECT id FROM ack_payments WHERE provider_ref = ?')
      .get(providerRef) as any

    if (payment) {
      // Store receipt
      db.prepare(`
        INSERT INTO ack_payment_receipts (id, payment_id, credential_jwt, created_at)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), payment.id, receiptJwt, now)
    }
  }
}
