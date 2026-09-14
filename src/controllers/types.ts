import type { RecordId } from './examples'
import type { CustomHandshakeProtocol } from '../enums'
import type { AnonCredsCredential } from '@credo-ts/anoncreds'
import type {
  DidResolutionMetadata,
  DidDocumentMetadata,
  DidRegistrationExtraOptions,
  DidDocument,
  DidRegistrationSecretOptions,
  InitConfig,
  DidResolutionOptions,
  JsonObject,
  W3cJsonLdSignCredentialOptions,
  W3cCredential,
  W3cCredentialSubject,
} from '@credo-ts/core'
import type {
  DidCommAttachment,
  DidCommAutoAcceptCredential,
  DidCommAutoAcceptProof,
  DidCommCredentialFormat,
  DidCommCredentialFormatPayload,
  DidCommHandshakeProtocol,
  DidCommMessage,
  DidCommProofFormat,
  DidCommRouting,
  OutOfBandDidCommService,
  ReceiveOutOfBandInvitationConfig,
} from '@credo-ts/didcomm'
import type { DIDDocument } from 'did-resolver'

type ProofExchangeRecord = unknown
type CredentialExchangeRecord = unknown
type WalletConfig = {
  id: string
  key: string
  keyDerivationMethod?: string
}
type JsonCredential = unknown
type JsonLdCredentialFormat = unknown
type LegacyIndyCredentialFormat = unknown
type AnonCredsCredentialFormat = unknown

export type SupportedKeyType = 'Ed25519' | 'Bls12381g2' | 'P-256'
type TsoaSingleOrArray<T> = T | T[]

export type AutoAcceptProof = DidCommAutoAcceptProof
export type AutoAcceptCredential = DidCommAutoAcceptCredential
export type HandshakeProtocol = DidCommHandshakeProtocol
export type AgentMessage = DidCommMessage
export type Routing = DidCommRouting
export type Attachment = DidCommAttachment
export type ProofFormat = DidCommProofFormat
export type CredentialFormatPayload<
  CFs extends DidCommCredentialFormat[],
  M extends keyof DidCommCredentialFormat['credentialFormats'],
> = DidCommCredentialFormatPayload<CFs, M>

export type CustomTenantConfig = {
  label: string
  connectionImageUrl?: string
  walletConfig: Pick<WalletConfig, 'id' | 'key' | 'keyDerivationMethod'>
  tenantType?: 'USER' | 'ORG'
  domain?: string
}

export interface AgentInfo {
  label: string
  endpoints: string[]
  isInitialized: boolean
  publicDid: void
}

export interface AgentToken {
  token: string
}

export interface AgentMessageType {
  '@id': string
  '@type': string
  [key: string]: any
}

export interface DidResolutionResultProps {
  didResolutionMetadata: DidResolutionMetadata
  didDocument: DIDDocument | null
  didDocumentMetadata: DidDocumentMetadata
}

export interface ProofRequestMessageResponse {
  message: string
  proofRecord: ProofExchangeRecord
}

// type CredentialFormats = [CredentialFormat]
type CredentialFormats = any[]

enum ProtocolVersion {
  v1 = 'v1',
  v2 = 'v2',
}
export interface ProposeCredentialOptions {
  protocolVersion: ProtocolVersion
  credentialFormats: any
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
  connectionId: RecordId
}

// export interface ProposeCredentialOptions<CPs extends CredentialProtocol[] = CredentialProtocol[]> extends BaseOptions {
//   connectionId: string
//   protocolVersion: CredentialProtocolVersionType<CPs>
//   credentialFormats: CredentialFormatPayload<CredentialFormatsFromProtocols<CPs>, 'createProposal'>
// }

export interface AcceptCredentialProposalOptions {
  credentialRecordId: string
  credentialFormats?: any
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
}

export interface CreateOfferOptions {
  protocolVersion: ProtocolVersion
  connectionId: RecordId
  credentialFormats: any
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
  goalCode?: string
  goal?: string
}

type CredentialFormatType = LegacyIndyCredentialFormat | JsonLdCredentialFormat | AnonCredsCredentialFormat

export interface CreateOfferOobOptions {
  protocolVersion: string
  credentialFormats: any
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
  goalCode?: string
  parentThreadId?: string
  willConfirm?: boolean
  label?: string
  imageUrl?: string
  recipientKey?: string
  invitationDid?: string
}
export interface CredentialCreateOfferOptions {
  credentialRecord: CredentialExchangeRecord
  credentialFormats: JsonCredential
  options: any
  attachmentId?: string
}

export interface CreateProofRequestOobOptions {
  protocolVersion: string
  proofFormats: any
  goalCode?: string
  parentThreadId?: string
  willConfirm?: boolean
  autoAcceptProof?: AutoAcceptProof
  comment?: string
  label?: string
  imageUrl?: string
  recipientKey?: string
  invitationDid?: string
}

export interface OfferCredentialOptions {
  credentialFormats: {
    indy: {
      credentialDefinitionId: string
      attributes: {
        name: string
        value: string
      }[]
    }
  }
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
  connectionId: string
}

export interface V2OfferCredentialOptions {
  protocolVersion: string
  connectionId: string
  credentialFormats: {
    indy: {
      credentialDefinitionId: string
      attributes: {
        name: string
        value: string
      }[]
    }
  }
  autoAcceptCredential: string
}

export interface AcceptCredential {
  credentialRecordId: RecordId
}

export interface CredentialOfferOptions {
  credentialRecordId: RecordId
  credentialFormats?: CredentialFormatPayload<CredentialFormats, 'acceptOffer'>
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
}

export interface AcceptCredentialRequestOptions {
  credentialRecordId: RecordId
  credentialFormats?: CredentialFormatPayload<CredentialFormats, 'acceptRequest'>
  autoAcceptCredential?: AutoAcceptCredential
  comment?: string
}

type ReceiveOutOfBandInvitationProps = Omit<ReceiveOutOfBandInvitationConfig, 'routing'>

export interface ReceiveInvitationProps extends ReceiveOutOfBandInvitationProps {
  invitation: OutOfBandInvitationSchema
}

export interface ReceiveInvitationByUrlProps extends ReceiveOutOfBandInvitationProps {
  invitationUrl: string
}

export interface AcceptInvitationConfig {
  autoAcceptConnection?: boolean
  reuseConnection?: boolean
  label?: string
  alias?: string
  imageUrl?: string
  mediatorId?: string
}

export interface OutOfBandInvitationSchema {
  '@id'?: string
  '@type': string
  label: string
  goalCode?: string
  goal?: string
  accept?: string[]
  handshake_protocols?: CustomHandshakeProtocol[]
  services: Array<OutOfBandDidCommService | string>
  imageUrl?: string
}

export interface ConnectionInvitationSchema {
  id?: string
  '@type': string
  label: string
  did?: string
  recipientKeys?: string[]
  serviceEndpoint?: string
  routingKeys?: string[]
  imageUrl?: string
}

// TODO: added type in protocolVersion
// export interface RequestProofOptions {
//   protocolVersion: 'v1' | 'v2'
//   connectionId: string
//   // TODO: added indy proof formate
//   proofFormats: ProofFormatPayload<[IndyProofFormat], 'createRequest'>
//   comment: string
//   autoAcceptProof?: AutoAcceptProof
//   parentThreadId?: string
// }

export interface RequestProofOptions {
  connectionId: string
  protocolVersion: string
  proofFormats: any
  comment: string
  autoAcceptProof: AutoAcceptProof
  goalCode?: string
  parentThreadId?: string
  willConfirm?: boolean
}

// TODO: added type in protocolVersion
export interface RequestProofProposalOptions {
  connectionId: string
  proofFormats: any
  goalCode?: string
  parentThreadId?: string
  autoAcceptProof?: AutoAcceptProof
  comment?: string
}

export interface AcceptProofProposal {
  proofRecordId: string
  proofFormats: any
  comment?: string
  autoAcceptProof?: AutoAcceptProof
  goalCode?: string
  willConfirm?: boolean
}

export interface GetTenantAgentOptions {
  tenantId: string
}

export interface DidCreateOptions {
  method?: string
  did?: string
  options?: DidRegistrationExtraOptions
  secret?: DidRegistrationSecretOptions
  didDocument?: DidDocument
  seed?: any
}

export interface ResolvedDid {
  didUrl: string
  options?: DidResolutionOptions
}

export interface DidCreate {
  keyType?: SupportedKeyType
  seed?: string
  domain?: string
  method: string
  did?: string
  role?: string
  endorserDid?: string
  didDocument?: DidDocument
}

// export type WithTenantAgentCallback<AgentModules extends ModulesMap> = (
//   tenantAgent: TenantAgent<AgentModules>
// ) => Promise<void>

export interface WithTenantAgentOptions {
  tenantId: string
  method: string
  payload?: any
}

export interface ReceiveConnectionsForTenants {
  tenantId: string
  invitationId?: string
}

export interface CreateInvitationOptions {
  label?: string
  alias?: string
  imageUrl?: string
  goalCode?: string
  goal?: string
  handshake?: boolean
  handshakeProtocols?: HandshakeProtocol[]
  messages?: AgentMessage[]
  multiUseInvitation?: boolean
  autoAcceptConnection?: boolean
  routing?: Routing
  appendedAttachments?: Attachment[]
  invitationDid?: string
}

//todo:Add transaction type
export interface EndorserTransaction {
  transaction: string | Record<string, unknown>
  endorserDid: string
}

export interface DidNymTransaction {
  did: string
  nymRequest: string
}

//todo:Add endorsedTransaction type
export interface WriteTransaction {
  endorsedTransaction: string
  endorserDid?: string
  schema?: {
    issuerId: string
    name: string
    version: string
    attributes: string[]
  }
  credentialDefinition?: {
    schemaId: string
    issuerId: string
    tag: string
    value: any
    type: string
  }
}
export interface RecipientKeyOption {
  recipientKey?: string
}

export interface CreateSchemaInput {
  issuerId: string
  name: string
  version: string
  attributes: string[]
  endorse?: boolean
  endorserDid?: string
}

export interface SchemaMetadata {
  did: string
  schemaId: string
  schemaTxnHash?: string
  schemaUrl?: string
}
/**
 * @example "ea4e5e69-fc04-465a-90d2-9f8ff78aa71d"
 */
export type ThreadId = string

export type SignDataOptions = {
  data: string
  keyType: SupportedKeyType
  publicKeyBase58: string
  did?: string
  method?: string
}

export type VerifyDataOptions = {
  data: string
  keyType: SupportedKeyType
  publicKeyBase58: string
  signature: string
}

export interface jsonLdCredentialOptions {
  '@context': Array<string | JsonObject>
  type: Array<string>
  credentialSubject: TsoaSingleOrArray<JsonObject>
  proofType: string
}

export interface credentialPayloadToSign {
  issuerDID: string
  method: string
  credential: jsonLdCredentialOptions // TODO: add support for other credential format
}
export type ExtensibleW3cCredentialSubject = W3cCredentialSubject & {
  [key: string]: any
}

export type ExtensibleW3cCredential = W3cCredential & {
  [key: string]: any
  credentialSubject: TsoaSingleOrArray<ExtensibleW3cCredentialSubject>
}

export type CustomW3cJsonLdSignCredentialOptions = Omit<W3cJsonLdSignCredentialOptions, 'format'> & {
  [key: string]: any
}

export interface CreateTenantOptions {
  /** Optional public base URL for the tenant (used for OpenID endpoints) */
  baseUrl?: string
  /** Optional human readable display name (used in metadata display objects) */
  displayName?: string
  config: Omit<CustomTenantConfig, 'walletConfig'> & {
    tenantType?: 'USER' | 'ORG'
    domain?: string
  }
}

/* ---------------- Multi-Tenancy Response Models (TSOA) ---------------- */

/** Metadata bundle returned when requesting tenant metadata */
export interface TenantMetadataResponse {
  /** OpenID issuer metadata object */
  issuer: Record<string, any>
  /** OpenID verifier metadata object */
  verifier: Record<string, any>
}

/** Response returned by POST /multi-tenancy/create-tenant */
export interface CreateTenantResponse {
  /** Unique identifier for the tenant (mirrors tenantId) */
  id: string
  /** Duplicate of id for backward compatibility with existing clients */
  tenantId: string
  /** JWT to authenticate as the tenant */
  token: string
  /** Human readable label */
  label?: string
  /** ISO timestamp of creation */
  createdAt: string
  /** ISO timestamp of last update */
  updatedAt?: string
  /** Provisioned issuer DID */
  issuerDid: string
  /** Verification method / key id for issuer DID */
  issuerKid: string
  /** Provisioned verifier DID */
  verifierDid: string
  /** Verification method / key id for verifier DID */
  verifierKid: string
  /** Underlying Askar profile identifier */
  askarProfile: string
  /** Issuer + verifier metadata objects */
  metadata: TenantMetadataResponse
  /** Allow forward-compat extension */
  [key: string]: any
}
