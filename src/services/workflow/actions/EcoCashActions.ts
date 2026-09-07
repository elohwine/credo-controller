import type { WorkflowActionContext } from '../ActionRegistry'

import { createHash, randomUUID } from 'crypto'

import { rootLogger } from '../../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'EcoCashActions' })

/** EcoCash C2B endpoints — sandbox vs production. */
const ECOCASH_C2B_SANDBOX = 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/instant/c2b/sandbox'
const ECOCASH_C2B_PROD = 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/instant/c2b'
const ECOCASH_STATUS_SANDBOX = 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/status/sandbox'
const ECOCASH_STATUS_PROD = 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/status'

/** Opaque phone hash for structured logging — never log raw MSISDNs. */
function msisdnHash(msisdn: string): string {
  return createHash('sha256').update(msisdn.trim()).digest('hex').slice(0, 12)
}

function resolveWebhookUrl(): string {
  if (process.env.NGROK_URL) return `${process.env.NGROK_URL}/webhooks/ecocash`
  if (process.env.PUBLIC_BASE_URL) return `${process.env.PUBLIC_BASE_URL}/webhooks/ecocash`
  return 'http://localhost:3000/webhooks/ecocash'
}

/**
 * ecocash.payment
 *
 * Initiates an EcoCash C2B payment and stores a structured result in
 * context.state.ecocashPayment. Does NOT log the raw customer MSISDN or
 * full response body.
 *
 * Required context.input fields:
 *   customerMsisdn: string
 *   amount: number
 *   currency?: string (default 'USD')
 *   sourceReference?: string (idempotency key — generated if absent)
 *   reason?: string
 *
 * Required config:
 *   sandboxMode?: boolean (default true)
 *   callbackUrl?: string (overrides auto-detected webhook URL)
 *
 * API key is read from ECOCASH_API_KEY env var or config.apiKey.
 * Never pass API keys through workflow state.
 */
export async function ecocashPayment(
  context: WorkflowActionContext,
  config: Record<string, unknown> = {},
): Promise<void> {
  const sandboxMode = (config.sandboxMode ?? process.env.ECOCASH_SANDBOX !== 'false') as boolean
  const apiKey = (config.apiKey as string | undefined) ?? process.env.ECOCASH_API_KEY
  if (!apiKey) throw new Error('ecocash.payment: ECOCASH_API_KEY is required')

  const { customerMsisdn, amount, currency = 'USD', reason, sourceReference: inputRef } = context.input
  if (!customerMsisdn) throw new Error('ecocash.payment: customerMsisdn is required')
  if (typeof amount !== 'number' || amount <= 0) throw new Error('ecocash.payment: amount must be a positive number')

  const sourceReference = (inputRef as string | undefined) ?? `PAY-${randomUUID()}`
  const callbackUrl = (config.callbackUrl as string | undefined) ?? resolveWebhookUrl()
  const endpoint = sandboxMode ? ECOCASH_C2B_SANDBOX : ECOCASH_C2B_PROD

  logger.info(
    {
      module: 'EcoCashActions',
      action: 'payment',
      msisdnHash: msisdnHash(customerMsisdn),
      sourceReference,
      sandboxMode,
    },
    'Initiating EcoCash C2B payment',
  )

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerMsisdn,
      amount: Number(amount.toFixed(2)),
      reason: (reason as string | undefined) ?? `Payment ${sourceReference}`,
      currency,
      sourceReference,
      callbackUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    // Log status code only — never log response body (may contain PII)
    logger.error({ status: response.status, sourceReference }, 'EcoCash payment initiation failed')
    throw new Error(`ecocash.payment: API returned ${response.status}`)
  }

  // Store metadata only — not the raw API response body
  context.state.ecocashPayment = {
    status: 'pending',
    sourceReference,
    callbackUrl,
    initiatedAt: new Date().toISOString(),
    sandboxMode,
  }

  logger.info({ sourceReference, callbackUrl }, 'EcoCash payment initiated successfully')
}

/**
 * ecocash.transaction.lookup
 *
 * Queries EcoCash for the current status of a transaction by sourceReference.
 * Stores the result in context.state.ecocashLookup.
 *
 * Required:
 *   context.input.sourceReference or context.state.ecocashPayment.sourceReference
 */
export async function ecocashTransactionLookup(
  context: WorkflowActionContext,
  config: Record<string, unknown> = {},
): Promise<void> {
  const sandboxMode = (config.sandboxMode ?? process.env.ECOCASH_SANDBOX !== 'false') as boolean
  const apiKey = (config.apiKey as string | undefined) ?? process.env.ECOCASH_API_KEY
  if (!apiKey) throw new Error('ecocash.transaction.lookup: ECOCASH_API_KEY is required')

  const sourceReference =
    (context.input.sourceReference as string | undefined) ??
    (context.state.ecocashPayment?.sourceReference as string | undefined)
  if (!sourceReference) throw new Error('ecocash.transaction.lookup: sourceReference is required')

  const endpoint =
    (sandboxMode ? ECOCASH_STATUS_SANDBOX : ECOCASH_STATUS_PROD) + `/${encodeURIComponent(sourceReference)}`

  logger.info({ sourceReference, sandboxMode }, 'Looking up EcoCash transaction status')

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    logger.error({ status: response.status, sourceReference }, 'EcoCash transaction lookup failed')
    throw new Error(`ecocash.transaction.lookup: API returned ${response.status}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  // Extract only the fields needed for platform decisions — never store raw API response
  const txStatus = (data.status as string | undefined) ?? 'UNKNOWN'
  const txId = data.transactionId as string | undefined

  context.state.ecocashLookup = {
    sourceReference,
    transactionId: txId,
    status: txStatus,
    checkedAt: new Date().toISOString(),
  }

  logger.info({ sourceReference, txStatus }, 'EcoCash transaction lookup complete')
}

/**
 * ecocash.payment.proof
 *
 * Creates a structured payment proof record from a completed EcoCash transaction.
 * The proof is stored as an evidence reference; the caller can later request a
 * verifiable credential via the issuance workflow.
 *
 * Requires context.state.ecocashPayment to contain a sourceReference, and
 * context.state.ecocashLookup to confirm completion.
 *
 * Does NOT issue a VC directly — that is done by credential.issue in a
 * subsequent workflow step, keeping concerns separated.
 */
export async function ecocashPaymentProof(
  context: WorkflowActionContext,
  config: Record<string, unknown> = {},
): Promise<void> {
  const payment = context.state.ecocashPayment as Record<string, unknown> | undefined
  const lookup = context.state.ecocashLookup as Record<string, unknown> | undefined

  const sourceReference = (payment?.sourceReference ?? context.input.sourceReference) as string | undefined
  if (!sourceReference) throw new Error('ecocash.payment.proof: sourceReference is required')

  const txStatus = (lookup?.status as string | undefined) ?? 'UNKNOWN'
  const confirmed = txStatus === 'SUCCESS' || txStatus === 'COMPLETED' || txStatus === 'APPROVED'

  if (!confirmed) {
    throw new Error(`ecocash.payment.proof: cannot issue proof for unconfirmed transaction (status=${txStatus})`)
  }

  // Build a structured proof object — opaque references, no PII
  const proofRef = `ecocash-proof:${sourceReference}`
  const proofDigest = createHash('sha256')
    .update(`${sourceReference}:${txStatus}:${lookup?.transactionId ?? ''}`)
    .digest('hex')

  context.state.ecocashPaymentProof = {
    proofRef,
    sourceReference,
    transactionId: lookup?.transactionId,
    transactionStatus: txStatus,
    digest: proofDigest,
    purpose: (config.purpose as string | undefined) ?? 'payment',
    createdAt: new Date().toISOString(),
  }

  logger.info({ proofRef, sourceReference }, 'EcoCash payment proof created')
}
