/**
 * AI Module Index
 *
 * Exports for the ACK-aligned AI/automation module.
 * Uses "ai" namespace to avoid conflicts with Credo agent terminology.
 *
 * Reference: docs/AGENT_TERMINOLOGY_AND_NAMING.md
 */

// Types
export * from './types/ack-types'

// Payment adapters
export { BaseAckPayAdapter, AckPayAdapterRegistry, ackPayAdapterRegistry } from './payments/AckPayAdapter'
export { EcoCashAckPayAdapter } from './payments/adapters/EcoCashAckPayAdapter'
