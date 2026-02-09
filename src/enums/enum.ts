export enum CredentialEnum {
  Finished = 'finished',
  Action = 'action',
  Failed = 'failed',
  Wait = 'wait',
}

export enum Role {
  Author = 'author',
  Endorser = 'endorser',
}

export enum DidMethod {
  Key = 'key',
  Web = 'web',
  Peer = 'peer',
}

// Future blockchain networks can be added here under NetworkName
export type NetworkName = string

// Removed Indy-specific transaction agreement enums
// Future blockchain-specific agreements can be added as needed

// Future blockchain networks can be added here
export type Network = string
// Example constant: export const Hyperledger_Fabric_Channel1: Network = 'fabric:channel1'

export enum NetworkTypes {
  Testnet = 'testnet',
  Demonet = 'demonet',
  Mainnet = 'mainnet',
}

// Removed Indy-specific acceptance mechanism enum
// Future blockchain-specific mechanisms can be added as needed

export enum EndorserMode {
  Internal = 'internal',
  External = 'external',
}

export enum SchemaError {
  NotFound = 'notFound',
  UnSupportedAnonCredsMethod = 'unsupportedAnonCredsMethod',
}

export enum HttpStatusCode {
  OK = 200,
  Created = 201,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  InternalServerError = 500,
}

export declare enum CustomHandshakeProtocol {
  DidExchange = 'https://didcomm.org/didexchange/1.1',
  Connections = 'https://didcomm.org/connections/1.0',
}

export enum AgentRole {
  RestRootAgentWithTenants = 'RestRootAgentWithTenants',
  RestRootAgent = 'RestRootAgent',
  RestTenantAgent = 'RestTenantAgent',
}

export enum ErrorMessages {
  Unauthorized = 'Unauthorized',
}

export enum RESULT {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum SCOPES {
  UNPROTECTED = 'skip',
  MULTITENANT_BASE_AGENT = 'Basewallet',
  TENANT_AGENT = 'tenant',
  DEDICATED_AGENT = 'dedicated',
}
