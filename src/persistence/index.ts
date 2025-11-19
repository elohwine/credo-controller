/**
 * Persistence Layer Exports
 * Central export point for all repositories and database management
 */

export { DatabaseManager } from './DatabaseManager'
export * from './TenantRepository'
export { DidRepository } from './DidRepository'
export { CredentialOfferRepository } from './CredentialOfferRepository'
export { IssuedCredentialRepository } from './IssuedCredentialRepository'
export { SchemaRepository } from './SchemaRepository'
export { CredentialDefinitionRepository } from './CredentialDefinitionRepository'
export * from './UserRepository'

export type { DidRecord } from './DidRepository'
export type { CredentialOfferRecord } from './CredentialOfferRepository'
export type { IssuedCredentialRecord } from './IssuedCredentialRepository'
export type { SchemaRecord } from './SchemaRepository'
export type { CredentialDefinitionRecord } from './CredentialDefinitionRepository'
