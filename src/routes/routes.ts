/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SchemaRegistryController } from './../controllers/schemas/SchemaRegistryController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { Polygon } from './../controllers/polygon/PolygonController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OidcVerifierController } from './../controllers/oidc/OidcVerifierController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OidcMetadataController } from './../controllers/oidc/OidcMetadataController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OID4VCredentialDefinitionController } from './../controllers/oidc/OID4VCredentialDefinitionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MultiTenancyController } from './../controllers/multi-tenancy/MultiTenancyController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { QuestionAnswerController } from './../controllers/didcomm/question-answer/QuestionAnswerController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProofController } from './../controllers/didcomm/proofs/ProofController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OutOfBandController } from './../controllers/didcomm/outofband/OutOfBandController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CredentialController } from './../controllers/didcomm/credentials/CredentialController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ConnectionController } from './../controllers/didcomm/connections/ConnectionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BasicMessageController } from './../controllers/didcomm/basic-messages/BasicMessageController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DidExpansionController } from './../controllers/did/DidExpansionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DidController } from './../controllers/did/DidController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DidAutomationController } from './../controllers/did/DidAutomationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SchemaController } from './../controllers/anoncreds/schema/SchemaController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EndorserTransactionController } from './../controllers/anoncreds/endorser-transaction/EndorserTransactionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CredentialDefinitionController } from './../controllers/anoncreds/cred-def/CredentialDefinitionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentController } from './../controllers/agent/AgentController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WalletAuthController } from './../controllers/wallet/WalletAuthController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WalletController } from './../controllers/wallet/WalletController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OidcIssuerController } from './../controllers/oidc/OidcIssuerController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EcoCashWebhookController } from './../controllers/webhooks/EcoCashWebhookController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WorkflowController } from './../controllers/workflow/WorkflowController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WalletCredentialsController } from './../controllers/wallet/WalletCredentialsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FinanceController } from './../controllers/finance/FinanceController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CatalogController } from './../controllers/catalog/CatalogController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WhatsAppPayloadController } from './../controllers/whatsapp/WhatsAppPayloadController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TrustController } from './../controllers/trust/TrustController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VCVerifierController } from './../controllers/regulator/VCVerifierController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EscalationController } from './../controllers/regulator/EscalationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WhatsAppWebhookController } from './../controllers/whatsapp/WhatsAppWebhookController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PayrollController } from './../controllers/finance/PayrollController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OnboardingController } from './../controllers/hr/OnboardingController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { RevocationController } from './../controllers/trust/RevocationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VerifierPortalController } from './../controllers/trust/VerifierPortalController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OperationsController } from './../controllers/hr/OperationsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ReportingController } from './../controllers/finance/ReportingController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { InventoryController } from './../controllers/inventory/InventoryController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MetricsController } from './../controllers/metrics/MetricsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PaymentController } from './../controllers/payments/PaymentController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ReceiptController } from './../controllers/payments/PaymentController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PortalController } from './../controllers/PortalController';
import { expressAuthentication } from './../authentication';
// @ts-ignore - no great way to install types from subpackage
import { iocContainer } from './../utils/tsyringeTsoaIocContainer';
import type { IocContainer, IocContainerFactory } from '@tsoa/runtime';
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegisteredSchema": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "jsonSchema": {"ref":"Record_string.any_","required":true},
            "tenantId": {"dataType":"string"},
            "schemaId": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegisterSchemaRequestBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "jsonSchema": {"ref":"Record_string.any_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.unknown_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidOperation.Create": {
        "dataType": "refEnum",
        "enums": ["createDID"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDidOperationOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"serviceEndpoint":{"dataType":"string"},"operation":{"ref":"DidOperation.Create","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidOperation.Update": {
        "dataType": "refEnum",
        "enums": ["updateDIDDoc"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidDocument": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.any_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateDidOperationOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"did":{"dataType":"string","required":true},"didDocument":{"ref":"DidDocument","required":true},"operation":{"ref":"DidOperation.Update","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidOperation.Deactivate": {
        "dataType": "refEnum",
        "enums": ["deactivate"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeactivateDidOperationOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"did":{"dataType":"string","required":true},"operation":{"ref":"DidOperation.Deactivate","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidOperation.AddResource": {
        "dataType": "refEnum",
        "enums": ["addResource"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddResourceDidOperationOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"did":{"dataType":"string","required":true},"resource":{"dataType":"object","required":true},"resourceId":{"dataType":"string","required":true},"operation":{"ref":"DidOperation.AddResource","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidOperationOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"CreateDidOperationOptions"},{"ref":"UpdateDidOperationOptions"},{"ref":"DeactivateDidOperationOptions"},{"ref":"AddResourceDidOperationOptions"}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreatePresentationRequestResponse": {
        "dataType": "refObject",
        "properties": {
            "requestId": {"dataType":"string","required":true},
            "presentation_request_url": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreatePresentationRequestBody": {
        "dataType": "refObject",
        "properties": {
            "presentationDefinition": {"dataType":"any"},
            "verifierDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerifyPresentationResponse": {
        "dataType": "refObject",
        "properties": {
            "verified": {"dataType":"boolean","required":true},
            "reason": {"dataType":"string"},
            "schemaValidation": {"dataType":"any"},
            "presentation": {"dataType":"any"},
            "error": {"dataType":"string"},
            "checks": {"dataType":"nestedObjectLiteral","nestedProperties":{"schema":{"dataType":"boolean"},"revocation":{"dataType":"boolean"},"audience":{"dataType":"boolean"},"nonce":{"dataType":"boolean"},"signature":{"dataType":"boolean"}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerifyPresentationRequestBody": {
        "dataType": "refObject",
        "properties": {
            "requestId": {"dataType":"string","required":true},
            "verifiablePresentation": {"dataType":"string","required":true},
            "presentationSubmission": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialDefinitionRecord": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "schemaId": {"dataType":"string","required":true},
            "issuerDid": {"dataType":"string","required":true},
            "credentialType": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "claimsTemplate": {"ref":"Record_string.unknown_"},
            "format": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["jwt_vc"]},{"dataType":"enum","enums":["sd_jwt"]},{"dataType":"enum","enums":["jwt_vc_json"]},{"dataType":"enum","enums":["jwt_vc_json-ld"]}]},
            "tenantId": {"dataType":"string"},
            "credentialDefinitionId": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegisterCredentialDefinitionBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "schemaId": {"dataType":"string","required":true},
            "credentialType": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "issuerDid": {"dataType":"string","required":true},
            "claimsTemplate": {"ref":"Record_string.unknown_"},
            "format": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["jwt_vc"]},{"dataType":"enum","enums":["sd_jwt"]},{"dataType":"enum","enums":["jwt_vc_json"]},{"dataType":"enum","enums":["jwt_vc_json-ld"]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TenantMetadataResponse": {
        "dataType": "refObject",
        "properties": {
            "issuer": {"ref":"Record_string.unknown_","required":true},
            "verifier": {"ref":"Record_string.unknown_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTenantResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "token": {"dataType":"string","required":true},
            "label": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
            "updatedAt": {"dataType":"string"},
            "issuerDid": {"dataType":"string","required":true},
            "issuerKid": {"dataType":"string","required":true},
            "verifierDid": {"dataType":"string","required":true},
            "verifierKid": {"dataType":"string","required":true},
            "askarProfile": {"dataType":"string","required":true},
            "metadata": {"ref":"TenantMetadataResponse","required":true},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_CustomTenantConfig.Exclude_keyofCustomTenantConfig.walletConfig__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"label":{"dataType":"string","required":true},"connectionImageUrl":{"dataType":"string"},"tenantType":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["USER"]},{"dataType":"enum","enums":["ORG"]}]},"domain":{"dataType":"string"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_CustomTenantConfig.walletConfig_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_CustomTenantConfig.Exclude_keyofCustomTenantConfig.walletConfig__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTenantOptions": {
        "dataType": "refObject",
        "properties": {
            "baseUrl": {"dataType":"string"},
            "displayName": {"dataType":"string"},
            "config": {"dataType":"intersection","subSchemas":[{"ref":"Omit_CustomTenantConfig.walletConfig_"},{"dataType":"nestedObjectLiteral","nestedProperties":{"domain":{"dataType":"string"},"tenantType":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["USER"]},{"dataType":"enum","enums":["ORG"]}]}}}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QuestionAnswerRole": {
        "dataType": "refEnum",
        "enums": ["questioner","responder"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QuestionAnswerState": {
        "dataType": "refEnum",
        "enums": ["question-sent","question-received","answer-received","answer-sent"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecordId": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ValidResponse": {
        "dataType": "refObject",
        "properties": {
            "text": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_response.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"response":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProofExchangeRecord": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.unknown_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AutoAcceptProof": {
        "dataType": "refEnum",
        "enums": ["always","contentApproved","never"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RequestProofProposalOptions": {
        "dataType": "refObject",
        "properties": {
            "connectionId": {"dataType":"string","required":true},
            "proofFormats": {"dataType":"any","required":true},
            "goalCode": {"dataType":"string"},
            "parentThreadId": {"dataType":"string"},
            "autoAcceptProof": {"ref":"AutoAcceptProof"},
            "comment": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptProofProposal": {
        "dataType": "refObject",
        "properties": {
            "proofRecordId": {"dataType":"string","required":true},
            "proofFormats": {"dataType":"any","required":true},
            "comment": {"dataType":"string"},
            "autoAcceptProof": {"ref":"AutoAcceptProof"},
            "goalCode": {"dataType":"string"},
            "willConfirm": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RequestProofOptions": {
        "dataType": "refObject",
        "properties": {
            "connectionId": {"dataType":"string","required":true},
            "protocolVersion": {"dataType":"string","required":true},
            "proofFormats": {"dataType":"any","required":true},
            "comment": {"dataType":"string","required":true},
            "autoAcceptProof": {"ref":"AutoAcceptProof","required":true},
            "goalCode": {"dataType":"string"},
            "parentThreadId": {"dataType":"string"},
            "willConfirm": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PlaintextMessage": {
        "dataType": "refObject",
        "properties": {
            "@type": {"dataType":"string","required":true},
            "@id": {"dataType":"string","required":true},
            "~thread": {"dataType":"nestedObjectLiteral","nestedProperties":{"pthid":{"dataType":"string"},"thid":{"dataType":"string"}}},
            "messageType": {"dataType":"string","required":true},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateProofRequestOobOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"dataType":"string","required":true},
            "proofFormats": {"dataType":"any","required":true},
            "goalCode": {"dataType":"string"},
            "parentThreadId": {"dataType":"string"},
            "willConfirm": {"dataType":"boolean"},
            "autoAcceptProof": {"ref":"AutoAcceptProof"},
            "comment": {"dataType":"string"},
            "label": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "recipientKey": {"dataType":"string"},
            "invitationDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProofFormatDataMessagePayload_ProofFormat-Array.proposal_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProofFormatDataMessagePayload_ProofFormat-Array.request_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProofFormatDataMessagePayload_ProofFormat-Array.presentation_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetProofFormatDataReturn_ProofFormat-Array_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"presentation":{"ref":"ProofFormatDataMessagePayload_ProofFormat-Array.presentation_"},"request":{"ref":"ProofFormatDataMessagePayload_ProofFormat-Array.request_"},"proposal":{"ref":"ProofFormatDataMessagePayload_ProofFormat-Array.proposal_"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandshakeProtocol": {
        "dataType": "refEnum",
        "enums": ["https://didcomm.org/didexchange/1.x","https://didcomm.org/connections/1.x"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentMessage": {
        "dataType": "refAlias",
        "type": {"ref":"PlaintextMessage","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "KeyType": {
        "dataType": "refEnum",
        "enums": ["ed25519","bls12381g1g2","bls12381g1","bls12381g2","x25519","p256","p384","p521","k256"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Key": {
        "dataType": "refObject",
        "properties": {
            "publicKey": {"dataType":"buffer","required":true},
            "keyType": {"ref":"KeyType","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Routing": {
        "dataType": "refObject",
        "properties": {
            "endpoints": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "recipientKey": {"ref":"Key","required":true},
            "routingKeys": {"dataType":"array","array":{"dataType":"refObject","ref":"Key"},"required":true},
            "mediatorId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonValue": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"double"},{"dataType":"boolean"},{"dataType":"enum","enums":[null]},{"ref":"JsonObject"},{"ref":"JsonArray"}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonObject": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": {"ref":"JsonValue"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonArray": {
        "dataType": "refAlias",
        "type": {"dataType":"array","array":{"dataType":"refAlias","ref":"JsonValue"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_JwsGeneralFormat.Exclude_keyofJwsGeneralFormat.payload__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"header":{"ref":"Record_string.unknown_","required":true},"signature":{"dataType":"string","required":true},"protected":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_JwsGeneralFormat.payload_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_JwsGeneralFormat.Exclude_keyofJwsGeneralFormat.payload__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JwsDetachedFormat": {
        "dataType": "refAlias",
        "type": {"ref":"Omit_JwsGeneralFormat.payload_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JwsFlattenedDetachedFormat": {
        "dataType": "refObject",
        "properties": {
            "signatures": {"dataType":"array","array":{"dataType":"refAlias","ref":"JwsDetachedFormat"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttachmentData": {
        "dataType": "refObject",
        "properties": {
            "base64": {"dataType":"string"},
            "json": {"ref":"JsonValue"},
            "links": {"dataType":"array","array":{"dataType":"string"}},
            "jws": {"dataType":"union","subSchemas":[{"ref":"JwsDetachedFormat"},{"ref":"JwsFlattenedDetachedFormat"}]},
            "sha256": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Attachment": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "filename": {"dataType":"string"},
            "mimeType": {"dataType":"string"},
            "lastmodTime": {"dataType":"datetime"},
            "byteCount": {"dataType":"double"},
            "data": {"ref":"AttachmentData","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateInvitationOptions": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string"},
            "alias": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "goalCode": {"dataType":"string"},
            "goal": {"dataType":"string"},
            "handshake": {"dataType":"boolean"},
            "handshakeProtocols": {"dataType":"array","array":{"dataType":"refEnum","ref":"HandshakeProtocol"}},
            "messages": {"dataType":"array","array":{"dataType":"refAlias","ref":"AgentMessage"}},
            "multiUseInvitation": {"dataType":"boolean"},
            "autoAcceptConnection": {"dataType":"boolean"},
            "routing": {"ref":"Routing"},
            "appendedAttachments": {"dataType":"array","array":{"dataType":"refObject","ref":"Attachment"}},
            "invitationDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecipientKeyOption": {
        "dataType": "refObject",
        "properties": {
            "recipientKey": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_CreateLegacyInvitationConfig.Exclude_keyofCreateLegacyInvitationConfig.routing__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"label":{"dataType":"string"},"alias":{"dataType":"string"},"imageUrl":{"dataType":"string"},"multiUseInvitation":{"dataType":"boolean"},"autoAcceptConnection":{"dataType":"boolean"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_CreateLegacyInvitationConfig.routing_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_CreateLegacyInvitationConfig.Exclude_keyofCreateLegacyInvitationConfig.routing__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OutOfBandRecord": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.unknown_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentMessageType": {
        "dataType": "refObject",
        "properties": {
            "@id": {"dataType":"string","required":true},
            "@type": {"dataType":"string","required":true},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomHandshakeProtocol": {
        "dataType": "refEnum",
        "enums": ["https://didcomm.org/didexchange/1.1","https://didcomm.org/connections/1.0"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SingleOrArray_string-or-Record_string.unknown__": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"Record_string.unknown_"}]},{"dataType":"array","array":{"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"Record_string.unknown_"}]}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OutOfBandDidCommService": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "serviceEndpoint": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "recipientKeys": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "routingKeys": {"dataType":"array","array":{"dataType":"string"}},
            "accept": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OutOfBandInvitationSchema": {
        "dataType": "refObject",
        "properties": {
            "@id": {"dataType":"string"},
            "@type": {"dataType":"string","required":true},
            "label": {"dataType":"string","required":true},
            "goalCode": {"dataType":"string"},
            "goal": {"dataType":"string"},
            "accept": {"dataType":"array","array":{"dataType":"string"}},
            "handshake_protocols": {"dataType":"array","array":{"dataType":"refEnum","ref":"CustomHandshakeProtocol"}},
            "services": {"dataType":"array","array":{"dataType":"union","subSchemas":[{"ref":"OutOfBandDidCommService"},{"dataType":"string"}]},"required":true},
            "imageUrl": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_ReceiveOutOfBandInvitationConfig.Exclude_keyofReceiveOutOfBandInvitationConfig.routing__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"label":{"dataType":"string"},"alias":{"dataType":"string"},"imageUrl":{"dataType":"string"},"autoAcceptConnection":{"dataType":"boolean"},"autoAcceptInvitation":{"dataType":"boolean"},"reuseConnection":{"dataType":"boolean"},"acceptInvitationTimeoutMs":{"dataType":"double"},"ourDid":{"dataType":"string"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_ReceiveOutOfBandInvitationConfig.routing_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_ReceiveOutOfBandInvitationConfig.Exclude_keyofReceiveOutOfBandInvitationConfig.routing__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReceiveInvitationProps": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string"},
            "alias": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "autoAcceptConnection": {"dataType":"boolean"},
            "autoAcceptInvitation": {"dataType":"boolean"},
            "reuseConnection": {"dataType":"boolean"},
            "acceptInvitationTimeoutMs": {"dataType":"double"},
            "ourDid": {"dataType":"string"},
            "invitation": {"ref":"OutOfBandInvitationSchema","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReceiveInvitationByUrlProps": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string"},
            "alias": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "autoAcceptConnection": {"dataType":"boolean"},
            "autoAcceptInvitation": {"dataType":"boolean"},
            "reuseConnection": {"dataType":"boolean"},
            "acceptInvitationTimeoutMs": {"dataType":"double"},
            "ourDid": {"dataType":"string"},
            "invitationUrl": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptInvitationConfig": {
        "dataType": "refObject",
        "properties": {
            "autoAcceptConnection": {"dataType":"boolean"},
            "reuseConnection": {"dataType":"boolean"},
            "label": {"dataType":"string"},
            "alias": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "mediatorId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ThreadId": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialState": {
        "dataType": "refEnum",
        "enums": ["proposal-sent","proposal-received","offer-sent","offer-received","declined","request-sent","request-received","credential-issued","credential-received","done","abandoned"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialRole": {
        "dataType": "refEnum",
        "enums": ["issuer","holder"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cCredentialRecord": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.unknown_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProtocolVersion": {
        "dataType": "refEnum",
        "enums": ["v1","v2"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialPreviewAttributeOptions": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "mimeType": {"dataType":"string"},
            "value": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LinkedAttachment": {
        "dataType": "refObject",
        "properties": {
            "attributeName": {"dataType":"string","required":true},
            "attachment": {"ref":"Attachment","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_AnonCredsProposeCredentialFormat.Exclude_keyofAnonCredsProposeCredentialFormat.schemaIssuerId-or-issuerId__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"schemaId":{"dataType":"string"},"schemaName":{"dataType":"string"},"schemaVersion":{"dataType":"string"},"credentialDefinitionId":{"dataType":"string"},"attributes":{"dataType":"array","array":{"dataType":"refObject","ref":"CredentialPreviewAttributeOptions"}},"linkedAttachments":{"dataType":"array","array":{"dataType":"refObject","ref":"LinkedAttachment"}},"schemaIssuerDid":{"dataType":"string"},"issuerDid":{"dataType":"string"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_AnonCredsProposeCredentialFormat.schemaIssuerId-or-issuerId_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_AnonCredsProposeCredentialFormat.Exclude_keyofAnonCredsProposeCredentialFormat.schemaIssuerId-or-issuerId__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LegacyIndyProposeCredentialFormat": {
        "dataType": "refAlias",
        "type": {"ref":"Omit_AnonCredsProposeCredentialFormat.schemaIssuerId-or-issuerId_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cIssuerOptions": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SingleOrArray_JsonObject_": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"JsonObject"},{"dataType":"array","array":{"dataType":"refObject","ref":"JsonObject"}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonCredential": {
        "dataType": "refObject",
        "properties": {
            "@context": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"ref":"JsonObject"}],"required":true},
            "id": {"dataType":"string"},
            "type": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "issuer": {"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"W3cIssuerOptions"}],"required":true},
            "issuanceDate": {"dataType":"string","required":true},
            "expirationDate": {"dataType":"string"},
            "credentialSubject": {"ref":"SingleOrArray_JsonObject_","required":true},
            "prettyVc": {"dataType":"any"},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonLdCredentialDetailFormat": {
        "dataType": "refObject",
        "properties": {
            "credential": {"ref":"JsonCredential","required":true},
            "options": {"dataType":"nestedObjectLiteral","nestedProperties":{"proofType":{"dataType":"string","required":true},"proofPurpose":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnonCredsProposeCredentialFormat": {
        "dataType": "refObject",
        "properties": {
            "schemaIssuerId": {"dataType":"string"},
            "schemaId": {"dataType":"string"},
            "schemaName": {"dataType":"string"},
            "schemaVersion": {"dataType":"string"},
            "credentialDefinitionId": {"dataType":"string"},
            "issuerId": {"dataType":"string"},
            "attributes": {"dataType":"array","array":{"dataType":"refObject","ref":"CredentialPreviewAttributeOptions"}},
            "linkedAttachments": {"dataType":"array","array":{"dataType":"refObject","ref":"LinkedAttachment"}},
            "schemaIssuerDid": {"dataType":"string"},
            "issuerDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormatType-Array.createProposal_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"indy":{"ref":"LegacyIndyProposeCredentialFormat"},"jsonld":{"ref":"JsonLdCredentialDetailFormat"},"anoncreds":{"ref":"AnonCredsProposeCredentialFormat"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AutoAcceptCredential": {
        "dataType": "refEnum",
        "enums": ["always","contentApproved","never"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProposeCredentialOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"ref":"ProtocolVersion","required":true},
            "credentialFormats": {"ref":"CredentialFormatPayload_CredentialFormatType-Array.createProposal_","required":true},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
            "connectionId": {"ref":"RecordId","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnonCredsAcceptProposalFormat": {
        "dataType": "refObject",
        "properties": {
            "credentialDefinitionId": {"dataType":"string"},
            "revocationRegistryDefinitionId": {"dataType":"string"},
            "revocationRegistryIndex": {"dataType":"double"},
            "attributes": {"dataType":"array","array":{"dataType":"refObject","ref":"CredentialPreviewAttributeOptions"}},
            "linkedAttachments": {"dataType":"array","array":{"dataType":"refObject","ref":"LinkedAttachment"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.never_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EmptyObject": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.never_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormats.acceptProposal_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"indy":{"ref":"AnonCredsAcceptProposalFormat"},"jsonld":{"ref":"EmptyObject"},"anoncreds":{"ref":"AnonCredsAcceptProposalFormat"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptCredentialProposalOptions": {
        "dataType": "refObject",
        "properties": {
            "credentialRecordId": {"dataType":"string","required":true},
            "credentialFormats": {"ref":"CredentialFormatPayload_CredentialFormats.acceptProposal_"},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnonCredsOfferCredentialFormat": {
        "dataType": "refObject",
        "properties": {
            "credentialDefinitionId": {"dataType":"string","required":true},
            "revocationRegistryDefinitionId": {"dataType":"string"},
            "revocationRegistryIndex": {"dataType":"double"},
            "attributes": {"dataType":"array","array":{"dataType":"refObject","ref":"CredentialPreviewAttributeOptions"},"required":true},
            "linkedAttachments": {"dataType":"array","array":{"dataType":"refObject","ref":"LinkedAttachment"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormats.createOffer_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"indy":{"ref":"AnonCredsOfferCredentialFormat"},"jsonld":{"ref":"JsonLdCredentialDetailFormat"},"anoncreds":{"ref":"AnonCredsOfferCredentialFormat"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOfferOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"ref":"ProtocolVersion","required":true},
            "connectionId": {"ref":"RecordId","required":true},
            "credentialFormats": {"ref":"CredentialFormatPayload_CredentialFormats.createOffer_","required":true},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
            "goalCode": {"dataType":"string"},
            "goal": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormatType-Array.createOffer_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"indy":{"ref":"AnonCredsOfferCredentialFormat"},"jsonld":{"ref":"JsonLdCredentialDetailFormat"},"anoncreds":{"ref":"AnonCredsOfferCredentialFormat"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOfferOobOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"dataType":"string","required":true},
            "credentialFormats": {"ref":"CredentialFormatPayload_CredentialFormatType-Array.createOffer_","required":true},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
            "goalCode": {"dataType":"string"},
            "parentThreadId": {"dataType":"string"},
            "willConfirm": {"dataType":"boolean"},
            "label": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "recipientKey": {"dataType":"string"},
            "invitationDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnonCredsAcceptOfferFormat": {
        "dataType": "refObject",
        "properties": {
            "linkSecretId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormats.acceptOffer_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"indy":{"ref":"AnonCredsAcceptOfferFormat"},"jsonld":{"ref":"EmptyObject"},"anoncreds":{"ref":"AnonCredsAcceptOfferFormat"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialOfferOptions": {
        "dataType": "refObject",
        "properties": {
            "credentialRecordId": {"ref":"RecordId","required":true},
            "credentialFormats": {"ref":"CredentialFormatPayload_CredentialFormats.acceptOffer_"},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AnonCredsAcceptRequestFormat": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.never_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonLdAcceptRequestFormat": {
        "dataType": "refObject",
        "properties": {
            "verificationMethod": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormats.acceptRequest_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"indy":{"ref":"AnonCredsAcceptRequestFormat"},"jsonld":{"ref":"JsonLdAcceptRequestFormat"},"anoncreds":{"ref":"AnonCredsAcceptRequestFormat"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptCredentialRequestOptions": {
        "dataType": "refObject",
        "properties": {
            "credentialRecordId": {"ref":"RecordId","required":true},
            "credentialFormats": {"ref":"CredentialFormatPayload_CredentialFormats.acceptRequest_"},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptCredential": {
        "dataType": "refObject",
        "properties": {
            "credentialRecordId": {"ref":"RecordId","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidExchangeState": {
        "dataType": "refEnum",
        "enums": ["start","invitation-sent","invitation-received","request-sent","request-received","response-sent","response-received","abandoned","completed"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BasicMessageRecord": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.unknown_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_content.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"content":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCreateResponse": {
        "dataType": "refObject",
        "properties": {
            "did": {"dataType":"string","required":true},
            "didDocument": {"dataType":"any","required":true},
            "keyRef": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDidKeyRequest": {
        "dataType": "refObject",
        "properties": {
            "keyType": {"dataType":"enum","enums":["Ed25519"]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDidJwkRequest": {
        "dataType": "refObject",
        "properties": {
            "keyType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["P-256"]},{"dataType":"enum","enums":["Ed25519"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PrepareDidWebRequest": {
        "dataType": "refObject",
        "properties": {
            "domain": {"dataType":"string","required":true},
            "keyMethod": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["jwk"]},{"dataType":"enum","enums":["key"]}]},
            "keyType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Ed25519"]},{"dataType":"enum","enums":["P-256"]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidResolutionMetadata": {
        "dataType": "refObject",
        "properties": {
            "contentType": {"dataType":"string"},
            "error": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["invalidDid"]},{"dataType":"enum","enums":["notFound"]},{"dataType":"enum","enums":["representationNotSupported"]},{"dataType":"enum","enums":["unsupportedDidMethod"]},{"dataType":"string"}]},
            "message": {"dataType":"string"},
            "servedFromCache": {"dataType":"boolean"},
            "servedFromDidRecord": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DIDDocumentMetadata": {
        "dataType": "refObject",
        "properties": {
            "created": {"dataType":"string"},
            "updated": {"dataType":"string"},
            "deactivated": {"dataType":"boolean"},
            "versionId": {"dataType":"string"},
            "nextUpdate": {"dataType":"string"},
            "nextVersionId": {"dataType":"string"},
            "equivalentId": {"dataType":"string"},
            "canonicalId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Did": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCreate": {
        "dataType": "refObject",
        "properties": {
            "keyType": {"ref":"KeyType"},
            "seed": {"dataType":"string"},
            "domain": {"dataType":"string"},
            "method": {"dataType":"string","required":true},
            "network": {"dataType":"string"},
            "did": {"dataType":"string"},
            "role": {"dataType":"string"},
            "endorserDid": {"dataType":"string"},
            "didDocument": {"ref":"DidDocument"},
            "privatekey": {"dataType":"string"},
            "endpoint": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidRecord": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.unknown_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateKeyDidResponse": {
        "dataType": "refObject",
        "properties": {
            "did": {"dataType":"string","required":true},
            "kid": {"dataType":"string","required":true},
            "publicKeyBase58": {"dataType":"string"},
            "didDocument": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SchemaId": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateSchemaInput": {
        "dataType": "refObject",
        "properties": {
            "issuerId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "attributes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "endorse": {"dataType":"boolean"},
            "endorserDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EndorserTransaction": {
        "dataType": "refObject",
        "properties": {
            "transaction": {"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"Record_string.unknown_"}],"required":true},
            "endorserDid": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidNymTransaction": {
        "dataType": "refObject",
        "properties": {
            "did": {"dataType":"string","required":true},
            "nymRequest": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WriteTransaction": {
        "dataType": "refObject",
        "properties": {
            "endorsedTransaction": {"dataType":"string","required":true},
            "endorserDid": {"dataType":"string"},
            "schema": {"dataType":"nestedObjectLiteral","nestedProperties":{"attributes":{"dataType":"array","array":{"dataType":"string"},"required":true},"version":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"issuerId":{"dataType":"string","required":true}}},
            "credentialDefinition": {"dataType":"nestedObjectLiteral","nestedProperties":{"type":{"dataType":"string","required":true},"value":{"dataType":"any","required":true},"tag":{"dataType":"string","required":true},"issuerId":{"dataType":"string","required":true},"schemaId":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialDefinitionId": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentInfo": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string","required":true},
            "endpoints": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "isInitialized": {"dataType":"boolean","required":true},
            "publicDid": {"dataType":"void","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentToken": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerifyDataOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"signature":{"dataType":"string","required":true},"publicKeyBase58":{"dataType":"string","required":true},"keyType":{"ref":"KeyType","required":true},"data":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cIssuer": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cCredentialSubject": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string"},
            "claims": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SingleOrArray_W3cCredentialSubject_": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"W3cCredentialSubject"},{"dataType":"array","array":{"dataType":"refObject","ref":"W3cCredentialSubject"}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cCredentialSchema": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SingleOrArray_W3cCredentialSchema_": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"W3cCredentialSchema"},{"dataType":"array","array":{"dataType":"refObject","ref":"W3cCredentialSchema"}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cCredentialStatus": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cCredential": {
        "dataType": "refObject",
        "properties": {
            "context": {"dataType":"array","array":{"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"JsonObject"}]},"required":true},
            "id": {"dataType":"string"},
            "type": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "issuer": {"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"W3cIssuer"}],"required":true},
            "issuanceDate": {"dataType":"string","required":true},
            "expirationDate": {"dataType":"string"},
            "credentialSubject": {"ref":"SingleOrArray_W3cCredentialSubject_","required":true},
            "credentialSchema": {"ref":"SingleOrArray_W3cCredentialSchema_"},
            "credentialStatus": {"ref":"W3cCredentialStatus"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_W3cJsonLdSignCredentialOptions.Exclude_keyofW3cJsonLdSignCredentialOptions.format__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"verificationMethod":{"dataType":"string","required":true},"proofType":{"dataType":"string","required":true},"proofPurpose":{"dataType":"any"},"created":{"dataType":"string"},"credential":{"ref":"W3cCredential","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_W3cJsonLdSignCredentialOptions.format_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_W3cJsonLdSignCredentialOptions.Exclude_keyofW3cJsonLdSignCredentialOptions.format__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomW3cJsonLdSignCredentialOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"intersection","subSchemas":[{"ref":"Omit_W3cJsonLdSignCredentialOptions.format_"},{"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SignDataOptions": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"method":{"dataType":"string"},"did":{"dataType":"string"},"publicKeyBase58":{"dataType":"string","required":true},"keyType":{"ref":"KeyType","required":true},"data":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Partial_W3cCredentialValidations_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Error": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "stack": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cVerifyResult_W3cCredentialValidations_": {
        "dataType": "refObject",
        "properties": {
            "isValid": {"dataType":"boolean","required":true},
            "validations": {"ref":"Partial_W3cCredentialValidations_","required":true},
            "error": {"ref":"Error"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cVerifyCredentialResult": {
        "dataType": "refAlias",
        "type": {"ref":"W3cVerifyResult_W3cCredentialValidations_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_LinkedDataProofOptions.Exclude_keyofLinkedDataProofOptions.cryptosuite__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"domain":{"dataType":"string"},"verificationMethod":{"dataType":"string","required":true},"proofPurpose":{"dataType":"string","required":true},"created":{"dataType":"string","required":true},"type":{"dataType":"string","required":true},"challenge":{"dataType":"string"},"jws":{"dataType":"string"},"proofValue":{"dataType":"string"},"nonce":{"dataType":"string"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_LinkedDataProofOptions.cryptosuite_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_LinkedDataProofOptions.Exclude_keyofLinkedDataProofOptions.cryptosuite__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DataIntegrityProofOptions": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"string","required":true},
            "cryptosuite": {"dataType":"string","required":true},
            "verificationMethod": {"dataType":"string","required":true},
            "proofPurpose": {"dataType":"string","required":true},
            "domain": {"dataType":"string"},
            "challenge": {"dataType":"string"},
            "nonce": {"dataType":"string"},
            "created": {"dataType":"string"},
            "expires": {"dataType":"string"},
            "proofValue": {"dataType":"string"},
            "previousProof": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SingleOrArray_Omit_LinkedDataProofOptions.cryptosuite_-or-DataIntegrityProofOptions_": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"union","subSchemas":[{"ref":"Omit_LinkedDataProofOptions.cryptosuite_"},{"ref":"DataIntegrityProofOptions"}]},{"dataType":"array","array":{"dataType":"union","subSchemas":[{"ref":"Omit_LinkedDataProofOptions.cryptosuite_"},{"ref":"DataIntegrityProofOptions"}]}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LinkedDataProof": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"string","required":true},
            "proofPurpose": {"dataType":"string","required":true},
            "verificationMethod": {"dataType":"string","required":true},
            "created": {"dataType":"string","required":true},
            "domain": {"dataType":"string"},
            "challenge": {"dataType":"string"},
            "jws": {"dataType":"string"},
            "proofValue": {"dataType":"string"},
            "nonce": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DataIntegrityProof": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"string","required":true},
            "cryptosuite": {"dataType":"string","required":true},
            "proofPurpose": {"dataType":"string","required":true},
            "verificationMethod": {"dataType":"string","required":true},
            "domain": {"dataType":"string"},
            "challenge": {"dataType":"string"},
            "nonce": {"dataType":"string"},
            "created": {"dataType":"string"},
            "expires": {"dataType":"string"},
            "proofValue": {"dataType":"string"},
            "previousProof": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SingleOrArray_LinkedDataProof-or-DataIntegrityProof_": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"union","subSchemas":[{"ref":"LinkedDataProof"},{"ref":"DataIntegrityProof"}]},{"dataType":"array","array":{"dataType":"union","subSchemas":[{"ref":"LinkedDataProof"},{"ref":"DataIntegrityProof"}]}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "W3cJsonLdVerifiableCredential": {
        "dataType": "refObject",
        "properties": {
            "context": {"dataType":"array","array":{"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"JsonObject"}]},"required":true},
            "id": {"dataType":"string"},
            "type": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "issuer": {"dataType":"union","subSchemas":[{"dataType":"string"},{"ref":"W3cIssuer"}],"required":true},
            "issuanceDate": {"dataType":"string","required":true},
            "expirationDate": {"dataType":"string"},
            "credentialSubject": {"ref":"SingleOrArray_W3cCredentialSubject_","required":true},
            "credentialSchema": {"ref":"SingleOrArray_W3cCredentialSchema_"},
            "credentialStatus": {"ref":"W3cCredentialStatus"},
            "proof": {"ref":"SingleOrArray_LinkedDataProof-or-DataIntegrityProof_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProofPurpose": {
        "dataType": "refAlias",
        "type": {"dataType":"any","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SafeW3cJsonLdVerifyCredentialOptions": {
        "dataType": "refObject",
        "properties": {
            "credential": {"ref":"W3cJsonLdVerifiableCredential","required":true},
            "verifyCredentialStatus": {"dataType":"boolean"},
            "proofPurpose": {"ref":"ProofPurpose"},
            "proof": {"ref":"SingleOrArray_Omit_LinkedDataProofOptions.cryptosuite_-or-DataIntegrityProofOptions_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegisterRequest": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "email": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
            "tenantType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["USER"]},{"dataType":"enum","enums":["ORG"]}]},
            "domain": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginRequest": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string"},
            "email": {"dataType":"string"},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SessionResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "username": {"dataType":"string","required":true},
            "email": {"dataType":"string","required":true},
            "walletId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginChallengeResponse": {
        "dataType": "refObject",
        "properties": {
            "nonce": {"dataType":"string","required":true},
            "expiresAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginVerifyRequest": {
        "dataType": "refObject",
        "properties": {
            "did": {"dataType":"string","required":true},
            "signature": {"dataType":"string","required":true},
            "nonce": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WalletListingItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "createdOn": {"dataType":"string","required":true},
            "addedOn": {"dataType":"string","required":true},
            "permission": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WalletListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "account": {"dataType":"string","required":true},
            "wallets": {"dataType":"array","array":{"dataType":"refObject","ref":"WalletListingItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateCredentialOfferResponse": {
        "dataType": "refObject",
        "properties": {
            "offerId": {"dataType":"string","required":true},
            "credential_offer_url": {"dataType":"string","required":true},
            "credential_offer_uri": {"dataType":"string","required":true},
            "preAuthorizedCode": {"dataType":"string","required":true},
            "expiresAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferCredentialTemplate": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "schemaId": {"dataType":"string"},
            "claimsTemplate": {"dataType":"any"},
            "format": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["jwt_vc"]},{"dataType":"enum","enums":["sd_jwt"]},{"dataType":"enum","enums":["jwt_vc_json"]},{"dataType":"enum","enums":["jwt_vc_json-ld"]}]},
            "credentialDefinitionId": {"dataType":"string"},
            "issuerDid": {"dataType":"string"},
            "claims": {"ref":"Record_string.any_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateCredentialOfferRequest": {
        "dataType": "refObject",
        "properties": {
            "credentials": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferCredentialTemplate"},"required":true},
            "issuerDid": {"dataType":"string"},
            "expiresIn": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EcoCashWebhookPayload": {
        "dataType": "refObject",
        "properties": {
            "paymentRequestId": {"dataType":"string"},
            "status": {"dataType":"string","required":true},
            "transactionId": {"dataType":"string"},
            "amount": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "sourceReference": {"dataType":"string"},
            "metadata": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PendingOffer": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "issuerName": {"dataType":"string","required":true},
            "credentialType": {"dataType":"string","required":true},
            "offerUri": {"dataType":"string","required":true},
            "claims": {"ref":"Record_string.any_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartSnapshotRequest": {
        "dataType": "refObject",
        "properties": {
            "cartId": {"dataType":"string","required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"CartItem"},"required":true},
            "totalAmount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "merchantDid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InvoiceRequest": {
        "dataType": "refObject",
        "properties": {
            "cartRef": {"dataType":"string","required":true},
            "amount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "dueDate": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CatalogItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "merchantId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "images": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "price": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "sku": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateCatalogItemRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "images": {"dataType":"array","array":{"dataType":"string"}},
            "price": {"dataType":"double","required":true},
            "currency": {"dataType":"string"},
            "sku": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WaCartItem": {
        "dataType": "refObject",
        "properties": {
            "itemId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Cart": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "merchantId": {"dataType":"string","required":true},
            "buyerPhone": {"dataType":"string"},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"WaCartItem"},"required":true},
            "total": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["quoted"]},{"dataType":"enum","enums":["invoiced"]},{"dataType":"enum","enums":["paid"]},{"dataType":"enum","enums":["cancelled"]}],"required":true},
            "createdAt": {"dataType":"string","required":true},
            "quoteOfferUrl": {"dataType":"string"},
            "invoiceOfferUrl": {"dataType":"string"},
            "receiptOfferUrl": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateCartRequest": {
        "dataType": "refObject",
        "properties": {
            "payload": {"dataType":"string","required":true},
            "buyerPhone": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutResponse": {
        "dataType": "refObject",
        "properties": {
            "cartId": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "quoteOfferUrl": {"dataType":"string"},
            "invoiceOfferUrl": {"dataType":"string"},
            "ecocashRef": {"dataType":"string"},
            "paymentInstructions": {"dataType":"string"},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TrustDriver": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "weight": {"dataType":"double","required":true},
            "value": {"dataType":"double","required":true},
            "sourceVcId": {"dataType":"string"},
            "evidence": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TrustScore": {
        "dataType": "refObject",
        "properties": {
            "merchantId": {"dataType":"string","required":true},
            "score": {"dataType":"double","required":true},
            "drivers": {"dataType":"array","array":{"dataType":"refObject","ref":"TrustDriver"},"required":true},
            "lastComputed": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TrustEvent": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "merchantId": {"dataType":"string","required":true},
            "eventType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["payment"]},{"dataType":"enum","enums":["dispute"]},{"dataType":"enum","enums":["refund"]},{"dataType":"enum","enums":["kyc_attestation"]},{"dataType":"enum","enums":["review"]},{"dataType":"enum","enums":["delivery"]}],"required":true},
            "eventData": {"dataType":"any"},
            "impact": {"dataType":"double","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecordEventRequest": {
        "dataType": "refObject",
        "properties": {
            "eventType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["payment"]},{"dataType":"enum","enums":["dispute"]},{"dataType":"enum","enums":["refund"]},{"dataType":"enum","enums":["kyc_attestation"]},{"dataType":"enum","enums":["review"]},{"dataType":"enum","enums":["delivery"]}],"required":true},
            "eventData": {"dataType":"any"},
            "impact": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerificationResult": {
        "dataType": "refObject",
        "properties": {
            "vcId": {"dataType":"string","required":true},
            "vcType": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["valid"]},{"dataType":"enum","enums":["invalid"]},{"dataType":"enum","enums":["revoked"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["not_found"]}],"required":true},
            "issuer": {"dataType":"string"},
            "issuanceDate": {"dataType":"string"},
            "expirationDate": {"dataType":"string"},
            "subject": {"dataType":"any"},
            "verifiedAt": {"dataType":"string","required":true},
            "signature": {"dataType":"nestedObjectLiteral","nestedProperties":{"verified":{"dataType":"boolean","required":true},"algorithm":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerificationLog": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "vcId": {"dataType":"string","required":true},
            "vcType": {"dataType":"string"},
            "verificationResult": {"dataType":"string","required":true},
            "verifierInfo": {"dataType":"any"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Escalation": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "merchantId": {"dataType":"string","required":true},
            "receiptId": {"dataType":"string"},
            "reason": {"dataType":"string","required":true},
            "severity": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["low"]},{"dataType":"enum","enums":["medium"]},{"dataType":"enum","enums":["high"]},{"dataType":"enum","enums":["critical"]}],"required":true},
            "packageUrl": {"dataType":"string"},
            "regulatorActionStatus": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["under_review"]},{"dataType":"enum","enums":["resolved"]},{"dataType":"enum","enums":["dismissed"]}],"required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateEscalationRequest": {
        "dataType": "refObject",
        "properties": {
            "merchantId": {"dataType":"string","required":true},
            "receiptId": {"dataType":"string"},
            "reason": {"dataType":"string","required":true},
            "severity": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["low"]},{"dataType":"enum","enums":["medium"]},{"dataType":"enum","enums":["high"]},{"dataType":"enum","enums":["critical"]}]},
            "evidence": {"dataType":"nestedObjectLiteral","nestedProperties":{"refundRate":{"dataType":"double"},"disputeCount":{"dataType":"double"},"transactionIds":{"dataType":"array","array":{"dataType":"string"}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EscalationPackage": {
        "dataType": "refObject",
        "properties": {
            "escalationId": {"dataType":"string","required":true},
            "merchantId": {"dataType":"string","required":true},
            "generatedAt": {"dataType":"string","required":true},
            "summary": {"dataType":"nestedObjectLiteral","nestedProperties":{"disputeRate":{"dataType":"double","required":true},"totalTransactions":{"dataType":"double","required":true},"trustScore":{"dataType":"double","required":true},"severity":{"dataType":"string","required":true},"reason":{"dataType":"string","required":true}},"required":true},
            "evidence": {"dataType":"nestedObjectLiteral","nestedProperties":{"recentEvents":{"dataType":"array","array":{"dataType":"any"},"required":true},"trustScoreBreakdown":{"dataType":"any","required":true}},"required":true},
            "signature": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WhatsAppWebhookPayload": {
        "dataType": "refObject",
        "properties": {
            "object": {"dataType":"string","required":true},
            "entry": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"changes":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"field":{"dataType":"string","required":true},"value":{"dataType":"nestedObjectLiteral","nestedProperties":{"messages":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"interactive":{"dataType":"nestedObjectLiteral","nestedProperties":{"button_reply":{"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"type":{"dataType":"string","required":true}}},"text":{"dataType":"nestedObjectLiteral","nestedProperties":{"body":{"dataType":"string","required":true}}},"type":{"dataType":"string","required":true},"timestamp":{"dataType":"string","required":true},"id":{"dataType":"string","required":true},"from":{"dataType":"string","required":true}}}},"contacts":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"wa_id":{"dataType":"string","required":true},"profile":{"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string","required":true}},"required":true}}}},"metadata":{"dataType":"nestedObjectLiteral","nestedProperties":{"phone_number_id":{"dataType":"string","required":true},"display_phone_number":{"dataType":"string","required":true}},"required":true},"messaging_product":{"dataType":"string","required":true}},"required":true}}},"required":true},"id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Employee": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "did": {"dataType":"string"},
            "firstName": {"dataType":"string","required":true},
            "lastName": {"dataType":"string","required":true},
            "email": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "baseSalary": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "nssaNumber": {"dataType":"string"},
            "tin": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["terminated"]},{"dataType":"enum","enums":["on_leave"]}],"required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateEmployeeRequest": {
        "dataType": "refObject",
        "properties": {
            "firstName": {"dataType":"string","required":true},
            "lastName": {"dataType":"string","required":true},
            "email": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "baseSalary": {"dataType":"double","required":true},
            "currency": {"dataType":"string"},
            "nssaNumber": {"dataType":"string"},
            "tin": {"dataType":"string"},
            "did": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PayrollRun": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "period": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["draft"]},{"dataType":"enum","enums":["processing"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["paid"]}],"required":true},
            "totalGross": {"dataType":"double","required":true},
            "totalNet": {"dataType":"double","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateRunRequest": {
        "dataType": "refObject",
        "properties": {
            "period": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Payslip": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "runId": {"dataType":"string","required":true},
            "employeeId": {"dataType":"string","required":true},
            "period": {"dataType":"string","required":true},
            "grossAmount": {"dataType":"double","required":true},
            "deductions": {"dataType":"nestedObjectLiteral","nestedProperties":{"other":{"dataType":"double","required":true},"aids_levy":{"dataType":"double","required":true},"paye":{"dataType":"double","required":true},"nssa":{"dataType":"double","required":true}},"required":true},
            "netAmount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "payslipVcId": {"dataType":"string"},
            "status": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OnboardingData": {
        "dataType": "refObject",
        "properties": {
            "personalInfo": {"dataType":"nestedObjectLiteral","nestedProperties":{"nokPhone":{"dataType":"string"},"nokName":{"dataType":"string"},"address":{"dataType":"string"},"dob":{"dataType":"string"}}},
            "bankDetails": {"dataType":"nestedObjectLiteral","nestedProperties":{"payoutMethod":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["bank"]},{"dataType":"enum","enums":["ecocash"]}]},"ecocashNumber":{"dataType":"string"},"account":{"dataType":"string"},"bankName":{"dataType":"string"}}},
            "documents": {"dataType":"nestedObjectLiteral","nestedProperties":{"passport":{"dataType":"string"},"idFront":{"dataType":"string"}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OnboardingRequest": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "candidateEmail": {"dataType":"string","required":true},
            "candidatePhone": {"dataType":"string"},
            "fullName": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["draft"]},{"dataType":"enum","enums":["invited"]},{"dataType":"enum","enums":["in_progress"]},{"dataType":"enum","enums":["review"]},{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["rejected"]},{"dataType":"enum","enums":["completed"]}],"required":true},
            "currentStep": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["init"]},{"dataType":"enum","enums":["personal_details"]},{"dataType":"enum","enums":["documents"]},{"dataType":"enum","enums":["contract"]},{"dataType":"enum","enums":["complete"]}],"required":true},
            "accessToken": {"dataType":"string","required":true},
            "employeeId": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
            "data": {"ref":"OnboardingData"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InitOnboardingPayload": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
            "fullName": {"dataType":"string","required":true},
            "phone": {"dataType":"string"},
            "tenantId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Partial_OnboardingData_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"personalInfo":{"dataType":"nestedObjectLiteral","nestedProperties":{"nokPhone":{"dataType":"string"},"nokName":{"dataType":"string"},"address":{"dataType":"string"},"dob":{"dataType":"string"}}},"bankDetails":{"dataType":"nestedObjectLiteral","nestedProperties":{"payoutMethod":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["bank"]},{"dataType":"enum","enums":["ecocash"]}]},"ecocashNumber":{"dataType":"string"},"account":{"dataType":"string"},"bankName":{"dataType":"string"}}},"documents":{"dataType":"nestedObjectLiteral","nestedProperties":{"passport":{"dataType":"string"},"idFront":{"dataType":"string"}}}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOnboardingPayload": {
        "dataType": "refObject",
        "properties": {
            "step": {"dataType":"string","required":true},
            "data": {"ref":"Partial_OnboardingData_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateStatusListPayload": {
        "dataType": "refObject",
        "properties": {
            "size": {"dataType":"double"},
            "tenantId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateStatusPayload": {
        "dataType": "refObject",
        "properties": {
            "listData": {"dataType":"string","required":true},
            "index": {"dataType":"double","required":true},
            "revoked": {"dataType":"boolean","required":true},
            "tenantId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LeaveRequest": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "employeeId": {"dataType":"string","required":true},
            "leaveType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["annual"]},{"dataType":"enum","enums":["sick"]},{"dataType":"enum","enums":["unpaid"]},{"dataType":"enum","enums":["maternity"]},{"dataType":"enum","enums":["study"]}],"required":true},
            "startDate": {"dataType":"string","required":true},
            "endDate": {"dataType":"string","required":true},
            "daysCount": {"dataType":"double","required":true},
            "reason": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["rejected"]}],"required":true},
            "approverId": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateLeaveRequestPayload": {
        "dataType": "refObject",
        "properties": {
            "employeeId": {"dataType":"string","required":true},
            "leaveType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["annual"]},{"dataType":"enum","enums":["sick"]},{"dataType":"enum","enums":["unpaid"]},{"dataType":"enum","enums":["maternity"]},{"dataType":"enum","enums":["study"]}],"required":true},
            "startDate": {"dataType":"string","required":true},
            "endDate": {"dataType":"string","required":true},
            "daysCount": {"dataType":"double","required":true},
            "reason": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOperationsStatusPayload": {
        "dataType": "refObject",
        "properties": {
            "adminDid": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["rejected"]},{"dataType":"enum","enums":["paid"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ExpenseClaim": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "employeeId": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "amount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "category": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["travel"]},{"dataType":"enum","enums":["meals"]},{"dataType":"enum","enums":["equipment"]},{"dataType":"enum","enums":["other"]}],"required":true},
            "receiptUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["paid"]},{"dataType":"enum","enums":["rejected"]}],"required":true},
            "approvedBy": {"dataType":"string"},
            "paidAt": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateExpenseClaimPayload": {
        "dataType": "refObject",
        "properties": {
            "employeeId": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "amount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "category": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["travel"]},{"dataType":"enum","enums":["meals"]},{"dataType":"enum","enums":["equipment"]},{"dataType":"enum","enums":["other"]}],"required":true},
            "receiptUrl": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IncomeStatement": {
        "dataType": "refObject",
        "properties": {
            "periodStart": {"dataType":"string","required":true},
            "periodEnd": {"dataType":"string","required":true},
            "revenue": {"dataType":"double","required":true},
            "expenses": {"dataType":"double","required":true},
            "netIncome": {"dataType":"double","required":true},
            "breakdown": {"dataType":"nestedObjectLiteral","nestedProperties":{"operations":{"dataType":"double","required":true},"payroll":{"dataType":"double","required":true},"sales":{"dataType":"double","required":true}},"required":true},
            "currency": {"dataType":"string","required":true},
            "generatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StatementOfferResponse": {
        "dataType": "refObject",
        "properties": {
            "uri": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateStatementOfferRequest": {
        "dataType": "refObject",
        "properties": {
            "startDate": {"dataType":"string","required":true},
            "endDate": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InventoryLocation": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["warehouse"]},{"dataType":"enum","enums":["shop"]},{"dataType":"enum","enums":["transit"]},{"dataType":"enum","enums":["virtual"]}],"required":true},
            "address": {"dataType":"string"},
            "did": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["inactive"]}],"required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateLocationRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["warehouse"]},{"dataType":"enum","enums":["shop"]},{"dataType":"enum","enums":["transit"]},{"dataType":"enum","enums":["virtual"]}]},
            "address": {"dataType":"string"},
            "did": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InventoryLot": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "catalogItemId": {"dataType":"string","required":true},
            "locationId": {"dataType":"string","required":true},
            "lotNumber": {"dataType":"string"},
            "serialNumber": {"dataType":"string"},
            "barcode": {"dataType":"string"},
            "quantityInitial": {"dataType":"double","required":true},
            "quantityOnHand": {"dataType":"double","required":true},
            "quantityReserved": {"dataType":"double","required":true},
            "quantityAvailable": {"dataType":"double","required":true},
            "unitCost": {"dataType":"double"},
            "currency": {"dataType":"string","required":true},
            "expiryDate": {"dataType":"string"},
            "receivedAt": {"dataType":"string"},
            "supplierId": {"dataType":"string"},
            "supplierInvoiceRef": {"dataType":"string"},
            "grnVcId": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["depleted"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["quarantine"]}],"required":true},
            "metadata": {"ref":"Record_string.any_"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InventoryEventType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["RECEIVE"]},{"dataType":"enum","enums":["TRANSFER_OUT"]},{"dataType":"enum","enums":["TRANSFER_IN"]},{"dataType":"enum","enums":["RESERVE"]},{"dataType":"enum","enums":["UNRESERVE"]},{"dataType":"enum","enums":["SELL"]},{"dataType":"enum","enums":["ADJUST"]},{"dataType":"enum","enums":["RETURN"]},{"dataType":"enum","enums":["WRITE_OFF"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InventoryEvent": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "eventType": {"ref":"InventoryEventType","required":true},
            "catalogItemId": {"dataType":"string","required":true},
            "lotId": {"dataType":"string"},
            "locationId": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "unitCost": {"dataType":"double"},
            "currency": {"dataType":"string","required":true},
            "referenceType": {"dataType":"string"},
            "referenceId": {"dataType":"string"},
            "counterpartyId": {"dataType":"string"},
            "eventHash": {"dataType":"string","required":true},
            "prevEventHash": {"dataType":"string"},
            "sequenceNumber": {"dataType":"double","required":true},
            "vcId": {"dataType":"string"},
            "vcType": {"dataType":"string"},
            "actorId": {"dataType":"string"},
            "reason": {"dataType":"string"},
            "metadata": {"ref":"Record_string.any_"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReceiveGoodsBody": {
        "dataType": "refObject",
        "properties": {
            "catalogItemId": {"dataType":"string","required":true},
            "locationId": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "unitCost": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "lotNumber": {"dataType":"string"},
            "serialNumber": {"dataType":"string"},
            "barcode": {"dataType":"string"},
            "expiryDate": {"dataType":"string"},
            "supplierId": {"dataType":"string"},
            "supplierInvoiceRef": {"dataType":"string"},
            "issueVC": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReserveStockBody": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"preferredLotId":{"dataType":"string"},"quantity":{"dataType":"double","required":true},"locationId":{"dataType":"string","required":true},"catalogItemId":{"dataType":"string","required":true}}},"required":true},
            "cartId": {"dataType":"string","required":true},
            "expiresInMs": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StockLevel": {
        "dataType": "refObject",
        "properties": {
            "catalogItemId": {"dataType":"string","required":true},
            "locationId": {"dataType":"string","required":true},
            "quantityOnHand": {"dataType":"double","required":true},
            "quantityReserved": {"dataType":"double","required":true},
            "quantityAvailable": {"dataType":"double","required":true},
            "totalCost": {"dataType":"double","required":true},
            "avgUnitCost": {"dataType":"double"},
            "lastEventHash": {"dataType":"string"},
            "lastEventAt": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ScanBarcodeResponse": {
        "dataType": "refObject",
        "properties": {
            "catalogItem": {"dataType":"any"},
            "lots": {"dataType":"array","array":{"dataType":"refObject","ref":"InventoryLot"},"required":true},
            "stockLevel": {"ref":"StockLevel"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerifyChainResponse": {
        "dataType": "refObject",
        "properties": {
            "valid": {"dataType":"boolean","required":true},
            "errors": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "eventCount": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TraceReceiptResponse": {
        "dataType": "refObject",
        "properties": {
            "receiptId": {"dataType":"string","required":true},
            "events": {"dataType":"array","array":{"dataType":"refObject","ref":"InventoryEvent"},"required":true},
            "fulfillments": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"grnVcId":{"dataType":"string"},"eventHash":{"dataType":"string","required":true},"quantity":{"dataType":"double","required":true},"serialNumber":{"dataType":"string"},"lotNumber":{"dataType":"string"},"lotId":{"dataType":"string","required":true}}},"required":true},
            "chainValid": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HealthResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["healthy"]},{"dataType":"enum","enums":["degraded"]},{"dataType":"enum","enums":["unhealthy"]}],"required":true},
            "checks": {"dataType":"nestedObjectLiteral","nestedProperties":{"memory":{"dataType":"boolean","required":true},"agent":{"dataType":"boolean","required":true},"database":{"dataType":"boolean","required":true}},"required":true},
            "details": {"ref":"Record_string.any_","required":true},
            "timestamp": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MetricsResponse": {
        "dataType": "refObject",
        "properties": {
            "system": {"dataType":"nestedObjectLiteral","nestedProperties":{"memory":{"dataType":"nestedObjectLiteral","nestedProperties":{"rss":{"dataType":"double","required":true},"heapTotal":{"dataType":"double","required":true},"heapUsed":{"dataType":"double","required":true}},"required":true},"uptime":{"dataType":"double","required":true}},"required":true},
            "database": {"dataType":"nestedObjectLiteral","nestedProperties":{"tableStats":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"rowCount":{"dataType":"double","required":true},"name":{"dataType":"string","required":true}}},"required":true},"totalSize":{"dataType":"double","required":true}},"required":true},
            "business": {"dataType":"nestedObjectLiteral","nestedProperties":{"tenants":{"dataType":"nestedObjectLiteral","nestedProperties":{"active":{"dataType":"double","required":true},"total":{"dataType":"double","required":true}},"required":true},"inventory":{"dataType":"nestedObjectLiteral","nestedProperties":{"stockouts":{"dataType":"double","required":true},"totalEvents":{"dataType":"double","required":true}},"required":true},"wallets":{"dataType":"nestedObjectLiteral","nestedProperties":{"totalRegistered":{"dataType":"double","required":true}},"required":true},"credentials":{"dataType":"nestedObjectLiteral","nestedProperties":{"last24h":{"dataType":"double","required":true},"totalIssued":{"dataType":"double","required":true}},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentRecord": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "cartId": {"dataType":"string","required":true},
            "paymentRequestToken": {"dataType":"string","required":true},
            "providerRef": {"dataType":"string","required":true},
            "payerPhone": {"dataType":"string","required":true},
            "amount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "state": {"dataType":"string","required":true},
            "idempotencyKey": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
            "updatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReceiptRecord": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "paymentId": {"dataType":"string","required":true},
            "credentialOfferUrl": {"dataType":"string","required":true},
            "credentialType": {"dataType":"string","required":true},
            "issuedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentLookupResult": {
        "dataType": "refObject",
        "properties": {
            "found": {"dataType":"boolean","required":true},
            "payment": {"ref":"PaymentRecord"},
            "receipt": {"ref":"ReceiptRecord"},
            "error": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReceiptVerificationResult": {
        "dataType": "refObject",
        "properties": {
            "verified": {"dataType":"boolean","required":true},
            "receipt": {"dataType":"nestedObjectLiteral","nestedProperties":{"timestamp":{"dataType":"string","required":true},"paymentMethod":{"dataType":"string","required":true},"items":{"dataType":"array","array":{"dataType":"any"},"required":true},"cartId":{"dataType":"string","required":true},"merchantId":{"dataType":"string","required":true},"payerPhone":{"dataType":"string","required":true},"currency":{"dataType":"string","required":true},"amount":{"dataType":"double","required":true},"transactionId":{"dataType":"string","required":true},"receiptId":{"dataType":"string","required":true}}},
            "error": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
        const argsSchemaRegistryController_registerSchema: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"RegisterSchemaRequestBody"},
        };
        app.post('/oidc/schemas',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(SchemaRegistryController)),
            ...(fetchMiddlewares<RequestHandler>(SchemaRegistryController.prototype.registerSchema)),

            async function SchemaRegistryController_registerSchema(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSchemaRegistryController_registerSchema, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SchemaRegistryController>(SchemaRegistryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'registerSchema',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSchemaRegistryController_listSchemas: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/oidc/schemas',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(SchemaRegistryController)),
            ...(fetchMiddlewares<RequestHandler>(SchemaRegistryController.prototype.listSchemas)),

            async function SchemaRegistryController_listSchemas(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSchemaRegistryController_listSchemas, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SchemaRegistryController>(SchemaRegistryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listSchemas',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSchemaRegistryController_getSchema: Record<string, TsoaRoute.ParameterSchema> = {
                schemaId: {"in":"path","name":"schemaId","required":true,"dataType":"string"},
        };
        app.get('/oidc/schemas/:schemaId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(SchemaRegistryController)),
            ...(fetchMiddlewares<RequestHandler>(SchemaRegistryController.prototype.getSchema)),

            async function SchemaRegistryController_getSchema(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSchemaRegistryController_getSchema, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SchemaRegistryController>(SchemaRegistryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSchema',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPolygon_createKeyPair: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.post('/polygon/create-keys',
            authenticateMiddleware([{"jwt":["tenant","dedicated","Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(Polygon)),
            ...(fetchMiddlewares<RequestHandler>(Polygon.prototype.createKeyPair)),

            async function Polygon_createKeyPair(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPolygon_createKeyPair, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<Polygon>(Polygon);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createKeyPair',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPolygon_createSchema: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                createSchemaRequest: {"in":"body","name":"createSchemaRequest","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"schema":{"ref":"Record_string.unknown_","required":true},"schemaName":{"dataType":"string","required":true},"did":{"dataType":"string","required":true}}},
        };
        app.post('/polygon/create-schema',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(Polygon)),
            ...(fetchMiddlewares<RequestHandler>(Polygon.prototype.createSchema)),

            async function Polygon_createSchema(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPolygon_createSchema, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<Polygon>(Polygon);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createSchema',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPolygon_estimateTransaction: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                estimateTransactionRequest: {"in":"body","name":"estimateTransactionRequest","required":true,"ref":"DidOperationOptions"},
        };
        app.post('/polygon/estimate-transaction',
            authenticateMiddleware([{"jwt":["tenant","dedicated","Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(Polygon)),
            ...(fetchMiddlewares<RequestHandler>(Polygon.prototype.estimateTransaction)),

            async function Polygon_estimateTransaction(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPolygon_estimateTransaction, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<Polygon>(Polygon);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'estimateTransaction',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPolygon_getSchemaById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                did: {"in":"path","name":"did","required":true,"dataType":"string"},
                schemaId: {"in":"path","name":"schemaId","required":true,"dataType":"string"},
        };
        app.get('/polygon/:did/:schemaId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(Polygon)),
            ...(fetchMiddlewares<RequestHandler>(Polygon.prototype.getSchemaById)),

            async function Polygon_getSchemaById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPolygon_getSchemaById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<Polygon>(Polygon);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSchemaById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcVerifierController_getSupportedFormats: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/oidc/verifier/formats',
            ...(fetchMiddlewares<RequestHandler>(OidcVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(OidcVerifierController.prototype.getSupportedFormats)),

            async function OidcVerifierController_getSupportedFormats(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcVerifierController_getSupportedFormats, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcVerifierController>(OidcVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSupportedFormats',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcVerifierController_createPresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreatePresentationRequestBody"},
        };
        app.post('/oidc/verifier/presentation-requests',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(OidcVerifierController.prototype.createPresentationRequest)),

            async function OidcVerifierController_createPresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcVerifierController_createPresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcVerifierController>(OidcVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createPresentationRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcVerifierController_verifyPresentation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"VerifyPresentationRequestBody"},
        };
        app.post('/oidc/verifier/verify',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(OidcVerifierController.prototype.verifyPresentation)),

            async function OidcVerifierController_verifyPresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcVerifierController_verifyPresentation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcVerifierController>(OidcVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyPresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcMetadataController_getPlatformIssuerMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/.well-known/openid-credential-issuer',
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController)),
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController.prototype.getPlatformIssuerMetadata)),

            async function OidcMetadataController_getPlatformIssuerMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcMetadataController_getPlatformIssuerMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcMetadataController>(OidcMetadataController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPlatformIssuerMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcMetadataController_getIssuerMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
        };
        app.get('/tenants/:tenantId/.well-known/openid-credential-issuer',
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController)),
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController.prototype.getIssuerMetadata)),

            async function OidcMetadataController_getIssuerMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcMetadataController_getIssuerMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcMetadataController>(OidcMetadataController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getIssuerMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcMetadataController_getVerifierMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
        };
        app.get('/tenants/:tenantId/.well-known/openid-verifier',
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController)),
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController.prototype.getVerifierMetadata)),

            async function OidcMetadataController_getVerifierMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcMetadataController_getVerifierMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcMetadataController>(OidcMetadataController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getVerifierMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcMetadataController_getIssuerDid: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
        };
        app.get('/tenants/:tenantId/issuer/did',
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController)),
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController.prototype.getIssuerDid)),

            async function OidcMetadataController_getIssuerDid(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcMetadataController_getIssuerDid, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcMetadataController>(OidcMetadataController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getIssuerDid',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOID4VCredentialDefinitionController_listCredentialDefinitions: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/oidc/credential-definitions',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OID4VCredentialDefinitionController)),
            ...(fetchMiddlewares<RequestHandler>(OID4VCredentialDefinitionController.prototype.listCredentialDefinitions)),

            async function OID4VCredentialDefinitionController_listCredentialDefinitions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOID4VCredentialDefinitionController_listCredentialDefinitions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OID4VCredentialDefinitionController>(OID4VCredentialDefinitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listCredentialDefinitions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOID4VCredentialDefinitionController_getCredentialDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/oidc/credential-definitions/:id',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OID4VCredentialDefinitionController)),
            ...(fetchMiddlewares<RequestHandler>(OID4VCredentialDefinitionController.prototype.getCredentialDefinition)),

            async function OID4VCredentialDefinitionController_getCredentialDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOID4VCredentialDefinitionController_getCredentialDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OID4VCredentialDefinitionController>(OID4VCredentialDefinitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOID4VCredentialDefinitionController_registerCredentialDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"RegisterCredentialDefinitionBody"},
        };
        app.post('/oidc/credential-definitions',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OID4VCredentialDefinitionController)),
            ...(fetchMiddlewares<RequestHandler>(OID4VCredentialDefinitionController.prototype.registerCredentialDefinition)),

            async function OID4VCredentialDefinitionController_registerCredentialDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOID4VCredentialDefinitionController_registerCredentialDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OID4VCredentialDefinitionController>(OID4VCredentialDefinitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'registerCredentialDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_listTenants: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/multi-tenancy',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.listTenants)),

            async function MultiTenancyController_listTenants(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_listTenants, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listTenants',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_createTenant: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                createTenantOptions: {"in":"body","name":"createTenantOptions","required":true,"ref":"CreateTenantOptions"},
        };
        app.post('/multi-tenancy/create-tenant',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.createTenant)),

            async function MultiTenancyController_createTenant(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_createTenant, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createTenant',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_getTenantToken: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
                notFoundError: {"in":"res","name":"404","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true}}},
                internalServerError: {"in":"res","name":"500","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}}},
        };
        app.post('/multi-tenancy/get-token/:tenantId',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.getTenantToken)),

            async function MultiTenancyController_getTenantToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_getTenantToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTenantToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_getTenantById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
                notFoundError: {"in":"res","name":"404","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true}}},
                internalServerError: {"in":"res","name":"500","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}}},
        };
        app.get('/multi-tenancy/:tenantId',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.getTenantById)),

            async function MultiTenancyController_getTenantById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_getTenantById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTenantById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_getTenantMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
                notFoundError: {"in":"res","name":"404","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true}}},
        };
        app.get('/multi-tenancy/:tenantId/metadata',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.getTenantMetadata)),

            async function MultiTenancyController_getTenantMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_getTenantMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTenantMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_getTenantIssuerMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
                notFoundError: {"in":"res","name":"404","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true}}},
        };
        app.get('/multi-tenancy/:tenantId/metadata/issuer',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.getTenantIssuerMetadata)),

            async function MultiTenancyController_getTenantIssuerMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_getTenantIssuerMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTenantIssuerMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_getTenantVerifierMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
                notFoundError: {"in":"res","name":"404","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true}}},
        };
        app.get('/multi-tenancy/:tenantId/metadata/verifier',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.getTenantVerifierMetadata)),

            async function MultiTenancyController_getTenantVerifierMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_getTenantVerifierMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTenantVerifierMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMultiTenancyController_deleteTenantById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                tenantId: {"in":"path","name":"tenantId","required":true,"dataType":"string"},
                notFoundError: {"in":"res","name":"404","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true}}},
                internalServerError: {"in":"res","name":"500","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}}},
        };
        app.delete('/multi-tenancy/:tenantId',
            authenticateMiddleware([{"jwt":["Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController)),
            ...(fetchMiddlewares<RequestHandler>(MultiTenancyController.prototype.deleteTenantById)),

            async function MultiTenancyController_deleteTenantById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMultiTenancyController_deleteTenantById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MultiTenancyController>(MultiTenancyController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteTenantById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsQuestionAnswerController_getQuestionAnswerRecords: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"query","name":"connectionId","dataType":"string"},
                role: {"in":"query","name":"role","ref":"QuestionAnswerRole"},
                state: {"in":"query","name":"state","ref":"QuestionAnswerState"},
                threadId: {"in":"query","name":"threadId","dataType":"string"},
        };
        app.get('/didcomm/question-answer',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController)),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController.prototype.getQuestionAnswerRecords)),

            async function QuestionAnswerController_getQuestionAnswerRecords(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsQuestionAnswerController_getQuestionAnswerRecords, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<QuestionAnswerController>(QuestionAnswerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getQuestionAnswerRecords',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsQuestionAnswerController_sendQuestion: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
                config: {"in":"body","name":"config","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"detail":{"dataType":"string"},"validResponses":{"dataType":"array","array":{"dataType":"refObject","ref":"ValidResponse"},"required":true},"question":{"dataType":"string","required":true}}},
        };
        app.post('/didcomm/question-answer/question/:connectionId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController)),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController.prototype.sendQuestion)),

            async function QuestionAnswerController_sendQuestion(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsQuestionAnswerController_sendQuestion, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<QuestionAnswerController>(QuestionAnswerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'sendQuestion',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsQuestionAnswerController_sendAnswer: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"RecordId"},
                body: {"in":"body","name":"body","required":true,"ref":"Record_response.string_"},
        };
        app.post('/didcomm/question-answer/answer/:id',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController)),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController.prototype.sendAnswer)),

            async function QuestionAnswerController_sendAnswer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsQuestionAnswerController_sendAnswer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<QuestionAnswerController>(QuestionAnswerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'sendAnswer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsQuestionAnswerController_getQuestionAnswerRecordById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"RecordId"},
        };
        app.get('/didcomm/question-answer/:id',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController)),
            ...(fetchMiddlewares<RequestHandler>(QuestionAnswerController.prototype.getQuestionAnswerRecordById)),

            async function QuestionAnswerController_getQuestionAnswerRecordById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsQuestionAnswerController_getQuestionAnswerRecordById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<QuestionAnswerController>(QuestionAnswerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getQuestionAnswerRecordById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_getAllProofs: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                threadId: {"in":"query","name":"threadId","dataType":"string"},
        };
        app.get('/didcomm/proofs',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.getAllProofs)),

            async function ProofController_getAllProofs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_getAllProofs, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAllProofs',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_getProofById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                proofRecordId: {"in":"path","name":"proofRecordId","required":true,"ref":"RecordId"},
        };
        app.get('/didcomm/proofs/:proofRecordId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.getProofById)),

            async function ProofController_getProofById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_getProofById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getProofById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_proposeProof: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestProofProposalOptions: {"in":"body","name":"requestProofProposalOptions","required":true,"ref":"RequestProofProposalOptions"},
        };
        app.post('/didcomm/proofs/propose-proof',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.proposeProof)),

            async function ProofController_proposeProof(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_proposeProof, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'proposeProof',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_acceptProposal: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                acceptProposal: {"in":"body","name":"acceptProposal","required":true,"ref":"AcceptProofProposal"},
        };
        app.post('/didcomm/proofs/:proofRecordId/accept-proposal',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.acceptProposal)),

            async function ProofController_acceptProposal(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_acceptProposal, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptProposal',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_requestProof: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestProofOptions: {"in":"body","name":"requestProofOptions","required":true,"ref":"RequestProofOptions"},
        };
        app.post('/didcomm/proofs/request-proof',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.requestProof)),

            async function ProofController_requestProof(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_requestProof, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'requestProof',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_createRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                createRequestOptions: {"in":"body","name":"createRequestOptions","required":true,"ref":"CreateProofRequestOobOptions"},
        };
        app.post('/didcomm/proofs/create-request-oob',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.createRequest)),

            async function ProofController_createRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_createRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_acceptRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                proofRecordId: {"in":"path","name":"proofRecordId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"comment":{"dataType":"string"},"filterByNonRevocationRequirements":{"dataType":"boolean"},"filterByPresentationPreview":{"dataType":"boolean"}}},
        };
        app.post('/didcomm/proofs/:proofRecordId/accept-request',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.acceptRequest)),

            async function ProofController_acceptRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_acceptRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_acceptPresentation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                proofRecordId: {"in":"path","name":"proofRecordId","required":true,"dataType":"string"},
        };
        app.post('/didcomm/proofs/:proofRecordId/accept-presentation',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.acceptPresentation)),

            async function ProofController_acceptPresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_acceptPresentation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptPresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProofController_proofFormData: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                proofRecordId: {"in":"path","name":"proofRecordId","required":true,"dataType":"string"},
        };
        app.get('/didcomm/proofs/:proofRecordId/form-data',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProofController)),
            ...(fetchMiddlewares<RequestHandler>(ProofController.prototype.proofFormData)),

            async function ProofController_proofFormData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProofController_proofFormData, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProofController>(ProofController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'proofFormData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_getAllOutOfBandRecords: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                invitationId: {"in":"query","name":"invitationId","ref":"RecordId"},
        };
        app.get('/didcomm/oob',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.getAllOutOfBandRecords)),

            async function OutOfBandController_getAllOutOfBandRecords(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_getAllOutOfBandRecords, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAllOutOfBandRecords',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_getOutOfBandRecordById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                outOfBandId: {"in":"path","name":"outOfBandId","required":true,"ref":"RecordId"},
        };
        app.get('/didcomm/oob/:outOfBandId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.getOutOfBandRecordById)),

            async function OutOfBandController_getOutOfBandRecordById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_getOutOfBandRecordById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOutOfBandRecordById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_createInvitation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                config: {"in":"body","name":"config","required":true,"dataType":"intersection","subSchemas":[{"ref":"CreateInvitationOptions"},{"ref":"RecipientKeyOption"}]},
        };
        app.post('/didcomm/oob/create-invitation',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.createInvitation)),

            async function OutOfBandController_createInvitation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_createInvitation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createInvitation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_createLegacyInvitation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                config: {"in":"body","name":"config","dataType":"intersection","subSchemas":[{"ref":"Omit_CreateLegacyInvitationConfig.routing_"},{"ref":"RecipientKeyOption"}]},
        };
        app.post('/didcomm/oob/create-legacy-invitation',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.createLegacyInvitation)),

            async function OutOfBandController_createLegacyInvitation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_createLegacyInvitation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createLegacyInvitation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_createLegacyConnectionlessInvitation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                config: {"in":"body","name":"config","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"domain":{"dataType":"string","required":true},"message":{"ref":"AgentMessageType","required":true},"recordId":{"dataType":"string","required":true}}},
        };
        app.post('/didcomm/oob/create-legacy-connectionless-invitation',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.createLegacyConnectionlessInvitation)),

            async function OutOfBandController_createLegacyConnectionlessInvitation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_createLegacyConnectionlessInvitation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createLegacyConnectionlessInvitation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_receiveInvitation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                invitationRequest: {"in":"body","name":"invitationRequest","required":true,"ref":"ReceiveInvitationProps"},
        };
        app.post('/didcomm/oob/receive-invitation',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.receiveInvitation)),

            async function OutOfBandController_receiveInvitation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_receiveInvitation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'receiveInvitation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_receiveInvitationFromUrl: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                invitationRequest: {"in":"body","name":"invitationRequest","required":true,"ref":"ReceiveInvitationByUrlProps"},
        };
        app.post('/didcomm/oob/receive-invitation-url',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.receiveInvitationFromUrl)),

            async function OutOfBandController_receiveInvitationFromUrl(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_receiveInvitationFromUrl, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'receiveInvitationFromUrl',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_acceptInvitation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                outOfBandId: {"in":"path","name":"outOfBandId","required":true,"ref":"RecordId"},
                acceptInvitationConfig: {"in":"body","name":"acceptInvitationConfig","required":true,"ref":"AcceptInvitationConfig"},
        };
        app.post('/didcomm/oob/:outOfBandId/accept-invitation',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.acceptInvitation)),

            async function OutOfBandController_acceptInvitation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_acceptInvitation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptInvitation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOutOfBandController_deleteOutOfBandRecord: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                outOfBandId: {"in":"path","name":"outOfBandId","required":true,"ref":"RecordId"},
        };
        app.delete('/didcomm/oob/:outOfBandId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController)),
            ...(fetchMiddlewares<RequestHandler>(OutOfBandController.prototype.deleteOutOfBandRecord)),

            async function OutOfBandController_deleteOutOfBandRecord(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOutOfBandController_deleteOutOfBandRecord, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OutOfBandController>(OutOfBandController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteOutOfBandRecord',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_getAllCredentials: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                threadId: {"in":"query","name":"threadId","ref":"ThreadId"},
                parentThreadId: {"in":"query","name":"parentThreadId","ref":"ThreadId"},
                connectionId: {"in":"query","name":"connectionId","ref":"RecordId"},
                state: {"in":"query","name":"state","ref":"CredentialState"},
                role: {"in":"query","name":"role","ref":"CredentialRole"},
        };
        app.get('/didcomm/credentials',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.getAllCredentials)),

            async function CredentialController_getAllCredentials(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_getAllCredentials, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAllCredentials',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_getAllW3c: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/didcomm/credentials/w3c',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.getAllW3c)),

            async function CredentialController_getAllW3c(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_getAllW3c, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAllW3c',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_getW3cById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/didcomm/credentials/w3c/:id',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.getW3cById)),

            async function CredentialController_getW3cById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_getW3cById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getW3cById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_getCredentialById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                credentialRecordId: {"in":"path","name":"credentialRecordId","required":true,"ref":"RecordId"},
        };
        app.get('/didcomm/credentials/:credentialRecordId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.getCredentialById)),

            async function CredentialController_getCredentialById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_getCredentialById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_proposeCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                proposeCredentialOptions: {"in":"body","name":"proposeCredentialOptions","required":true,"ref":"ProposeCredentialOptions"},
        };
        app.post('/didcomm/credentials/propose-credential',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.proposeCredential)),

            async function CredentialController_proposeCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_proposeCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'proposeCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_acceptProposal: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                acceptCredentialProposal: {"in":"body","name":"acceptCredentialProposal","required":true,"ref":"AcceptCredentialProposalOptions"},
        };
        app.post('/didcomm/credentials/accept-proposal',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.acceptProposal)),

            async function CredentialController_acceptProposal(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_acceptProposal, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptProposal',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_createOffer: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                createOfferOptions: {"in":"body","name":"createOfferOptions","required":true,"ref":"CreateOfferOptions"},
        };
        app.post('/didcomm/credentials/create-offer',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.createOffer)),

            async function CredentialController_createOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_createOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_createOfferOob: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                outOfBandOption: {"in":"body","name":"outOfBandOption","required":true,"ref":"CreateOfferOobOptions"},
        };
        app.post('/didcomm/credentials/create-offer-oob',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.createOfferOob)),

            async function CredentialController_createOfferOob(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_createOfferOob, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createOfferOob',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_acceptOffer: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                acceptCredentialOfferOptions: {"in":"body","name":"acceptCredentialOfferOptions","required":true,"ref":"CredentialOfferOptions"},
        };
        app.post('/didcomm/credentials/accept-offer',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.acceptOffer)),

            async function CredentialController_acceptOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_acceptOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_acceptRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                acceptCredentialRequestOptions: {"in":"body","name":"acceptCredentialRequestOptions","required":true,"ref":"AcceptCredentialRequestOptions"},
        };
        app.post('/didcomm/credentials/accept-request',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.acceptRequest)),

            async function CredentialController_acceptRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_acceptRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_acceptCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                acceptCredential: {"in":"body","name":"acceptCredential","required":true,"ref":"AcceptCredential"},
        };
        app.post('/didcomm/credentials/accept-credential',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.acceptCredential)),

            async function CredentialController_acceptCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_acceptCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialController_credentialFormData: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                credentialRecordId: {"in":"path","name":"credentialRecordId","required":true,"dataType":"string"},
        };
        app.get('/didcomm/credentials/:credentialRecordId/form-data',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialController.prototype.credentialFormData)),

            async function CredentialController_credentialFormData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialController_credentialFormData, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialController>(CredentialController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'credentialFormData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsConnectionController_getAllConnections: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                outOfBandId: {"in":"query","name":"outOfBandId","dataType":"string"},
                alias: {"in":"query","name":"alias","dataType":"string"},
                state: {"in":"query","name":"state","ref":"DidExchangeState"},
                myDid: {"in":"query","name":"myDid","dataType":"string"},
                theirDid: {"in":"query","name":"theirDid","dataType":"string"},
                theirLabel: {"in":"query","name":"theirLabel","dataType":"string"},
        };
        app.get('/didcomm/connections',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController)),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController.prototype.getAllConnections)),

            async function ConnectionController_getAllConnections(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsConnectionController_getAllConnections, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ConnectionController>(ConnectionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAllConnections',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsConnectionController_getConnectionById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
        };
        app.get('/didcomm/connections/:connectionId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController)),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController.prototype.getConnectionById)),

            async function ConnectionController_getConnectionById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsConnectionController_getConnectionById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ConnectionController>(ConnectionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getConnectionById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsConnectionController_deleteConnection: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
        };
        app.delete('/didcomm/connections/:connectionId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController)),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController.prototype.deleteConnection)),

            async function ConnectionController_deleteConnection(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsConnectionController_deleteConnection, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ConnectionController>(ConnectionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteConnection',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsConnectionController_acceptRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
        };
        app.post('/didcomm/connections/:connectionId/accept-request',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController)),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController.prototype.acceptRequest)),

            async function ConnectionController_acceptRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsConnectionController_acceptRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ConnectionController>(ConnectionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsConnectionController_acceptResponse: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
        };
        app.post('/didcomm/connections/:connectionId/accept-response',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController)),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController.prototype.acceptResponse)),

            async function ConnectionController_acceptResponse(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsConnectionController_acceptResponse, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ConnectionController>(ConnectionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptResponse',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsConnectionController_getInvitation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                invitationId: {"in":"path","name":"invitationId","required":true,"dataType":"string"},
        };
        app.get('/didcomm/url/:invitationId',
            ...(fetchMiddlewares<RequestHandler>(ConnectionController)),
            ...(fetchMiddlewares<RequestHandler>(ConnectionController.prototype.getInvitation)),

            async function ConnectionController_getInvitation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsConnectionController_getInvitation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ConnectionController>(ConnectionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getInvitation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBasicMessageController_getBasicMessages: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
        };
        app.get('/didcomm/basic-messages/:connectionId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(BasicMessageController)),
            ...(fetchMiddlewares<RequestHandler>(BasicMessageController.prototype.getBasicMessages)),

            async function BasicMessageController_getBasicMessages(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBasicMessageController_getBasicMessages, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<BasicMessageController>(BasicMessageController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getBasicMessages',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBasicMessageController_sendMessage: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                connectionId: {"in":"path","name":"connectionId","required":true,"ref":"RecordId"},
                body: {"in":"body","name":"body","required":true,"ref":"Record_content.string_"},
        };
        app.post('/didcomm/basic-messages/:connectionId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(BasicMessageController)),
            ...(fetchMiddlewares<RequestHandler>(BasicMessageController.prototype.sendMessage)),

            async function BasicMessageController_sendMessage(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBasicMessageController_sendMessage, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<BasicMessageController>(BasicMessageController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'sendMessage',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidExpansionController_createDidKey: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateDidKeyRequest"},
        };
        app.post('/dids/create-key',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController)),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController.prototype.createDidKey)),

            async function DidExpansionController_createDidKey(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidExpansionController_createDidKey, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidExpansionController>(DidExpansionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createDidKey',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidExpansionController_createDidJwk: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateDidJwkRequest"},
        };
        app.post('/dids/create-jwk',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController)),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController.prototype.createDidJwk)),

            async function DidExpansionController_createDidJwk(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidExpansionController_createDidJwk, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidExpansionController>(DidExpansionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createDidJwk',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidExpansionController_prepareDidWeb: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"PrepareDidWebRequest"},
        };
        app.post('/dids/prepare-web',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController)),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController.prototype.prepareDidWeb)),

            async function DidExpansionController_prepareDidWeb(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidExpansionController_prepareDidWeb, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidExpansionController>(DidExpansionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'prepareDidWeb',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidExpansionController_listDidRecords: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/dids/records',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController)),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController.prototype.listDidRecords)),

            async function DidExpansionController_listDidRecords(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidExpansionController_listDidRecords, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidExpansionController>(DidExpansionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listDidRecords',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidExpansionController_verifyPublishedDidWeb: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                domain: {"in":"path","name":"domain","required":true,"dataType":"string"},
        };
        app.get('/dids/verify-web/:domain',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController)),
            ...(fetchMiddlewares<RequestHandler>(DidExpansionController.prototype.verifyPublishedDidWeb)),

            async function DidExpansionController_verifyPublishedDidWeb(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidExpansionController_verifyPublishedDidWeb, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidExpansionController>(DidExpansionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyPublishedDidWeb',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidController_getDidRecordByDid: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                did: {"in":"path","name":"did","required":true,"ref":"Did"},
        };
        app.get('/dids/:did',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidController)),
            ...(fetchMiddlewares<RequestHandler>(DidController.prototype.getDidRecordByDid)),

            async function DidController_getDidRecordByDid(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidController_getDidRecordByDid, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidController>(DidController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getDidRecordByDid',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidController_writeDid: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                createDidOptions: {"in":"body","name":"createDidOptions","required":true,"ref":"DidCreate"},
        };
        app.post('/dids/write',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidController)),
            ...(fetchMiddlewares<RequestHandler>(DidController.prototype.writeDid)),

            async function DidController_writeDid(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidController_writeDid, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidController>(DidController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'writeDid',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidController_getDids: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/dids',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidController)),
            ...(fetchMiddlewares<RequestHandler>(DidController.prototype.getDids)),

            async function DidController_getDids(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidController_getDids, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidController>(DidController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getDids',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDidAutomationController_createKeyDid: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/dids/automation/key',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(DidAutomationController)),
            ...(fetchMiddlewares<RequestHandler>(DidAutomationController.prototype.createKeyDid)),

            async function DidAutomationController_createKeyDid(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDidAutomationController_createKeyDid, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DidAutomationController>(DidAutomationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createKeyDid',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSchemaController_getSchemaById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                schemaId: {"in":"path","name":"schemaId","required":true,"ref":"SchemaId"},
        };
        app.get('/anoncreds/schemas/:schemaId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(SchemaController)),
            ...(fetchMiddlewares<RequestHandler>(SchemaController.prototype.getSchemaById)),

            async function SchemaController_getSchemaById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSchemaController_getSchemaById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SchemaController>(SchemaController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSchemaById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSchemaController_createSchema: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                schema: {"in":"body","name":"schema","required":true,"ref":"CreateSchemaInput"},
        };
        app.post('/anoncreds/schemas',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(SchemaController)),
            ...(fetchMiddlewares<RequestHandler>(SchemaController.prototype.createSchema)),

            async function SchemaController_createSchema(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSchemaController_createSchema, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SchemaController>(SchemaController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createSchema',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEndorserTransactionController_endorserTransaction: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                endorserTransaction: {"in":"body","name":"endorserTransaction","required":true,"ref":"EndorserTransaction"},
        };
        app.post('/blockchain/transactions/endorse',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(EndorserTransactionController)),
            ...(fetchMiddlewares<RequestHandler>(EndorserTransactionController.prototype.endorserTransaction)),

            async function EndorserTransactionController_endorserTransaction(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEndorserTransactionController_endorserTransaction, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EndorserTransactionController>(EndorserTransactionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'endorserTransaction',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEndorserTransactionController_didNymTransaction: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                didNymTransaction: {"in":"body","name":"didNymTransaction","required":true,"ref":"DidNymTransaction"},
        };
        app.post('/blockchain/transactions/set-endorser-role',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(EndorserTransactionController)),
            ...(fetchMiddlewares<RequestHandler>(EndorserTransactionController.prototype.didNymTransaction)),

            async function EndorserTransactionController_didNymTransaction(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEndorserTransactionController_didNymTransaction, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EndorserTransactionController>(EndorserTransactionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'didNymTransaction',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEndorserTransactionController_writeSchemaAndCredDefOnLedger: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                writeTransaction: {"in":"body","name":"writeTransaction","required":true,"ref":"WriteTransaction"},
        };
        app.post('/blockchain/transactions/write',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(EndorserTransactionController)),
            ...(fetchMiddlewares<RequestHandler>(EndorserTransactionController.prototype.writeSchemaAndCredDefOnLedger)),

            async function EndorserTransactionController_writeSchemaAndCredDefOnLedger(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEndorserTransactionController_writeSchemaAndCredDefOnLedger, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EndorserTransactionController>(EndorserTransactionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'writeSchemaAndCredDefOnLedger',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialDefinitionController_getCredentialDefinitionById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                credentialDefinitionId: {"in":"path","name":"credentialDefinitionId","required":true,"ref":"CredentialDefinitionId"},
        };
        app.get('/anoncreds/credential-definitions/:credentialDefinitionId',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialDefinitionController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialDefinitionController.prototype.getCredentialDefinitionById)),

            async function CredentialDefinitionController_getCredentialDefinitionById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialDefinitionController_getCredentialDefinitionById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialDefinitionController>(CredentialDefinitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialDefinitionById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCredentialDefinitionController_createCredentialDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                credentialDefinitionRequest: {"in":"body","name":"credentialDefinitionRequest","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"endorserDid":{"dataType":"string"},"endorse":{"dataType":"boolean"},"tag":{"dataType":"string","required":true},"schemaId":{"ref":"SchemaId","required":true},"issuerId":{"dataType":"string","required":true}}},
        };
        app.post('/anoncreds/credential-definitions',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(CredentialDefinitionController)),
            ...(fetchMiddlewares<RequestHandler>(CredentialDefinitionController.prototype.createCredentialDefinition)),

            async function CredentialDefinitionController_createCredentialDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCredentialDefinitionController_createCredentialDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CredentialDefinitionController>(CredentialDefinitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createCredentialDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_getAgentInfo: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/agent',
            authenticateMiddleware([{"jwt":["tenant","dedicated","Basewallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.getAgentInfo)),

            async function AgentController_getAgentInfo(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_getAgentInfo, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAgentInfo',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_getDatabaseHealth: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/agent/health/database',
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.getDatabaseHealth)),

            async function AgentController_getDatabaseHealth(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_getDatabaseHealth, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getDatabaseHealth',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_getAgentToken: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/agent/token',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.getAgentToken)),

            async function AgentController_getAgentToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_getAgentToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAgentToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_deleteWallet: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/agent/wallet',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.deleteWallet)),

            async function AgentController_deleteWallet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_deleteWallet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteWallet',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_verify: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"VerifyDataOptions"},
        };
        app.post('/agent/verify',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.verify)),

            async function AgentController_verify(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_verify, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verify',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_signCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                storeCredential: {"in":"query","name":"storeCredential","required":true,"dataType":"boolean"},
                dataTypeToSign: {"in":"query","name":"dataTypeToSign","required":true,"dataType":"union","subSchemas":[{"dataType":"enum","enums":["rawData"]},{"dataType":"enum","enums":["jsonLd"]}]},
                data: {"in":"body","name":"data","required":true,"dataType":"union","subSchemas":[{"ref":"CustomW3cJsonLdSignCredentialOptions"},{"ref":"SignDataOptions"},{"dataType":"any"}]},
        };
        app.post('/agent/credential/sign',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.signCredential)),

            async function AgentController_signCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_signCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'signCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_verifyCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                credentialToVerify: {"in":"body","name":"credentialToVerify","required":true,"dataType":"union","subSchemas":[{"ref":"SafeW3cJsonLdVerifyCredentialOptions"},{"dataType":"any"}]},
        };
        app.post('/agent/credential/verify',
            authenticateMiddleware([{"jwt":["tenant","dedicated"]}]),
            ...(fetchMiddlewares<RequestHandler>(AgentController)),
            ...(fetchMiddlewares<RequestHandler>(AgentController.prototype.verifyCredential)),

            async function AgentController_verifyCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_verifyCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AgentController>(AgentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_register: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"RegisterRequest"},
        };
        app.post('/api/wallet/auth/register',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.register)),

            async function WalletAuthController_register(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_register, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'register',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_login: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"LoginRequest"},
        };
        app.post('/api/wallet/auth/login',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.login)),

            async function WalletAuthController_login(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_login, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'login',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_loginWithWallet: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/wallet/auth/login-wallet',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.loginWithWallet)),

            async function WalletAuthController_loginWithWallet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_loginWithWallet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'loginWithWallet',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_verifyWalletLogin: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"VerifyPresentationRequestBody"},
        };
        app.post('/api/wallet/auth/login-wallet/verify',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.verifyWalletLogin)),

            async function WalletAuthController_verifyWalletLogin(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_verifyWalletLogin, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyWalletLogin',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_getSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/wallet/auth/session',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.getSession)),

            async function WalletAuthController_getSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_getSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_loginChallenge: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/wallet/auth/login-challenge',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.loginChallenge)),

            async function WalletAuthController_loginChallenge(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_loginChallenge, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'loginChallenge',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_loginVerify: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"LoginVerifyRequest"},
        };
        app.post('/api/wallet/auth/login-verify',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.loginVerify)),

            async function WalletAuthController_loginVerify(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_loginVerify, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'loginVerify',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletAuthController_logout: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/wallet/auth/logout',
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController)),
            ...(fetchMiddlewares<RequestHandler>(WalletAuthController.prototype.logout)),

            async function WalletAuthController_logout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletAuthController_logout, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletAuthController>(WalletAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'logout',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_getWallets: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/wallet/accounts/wallets',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.getWallets)),

            async function WalletController_getWallets(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_getWallets, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getWallets',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_listCredentials: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
        };
        app.get('/api/wallet/wallet/:walletId/credentials',
            authenticateMiddleware([{"apiKey":[]},{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.listCredentials)),

            async function WalletController_listCredentials(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_listCredentials, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listCredentials',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_hasCredentialOfType: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                credentialType: {"in":"path","name":"credentialType","required":true,"dataType":"string"},
        };
        app.get('/api/wallet/wallet/:walletId/credentials/exists/:credentialType',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.hasCredentialOfType)),

            async function WalletController_hasCredentialOfType(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_hasCredentialOfType, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'hasCredentialOfType',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_getDids: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
        };
        app.get('/api/wallet/wallet/:walletId/dids',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.getDids)),

            async function WalletController_getDids(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_getDids, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getDids',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_getCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                credentialId: {"in":"path","name":"credentialId","required":true,"dataType":"string"},
        };
        app.get('/api/wallet/wallet/:walletId/credentials/:credentialId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.getCredential)),

            async function WalletController_getCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_getCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_resolveCredentialOffer: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
        };
        app.post('/api/wallet/wallet/:walletId/exchange/resolveCredentialOffer',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.resolveCredentialOffer)),

            async function WalletController_resolveCredentialOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_resolveCredentialOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'resolveCredentialOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_resolveIssuerOpenIDMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                issuer: {"in":"query","name":"issuer","required":true,"dataType":"string"},
        };
        app.get('/api/wallet/wallet/:walletId/exchange/resolveIssuerOpenIDMetadata',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.resolveIssuerOpenIDMetadata)),

            async function WalletController_resolveIssuerOpenIDMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_resolveIssuerOpenIDMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'resolveIssuerOpenIDMetadata',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_useOfferRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                did: {"in":"query","name":"did","dataType":"string"},
                body: {"in":"body","name":"body","dataType":"any"},
        };
        app.post('/api/wallet/wallet/:walletId/exchange/useOfferRequest',
            authenticateMiddleware([{"apiKey":[]},{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.useOfferRequest)),

            async function WalletController_useOfferRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_useOfferRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'useOfferRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_resolvePresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
        };
        app.post('/api/wallet/wallet/:walletId/exchange/resolvePresentationRequest',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.resolvePresentationRequest)),

            async function WalletController_resolvePresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_resolvePresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'resolvePresentationRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_matchCredentialsForPresentationDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
        };
        app.post('/api/wallet/wallet/:walletId/exchange/matchCredentialsForPresentationDefinition',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.matchCredentialsForPresentationDefinition)),

            async function WalletController_matchCredentialsForPresentationDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_matchCredentialsForPresentationDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'matchCredentialsForPresentationDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletController_usePresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
        };
        app.post('/api/wallet/wallet/:walletId/exchange/usePresentationRequest',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.usePresentationRequest)),

            async function WalletController_usePresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_usePresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'usePresentationRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcIssuerController_createCredentialOffer: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateCredentialOfferRequest"},
        };
        app.post('/custom-oidc/issuer/credential-offers',
            authenticateMiddleware([{"apiKey":[]},{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController)),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController.prototype.createCredentialOffer)),

            async function OidcIssuerController_createCredentialOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcIssuerController_createCredentialOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcIssuerController>(OidcIssuerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createCredentialOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcIssuerController_getCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/custom-oidc/issuer/credentials/:id',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController)),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController.prototype.getCredential)),

            async function OidcIssuerController_getCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcIssuerController_getCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcIssuerController>(OidcIssuerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcIssuerController_revokeCredential: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.post('/custom-oidc/issuer/credentials/:id/revoke',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController)),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController.prototype.revokeCredential)),

            async function OidcIssuerController_revokeCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcIssuerController_revokeCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcIssuerController>(OidcIssuerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'revokeCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOidcIssuerController_listCredentials: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                subject: {"in":"query","name":"subject","dataType":"string"},
        };
        app.get('/custom-oidc/issuer/credentials',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController)),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController.prototype.listCredentials)),

            async function OidcIssuerController_listCredentials(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcIssuerController_listCredentials, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcIssuerController>(OidcIssuerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listCredentials',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEcoCashWebhookController_handleEcoCashWebhook: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"EcoCashWebhookPayload"},
                apiKey: {"in":"header","name":"X-API-KEY","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.post('/webhooks/ecocash',
            ...(fetchMiddlewares<RequestHandler>(EcoCashWebhookController)),
            ...(fetchMiddlewares<RequestHandler>(EcoCashWebhookController.prototype.handleEcoCashWebhook)),

            async function EcoCashWebhookController_handleEcoCashWebhook(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEcoCashWebhookController_handleEcoCashWebhook, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EcoCashWebhookController>(EcoCashWebhookController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'handleEcoCashWebhook',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWorkflowController_executeWorkflow: Record<string, TsoaRoute.ParameterSchema> = {
                workflowId: {"in":"path","name":"workflowId","required":true,"dataType":"string"},
                input: {"in":"body","name":"input","required":true,"dataType":"any"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/:workflowId/execute',
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.executeWorkflow)),

            async function WorkflowController_executeWorkflow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_executeWorkflow, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'executeWorkflow',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWorkflowController_listWorkflows: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                category: {"in":"query","name":"category","dataType":"string"},
        };
        app.get('/workflows',
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.listWorkflows)),

            async function WorkflowController_listWorkflows(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_listWorkflows, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listWorkflows',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWorkflowController_registerWorkflow: Record<string, TsoaRoute.ParameterSchema> = {
                definition: {"in":"body","name":"definition","required":true,"dataType":"any"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows',
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.registerWorkflow)),

            async function WorkflowController_registerWorkflow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_registerWorkflow, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'registerWorkflow',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletCredentialsController_getPendingOffers: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/wallet/credentials/pending-offers',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController)),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController.prototype.getPendingOffers)),

            async function WalletCredentialsController_getPendingOffers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletCredentialsController_getPendingOffers, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletCredentialsController>(WalletCredentialsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPendingOffers',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWalletCredentialsController_acceptOffer: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"offerUri":{"dataType":"string","required":true}}},
        };
        app.post('/api/wallet/credentials/accept-offer',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController)),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController.prototype.acceptOffer)),

            async function WalletCredentialsController_acceptOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletCredentialsController_acceptOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletCredentialsController>(WalletCredentialsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFinanceController_issueCartSnapshot: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CartSnapshotRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/cart/:cartId/issue-snapshot',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(FinanceController)),
            ...(fetchMiddlewares<RequestHandler>(FinanceController.prototype.issueCartSnapshot)),

            async function FinanceController_issueCartSnapshot(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFinanceController_issueCartSnapshot, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FinanceController>(FinanceController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'issueCartSnapshot',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFinanceController_issueInvoice: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"InvoiceRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/invoices/issue',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(FinanceController)),
            ...(fetchMiddlewares<RequestHandler>(FinanceController.prototype.issueInvoice)),

            async function FinanceController_issueInvoice(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFinanceController_issueInvoice, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FinanceController>(FinanceController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'issueInvoice',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFinanceController_issueReceipt: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"transactionId":{"dataType":"string","required":true},"currency":{"dataType":"string","required":true},"amount":{"dataType":"double","required":true},"cartId":{"dataType":"string"},"invoiceRef":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/receipts/issue',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(FinanceController)),
            ...(fetchMiddlewares<RequestHandler>(FinanceController.prototype.issueReceipt)),

            async function FinanceController_issueReceipt(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFinanceController_issueReceipt, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FinanceController>(FinanceController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'issueReceipt',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCatalogController_createItem: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateCatalogItemRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/catalog/merchant/:merchantId/items',
            ...(fetchMiddlewares<RequestHandler>(CatalogController)),
            ...(fetchMiddlewares<RequestHandler>(CatalogController.prototype.createItem)),

            async function CatalogController_createItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCatalogController_createItem, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CatalogController>(CatalogController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createItem',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCatalogController_searchItems: Record<string, TsoaRoute.ParameterSchema> = {
                q: {"in":"query","name":"q","dataType":"string"},
        };
        app.get('/api/catalog/search',
            ...(fetchMiddlewares<RequestHandler>(CatalogController)),
            ...(fetchMiddlewares<RequestHandler>(CatalogController.prototype.searchItems)),

            async function CatalogController_searchItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCatalogController_searchItems, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CatalogController>(CatalogController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchItems',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_createCartFromPayload: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateCartRequest"},
        };
        app.post('/api/wa/cart/create',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.createCartFromPayload)),

            async function WhatsAppPayloadController_createCartFromPayload(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_createCartFromPayload, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createCartFromPayload',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_getCart: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
        };
        app.get('/api/wa/cart/:cartId',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.getCart)),

            async function WhatsAppPayloadController_getCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_getCart, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCart',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_addItemToCart: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"quantity":{"dataType":"double"},"itemId":{"dataType":"string","required":true}}},
        };
        app.post('/api/wa/cart/:cartId/items',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.addItemToCart)),

            async function WhatsAppPayloadController_addItemToCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_addItemToCart, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'addItemToCart',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_generateWaLink: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
                itemId: {"in":"path","name":"itemId","required":true,"dataType":"string"},
                waNumber: {"in":"query","name":"waNumber","dataType":"string"},
        };
        app.get('/api/wa/link/:merchantId/:itemId',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.generateWaLink)),

            async function WhatsAppPayloadController_generateWaLink(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_generateWaLink, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'generateWaLink',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_presentCartOptions: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
        };
        app.post('/api/wa/cart/:cartId/present-options',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.presentCartOptions)),

            async function WhatsAppPayloadController_presentCartOptions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_presentCartOptions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'presentCartOptions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_issueQuoteVC: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"sendToWhatsApp":{"dataType":"boolean"}}},
        };
        app.post('/api/wa/cart/:cartId/issue-quote',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.issueQuoteVC)),

            async function WhatsAppPayloadController_issueQuoteVC(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_issueQuoteVC, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'issueQuoteVC',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_checkout: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"sendToWhatsApp":{"dataType":"boolean"},"skipQuote":{"dataType":"boolean"},"customerMsisdn":{"dataType":"string","required":true}}},
        };
        app.post('/api/wa/cart/:cartId/checkout',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.checkout)),

            async function WhatsAppPayloadController_checkout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_checkout, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'checkout',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_getAllCarts: Record<string, TsoaRoute.ParameterSchema> = {
                status: {"in":"query","name":"status","dataType":"string"},
                merchantId: {"in":"query","name":"merchantId","dataType":"string"},
        };
        app.get('/api/wa/carts',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.getAllCarts)),

            async function WhatsAppPayloadController_getAllCarts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_getAllCarts, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAllCarts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppPayloadController_sendReceiptToWhatsApp: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"transactionId":{"dataType":"string","required":true},"receiptOfferUrl":{"dataType":"string","required":true}}},
        };
        app.post('/api/wa/cart/:cartId/send-receipt',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppPayloadController.prototype.sendReceiptToWhatsApp)),

            async function WhatsAppPayloadController_sendReceiptToWhatsApp(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppPayloadController_sendReceiptToWhatsApp, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppPayloadController>(WhatsAppPayloadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'sendReceiptToWhatsApp',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTrustController_getTrustScore: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
                maxAgeMinutes: {"in":"query","name":"maxAgeMinutes","dataType":"double"},
        };
        app.get('/api/trust/:merchantId',
            ...(fetchMiddlewares<RequestHandler>(TrustController)),
            ...(fetchMiddlewares<RequestHandler>(TrustController.prototype.getTrustScore)),

            async function TrustController_getTrustScore(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTrustController_getTrustScore, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TrustController>(TrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTrustScore',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTrustController_computeTrustScore: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
        };
        app.post('/api/trust/:merchantId/compute',
            ...(fetchMiddlewares<RequestHandler>(TrustController)),
            ...(fetchMiddlewares<RequestHandler>(TrustController.prototype.computeTrustScore)),

            async function TrustController_computeTrustScore(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTrustController_computeTrustScore, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TrustController>(TrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'computeTrustScore',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTrustController_recordEvent: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"RecordEventRequest"},
        };
        app.post('/api/trust/:merchantId/events',
            ...(fetchMiddlewares<RequestHandler>(TrustController)),
            ...(fetchMiddlewares<RequestHandler>(TrustController.prototype.recordEvent)),

            async function TrustController_recordEvent(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTrustController_recordEvent, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TrustController>(TrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'recordEvent',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTrustController_getTrustCard: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
        };
        app.get('/api/trust/:merchantId/card',
            ...(fetchMiddlewares<RequestHandler>(TrustController)),
            ...(fetchMiddlewares<RequestHandler>(TrustController.prototype.getTrustCard)),

            async function TrustController_getTrustCard(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTrustController_getTrustCard, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TrustController>(TrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTrustCard',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsVCVerifierController_verifyCredential: Record<string, TsoaRoute.ParameterSchema> = {
                vcId: {"in":"path","name":"vcId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/verify/:vcId',
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController.prototype.verifyCredential)),

            async function VCVerifierController_verifyCredential(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVCVerifierController_verifyCredential, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VCVerifierController>(VCVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyCredential',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsVCVerifierController_verifyScan: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/verify/scan',
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController.prototype.verifyScan)),

            async function VCVerifierController_verifyScan(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVCVerifierController_verifyScan, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VCVerifierController>(VCVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyScan',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsVCVerifierController_getVerificationHistory: Record<string, TsoaRoute.ParameterSchema> = {
                vcId: {"in":"path","name":"vcId","required":true,"dataType":"string"},
        };
        app.get('/api/verify/:vcId/history',
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController.prototype.getVerificationHistory)),

            async function VCVerifierController_getVerificationHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVCVerifierController_getVerificationHistory, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VCVerifierController>(VCVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getVerificationHistory',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsVCVerifierController_getVerificationPage: Record<string, TsoaRoute.ParameterSchema> = {
                vcId: {"in":"path","name":"vcId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/verify/:vcId/page',
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController)),
            ...(fetchMiddlewares<RequestHandler>(VCVerifierController.prototype.getVerificationPage)),

            async function VCVerifierController_getVerificationPage(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVCVerifierController_getVerificationPage, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VCVerifierController>(VCVerifierController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getVerificationPage',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEscalationController_createEscalation: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateEscalationRequest"},
        };
        app.post('/api/regulator/escalations',
            ...(fetchMiddlewares<RequestHandler>(EscalationController)),
            ...(fetchMiddlewares<RequestHandler>(EscalationController.prototype.createEscalation)),

            async function EscalationController_createEscalation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEscalationController_createEscalation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EscalationController>(EscalationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createEscalation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEscalationController_getEscalationPackage: Record<string, TsoaRoute.ParameterSchema> = {
                escalationId: {"in":"path","name":"escalationId","required":true,"dataType":"string"},
        };
        app.get('/api/regulator/escalations/:escalationId/package',
            ...(fetchMiddlewares<RequestHandler>(EscalationController)),
            ...(fetchMiddlewares<RequestHandler>(EscalationController.prototype.getEscalationPackage)),

            async function EscalationController_getEscalationPackage(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEscalationController_getEscalationPackage, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EscalationController>(EscalationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getEscalationPackage',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEscalationController_listEscalations: Record<string, TsoaRoute.ParameterSchema> = {
                status: {"in":"query","name":"status","dataType":"string"},
                severity: {"in":"query","name":"severity","dataType":"string"},
                merchantId: {"in":"query","name":"merchantId","dataType":"string"},
        };
        app.get('/api/regulator/escalations',
            ...(fetchMiddlewares<RequestHandler>(EscalationController)),
            ...(fetchMiddlewares<RequestHandler>(EscalationController.prototype.listEscalations)),

            async function EscalationController_listEscalations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEscalationController_listEscalations, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EscalationController>(EscalationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listEscalations',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEscalationController_updateEscalationStatus: Record<string, TsoaRoute.ParameterSchema> = {
                escalationId: {"in":"path","name":"escalationId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"notes":{"dataType":"string"},"status":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["under_review"]},{"dataType":"enum","enums":["resolved"]},{"dataType":"enum","enums":["dismissed"]}],"required":true}}},
        };
        app.post('/api/regulator/escalations/:escalationId/status',
            ...(fetchMiddlewares<RequestHandler>(EscalationController)),
            ...(fetchMiddlewares<RequestHandler>(EscalationController.prototype.updateEscalationStatus)),

            async function EscalationController_updateEscalationStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEscalationController_updateEscalationStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EscalationController>(EscalationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateEscalationStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppWebhookController_verifyWebhook: Record<string, TsoaRoute.ParameterSchema> = {
                mode: {"in":"query","name":"hub.mode","required":true,"dataType":"string"},
                token: {"in":"query","name":"hub.verify_token","required":true,"dataType":"string"},
                challenge: {"in":"query","name":"hub.challenge","required":true,"dataType":"string"},
        };
        app.get('/wa/webhook',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppWebhookController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppWebhookController.prototype.verifyWebhook)),

            async function WhatsAppWebhookController_verifyWebhook(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppWebhookController_verifyWebhook, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppWebhookController>(WhatsAppWebhookController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyWebhook',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWhatsAppWebhookController_handleWebhook: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"WhatsAppWebhookPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/wa/webhook',
            ...(fetchMiddlewares<RequestHandler>(WhatsAppWebhookController)),
            ...(fetchMiddlewares<RequestHandler>(WhatsAppWebhookController.prototype.handleWebhook)),

            async function WhatsAppWebhookController_handleWebhook(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWhatsAppWebhookController_handleWebhook, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WhatsAppWebhookController>(WhatsAppWebhookController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'handleWebhook',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_listEmployees: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/payroll/employees',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.listEmployees)),

            async function PayrollController_listEmployees(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_listEmployees, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listEmployees',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_saveEmployee: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateEmployeeRequest"},
        };
        app.post('/api/payroll/employees',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.saveEmployee)),

            async function PayrollController_saveEmployee(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_saveEmployee, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'saveEmployee',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_listRuns: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/payroll/runs',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.listRuns)),

            async function PayrollController_listRuns(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_listRuns, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listRuns',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_createRun: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateRunRequest"},
        };
        app.post('/api/payroll/runs',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.createRun)),

            async function PayrollController_createRun(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_createRun, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createRun',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_getRunDetails: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
        };
        app.get('/api/payroll/runs/:runId',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.getRunDetails)),

            async function PayrollController_getRunDetails(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_getRunDetails, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getRunDetails',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_issuePayslips: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
        };
        app.post('/api/payroll/runs/:runId/issue',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.issuePayslips)),

            async function PayrollController_issuePayslips(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_issuePayslips, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'issuePayslips',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPayrollController_processPayout: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
        };
        app.post('/api/payroll/runs/:runId/payout',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.processPayout)),

            async function PayrollController_processPayout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_processPayout, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'processPayout',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOnboardingController_listCases: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/onboarding/cases',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.listCases)),

            async function OnboardingController_listCases(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_listCases, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listCases',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOnboardingController_createCase: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"role":{"dataType":"string"},"department":{"dataType":"string"},"startDate":{"dataType":"string"},"email":{"dataType":"string","required":true},"employeeName":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.post('/api/onboarding/cases',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.createCase)),

            async function OnboardingController_createCase(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_createCase, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createCase',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOnboardingController_initOnboarding: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"InitOnboardingPayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.post('/api/onboarding/init',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.initOnboarding)),

            async function OnboardingController_initOnboarding(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_initOnboarding, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'initOnboarding',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOnboardingController_getRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/api/onboarding/:id',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.getRequest)),

            async function OnboardingController_getRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_getRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOnboardingController_updateStep: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateOnboardingPayload"},
        };
        app.put('/api/onboarding/:id/step',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.updateStep)),

            async function OnboardingController_updateStep(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_updateStep, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateStep',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOnboardingController_approveRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.post('/api/onboarding/:id/approve',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.approveRequest)),

            async function OnboardingController_approveRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_approveRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'approveRequest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRevocationController_createList: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateStatusListPayload"},
        };
        app.post('/api/revocation/list',
            ...(fetchMiddlewares<RequestHandler>(RevocationController)),
            ...(fetchMiddlewares<RequestHandler>(RevocationController.prototype.createList)),

            async function RevocationController_createList(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRevocationController_createList, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RevocationController>(RevocationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createList',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRevocationController_updateStatus: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateStatusPayload"},
        };
        app.post('/api/revocation/update',
            ...(fetchMiddlewares<RequestHandler>(RevocationController)),
            ...(fetchMiddlewares<RequestHandler>(RevocationController.prototype.updateStatus)),

            async function RevocationController_updateStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRevocationController_updateStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RevocationController>(RevocationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsVerifierPortalController_verify: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"dataType":"any"},
        };
        app.post('/api/verifier/verify',
            ...(fetchMiddlewares<RequestHandler>(VerifierPortalController)),
            ...(fetchMiddlewares<RequestHandler>(VerifierPortalController.prototype.verify)),

            async function VerifierPortalController_verify(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVerifierPortalController_verify, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VerifierPortalController>(VerifierPortalController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verify',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsVerifierPortalController_getHistory: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"default":50,"in":"query","name":"limit","dataType":"double"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/verifier/history',
            ...(fetchMiddlewares<RequestHandler>(VerifierPortalController)),
            ...(fetchMiddlewares<RequestHandler>(VerifierPortalController.prototype.getHistory)),

            async function VerifierPortalController_getHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVerifierPortalController_getHistory, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VerifierPortalController>(VerifierPortalController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getHistory',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOperationsController_requestLeave: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateLeaveRequestPayload"},
        };
        app.post('/api/operations/leave',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.requestLeave)),

            async function OperationsController_requestLeave(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_requestLeave, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'requestLeave',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOperationsController_listLeave: Record<string, TsoaRoute.ParameterSchema> = {
                employeeId: {"in":"query","name":"employeeId","dataType":"string"},
        };
        app.get('/api/operations/leave',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.listLeave)),

            async function OperationsController_listLeave(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_listLeave, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listLeave',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOperationsController_updateLeaveStatus: Record<string, TsoaRoute.ParameterSchema> = {
                leaveId: {"in":"path","name":"leaveId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateOperationsStatusPayload"},
        };
        app.put('/api/operations/leave/:leaveId/status',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.updateLeaveStatus)),

            async function OperationsController_updateLeaveStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_updateLeaveStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateLeaveStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOperationsController_submitExpense: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateExpenseClaimPayload"},
        };
        app.post('/api/operations/expenses',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.submitExpense)),

            async function OperationsController_submitExpense(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_submitExpense, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'submitExpense',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOperationsController_listExpenses: Record<string, TsoaRoute.ParameterSchema> = {
                employeeId: {"in":"query","name":"employeeId","dataType":"string"},
        };
        app.get('/api/operations/expenses',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.listExpenses)),

            async function OperationsController_listExpenses(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_listExpenses, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listExpenses',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOperationsController_updateExpenseStatus: Record<string, TsoaRoute.ParameterSchema> = {
                claimId: {"in":"path","name":"claimId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateOperationsStatusPayload"},
        };
        app.put('/api/operations/expenses/:claimId/status',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.updateExpenseStatus)),

            async function OperationsController_updateExpenseStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_updateExpenseStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateExpenseStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsReportingController_getIncomeStatement: Record<string, TsoaRoute.ParameterSchema> = {
                startDate: {"in":"query","name":"startDate","required":true,"dataType":"string"},
                endDate: {"in":"query","name":"endDate","required":true,"dataType":"string"},
        };
        app.get('/api/finance/income-statement',
            ...(fetchMiddlewares<RequestHandler>(ReportingController)),
            ...(fetchMiddlewares<RequestHandler>(ReportingController.prototype.getIncomeStatement)),

            async function ReportingController_getIncomeStatement(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReportingController_getIncomeStatement, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReportingController>(ReportingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getIncomeStatement',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsReportingController_createIncomeStatementOffer: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateStatementOfferRequest"},
        };
        app.post('/api/finance/income-statement/offer',
            ...(fetchMiddlewares<RequestHandler>(ReportingController)),
            ...(fetchMiddlewares<RequestHandler>(ReportingController.prototype.createIncomeStatementOffer)),

            async function ReportingController_createIncomeStatementOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReportingController_createIncomeStatementOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReportingController>(ReportingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createIncomeStatementOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_createLocation: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateLocationRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/inventory/locations',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.createLocation)),

            async function InventoryController_createLocation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_createLocation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createLocation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_getLocations: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/inventory/locations',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getLocations)),

            async function InventoryController_getLocations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getLocations, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getLocations',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_receiveGoods: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"ReceiveGoodsBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/inventory/receive',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.receiveGoods)),

            async function InventoryController_receiveGoods(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_receiveGoods, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'receiveGoods',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_reserveStock: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"ReserveStockBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/inventory/reserve',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.reserveStock)),

            async function InventoryController_reserveStock(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_reserveStock, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reserveStock',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_getStockLevels: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                catalogItemId: {"in":"query","name":"catalogItemId","dataType":"string"},
                locationId: {"in":"query","name":"locationId","dataType":"string"},
        };
        app.get('/api/inventory/levels',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getStockLevels)),

            async function InventoryController_getStockLevels(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getStockLevels, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getStockLevels',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_getLot: Record<string, TsoaRoute.ParameterSchema> = {
                lotId: {"in":"path","name":"lotId","required":true,"dataType":"string"},
        };
        app.get('/api/inventory/lots/:lotId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getLot)),

            async function InventoryController_getLot(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getLot, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getLot',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_scanBarcode: Record<string, TsoaRoute.ParameterSchema> = {
                barcode: {"in":"path","name":"barcode","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                locationId: {"in":"query","name":"locationId","dataType":"string"},
        };
        app.get('/api/inventory/scan/:barcode',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.scanBarcode)),

            async function InventoryController_scanBarcode(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_scanBarcode, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'scanBarcode',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_getEvents: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                catalogItemId: {"in":"query","name":"catalogItemId","required":true,"dataType":"string"},
                locationId: {"in":"query","name":"locationId","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/inventory/events',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getEvents)),

            async function InventoryController_getEvents(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getEvents, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getEvents',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_verifyChain: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                catalogItemId: {"in":"query","name":"catalogItemId","required":true,"dataType":"string"},
                locationId: {"in":"query","name":"locationId","required":true,"dataType":"string"},
        };
        app.get('/api/inventory/verify-chain',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.verifyChain)),

            async function InventoryController_verifyChain(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_verifyChain, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyChain',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_traceReceipt: Record<string, TsoaRoute.ParameterSchema> = {
                receiptId: {"in":"path","name":"receiptId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/inventory/trace/receipt/:receiptId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.traceReceipt)),

            async function InventoryController_traceReceipt(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_traceReceipt, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'traceReceipt',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_getValuation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/inventory/analytics/valuation',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getValuation)),

            async function InventoryController_getValuation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getValuation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getValuation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsInventoryController_getAging: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/inventory/analytics/aging',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getAging)),

            async function InventoryController_getAging(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getAging, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAging',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMetricsController_healthCheck: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/health',
            ...(fetchMiddlewares<RequestHandler>(MetricsController)),
            ...(fetchMiddlewares<RequestHandler>(MetricsController.prototype.healthCheck)),

            async function MetricsController_healthCheck(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMetricsController_healthCheck, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MetricsController>(MetricsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'healthCheck',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMetricsController_livenessProbe: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/health/live',
            ...(fetchMiddlewares<RequestHandler>(MetricsController)),
            ...(fetchMiddlewares<RequestHandler>(MetricsController.prototype.livenessProbe)),

            async function MetricsController_livenessProbe(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMetricsController_livenessProbe, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MetricsController>(MetricsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'livenessProbe',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMetricsController_readinessProbe: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/health/ready',
            ...(fetchMiddlewares<RequestHandler>(MetricsController)),
            ...(fetchMiddlewares<RequestHandler>(MetricsController.prototype.readinessProbe)),

            async function MetricsController_readinessProbe(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMetricsController_readinessProbe, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MetricsController>(MetricsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'readinessProbe',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMetricsController_getJsonMetrics: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/metrics/json',
            ...(fetchMiddlewares<RequestHandler>(MetricsController)),
            ...(fetchMiddlewares<RequestHandler>(MetricsController.prototype.getJsonMetrics)),

            async function MetricsController_getJsonMetrics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMetricsController_getJsonMetrics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MetricsController>(MetricsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getJsonMetrics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMetricsController_getPrometheusMetrics: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/metrics',
            ...(fetchMiddlewares<RequestHandler>(MetricsController)),
            ...(fetchMiddlewares<RequestHandler>(MetricsController.prototype.getPrometheusMetrics)),

            async function MetricsController_getPrometheusMetrics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMetricsController_getPrometheusMetrics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MetricsController>(MetricsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPrometheusMetrics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentController_lookupPayment: Record<string, TsoaRoute.ParameterSchema> = {
                ref: {"in":"query","name":"ref","required":true,"dataType":"string"},
        };
        app.get('/api/payments/lookup',
            ...(fetchMiddlewares<RequestHandler>(PaymentController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentController.prototype.lookupPayment)),

            async function PaymentController_lookupPayment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentController_lookupPayment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PaymentController>(PaymentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'lookupPayment',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentController_getPaymentById: Record<string, TsoaRoute.ParameterSchema> = {
                paymentId: {"in":"path","name":"paymentId","required":true,"dataType":"string"},
        };
        app.get('/api/payments/:paymentId',
            ...(fetchMiddlewares<RequestHandler>(PaymentController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentController.prototype.getPaymentById)),

            async function PaymentController_getPaymentById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentController_getPaymentById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PaymentController>(PaymentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPaymentById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentController_listPayments: Record<string, TsoaRoute.ParameterSchema> = {
                state: {"in":"query","name":"state","dataType":"string"},
                tenantId: {"in":"query","name":"tenantId","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/payments',
            ...(fetchMiddlewares<RequestHandler>(PaymentController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentController.prototype.listPayments)),

            async function PaymentController_listPayments(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentController_listPayments, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PaymentController>(PaymentController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listPayments',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsReceiptController_verifyReceipt: Record<string, TsoaRoute.ParameterSchema> = {
                transactionId: {"in":"path","name":"transactionId","required":true,"dataType":"string"},
        };
        app.get('/api/receipts/verify/:transactionId',
            ...(fetchMiddlewares<RequestHandler>(ReceiptController)),
            ...(fetchMiddlewares<RequestHandler>(ReceiptController.prototype.verifyReceipt)),

            async function ReceiptController_verifyReceipt(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReceiptController_verifyReceipt, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReceiptController>(ReceiptController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'verifyReceipt',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsReceiptController_listReceipts: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/receipts',
            ...(fetchMiddlewares<RequestHandler>(ReceiptController)),
            ...(fetchMiddlewares<RequestHandler>(ReceiptController.prototype.listReceipts)),

            async function ReceiptController_listReceipts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReceiptController_listReceipts, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReceiptController>(ReceiptController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listReceipts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPortalController_getCredentialList: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/list',
            ...(fetchMiddlewares<RequestHandler>(PortalController)),
            ...(fetchMiddlewares<RequestHandler>(PortalController.prototype.getCredentialList)),

            async function PortalController_getCredentialList(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPortalController_getCredentialList, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PortalController>(PortalController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialList',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPortalController_getCredentialOffer: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/api/vc/:id',
            ...(fetchMiddlewares<RequestHandler>(PortalController)),
            ...(fetchMiddlewares<RequestHandler>(PortalController.prototype.getCredentialOffer)),

            async function PortalController_getCredentialOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPortalController_getCredentialOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PortalController>(PortalController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(request: any, response: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }

                    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            try {
                request['user'] = await Promise.any(secMethodOrPromises);

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }

                next();
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                error.status = error.status || 401;

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }
                next(error);
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
