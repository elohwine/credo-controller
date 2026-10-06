/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuditController } from './../controllers/admin/AuditController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PaymentController } from './../controllers/payments/PaymentController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ReceiptController } from './../controllers/payments/PaymentController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MultiTenancyController } from './../controllers/multi-tenancy/MultiTenancyController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DidExpansionController } from './../controllers/did/DidExpansionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VCVerifierController } from './../controllers/regulator/VCVerifierController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EscalationController } from './../controllers/regulator/EscalationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OperationsController } from './../controllers/hr/OperationsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OnboardingController } from './../controllers/hr/OnboardingController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { InventoryController } from './../controllers/inventory/InventoryController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ReportingController } from './../controllers/finance/ReportingController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PayrollController } from './../controllers/finance/PayrollController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FinanceController } from './../controllers/finance/FinanceController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProviderController } from './../controllers/provider/ProviderController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OrganizationController } from './../controllers/organizations/OrganizationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CatalogController } from './../controllers/catalog/CatalogController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ShortlinkController } from './../controllers/shortlink/ShortlinkController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VerificationPageController } from './../controllers/shortlink/ShortlinkController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SchemaRegistryController } from './../controllers/schemas/SchemaRegistryController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DidController } from './../controllers/did/DidController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DidAutomationController } from './../controllers/did/DidAutomationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WhatsAppWebhookController } from './../controllers/whatsapp/WhatsAppWebhookController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WhatsAppPayloadController } from './../controllers/whatsapp/WhatsAppPayloadController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SchemaController } from './../controllers/anoncreds/schema/SchemaController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EndorserTransactionController } from './../controllers/anoncreds/endorser-transaction/EndorserTransactionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CredentialDefinitionController } from './../controllers/anoncreds/cred-def/CredentialDefinitionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OidcIssuerController } from './../controllers/oidc/OidcIssuerController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EcoCashWebhookController } from './../controllers/webhooks/EcoCashWebhookController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentController } from './../controllers/agent/AgentController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OidcVerifierController } from './../controllers/oidc/OidcVerifierController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OidcMetadataController } from './../controllers/oidc/OidcMetadataController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OID4VCredentialDefinitionController } from './../controllers/oidc/OID4VCredentialDefinitionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WalletController } from './../controllers/wallet/WalletController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SSIAuthController } from './../controllers/wallet/SSIAuthController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SsiVerificationController } from './../controllers/platform/SsiVerificationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WalletCredentialsController } from './../controllers/wallet/WalletCredentialsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VerifierPortalController } from './../controllers/trust/VerifierPortalController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TrustController } from './../controllers/trust/TrustController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { RevocationController } from './../controllers/trust/RevocationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WalletAuthController } from './../controllers/wallet/WalletAuthController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SsiTrustController } from './../controllers/platform/SsiTrustController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WorkflowTemplateController } from './../controllers/workflow/WorkflowTemplateController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WorkflowController } from './../controllers/workflow/WorkflowController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TriggerController } from './../controllers/workflow/TriggerController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { RequestController } from './../controllers/platform/RequestController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PlatformWorkflowController } from './../controllers/platform/PlatformWorkflowController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MetricsController } from './../controllers/metrics/MetricsController';
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
import { RequisitionController } from './../controllers/finance/RequisitionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WorkflowRequestController } from './../controllers/contacts/WorkflowRequestController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WorkflowEvidenceController } from './../controllers/workflow/WorkflowEvidenceController';
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
    "AuditLog": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "actorDid": {"dataType":"string"},
            "actionType": {"dataType":"string","required":true},
            "resourceId": {"dataType":"string"},
            "details": {"dataType":"object"},
            "ipAddress": {"dataType":"string"},
            "userAgent": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
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
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TenantMetadataResponse": {
        "dataType": "refObject",
        "properties": {
            "issuer": {"ref":"Record_string.any_","required":true},
            "verifier": {"ref":"Record_string.any_","required":true},
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
    "Record_string.unknown_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
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
            "approvalVcId": {"dataType":"string"},
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
            "approvalVcId": {"dataType":"string"},
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
    "IncomeStatement": {
        "dataType": "refObject",
        "properties": {
            "statementId": {"dataType":"string","required":true},
            "organizationName": {"dataType":"string","required":true},
            "periodStart": {"dataType":"string","required":true},
            "periodEnd": {"dataType":"string","required":true},
            "revenue": {"dataType":"double","required":true},
            "costOfGoodsSold": {"dataType":"double","required":true},
            "grossProfit": {"dataType":"double","required":true},
            "operatingExpenses": {"dataType":"double","required":true},
            "operatingIncome": {"dataType":"double","required":true},
            "otherIncome": {"dataType":"double","required":true},
            "otherExpenses": {"dataType":"double","required":true},
            "expenses": {"dataType":"double","required":true},
            "netIncome": {"dataType":"double","required":true},
            "breakdown": {"dataType":"nestedObjectLiteral","nestedProperties":{"operations":{"dataType":"double","required":true},"payroll":{"dataType":"double","required":true},"sales":{"dataType":"double","required":true}},"required":true},
            "currency": {"dataType":"string","required":true},
            "generatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BalanceSheet": {
        "dataType": "refObject",
        "properties": {
            "statementId": {"dataType":"string","required":true},
            "organizationName": {"dataType":"string","required":true},
            "asOfDate": {"dataType":"string","required":true},
            "currentAssets": {"dataType":"double","required":true},
            "cash": {"dataType":"double","required":true},
            "accountsReceivable": {"dataType":"double","required":true},
            "inventory": {"dataType":"double","required":true},
            "nonCurrentAssets": {"dataType":"double","required":true},
            "propertyPlantEquipment": {"dataType":"double","required":true},
            "totalAssets": {"dataType":"double","required":true},
            "currentLiabilities": {"dataType":"double","required":true},
            "accountsPayable": {"dataType":"double","required":true},
            "shortTermDebt": {"dataType":"double","required":true},
            "nonCurrentLiabilities": {"dataType":"double","required":true},
            "longTermDebt": {"dataType":"double","required":true},
            "totalLiabilities": {"dataType":"double","required":true},
            "shareCapital": {"dataType":"double","required":true},
            "retainedEarnings": {"dataType":"double","required":true},
            "totalEquity": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "generatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CashFlowStatement": {
        "dataType": "refObject",
        "properties": {
            "statementId": {"dataType":"string","required":true},
            "organizationName": {"dataType":"string","required":true},
            "periodStart": {"dataType":"string","required":true},
            "periodEnd": {"dataType":"string","required":true},
            "cashFromOperations": {"dataType":"double","required":true},
            "netIncome": {"dataType":"double","required":true},
            "depreciation": {"dataType":"double","required":true},
            "changesInWorkingCapital": {"dataType":"double","required":true},
            "cashFromInvesting": {"dataType":"double","required":true},
            "capitalExpenditures": {"dataType":"double","required":true},
            "assetSales": {"dataType":"double","required":true},
            "cashFromFinancing": {"dataType":"double","required":true},
            "debtProceeds": {"dataType":"double","required":true},
            "debtRepayments": {"dataType":"double","required":true},
            "dividendsPaid": {"dataType":"double","required":true},
            "netCashFlow": {"dataType":"double","required":true},
            "beginningCash": {"dataType":"double","required":true},
            "endingCash": {"dataType":"double","required":true},
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
            "statementType": {"dataType":"string","required":true},
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
    "CreateBalanceSheetOfferRequest": {
        "dataType": "refObject",
        "properties": {
            "asOfDate": {"dataType":"string","required":true},
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
            "totalNssa": {"dataType":"double"},
            "totalPaye": {"dataType":"double"},
            "totalAidsLevy": {"dataType":"double"},
            "runVcId": {"dataType":"string"},
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
    "TaxCompliance": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "taxType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["NSSA"]},{"dataType":"enum","enums":["PAYE"]},{"dataType":"enum","enums":["AIDS_LEVY"]},{"dataType":"enum","enums":["ZIMRA"]}],"required":true},
            "period": {"dataType":"string","required":true},
            "amount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "filingDate": {"dataType":"string"},
            "referenceNumber": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["filed"]},{"dataType":"enum","enums":["confirmed"]},{"dataType":"enum","enums":["rejected"]}],"required":true},
            "relatedPayrollRunId": {"dataType":"string"},
            "complianceVcId": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IssueTaxComplianceRequest": {
        "dataType": "refObject",
        "properties": {
            "taxType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["NSSA"]},{"dataType":"enum","enums":["PAYE"]},{"dataType":"enum","enums":["AIDS_LEVY"]}],"required":true},
            "referenceNumber": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateTaxComplianceStatusRequest": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["filed"]},{"dataType":"enum","enums":["confirmed"]},{"dataType":"enum","enums":["rejected"]}],"required":true},
            "proofOfPaymentRef": {"dataType":"string"},
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
    "WorkflowActorDefaultRecord": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "orgTenantId": {"dataType":"string","required":true},
            "workflowType": {"dataType":"string","required":true},
            "stageAction": {"dataType":"string","required":true},
            "defaultRole": {"dataType":"string"},
            "defaultUserId": {"dataType":"string"},
            "defaultWalletTenantId": {"dataType":"string"},
            "enabled": {"dataType":"boolean","required":true},
            "createdAt": {"dataType":"string","required":true},
            "updatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgMemberActor": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
            "walletTenantId": {"dataType":"string"},
            "status": {"dataType":"string","required":true},
            "updatedAt": {"dataType":"string"},
            "displayName": {"dataType":"string"},
            "phone": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowActorDefaultBody": {
        "dataType": "refObject",
        "properties": {
            "workflowType": {"dataType":"string","required":true},
            "stageAction": {"dataType":"string","required":true},
            "defaultUserId": {"dataType":"string"},
            "defaultRole": {"dataType":"string"},
            "defaultWalletTenantId": {"dataType":"string"},
            "enabled": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceProvider": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["payment"]},{"dataType":"enum","enums":["identity"]},{"dataType":"enum","enums":["verification"]},{"dataType":"enum","enums":["notification"]},{"dataType":"enum","enums":["custom"]}],"required":true},
            "description": {"dataType":"string"},
            "baseUrl": {"dataType":"string"},
            "authType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["api_key"]},{"dataType":"enum","enums":["oauth2"]},{"dataType":"enum","enums":["basic"]},{"dataType":"enum","enums":["none"]}],"required":true},
            "configSchema": {"dataType":"any"},
            "isSystem": {"dataType":"boolean","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["inactive"]},{"dataType":"enum","enums":["deprecated"]}],"required":true},
            "createdAt": {"dataType":"datetime"},
            "updatedAt": {"dataType":"datetime"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateProviderRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["payment"]},{"dataType":"enum","enums":["identity"]},{"dataType":"enum","enums":["verification"]},{"dataType":"enum","enums":["notification"]},{"dataType":"enum","enums":["custom"]}],"required":true},
            "description": {"dataType":"string"},
            "baseUrl": {"dataType":"string"},
            "authType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["api_key"]},{"dataType":"enum","enums":["oauth2"]},{"dataType":"enum","enums":["basic"]},{"dataType":"enum","enums":["none"]}]},
            "configSchema": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Partial_CreateProviderRequest_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string"},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["payment"]},{"dataType":"enum","enums":["identity"]},{"dataType":"enum","enums":["verification"]},{"dataType":"enum","enums":["notification"]},{"dataType":"enum","enums":["custom"]}]},"description":{"dataType":"string"},"baseUrl":{"dataType":"string"},"authType":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["api_key"]},{"dataType":"enum","enums":["oauth2"]},{"dataType":"enum","enums":["basic"]},{"dataType":"enum","enums":["none"]}]},"configSchema":{"dataType":"any"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProviderConfig": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "providerId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "config": {"ref":"Record_string.any_","required":true},
            "environment": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["sandbox"]},{"dataType":"enum","enums":["production"]}],"required":true},
            "isDefault": {"dataType":"boolean","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["inactive"]}],"required":true},
            "createdAt": {"dataType":"datetime"},
            "updatedAt": {"dataType":"datetime"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateConfigRequest": {
        "dataType": "refObject",
        "properties": {
            "providerId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "config": {"ref":"Record_string.any_","required":true},
            "environment": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["sandbox"]},{"dataType":"enum","enums":["production"]}]},
            "isDefault": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Partial_CreateConfigRequest_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"providerId":{"dataType":"string"},"name":{"dataType":"string"},"config":{"ref":"Record_string.any_"},"environment":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["sandbox"]},{"dataType":"enum","enums":["production"]}]},"isDefault":{"dataType":"boolean"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SectorType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ecommerce"]},{"dataType":"enum","enums":["education"]},{"dataType":"enum","enums":["cash"]},{"dataType":"enum","enums":["field_execution"]},{"dataType":"enum","enums":["custom"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrgResponse": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
            "domain": {"dataType":"string"},
            "issuerDid": {"dataType":"string"},
            "memberCount": {"dataType":"double","required":true},
            "sector": {"ref":"SectorType"},
            "assignedTemplateId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationCategory": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["government"]},{"dataType":"enum","enums":["education"]},{"dataType":"enum","enums":["telecom"]},{"dataType":"enum","enums":["supplier"]},{"dataType":"enum","enums":["finance"]},{"dataType":"enum","enums":["healthcare"]},{"dataType":"enum","enums":["insurance"]},{"dataType":"enum","enums":["employer"]},{"dataType":"enum","enums":["logistics"]},{"dataType":"enum","enums":["other"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrgRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "domain": {"dataType":"string"},
            "category": {"ref":"OrganizationCategory"},
            "paymentRails": {"dataType":"array","array":{"dataType":"string"}},
            "workflowTypes": {"dataType":"array","array":{"dataType":"string"}},
            "sector": {"ref":"SectorType"},
            "additionalWorkflowTypes": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentSetupItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "providerId": {"dataType":"string","required":true},
            "providerName": {"dataType":"string","required":true},
            "simulated": {"dataType":"boolean","required":true},
            "environment": {"dataType":"string","required":true},
            "isDefault": {"dataType":"boolean","required":true},
            "status": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentMethodId": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ecocash"]},{"dataType":"enum","enums":["clicknpay"]},{"dataType":"enum","enums":["simulated"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentMethodChoice": {
        "dataType": "refObject",
        "properties": {
            "id": {"ref":"PaymentMethodId","required":true},
            "name": {"dataType":"string","required":true},
            "detail": {"dataType":"string","required":true},
            "selected": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SelectPaymentMethodRequest": {
        "dataType": "refObject",
        "properties": {
            "method": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["clicknpay"]},{"dataType":"enum","enums":["ecocash"]},{"dataType":"enum","enums":["simulated"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TrustedPartner": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "reference": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "isOwnOrganization": {"dataType":"boolean","required":true},
            "createdAt": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOrgPaymentRailsResponse": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "paymentRails": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOrgPaymentRailsRequest": {
        "dataType": "refObject",
        "properties": {
            "paymentRails": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOrgDiscoveryVisibilityResponse": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "isPublic": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOrgDiscoveryVisibilityRequest": {
        "dataType": "refObject",
        "properties": {
            "isPublic": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.string-Array_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"array","array":{"dataType":"string"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgProofVcPolicyResponse": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "defaultAcceptedVcTypes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "actionOverrides": {"ref":"Record_string.string-Array_","required":true},
            "updatedAt": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOrgProofVcPolicyRequest": {
        "dataType": "refObject",
        "properties": {
            "defaultAcceptedVcTypes": {"dataType":"array","array":{"dataType":"string"}},
            "actionOverrides": {"ref":"Record_string.string-Array_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgListItem": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
            "domain": {"dataType":"string"},
            "issuerDid": {"dataType":"string"},
            "memberCount": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowStepDefinition": {
        "dataType": "refObject",
        "properties": {
            "action": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "config": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialOfferMode": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["required"]},{"dataType":"enum","enums":["optional"]},{"dataType":"enum","enums":["disabled"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.CredentialOfferMode_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"ref":"CredentialOfferMode"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialPolicy": {
        "dataType": "refObject",
        "properties": {
            "outputVCs": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "autoIssue": {"dataType":"boolean","required":true},
            "vcOfferModes": {"ref":"Record_string.CredentialOfferMode_"},
            "sendOptionalOffers": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReconciliationPolicy": {
        "dataType": "refObject",
        "properties": {
            "mode": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["automatic"]},{"dataType":"enum","enums":["daily_batch"]},{"dataType":"enum","enums":["manual_close"]},{"dataType":"enum","enums":["bank_import"]}],"required":true},
            "events": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EvidencePolicy": {
        "dataType": "refObject",
        "properties": {
            "requireDeliveryPhoto": {"dataType":"boolean"},
            "requireSignature": {"dataType":"boolean"},
            "requireStudentId": {"dataType":"boolean"},
            "requireTermReference": {"dataType":"boolean"},
            "requireCashierRef": {"dataType":"boolean"},
            "requireGps": {"dataType":"boolean"},
            "requirePhoto": {"dataType":"boolean"},
            "requireAcknowledgementSignature": {"dataType":"boolean"},
            "requireApproval": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BrandingPolicy": {
        "dataType": "refObject",
        "properties": {
            "logo": {"dataType":"string"},
            "primaryColor": {"dataType":"string"},
            "receiptFooter": {"dataType":"string"},
            "supportContact": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowInitiationMode": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["none"]},{"dataType":"enum","enums":["optional"]},{"dataType":"enum","enums":["required"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowInitiationDefinition": {
        "dataType": "refObject",
        "properties": {
            "mode": {"ref":"WorkflowInitiationMode","required":true},
            "title": {"dataType":"string"},
            "description": {"dataType":"string"},
            "inputSchema": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowPrerequisiteKey": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["organization_profile"]},{"dataType":"enum","enums":["primary_admin"]},{"dataType":"enum","enums":["active_members"]},{"dataType":"enum","enums":["ssi_identity"]},{"dataType":"enum","enums":["roles"]},{"dataType":"enum","enums":["authorities"]},{"dataType":"enum","enums":["departments"]},{"dataType":"enum","enums":["trusted_issuers"]},{"dataType":"enum","enums":["verifier_registration"]},{"dataType":"enum","enums":["payment_provider"]},{"dataType":"enum","enums":["delegations"]},{"dataType":"enum","enums":["people_records"]},{"dataType":"enum","enums":["stage_actor"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowPrerequisiteRequirement": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["mandatory"]},{"dataType":"enum","enums":["conditional"]},{"dataType":"enum","enums":["recommended"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowPrerequisiteCondition": {
        "dataType": "refObject",
        "properties": {
            "field": {"dataType":"string","required":true},
            "equals": {"dataType":"any"},
            "nonEmpty": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowPrerequisite": {
        "dataType": "refObject",
        "properties": {
            "key": {"ref":"WorkflowPrerequisiteKey","required":true},
            "stageAction": {"dataType":"string"},
            "requirement": {"ref":"WorkflowPrerequisiteRequirement","required":true},
            "title": {"dataType":"string"},
            "when": {"ref":"WorkflowPrerequisiteCondition"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowTemplateDefinition": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "tenantId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "workflowType": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "sector": {"ref":"SectorType","required":true},
            "enabled": {"dataType":"boolean","required":true},
            "version": {"dataType":"double","required":true},
            "steps": {"dataType":"array","array":{"dataType":"refObject","ref":"WorkflowStepDefinition"},"required":true},
            "paymentModes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "credentialPolicy": {"ref":"CredentialPolicy","required":true},
            "reconciliationPolicy": {"ref":"ReconciliationPolicy","required":true},
            "evidencePolicy": {"ref":"EvidencePolicy","required":true},
            "brandingPolicy": {"ref":"BrandingPolicy","required":true},
            "initiation": {"ref":"WorkflowInitiationDefinition"},
            "prerequisites": {"dataType":"array","array":{"dataType":"refObject","ref":"WorkflowPrerequisite"}},
            "createdAt": {"dataType":"datetime"},
            "updatedAt": {"dataType":"datetime"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationWorkflowConfigurationResponse": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "sector": {"ref":"SectorType"},
            "templates": {"dataType":"array","array":{"dataType":"refObject","ref":"WorkflowTemplateDefinition"},"required":true},
            "workflowTypes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "workflows": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"blocking":{"dataType":"array","array":{"dataType":"string"},"required":true},"ready":{"dataType":"boolean","required":true},"name":{"dataType":"string"},"workflowType":{"dataType":"string","required":true},"templateId":{"dataType":"string"}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActivateOrgWorkflowsRequest": {
        "dataType": "refObject",
        "properties": {
            "workflowTypes": {"dataType":"array","array":{"dataType":"string"}},
            "sector": {"ref":"SectorType"},
            "additionalWorkflowTypes": {"dataType":"array","array":{"dataType":"string"}},
            "name": {"dataType":"string"},
            "paymentModes": {"dataType":"array","array":{"dataType":"string"}},
            "reconciliationPolicy": {"ref":"Record_string.unknown_"},
            "evidencePolicy": {"ref":"Record_string.unknown_"},
            "brandingPolicy": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ConfigureOrgWorkflowsRequest": {
        "dataType": "refAlias",
        "type": {"ref":"ActivateOrgWorkflowsRequest","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgKind": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["office"]},{"dataType":"enum","enums":["field"]},{"dataType":"enum","enums":["school"]},{"dataType":"enum","enums":["shop"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgSetupProfile": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "kinds": {"dataType":"array","array":{"dataType":"refAlias","ref":"OrgKind"},"required":true},
            "approvalPresetId": {"dataType":"string"},
            "approvalTitle": {"dataType":"string"},
            "paymentChoice": {"dataType":"string"},
            "answeredAt": {"dataType":"string"},
            "requestTypes": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgSetupProfileInput": {
        "dataType": "refObject",
        "properties": {
            "kinds": {"dataType":"array","array":{"dataType":"string"}},
            "approvalPresetId": {"dataType":"string"},
            "approvalTitle": {"dataType":"string"},
            "paymentChoice": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationSetupRequirement": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["mandatory"]},{"dataType":"enum","enums":["conditional"]},{"dataType":"enum","enums":["recommended"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationSetupStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ready"]},{"dataType":"enum","enums":["needs_attention"]},{"dataType":"enum","enums":["pending_external"]},{"dataType":"enum","enums":["optional"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationSetupReadinessItem": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "domain": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["core"]},{"dataType":"enum","enums":["people"]},{"dataType":"enum","enums":["authority"]},{"dataType":"enum","enums":["operations"]},{"dataType":"enum","enums":["trust"]},{"dataType":"enum","enums":["integrations"]}],"required":true},
            "requirement": {"ref":"OrganizationSetupRequirement","required":true},
            "status": {"ref":"OrganizationSetupStatus","required":true},
            "reason": {"dataType":"string"},
            "requiredFor": {"dataType":"array","array":{"dataType":"string"}},
            "stageAction": {"dataType":"string"},
            "actionPath": {"dataType":"string"},
            "askedOnFirstUse": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationSetupDomainProgress": {
        "dataType": "refObject",
        "properties": {
            "domain": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["core"]},{"dataType":"enum","enums":["people"]},{"dataType":"enum","enums":["authority"]},{"dataType":"enum","enums":["operations"]},{"dataType":"enum","enums":["trust"]},{"dataType":"enum","enums":["integrations"]}],"required":true},
            "ready": {"dataType":"double","required":true},
            "total": {"dataType":"double","required":true},
            "percent": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationWorkflowReadinessSummary": {
        "dataType": "refObject",
        "properties": {
            "templateId": {"dataType":"string"},
            "workflowType": {"dataType":"string","required":true},
            "name": {"dataType":"string"},
            "ready": {"dataType":"boolean","required":true},
            "blocking": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationSetupReadiness": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "orgName": {"dataType":"string","required":true},
            "organizationId": {"dataType":"string","required":true},
            "readinessPercent": {"dataType":"double","required":true},
            "readinessState": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ready"]},{"dataType":"enum","enums":["in_progress"]},{"dataType":"enum","enums":["blocked"]}],"required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"OrganizationSetupReadinessItem"},"required":true},
            "domains": {"dataType":"array","array":{"dataType":"refObject","ref":"OrganizationSetupDomainProgress"},"required":true},
            "nextActions": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "workflows": {"dataType":"array","array":{"dataType":"refObject","ref":"OrganizationWorkflowReadinessSummary"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgWorkflowActorMode": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["configured_user"]},{"dataType":"enum","enums":["configured_wallet"]},{"dataType":"enum","enums":["configured_role"]},{"dataType":"enum","enums":["shared_finance"]},{"dataType":"enum","enums":["policy_fallback"]},{"dataType":"enum","enums":["role_fallback"]},{"dataType":"enum","enums":["owner_fallback"]},{"dataType":"enum","enums":["unassigned"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActorFallbackEntry": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["role"]},{"dataType":"enum","enums":["wallet"]}],"required":true},
            "value": {"dataType":"string","required":true},
            "label": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResolvedOrgWorkflowActor": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string"},
            "walletTenantId": {"dataType":"string"},
            "role": {"dataType":"string","required":true},
            "mode": {"ref":"OrgWorkflowActorMode","required":true},
            "via": {"ref":"ActorFallbackEntry"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageActorCredentialView": {
        "dataType": "refObject",
        "properties": {
            "state": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["accepted"]},{"dataType":"enum","enums":["offered"]},{"dataType":"enum","enums":["not_offered"]},{"dataType":"enum","enums":["not_applicable"]}],"required":true},
            "offeredAt": {"dataType":"string"},
            "acceptedAt": {"dataType":"string"},
            "stageActions": {"dataType":"array","array":{"dataType":"string"}},
            "stale": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowStageActorView": {
        "dataType": "refObject",
        "properties": {
            "stageAction": {"dataType":"string","required":true},
            "title": {"dataType":"string"},
            "requirement": {"dataType":"string","required":true},
            "actor": {"ref":"ResolvedOrgWorkflowActor","required":true},
            "actorDescription": {"dataType":"string","required":true},
            "needsAssignment": {"dataType":"boolean","required":true},
            "moneyStep": {"dataType":"boolean","required":true},
            "askedOnFirstUse": {"dataType":"boolean","required":true},
            "default": {"ref":"WorkflowActorDefaultRecord"},
            "builtInRoles": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "stageChain": {"dataType":"array","array":{"dataType":"refObject","ref":"ActorFallbackEntry"},"required":true},
            "credential": {"ref":"StageActorCredentialView","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.ActorFallbackEntry-Array_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"array","array":{"dataType":"refObject","ref":"ActorFallbackEntry"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageSignMode": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one"]},{"dataType":"enum","enums":["both"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.StageSignMode_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"ref":"StageSignMode"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgWorkflowActorPolicy": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "stageChains": {"ref":"Record_string.ActorFallbackEntry-Array_","required":true},
            "defaultChain": {"dataType":"array","array":{"dataType":"refObject","ref":"ActorFallbackEntry"},"required":true},
            "useBuiltInRoleFallbacks": {"dataType":"boolean","required":true},
            "ownerFallbackEnabled": {"dataType":"boolean","required":true},
            "signGroups": {"ref":"Record_string.StageSignMode_","required":true},
            "updatedAt": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_ActorPreset.id-or-title-or-detail-or-signMode_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"id":{"dataType":"string","required":true},"title":{"dataType":"string","required":true},"detail":{"dataType":"string","required":true},"signMode":{"ref":"StageSignMode","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowActorsView": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "workflows": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"stages":{"dataType":"array","array":{"dataType":"refObject","ref":"WorkflowStageActorView"},"required":true},"name":{"dataType":"string"},"workflowType":{"dataType":"string","required":true},"templateId":{"dataType":"string"}}},"required":true},
            "members": {"dataType":"array","array":{"dataType":"refObject","ref":"OrgMemberActor"},"required":true},
            "roles": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "policy": {"ref":"OrgWorkflowActorPolicy","required":true},
            "presets": {"dataType":"array","array":{"dataType":"refAlias","ref":"Pick_ActorPreset.id-or-title-or-detail-or-signMode_"},"required":true},
            "canEdit": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowActorDefaultInput": {
        "dataType": "refObject",
        "properties": {
            "workflowType": {"dataType":"string","required":true},
            "stageAction": {"dataType":"string","required":true},
            "defaultUserId": {"dataType":"string"},
            "defaultRole": {"dataType":"string"},
            "defaultWalletTenantId": {"dataType":"string"},
            "enabled": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Partial_Omit_OrgWorkflowActorPolicy.orgTenantId-or-updatedAt__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"stageChains":{"ref":"Record_string.ActorFallbackEntry-Array_"},"defaultChain":{"dataType":"array","array":{"dataType":"refObject","ref":"ActorFallbackEntry"}},"useBuiltInRoleFallbacks":{"dataType":"boolean"},"ownerFallbackEnabled":{"dataType":"boolean"},"signGroups":{"ref":"Record_string.StageSignMode_"}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgWorkflowActorPolicyPatch": {
        "dataType": "refAlias",
        "type": {"ref":"Partial_Omit_OrgWorkflowActorPolicy.orgTenantId-or-updatedAt__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApplyActorPresetRequest": {
        "dataType": "refObject",
        "properties": {
            "presetId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandoffStartMode": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["auto"]},{"dataType":"enum","enums":["manual"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandoffStageOption": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "label": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowHandoffSetting": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
            "kind": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["job"]},{"dataType":"enum","enums":["request"]}],"required":true},
            "label": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "from": {"dataType":"string","required":true},
            "fromLabel": {"dataType":"string","required":true},
            "to": {"dataType":"string","required":true},
            "toLabel": {"dataType":"string","required":true},
            "holdParent": {"dataType":"boolean","required":true},
            "startMode": {"ref":"HandoffStartMode","required":true},
            "requiredStages": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "stageOptions": {"dataType":"array","array":{"dataType":"refObject","ref":"HandoffStageOption"},"required":true},
            "enabled": {"dataType":"boolean","required":true},
            "source": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["built_in"]},{"dataType":"enum","enums":["custom"]}],"required":true},
            "conditionLabel": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowHandoffPatch": {
        "dataType": "refObject",
        "properties": {
            "startMode": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["auto"]},{"dataType":"enum","enums":["manual"]}]},
            "requiredStages": {"dataType":"array","array":{"dataType":"string"}},
            "enabled": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AssignUnassignedStagesResult": {
        "dataType": "refObject",
        "properties": {
            "assigned": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"stageAction":{"dataType":"string","required":true},"workflowType":{"dataType":"string","required":true}}},"required":true},
            "skipped": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string","required":true},"stageAction":{"dataType":"string","required":true},"workflowType":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AssignUnassignedStagesInput": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string"},
            "role": {"dataType":"string"},
            "workflowType": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferWorkflowActorCredentialsResult": {
        "dataType": "refObject",
        "properties": {
            "offered": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"role":{"dataType":"string"},"userId":{"dataType":"string"},"stageActions":{"dataType":"array","array":{"dataType":"string"},"required":true},"workflowType":{"dataType":"string","required":true}}},"required":true},
            "alreadyCovered": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"outcome":{"dataType":"string","required":true},"role":{"dataType":"string"},"userId":{"dataType":"string"},"stageActions":{"dataType":"array","array":{"dataType":"string"},"required":true},"workflowType":{"dataType":"string","required":true}}},"required":true},
            "skipped": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string"},"stageActions":{"dataType":"array","array":{"dataType":"string"},"required":true},"workflowType":{"dataType":"string","required":true}}},"required":true},
            "failed": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string"},"stageActions":{"dataType":"array","array":{"dataType":"string"},"required":true},"workflowType":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferWorkflowActorCredentialsInput": {
        "dataType": "refObject",
        "properties": {
            "workflowType": {"dataType":"string"},
            "force": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowReadinessDomain": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["core"]},{"dataType":"enum","enums":["people"]},{"dataType":"enum","enums":["authority"]},{"dataType":"enum","enums":["operations"]},{"dataType":"enum","enums":["trust"]},{"dataType":"enum","enums":["integrations"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowReadinessStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ready"]},{"dataType":"enum","enums":["needs_attention"]},{"dataType":"enum","enums":["pending_external"]},{"dataType":"enum","enums":["optional"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowReadinessItem": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "domain": {"ref":"WorkflowReadinessDomain","required":true},
            "requirement": {"ref":"WorkflowPrerequisiteRequirement","required":true},
            "status": {"ref":"WorkflowReadinessStatus","required":true},
            "reason": {"dataType":"string"},
            "requiredFor": {"dataType":"array","array":{"dataType":"string"}},
            "stageAction": {"dataType":"string"},
            "configurableBy": {"dataType":"enum","enums":["owner_admin"],"required":true},
            "actionPath": {"dataType":"string"},
            "askedOnFirstUse": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TemplateReadinessReport": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string","required":true},
            "templateId": {"dataType":"string"},
            "workflowType": {"dataType":"string","required":true},
            "templateName": {"dataType":"string"},
            "ready": {"dataType":"boolean","required":true},
            "blocking": {"dataType":"array","array":{"dataType":"refObject","ref":"WorkflowReadinessItem"},"required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"WorkflowReadinessItem"},"required":true},
            "configured": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SwitchOrgResponse": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
            "orgTenantId": {"dataType":"string","required":true},
            "orgName": {"dataType":"string"},
            "orgRole": {"dataType":"string","required":true},
            "sector": {"dataType":"string"},
            "workflowTypes": {"dataType":"array","array":{"dataType":"string"}},
            "workflows": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"blocking":{"dataType":"array","array":{"dataType":"string"},"required":true},"ready":{"dataType":"boolean","required":true},"name":{"dataType":"string"},"workflowType":{"dataType":"string","required":true},"templateId":{"dataType":"string"}}}},
            "readinessState": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ready"]},{"dataType":"enum","enums":["in_progress"]},{"dataType":"enum","enums":["blocked"]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgMemberItem": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
            "displayName": {"dataType":"string"},
            "phone": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InviteMemberRequest": {
        "dataType": "refObject",
        "properties": {
            "targetUserId": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateMemberRoleRequest": {
        "dataType": "refObject",
        "properties": {
            "role": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InviteMemberByPhoneRequest": {
        "dataType": "refObject",
        "properties": {
            "phone": {"dataType":"string","required":true},
            "role": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DepartmentItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "code": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "memberCount": {"dataType":"double"},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDepartmentRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "code": {"dataType":"string"},
            "description": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthorityItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
            "domain": {"dataType":"string","required":true},
            "thresholdAmount": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "status": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GrantAuthorityRequest": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "role": {"dataType":"string","required":true},
            "domain": {"dataType":"string","required":true},
            "thresholdAmount": {"dataType":"double"},
            "currency": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RoleItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "permissions": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateRoleRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "permissions": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DelegationItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "delegatorUserId": {"dataType":"string","required":true},
            "delegateUserId": {"dataType":"string","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "maxAmount": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "validFrom": {"dataType":"string","required":true},
            "validUntil": {"dataType":"string"},
            "status": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDelegationRequest": {
        "dataType": "refObject",
        "properties": {
            "delegatorUserId": {"dataType":"string","required":true},
            "delegateUserId": {"dataType":"string","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "maxAmount": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "validFrom": {"dataType":"string","required":true},
            "validUntil": {"dataType":"string"},
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
            "category": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
            "catalogItemVcOffer": {"dataType":"nestedObjectLiteral","nestedProperties":{"credentialType":{"dataType":"array","array":{"dataType":"string"},"required":true},"expiresAt":{"dataType":"string","required":true},"credential_offer_deeplink":{"dataType":"string","required":true},"credential_offer_uri":{"dataType":"string","required":true},"offerId":{"dataType":"string","required":true}}},
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
            "category": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShortlinkResponse": {
        "dataType": "refObject",
        "properties": {
            "code": {"dataType":"string","required":true},
            "url": {"dataType":"string","required":true},
            "expiresAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateShortlinkRequest": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["credential"]},{"dataType":"enum","enums":["receipt"]},{"dataType":"enum","enums":["verification"]}],"required":true},
            "targetId": {"dataType":"string","required":true},
            "metadata": {"ref":"Record_string.any_"},
            "ttlHours": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResolveResponse": {
        "dataType": "refObject",
        "properties": {
            "valid": {"dataType":"boolean","required":true},
            "type": {"dataType":"string"},
            "targetId": {"dataType":"string"},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"Record_string.any_"},{"dataType":"enum","enums":[null]}]},
            "expiresAt": {"dataType":"string"},
            "verificationUrl": {"dataType":"string"},
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
    "Did": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SupportedKeyType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Ed25519"]},{"dataType":"enum","enums":["Bls12381g2"]},{"dataType":"enum","enums":["P-256"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidDocument": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.any_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCreate": {
        "dataType": "refObject",
        "properties": {
            "keyType": {"ref":"SupportedKeyType"},
            "seed": {"dataType":"string"},
            "domain": {"dataType":"string"},
            "method": {"dataType":"string","required":true},
            "did": {"dataType":"string"},
            "role": {"dataType":"string"},
            "endorserDid": {"dataType":"string"},
            "didDocument": {"ref":"DidDocument"},
        },
        "additionalProperties": false,
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
    "WhatsAppWebhookPayload": {
        "dataType": "refObject",
        "properties": {
            "object": {"dataType":"string","required":true},
            "entry": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"changes":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"field":{"dataType":"string","required":true},"value":{"dataType":"nestedObjectLiteral","nestedProperties":{"messages":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"interactive":{"dataType":"nestedObjectLiteral","nestedProperties":{"button_reply":{"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"type":{"dataType":"string","required":true}}},"text":{"dataType":"nestedObjectLiteral","nestedProperties":{"body":{"dataType":"string","required":true}}},"type":{"dataType":"string","required":true},"timestamp":{"dataType":"string","required":true},"id":{"dataType":"string","required":true},"from":{"dataType":"string","required":true}}}},"contacts":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"wa_id":{"dataType":"string","required":true},"profile":{"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string","required":true}},"required":true}}}},"metadata":{"dataType":"nestedObjectLiteral","nestedProperties":{"phone_number_id":{"dataType":"string","required":true},"display_phone_number":{"dataType":"string","required":true}},"required":true},"messaging_product":{"dataType":"string","required":true}},"required":true}}},"required":true},"id":{"dataType":"string","required":true}}},"required":true},
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
            "invoiceOfferId": {"dataType":"string"},
            "ecocashRef": {"dataType":"string"},
            "paymentInstructions": {"dataType":"string"},
            "sandbox": {"dataType":"boolean"},
            "message": {"dataType":"string","required":true},
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
            "customerMsisdn": {"dataType":"string"},
            "timestamp": {"dataType":"string"},
            "metadata": {"dataType":"any"},
        },
        "additionalProperties": false,
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
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"signature":{"dataType":"string","required":true},"publicKeyBase58":{"dataType":"string","required":true},"keyType":{"ref":"SupportedKeyType","required":true},"data":{"dataType":"string","required":true}},"validators":{}},
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
    "CredentialDefinitionStoreRecord": {
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
    "SSIRegisterResponse": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string","required":true},
            "walletId": {"dataType":"string","required":true},
            "token": {"dataType":"string","required":true},
            "claimedExisting": {"dataType":"boolean","required":true},
            "vcOfferUrl": {"dataType":"string"},
            "vcOfferAutoAccepted": {"dataType":"boolean"},
            "existingCredentialsCount": {"dataType":"double"},
            "retroactiveReceiptsQueued": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SSIRegisterRequest": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "phone": {"dataType":"string"},
            "email": {"dataType":"string"},
            "pin": {"dataType":"string"},
            "claimExistingTenantId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ScopedSessionResponse": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
            "expiresIn": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SSILoginChallengeResponse": {
        "dataType": "refObject",
        "properties": {
            "nonce": {"dataType":"string","required":true},
            "expiresAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginResponse": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "displayName": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VCLoginRequest": {
        "dataType": "refObject",
        "properties": {
            "vcJwt": {"dataType":"string","required":true},
            "nonce": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PinLoginRequest": {
        "dataType": "refObject",
        "properties": {
            "phone": {"dataType":"string"},
            "email": {"dataType":"string"},
            "pin": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SessionInfo": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "did": {"dataType":"string","required":true},
            "expiresAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["valid"]},{"dataType":"enum","enums":["suspended"]},{"dataType":"enum","enums":["revoked"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["unknown"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SsiEvidenceInput": {
        "dataType": "refObject",
        "properties": {
            "credentialType": {"dataType":"string","required":true},
            "issuerRef": {"dataType":"string"},
            "status": {"ref":"CredentialStatus","required":true},
            "isTrustedIssuer": {"dataType":"boolean","required":true},
            "credentialReferenceId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PlatformPresentationVerificationResult": {
        "dataType": "refObject",
        "properties": {
            "resultId": {"dataType":"string","required":true},
            "verified": {"dataType":"boolean","required":true},
            "credentialCount": {"dataType":"double","required":true},
            "reasonCode": {"dataType":"string","required":true},
            "statusChecked": {"dataType":"boolean","required":true},
            "evidenceDigest": {"dataType":"string","required":true},
            "ssiEvidence": {"dataType":"array","array":{"dataType":"refObject","ref":"SsiEvidenceInput"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PendingOffer": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "sourceId": {"dataType":"string"},
            "issuerName": {"dataType":"string","required":true},
            "credentialType": {"dataType":"string","required":true},
            "offerUri": {"dataType":"string","required":true},
            "createdAt": {"dataType":"string"},
            "sourceType": {"dataType":"string"},
            "workflowRunId": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["retrying"]},{"dataType":"enum","enums":["accepted"]},{"dataType":"enum","enums":["resolved"]}]},
            "attemptCount": {"dataType":"double"},
            "lastAttemptAt": {"dataType":"string"},
            "lastError": {"dataType":"string"},
            "title": {"dataType":"string"},
            "body": {"dataType":"string"},
            "claims": {"ref":"Record_string.any_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PendingReceipt": {
        "dataType": "refObject",
        "properties": {
            "receiptRowId": {"dataType":"string","required":true},
            "paymentId": {"dataType":"string"},
            "sourceId": {"dataType":"string"},
            "credentialType": {"dataType":"string","required":true},
            "offerUri": {"dataType":"string","required":true},
            "sourceType": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["retrying"]},{"dataType":"enum","enums":["accepted"]},{"dataType":"enum","enums":["resolved"]}]},
            "amount": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "merchant": {"dataType":"string"},
            "merchantName": {"dataType":"string"},
            "paymentLinkId": {"dataType":"string"},
            "invoiceRef": {"dataType":"string"},
            "quoteId": {"dataType":"string"},
            "paymentUrl": {"dataType":"string"},
            "metadata": {"ref":"Record_string.any_"},
            "issuedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthContext": {
        "dataType": "refEnum",
        "enums": ["org","personal"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WalletAuthContext": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"AuthContext"},{"dataType":"enum","enums":["unknown"]}],"validators":{}},
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
    "TrustEngineScore": {
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
    "TrustEngineEvent": {
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
    "RegisterRequest": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "email": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "pin": {"dataType":"string"},
            "tenantType": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["USER"]},{"dataType":"enum","enums":["ORG"]}]},
            "domain": {"dataType":"string"},
            "claimExistingTenant": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginRequest": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string"},
            "email": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "pin": {"dataType":"string"},
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
    "TemplateListItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "category": {"dataType":"string","required":true},
            "industry": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "triggerTypes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "outputVCs": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TemplateDetail": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "category": {"dataType":"string","required":true},
            "industry": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "triggerTypes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "outputVCs": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "inputSchema": {"ref":"Record_string.unknown_","required":true},
            "steps": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"description":{"dataType":"string","required":true},"action":{"dataType":"string","required":true}}},"required":true},
            "configurable": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"default":{"dataType":"any"},"options":{"dataType":"array","array":{"dataType":"string"}},"type":{"dataType":"string","required":true},"label":{"dataType":"string","required":true},"field":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InstantiateTemplateResponse": {
        "dataType": "refObject",
        "properties": {
            "workflowId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "templateId": {"dataType":"string","required":true},
            "actions": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"config":{"ref":"Record_string.unknown_","required":true},"action":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InstantiateTemplateRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "tenantId": {"dataType":"string","required":true},
            "config": {"ref":"Record_string.unknown_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowExecutionResult": {
        "dataType": "refObject",
        "properties": {
            "runId": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["running"]},{"dataType":"enum","enums":["failed"]}],"required":true},
            "output": {"dataType":"any"},
            "error": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ExecuteWorkflowRequest": {
        "dataType": "refObject",
        "properties": {
            "async": {"dataType":"boolean"},
            "triggerRef": {"dataType":"string"},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageProofStage": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["acknowledgement"]},{"dataType":"enum","enums":["payout"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageProofRequestResponse": {
        "dataType": "refObject",
        "properties": {
            "runId": {"dataType":"string","required":true},
            "stage": {"ref":"StageProofStage","required":true},
            "requestId": {"dataType":"string","required":true},
            "presentationRequestUrl": {"dataType":"string","required":true},
            "verifierDid": {"dataType":"string","required":true},
            "acceptedVcTypes": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageProofRequestBody": {
        "dataType": "refObject",
        "properties": {
            "stage": {"ref":"StageProofStage","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageProofCompleteBody": {
        "dataType": "refObject",
        "properties": {
            "stage": {"ref":"StageProofStage","required":true},
            "requestId": {"dataType":"string","required":true},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StageProofEmbeddedWalletBody": {
        "dataType": "refObject",
        "properties": {
            "stage": {"ref":"StageProofStage","required":true},
            "requestId": {"dataType":"string","required":true},
            "notes": {"dataType":"string"},
            "presentationRequestUrl": {"dataType":"string","required":true},
            "walletId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandoffInputField": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "label": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["text"]},{"dataType":"enum","enums":["number"]}],"required":true},
            "required": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AvailableHandoff": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
            "label": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "holdParent": {"dataType":"boolean","required":true},
            "startMode": {"ref":"HandoffStartMode","required":true},
            "fields": {"dataType":"array","array":{"dataType":"refObject","ref":"HandoffInputField"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandoffChildKind": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["run"]},{"dataType":"enum","enums":["request"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandoffLinkStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["running"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["failed"]},{"dataType":"enum","enums":["cancelled"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HandoffLink": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "key": {"dataType":"string","required":true},
            "label": {"dataType":"string","required":true},
            "childKind": {"ref":"HandoffChildKind","required":true},
            "childId": {"dataType":"string","required":true},
            "holdParent": {"dataType":"boolean","required":true},
            "status": {"ref":"HandoffLinkStatus","required":true},
            "startedBy": {"dataType":"string"},
            "startedAt": {"dataType":"string"},
            "finishedAt": {"dataType":"string"},
            "result": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RunHandoffsView": {
        "dataType": "refObject",
        "properties": {
            "available": {"dataType":"array","array":{"dataType":"refObject","ref":"AvailableHandoff"},"required":true},
            "active": {"dataType":"array","array":{"dataType":"refObject","ref":"HandoffLink"},"required":true},
            "waitingFor": {"dataType":"array","array":{"dataType":"refObject","ref":"HandoffLink"},"required":true},
            "completedStages": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StartHandoffBody": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
            "input": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegisterWorkflowRequest": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "category": {"dataType":"string","required":true},
            "provider": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "inputSchema": {"dataType":"any"},
            "actions": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"config":{"dataType":"any"},"action":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TriggerResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "workflowId": {"dataType":"string","required":true},
            "tenantId": {"dataType":"string","required":true},
            "triggerType": {"dataType":"string","required":true},
            "isActive": {"dataType":"boolean","required":true},
            "webhookUrl": {"dataType":"string"},
            "lastTriggeredAt": {"dataType":"string"},
            "createdAt": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"string"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateWebhookTriggerRequest": {
        "dataType": "refObject",
        "properties": {
            "workflowId": {"dataType":"string","required":true},
            "name": {"dataType":"string"},
            "config": {"dataType":"nestedObjectLiteral","nestedProperties":{"requiredFields":{"dataType":"array","array":{"dataType":"string"}},"inputMapping":{"ref":"Record_string.string_"},"secretKey":{"dataType":"string"}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateScheduleTriggerRequest": {
        "dataType": "refObject",
        "properties": {
            "workflowId": {"dataType":"string","required":true},
            "name": {"dataType":"string"},
            "config": {"dataType":"nestedObjectLiteral","nestedProperties":{"inputData":{"ref":"Record_string.any_"},"timezone":{"dataType":"string"},"cronExpression":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateEventTriggerRequest": {
        "dataType": "refObject",
        "properties": {
            "workflowId": {"dataType":"string","required":true},
            "name": {"dataType":"string"},
            "config": {"dataType":"nestedObjectLiteral","nestedProperties":{"inputMapping":{"ref":"Record_string.string_"},"sourceFilter":{"dataType":"string"},"eventType":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WebhookExecutionResponse": {
        "dataType": "refObject",
        "properties": {
            "runId": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "triggerId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EmitEventRequest": {
        "dataType": "refObject",
        "properties": {
            "eventType": {"dataType":"string","required":true},
            "data": {"ref":"Record_string.any_","required":true},
            "source": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Pick_CreatePlatformRequestInput.Exclude_keyofCreatePlatformRequestInput.tenantId-or-subjectRef__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"description":{"dataType":"string"},"title":{"dataType":"string","required":true},"requestType":{"dataType":"string","required":true},"amount":{"dataType":"double"},"currency":{"dataType":"string"},"priority":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["low"]},{"dataType":"enum","enums":["normal"]},{"dataType":"enum","enums":["high"]},{"dataType":"enum","enums":["urgent"]}]},"targetModule":{"dataType":"string"},"context":{"ref":"Record_string.unknown_"},"items":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"metadata":{"ref":"Record_string.unknown_"},"itemType":{"dataType":"string"},"unitPrice":{"dataType":"double"},"quantity":{"dataType":"double"},"description":{"dataType":"string","required":true}}}}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Omit_CreatePlatformRequestInput.tenantId-or-subjectRef_": {
        "dataType": "refAlias",
        "type": {"ref":"Pick_CreatePlatformRequestInput.Exclude_keyofCreatePlatformRequestInput.tenantId-or-subjectRef__","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RequestStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["draft"]},{"dataType":"enum","enums":["submitted"]},{"dataType":"enum","enums":["in_review"]},{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["rejected"]},{"dataType":"enum","enums":["in_fulfilment"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["cancelled"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SpawnedRequest": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "requestType": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
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
    "DidCommAutoAcceptProof": {
        "dataType": "refEnum",
        "enums": ["always","contentApproved","never"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AutoAcceptProof": {
        "dataType": "refAlias",
        "type": {"ref":"DidCommAutoAcceptProof","validators":{}},
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
    "ThreadId": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCommCredentialState": {
        "dataType": "refEnum",
        "enums": ["proposal-sent","proposal-received","offer-sent","offer-received","declined","request-sent","request-received","credential-issued","credential-received","done","abandoned"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCommCredentialRole": {
        "dataType": "refEnum",
        "enums": ["issuer","holder"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProtocolVersion": {
        "dataType": "refEnum",
        "enums": ["v1","v2"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCommAutoAcceptCredential": {
        "dataType": "refEnum",
        "enums": ["always","contentApproved","never"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AutoAcceptCredential": {
        "dataType": "refAlias",
        "type": {"ref":"DidCommAutoAcceptCredential","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProposeCredentialOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"ref":"ProtocolVersion","required":true},
            "credentialFormats": {"dataType":"any","required":true},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
            "connectionId": {"ref":"RecordId","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptCredentialProposalOptions": {
        "dataType": "refObject",
        "properties": {
            "credentialRecordId": {"dataType":"string","required":true},
            "credentialFormats": {"dataType":"any"},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOfferOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"ref":"ProtocolVersion","required":true},
            "connectionId": {"ref":"RecordId","required":true},
            "credentialFormats": {"dataType":"any","required":true},
            "autoAcceptCredential": {"ref":"AutoAcceptCredential"},
            "comment": {"dataType":"string"},
            "goalCode": {"dataType":"string"},
            "goal": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOfferOobOptions": {
        "dataType": "refObject",
        "properties": {
            "protocolVersion": {"dataType":"string","required":true},
            "credentialFormats": {"dataType":"any","required":true},
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
    "DidCommCredentialFormatPayload_CredentialFormats.acceptOffer_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormats.acceptOffer_": {
        "dataType": "refAlias",
        "type": {"ref":"DidCommCredentialFormatPayload_CredentialFormats.acceptOffer_","validators":{}},
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
    "DidCommCredentialFormatPayload_CredentialFormats.acceptRequest_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialFormatPayload_CredentialFormats.acceptRequest_": {
        "dataType": "refAlias",
        "type": {"ref":"DidCommCredentialFormatPayload_CredentialFormats.acceptRequest_","validators":{}},
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
    "DidCommDidExchangeState": {
        "dataType": "refEnum",
        "enums": ["start","invitation-sent","invitation-received","request-sent","request-received","response-sent","response-received","abandoned","completed"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DidCommBasicMessageRecord": {
        "dataType": "refAlias",
        "type": {"ref":"Record_string.unknown_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_content.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"content":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RequisitionItem": {
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
    "RequisitionRequest": {
        "dataType": "refObject",
        "properties": {
            "orgTenantId": {"dataType":"string"},
            "assignToUserId": {"dataType":"string"},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"RequisitionItem"},"required":true},
            "totalAmount": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "department": {"dataType":"string","required":true},
            "vendor": {"dataType":"string"},
            "paymentMethod": {"dataType":"string"},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApproveRequest": {
        "dataType": "refObject",
        "properties": {
            "vpToken": {"dataType":"string"},
            "idToken": {"dataType":"string"},
            "approvalSignature": {"dataType":"string"},
            "requestId": {"dataType":"string","required":true},
            "state": {"dataType":"string"},
            "presentationSubmission": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApprovalPresentationRequestResponse": {
        "dataType": "refObject",
        "properties": {
            "requisitionId": {"dataType":"string","required":true},
            "requestId": {"dataType":"string","required":true},
            "presentationRequestUrl": {"dataType":"string","required":true},
            "verifierDid": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReleaseRequest": {
        "dataType": "refObject",
        "properties": {
            "amount": {"dataType":"double"},
            "currency": {"dataType":"string"},
            "description": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VpPresentationRequestResponse": {
        "dataType": "refObject",
        "properties": {
            "requisitionId": {"dataType":"string","required":true},
            "requestId": {"dataType":"string","required":true},
            "presentationRequestUrl": {"dataType":"string","required":true},
            "verifierDid": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AckRequest": {
        "dataType": "refObject",
        "properties": {
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowRequestResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "requesterTenantId": {"dataType":"string","required":true},
            "targetOrgTenantId": {"dataType":"string","required":true},
            "contactName": {"dataType":"string"},
            "requestType": {"dataType":"string","required":true},
            "workflowType": {"dataType":"string"},
            "workflowId": {"dataType":"string"},
            "payload": {"ref":"Record_string.unknown_","required":true},
            "status": {"dataType":"string","required":true},
            "responseVcId": {"dataType":"string"},
            "rejectionReason": {"dataType":"string"},
            "assigneeUserId": {"dataType":"string"},
            "assigneeWalletTenantId": {"dataType":"string"},
            "assigneeRole": {"dataType":"string"},
            "assignedAt": {"dataType":"string"},
            "assignmentMode": {"dataType":"string"},
            "createdAt": {"dataType":"string","required":true},
            "updatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowRequestType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["quote"]},{"dataType":"enum","enums":["invoice"]},{"dataType":"enum","enums":["vc_issuance"]},{"dataType":"enum","enums":["service"]},{"dataType":"enum","enums":["requisition"]},{"dataType":"enum","enums":["payment_link"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateRequestBody": {
        "dataType": "refObject",
        "properties": {
            "contactId": {"dataType":"string","required":true},
            "requestType": {"ref":"WorkflowRequestType","required":true},
            "workflowType": {"dataType":"string"},
            "payload": {"ref":"Record_string.unknown_","required":true},
            "expiresInDays": {"dataType":"double"},
            "assignToUserId": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContactCapabilityResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "contactId": {"dataType":"string","required":true},
            "orgTenantId": {"dataType":"string","required":true},
            "capabilityType": {"dataType":"string","required":true},
            "vcTypes": {"dataType":"array","array":{"dataType":"string"}},
            "enabled": {"dataType":"boolean","required":true},
            "metadata": {"ref":"Record_string.unknown_","required":true},
            "createdAt": {"dataType":"string","required":true},
            "updatedAt": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddContactCapabilityBody": {
        "dataType": "refObject",
        "properties": {
            "capabilityType": {"dataType":"string","required":true},
            "vcTypes": {"dataType":"array","array":{"dataType":"string"}},
            "enabled": {"dataType":"boolean"},
            "metadata": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WorkflowRequestStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["rejected"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]},{"dataType":"enum","enums":["expired"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApproveRequestBody": {
        "dataType": "refObject",
        "properties": {
            "approverId": {"dataType":"string"},
            "approverRole": {"dataType":"string"},
            "executeWorkflow": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RejectRequestBody": {
        "dataType": "refObject",
        "properties": {
            "reason": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EvidenceCaptureResponse": {
        "dataType": "refObject",
        "properties": {
            "providerRef": {"dataType":"string","required":true},
            "runId": {"dataType":"string","required":true},
            "status": {"dataType":"enum","enums":["completed"],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EvidenceCaptureRequest": {
        "dataType": "refObject",
        "properties": {
            "imageBase64": {"dataType":"string","required":true},
            "mimeType": {"dataType":"string","required":true},
            "gpsLat": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "gpsLng": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "timestamp": {"dataType":"string","required":true},
            "sha256": {"dataType":"string","required":true},
            "notes": {"dataType":"string","required":true},
            "providerRef": {"dataType":"string"},
            "workflowLabel": {"dataType":"string"},
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


    
        const argsAuditController_getLogs: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                limit: {"default":100,"in":"query","name":"limit","dataType":"double"},
                resourceId: {"in":"query","name":"resourceId","dataType":"string"},
        };
        app.get('/api/audit/logs',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuditController)),
            ...(fetchMiddlewares<RequestHandler>(AuditController.prototype.getLogs)),

            async function AuditController_getLogs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuditController_getLogs, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuditController>(AuditController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getLogs',
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
        const argsAuditController_verifyChain: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                credentialId: {"in":"path","name":"credentialId","required":true,"dataType":"string"},
        };
        app.get('/api/audit/chain/:credentialId',
            ...(fetchMiddlewares<RequestHandler>(AuditController)),
            ...(fetchMiddlewares<RequestHandler>(AuditController.prototype.verifyChain)),

            async function AuditController_verifyChain(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuditController_verifyChain, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AuditController>(AuditController);
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
        const argsReceiptController_confirmDelivery: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"allowPending":{"dataType":"boolean"},"transactionId":{"dataType":"string","required":true}}},
        };
        app.post('/api/receipts/confirm-delivery',
            ...(fetchMiddlewares<RequestHandler>(ReceiptController)),
            ...(fetchMiddlewares<RequestHandler>(ReceiptController.prototype.confirmDelivery)),

            async function ReceiptController_confirmDelivery(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReceiptController_confirmDelivery, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReceiptController>(ReceiptController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'confirmDelivery',
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
            authenticateMiddleware([{"apiKey":[]},{"jwt":["Basewallet"]}]),
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
        const argsOperationsController_reofferLeaveApproval: Record<string, TsoaRoute.ParameterSchema> = {
                leaveId: {"in":"path","name":"leaveId","required":true,"dataType":"string"},
        };
        app.post('/api/operations/leave/:leaveId/reoffer',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.reofferLeaveApproval)),

            async function OperationsController_reofferLeaveApproval(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_reofferLeaveApproval, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reofferLeaveApproval',
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
        const argsOperationsController_reofferExpenseApproval: Record<string, TsoaRoute.ParameterSchema> = {
                claimId: {"in":"path","name":"claimId","required":true,"dataType":"string"},
        };
        app.post('/api/operations/expenses/:claimId/reoffer',
            ...(fetchMiddlewares<RequestHandler>(OperationsController)),
            ...(fetchMiddlewares<RequestHandler>(OperationsController.prototype.reofferExpenseApproval)),

            async function OperationsController_reofferExpenseApproval(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOperationsController_reofferExpenseApproval, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OperationsController>(OperationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reofferExpenseApproval',
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
        const argsOnboardingController_reofferContract: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.post('/api/onboarding/:id/reoffer',
            ...(fetchMiddlewares<RequestHandler>(OnboardingController)),
            ...(fetchMiddlewares<RequestHandler>(OnboardingController.prototype.reofferContract)),

            async function OnboardingController_reofferContract(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOnboardingController_reofferContract, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OnboardingController>(OnboardingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reofferContract',
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
            authenticateMiddleware([{"apiKey":[]}]),
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
        const argsInventoryController_getProfitAnalytics: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/inventory/analytics/profit',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.getProfitAnalytics)),

            async function InventoryController_getProfitAnalytics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_getProfitAnalytics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getProfitAnalytics',
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
        const argsInventoryController_buyItem: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"priceOverride":{"dataType":"double"},"quantity":{"dataType":"double","required":true},"lotId":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/inventory/buy',
            authenticateMiddleware([{"apiKey":[]}]),
            ...(fetchMiddlewares<RequestHandler>(InventoryController)),
            ...(fetchMiddlewares<RequestHandler>(InventoryController.prototype.buyItem)),

            async function InventoryController_buyItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsInventoryController_buyItem, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<InventoryController>(InventoryController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'buyItem',
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
        const argsReportingController_getBalanceSheet: Record<string, TsoaRoute.ParameterSchema> = {
                asOfDate: {"in":"query","name":"asOfDate","required":true,"dataType":"string"},
        };
        app.get('/api/finance/balance-sheet',
            ...(fetchMiddlewares<RequestHandler>(ReportingController)),
            ...(fetchMiddlewares<RequestHandler>(ReportingController.prototype.getBalanceSheet)),

            async function ReportingController_getBalanceSheet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReportingController_getBalanceSheet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReportingController>(ReportingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getBalanceSheet',
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
        const argsReportingController_getCashFlowStatement: Record<string, TsoaRoute.ParameterSchema> = {
                startDate: {"in":"query","name":"startDate","required":true,"dataType":"string"},
                endDate: {"in":"query","name":"endDate","required":true,"dataType":"string"},
        };
        app.get('/api/finance/cash-flow',
            ...(fetchMiddlewares<RequestHandler>(ReportingController)),
            ...(fetchMiddlewares<RequestHandler>(ReportingController.prototype.getCashFlowStatement)),

            async function ReportingController_getCashFlowStatement(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReportingController_getCashFlowStatement, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReportingController>(ReportingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCashFlowStatement',
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
        const argsReportingController_createBalanceSheetOffer: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateBalanceSheetOfferRequest"},
        };
        app.post('/api/finance/balance-sheet/offer',
            ...(fetchMiddlewares<RequestHandler>(ReportingController)),
            ...(fetchMiddlewares<RequestHandler>(ReportingController.prototype.createBalanceSheetOffer)),

            async function ReportingController_createBalanceSheetOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReportingController_createBalanceSheetOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReportingController>(ReportingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createBalanceSheetOffer',
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
        const argsReportingController_createCashFlowOffer: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateStatementOfferRequest"},
        };
        app.post('/api/finance/cash-flow/offer',
            ...(fetchMiddlewares<RequestHandler>(ReportingController)),
            ...(fetchMiddlewares<RequestHandler>(ReportingController.prototype.createCashFlowOffer)),

            async function ReportingController_createCashFlowOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsReportingController_createCashFlowOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ReportingController>(ReportingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createCashFlowOffer',
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
        const argsPayrollController_reofferPayrollRunVC: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
        };
        app.post('/api/payroll/runs/:runId/reoffer',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.reofferPayrollRunVC)),

            async function PayrollController_reofferPayrollRunVC(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_reofferPayrollRunVC, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reofferPayrollRunVC',
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
        const argsPayrollController_listTaxCompliance: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/payroll/tax-compliance',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.listTaxCompliance)),

            async function PayrollController_listTaxCompliance(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_listTaxCompliance, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listTaxCompliance',
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
        const argsPayrollController_issueTaxCompliance: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"IssueTaxComplianceRequest"},
        };
        app.post('/api/payroll/runs/:runId/tax-compliance',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.issueTaxCompliance)),

            async function PayrollController_issueTaxCompliance(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_issueTaxCompliance, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'issueTaxCompliance',
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
        const argsPayrollController_updateTaxComplianceStatus: Record<string, TsoaRoute.ParameterSchema> = {
                complianceId: {"in":"path","name":"complianceId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateTaxComplianceStatusRequest"},
        };
        app.post('/api/payroll/tax-compliance/:complianceId/status',
            ...(fetchMiddlewares<RequestHandler>(PayrollController)),
            ...(fetchMiddlewares<RequestHandler>(PayrollController.prototype.updateTaxComplianceStatus)),

            async function PayrollController_updateTaxComplianceStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPayrollController_updateTaxComplianceStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PayrollController>(PayrollController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateTaxComplianceStatus',
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
        const argsFinanceController_listWorkflowActorDefaults: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                workflowType: {"in":"query","name":"workflowType","dataType":"string"},
        };
        app.get('/api/finance/ap/workflow-actors/defaults',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FinanceController)),
            ...(fetchMiddlewares<RequestHandler>(FinanceController.prototype.listWorkflowActorDefaults)),

            async function FinanceController_listWorkflowActorDefaults(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFinanceController_listWorkflowActorDefaults, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FinanceController>(FinanceController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listWorkflowActorDefaults',
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
        const argsFinanceController_saveWorkflowActorDefault: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"WorkflowActorDefaultBody"},
        };
        app.post('/api/finance/ap/workflow-actors/defaults',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FinanceController)),
            ...(fetchMiddlewares<RequestHandler>(FinanceController.prototype.saveWorkflowActorDefault)),

            async function FinanceController_saveWorkflowActorDefault(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFinanceController_saveWorkflowActorDefault, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<FinanceController>(FinanceController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'saveWorkflowActorDefault',
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
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"payerPhone":{"dataType":"string"},"transactionId":{"dataType":"string","required":true},"currency":{"dataType":"string","required":true},"amount":{"dataType":"double","required":true},"cartId":{"dataType":"string"},"invoiceRef":{"dataType":"string","required":true}}},
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
        const argsProviderController_listProviders: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                type: {"in":"query","name":"type","dataType":"string"},
        };
        app.get('/providers',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.listProviders)),

            async function ProviderController_listProviders(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_listProviders, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listProviders',
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
        const argsProviderController_getProvider: Record<string, TsoaRoute.ParameterSchema> = {
                providerId: {"in":"path","name":"providerId","required":true,"dataType":"string"},
        };
        app.get('/providers/:providerId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.getProvider)),

            async function ProviderController_getProvider(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_getProvider, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getProvider',
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
        const argsProviderController_createProvider: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateProviderRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/providers',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.createProvider)),

            async function ProviderController_createProvider(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_createProvider, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createProvider',
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
        const argsProviderController_updateProvider: Record<string, TsoaRoute.ParameterSchema> = {
                providerId: {"in":"path","name":"providerId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"Partial_CreateProviderRequest_"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/providers/:providerId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.updateProvider)),

            async function ProviderController_updateProvider(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_updateProvider, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateProvider',
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
        const argsProviderController_deleteProvider: Record<string, TsoaRoute.ParameterSchema> = {
                providerId: {"in":"path","name":"providerId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/providers/:providerId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.deleteProvider)),

            async function ProviderController_deleteProvider(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_deleteProvider, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteProvider',
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
        const argsProviderController_listConfigs: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                providerId: {"in":"query","name":"providerId","dataType":"string"},
        };
        app.get('/providers/configs',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.listConfigs)),

            async function ProviderController_listConfigs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_listConfigs, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listConfigs',
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
        const argsProviderController_getConfig: Record<string, TsoaRoute.ParameterSchema> = {
                configId: {"in":"path","name":"configId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/providers/configs/:configId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.getConfig)),

            async function ProviderController_getConfig(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_getConfig, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getConfig',
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
        const argsProviderController_createConfig: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateConfigRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/providers/configs',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.createConfig)),

            async function ProviderController_createConfig(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_createConfig, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createConfig',
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
        const argsProviderController_updateConfig: Record<string, TsoaRoute.ParameterSchema> = {
                configId: {"in":"path","name":"configId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"Partial_CreateConfigRequest_"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/providers/configs/:configId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.updateConfig)),

            async function ProviderController_updateConfig(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_updateConfig, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateConfig',
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
        const argsProviderController_deleteConfig: Record<string, TsoaRoute.ParameterSchema> = {
                configId: {"in":"path","name":"configId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/providers/configs/:configId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(ProviderController)),
            ...(fetchMiddlewares<RequestHandler>(ProviderController.prototype.deleteConfig)),

            async function ProviderController_deleteConfig(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProviderController_deleteConfig, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProviderController>(ProviderController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteConfig',
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
        const argsOrganizationController_createOrganization: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateOrgRequest"},
        };
        app.post('/api/organizations',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.createOrganization)),

            async function OrganizationController_createOrganization(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_createOrganization, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createOrganization',
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
        const argsOrganizationController_listPaymentSetup: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/setup/payments',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listPaymentSetup)),

            async function OrganizationController_listPaymentSetup(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listPaymentSetup, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listPaymentSetup',
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
        const argsOrganizationController_selectPaymentMethod: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"SelectPaymentMethodRequest"},
        };
        app.post('/api/organizations/:orgTenantId/setup/payments',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.selectPaymentMethod)),

            async function OrganizationController_selectPaymentMethod(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_selectPaymentMethod, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'selectPaymentMethod',
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
        const argsOrganizationController_enableSimulatedPayments: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.post('/api/organizations/:orgTenantId/setup/payments/simulated',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.enableSimulatedPayments)),

            async function OrganizationController_enableSimulatedPayments(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_enableSimulatedPayments, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'enableSimulatedPayments',
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
        const argsOrganizationController_trustOwnOrganization: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.post('/api/organizations/:orgTenantId/setup/trusted-partners/own',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.trustOwnOrganization)),

            async function OrganizationController_trustOwnOrganization(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_trustOwnOrganization, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'trustOwnOrganization',
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
        const argsOrganizationController_listTrustedPartners: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/setup/trusted-partners',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listTrustedPartners)),

            async function OrganizationController_listTrustedPartners(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listTrustedPartners, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listTrustedPartners',
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
        const argsOrganizationController_addTrustedPartner: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string"},"reference":{"dataType":"string"}}},
        };
        app.post('/api/organizations/:orgTenantId/setup/trusted-partners',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.addTrustedPartner)),

            async function OrganizationController_addTrustedPartner(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_addTrustedPartner, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'addTrustedPartner',
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
        const argsOrganizationController_removeTrustedPartner: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                partnerId: {"in":"path","name":"partnerId","required":true,"dataType":"string"},
        };
        app.delete('/api/organizations/:orgTenantId/setup/trusted-partners/:partnerId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.removeTrustedPartner)),

            async function OrganizationController_removeTrustedPartner(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_removeTrustedPartner, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'removeTrustedPartner',
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
        const argsOrganizationController_updatePaymentRails: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateOrgPaymentRailsRequest"},
        };
        app.patch('/api/organizations/:orgTenantId/payment-rails',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.updatePaymentRails)),

            async function OrganizationController_updatePaymentRails(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_updatePaymentRails, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updatePaymentRails',
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
        const argsOrganizationController_updateDiscoveryVisibility: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateOrgDiscoveryVisibilityRequest"},
        };
        app.patch('/api/organizations/:orgTenantId/discovery-visibility',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.updateDiscoveryVisibility)),

            async function OrganizationController_updateDiscoveryVisibility(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_updateDiscoveryVisibility, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateDiscoveryVisibility',
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
        const argsOrganizationController_getProofVcPolicy: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/proof-vc-policy',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getProofVcPolicy)),

            async function OrganizationController_getProofVcPolicy(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getProofVcPolicy, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getProofVcPolicy',
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
        const argsOrganizationController_updateProofVcPolicy: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateOrgProofVcPolicyRequest"},
        };
        app.patch('/api/organizations/:orgTenantId/proof-vc-policy',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.updateProofVcPolicy)),

            async function OrganizationController_updateProofVcPolicy(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_updateProofVcPolicy, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateProofVcPolicy',
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
        const argsOrganizationController_listMyOrganizations: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/organizations',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listMyOrganizations)),

            async function OrganizationController_listMyOrganizations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listMyOrganizations, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listMyOrganizations',
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
        const argsOrganizationController_getOrganizationWorkflows: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/workflows',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getOrganizationWorkflows)),

            async function OrganizationController_getOrganizationWorkflows(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getOrganizationWorkflows, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOrganizationWorkflows',
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
        const argsOrganizationController_configureOrganizationWorkflows: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ConfigureOrgWorkflowsRequest"},
        };
        app.post('/api/organizations/:orgTenantId/workflows/configure',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.configureOrganizationWorkflows)),

            async function OrganizationController_configureOrganizationWorkflows(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_configureOrganizationWorkflows, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'configureOrganizationWorkflows',
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
        const argsOrganizationController_activateOrganizationWorkflows: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ActivateOrgWorkflowsRequest"},
        };
        app.post('/api/organizations/:orgTenantId/workflows/activate',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.activateOrganizationWorkflows)),

            async function OrganizationController_activateOrganizationWorkflows(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_activateOrganizationWorkflows, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'activateOrganizationWorkflows',
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
        const argsOrganizationController_getSetupProfile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/setup/profile',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getSetupProfile)),

            async function OrganizationController_getSetupProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getSetupProfile, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSetupProfile',
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
        const argsOrganizationController_saveSetupProfile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"OrgSetupProfileInput"},
        };
        app.put('/api/organizations/:orgTenantId/setup/profile',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.saveSetupProfile)),

            async function OrganizationController_saveSetupProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_saveSetupProfile, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'saveSetupProfile',
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
        const argsOrganizationController_getOrganizationSetupReadiness: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/setup/readiness',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getOrganizationSetupReadiness)),

            async function OrganizationController_getOrganizationSetupReadiness(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getOrganizationSetupReadiness, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOrganizationSetupReadiness',
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
        const argsOrganizationController_getWorkflowActors: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/workflows/actors',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getWorkflowActors)),

            async function OrganizationController_getWorkflowActors(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getWorkflowActors, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getWorkflowActors',
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
        const argsOrganizationController_saveWorkflowActorDefault: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"WorkflowActorDefaultInput"},
        };
        app.put('/api/organizations/:orgTenantId/workflows/actors/defaults',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.saveWorkflowActorDefault)),

            async function OrganizationController_saveWorkflowActorDefault(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_saveWorkflowActorDefault, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'saveWorkflowActorDefault',
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
        const argsOrganizationController_getWorkflowActorPolicy: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/workflows/actors/policy',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getWorkflowActorPolicy)),

            async function OrganizationController_getWorkflowActorPolicy(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getWorkflowActorPolicy, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getWorkflowActorPolicy',
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
        const argsOrganizationController_updateWorkflowActorPolicy: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"OrgWorkflowActorPolicyPatch"},
        };
        app.patch('/api/organizations/:orgTenantId/workflows/actors/policy',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.updateWorkflowActorPolicy)),

            async function OrganizationController_updateWorkflowActorPolicy(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_updateWorkflowActorPolicy, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateWorkflowActorPolicy',
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
        const argsOrganizationController_applyWorkflowActorPreset: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ApplyActorPresetRequest"},
        };
        app.post('/api/organizations/:orgTenantId/workflows/actors/presets',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.applyWorkflowActorPreset)),

            async function OrganizationController_applyWorkflowActorPreset(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_applyWorkflowActorPreset, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'applyWorkflowActorPreset',
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
        const argsOrganizationController_getWorkflowHandoffs: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/workflows/handoffs',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getWorkflowHandoffs)),

            async function OrganizationController_getWorkflowHandoffs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getWorkflowHandoffs, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getWorkflowHandoffs',
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
        const argsOrganizationController_saveWorkflowHandoff: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                handoffKey: {"in":"path","name":"handoffKey","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"WorkflowHandoffPatch"},
        };
        app.put('/api/organizations/:orgTenantId/workflows/handoffs/:handoffKey',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.saveWorkflowHandoff)),

            async function OrganizationController_saveWorkflowHandoff(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_saveWorkflowHandoff, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'saveWorkflowHandoff',
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
        const argsOrganizationController_assignUnassignedWorkflowStages: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"AssignUnassignedStagesInput"},
        };
        app.post('/api/organizations/:orgTenantId/workflows/actors/assign-unassigned',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.assignUnassignedWorkflowStages)),

            async function OrganizationController_assignUnassignedWorkflowStages(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_assignUnassignedWorkflowStages, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'assignUnassignedWorkflowStages',
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
        const argsOrganizationController_offerWorkflowActorCredentials: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"OfferWorkflowActorCredentialsInput"},
        };
        app.post('/api/organizations/:orgTenantId/workflows/actors/offer-credentials',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.offerWorkflowActorCredentials)),

            async function OrganizationController_offerWorkflowActorCredentials(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_offerWorkflowActorCredentials, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'offerWorkflowActorCredentials',
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
        const argsOrganizationController_getWorkflowPrerequisites: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                templateRef: {"in":"path","name":"templateRef","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/workflows/:templateRef/prerequisites',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.getWorkflowPrerequisites)),

            async function OrganizationController_getWorkflowPrerequisites(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_getWorkflowPrerequisites, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getWorkflowPrerequisites',
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
        const argsOrganizationController_switchToOrganization: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.post('/api/organizations/:orgTenantId/switch',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.switchToOrganization)),

            async function OrganizationController_switchToOrganization(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_switchToOrganization, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'switchToOrganization',
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
        const argsOrganizationController_listMembers: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/members',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listMembers)),

            async function OrganizationController_listMembers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listMembers, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listMembers',
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
        const argsOrganizationController_inviteMember: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"InviteMemberRequest"},
        };
        app.post('/api/organizations/:orgTenantId/members',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.inviteMember)),

            async function OrganizationController_inviteMember(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_inviteMember, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'inviteMember',
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
        const argsOrganizationController_updateMemberRole: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                targetUserId: {"in":"path","name":"targetUserId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateMemberRoleRequest"},
        };
        app.patch('/api/organizations/:orgTenantId/members/:targetUserId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.updateMemberRole)),

            async function OrganizationController_updateMemberRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_updateMemberRole, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateMemberRole',
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
        const argsOrganizationController_removeMember: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                targetUserId: {"in":"path","name":"targetUserId","required":true,"dataType":"string"},
        };
        app.delete('/api/organizations/:orgTenantId/members/:targetUserId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.removeMember)),

            async function OrganizationController_removeMember(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_removeMember, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'removeMember',
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
        const argsOrganizationController_inviteMemberByPhone: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"InviteMemberByPhoneRequest"},
        };
        app.post('/api/organizations/:orgTenantId/members/invite',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.inviteMemberByPhone)),

            async function OrganizationController_inviteMemberByPhone(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_inviteMemberByPhone, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'inviteMemberByPhone',
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
        const argsOrganizationController_listDepartments: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/departments',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listDepartments)),

            async function OrganizationController_listDepartments(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listDepartments, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listDepartments',
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
        const argsOrganizationController_createDepartment: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateDepartmentRequest"},
        };
        app.post('/api/organizations/:orgTenantId/departments',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.createDepartment)),

            async function OrganizationController_createDepartment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_createDepartment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createDepartment',
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
        const argsOrganizationController_deleteDepartment: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                departmentId: {"in":"path","name":"departmentId","required":true,"dataType":"string"},
        };
        app.delete('/api/organizations/:orgTenantId/departments/:departmentId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.deleteDepartment)),

            async function OrganizationController_deleteDepartment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_deleteDepartment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteDepartment',
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
        const argsOrganizationController_listAuthorities: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/authorities',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listAuthorities)),

            async function OrganizationController_listAuthorities(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listAuthorities, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listAuthorities',
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
        const argsOrganizationController_grantAuthority: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"GrantAuthorityRequest"},
        };
        app.post('/api/organizations/:orgTenantId/authorities',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.grantAuthority)),

            async function OrganizationController_grantAuthority(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_grantAuthority, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'grantAuthority',
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
        const argsOrganizationController_revokeAuthority: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                authorityId: {"in":"path","name":"authorityId","required":true,"dataType":"string"},
        };
        app.delete('/api/organizations/:orgTenantId/authorities/:authorityId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.revokeAuthority)),

            async function OrganizationController_revokeAuthority(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_revokeAuthority, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'revokeAuthority',
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
        const argsOrganizationController_listRoles: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/roles',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listRoles)),

            async function OrganizationController_listRoles(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listRoles, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listRoles',
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
        const argsOrganizationController_createRole: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateRoleRequest"},
        };
        app.post('/api/organizations/:orgTenantId/roles',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.createRole)),

            async function OrganizationController_createRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_createRole, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createRole',
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
        const argsOrganizationController_deleteRole: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                roleId: {"in":"path","name":"roleId","required":true,"dataType":"string"},
        };
        app.delete('/api/organizations/:orgTenantId/roles/:roleId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.deleteRole)),

            async function OrganizationController_deleteRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_deleteRole, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteRole',
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
        const argsOrganizationController_listDelegations: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
        };
        app.get('/api/organizations/:orgTenantId/delegations',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.listDelegations)),

            async function OrganizationController_listDelegations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_listDelegations, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listDelegations',
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
        const argsOrganizationController_createDelegation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateDelegationRequest"},
        };
        app.post('/api/organizations/:orgTenantId/delegations',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.createDelegation)),

            async function OrganizationController_createDelegation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_createDelegation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createDelegation',
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
        const argsOrganizationController_revokeDelegation: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                orgTenantId: {"in":"path","name":"orgTenantId","required":true,"dataType":"string"},
                delegationId: {"in":"path","name":"delegationId","required":true,"dataType":"string"},
        };
        app.delete('/api/organizations/:orgTenantId/delegations/:delegationId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController)),
            ...(fetchMiddlewares<RequestHandler>(OrganizationController.prototype.revokeDelegation)),

            async function OrganizationController_revokeDelegation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrganizationController_revokeDelegation, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrganizationController>(OrganizationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'revokeDelegation',
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
        const argsCatalogController_importItems: Record<string, TsoaRoute.ParameterSchema> = {
                merchantId: {"in":"path","name":"merchantId","required":true,"dataType":"string"},
                items: {"in":"body","name":"items","required":true,"dataType":"array","array":{"dataType":"refObject","ref":"CreateCatalogItemRequest"}},
        };
        app.post('/api/catalog/merchant/:merchantId/import',
            ...(fetchMiddlewares<RequestHandler>(CatalogController)),
            ...(fetchMiddlewares<RequestHandler>(CatalogController.prototype.importItems)),

            async function CatalogController_importItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCatalogController_importItems, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CatalogController>(CatalogController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'importItems',
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
        const argsShortlinkController_createShortlink: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateShortlinkRequest"},
        };
        app.post('/api/shortlinks',
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController)),
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController.prototype.createShortlink)),

            async function ShortlinkController_createShortlink(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShortlinkController_createShortlink, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShortlinkController>(ShortlinkController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createShortlink',
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
        const argsShortlinkController_resolveShortlink: Record<string, TsoaRoute.ParameterSchema> = {
                code: {"in":"path","name":"code","required":true,"dataType":"string"},
        };
        app.get('/api/shortlinks/:code',
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController)),
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController.prototype.resolveShortlink)),

            async function ShortlinkController_resolveShortlink(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShortlinkController_resolveShortlink, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShortlinkController>(ShortlinkController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'resolveShortlink',
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
        const argsShortlinkController_createReceiptShortlink: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"merchant":{"dataType":"string"},"currency":{"dataType":"string"},"amount":{"dataType":"string"},"transactionId":{"dataType":"string","required":true}}},
        };
        app.post('/api/shortlinks/receipt',
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController)),
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController.prototype.createReceiptShortlink)),

            async function ShortlinkController_createReceiptShortlink(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShortlinkController_createReceiptShortlink, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShortlinkController>(ShortlinkController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createReceiptShortlink',
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
        const argsShortlinkController_cleanupExpired: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.post('/api/shortlinks/cleanup',
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController)),
            ...(fetchMiddlewares<RequestHandler>(ShortlinkController.prototype.cleanupExpired)),

            async function ShortlinkController_cleanupExpired(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShortlinkController_cleanupExpired, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShortlinkController>(ShortlinkController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'cleanupExpired',
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
        const argsVerificationPageController_getVerificationPage: Record<string, TsoaRoute.ParameterSchema> = {
                code: {"in":"path","name":"code","required":true,"dataType":"string"},
        };
        app.get('/v/:code',
            ...(fetchMiddlewares<RequestHandler>(VerificationPageController)),
            ...(fetchMiddlewares<RequestHandler>(VerificationPageController.prototype.getVerificationPage)),

            async function VerificationPageController_getVerificationPage(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVerificationPageController_getVerificationPage, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VerificationPageController>(VerificationPageController);
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
        const argsVerificationPageController_confirmDelivery: Record<string, TsoaRoute.ParameterSchema> = {
                code: {"in":"path","name":"code","required":true,"dataType":"string"},
        };
        app.post('/v/:code/confirm',
            ...(fetchMiddlewares<RequestHandler>(VerificationPageController)),
            ...(fetchMiddlewares<RequestHandler>(VerificationPageController.prototype.confirmDelivery)),

            async function VerificationPageController_confirmDelivery(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVerificationPageController_confirmDelivery, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<VerificationPageController>(VerificationPageController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'confirmDelivery',
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
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"tenantId":{"dataType":"string"},"sendToWhatsApp":{"dataType":"boolean"},"skipQuote":{"dataType":"boolean"},"customerMsisdn":{"dataType":"string","required":true}}},
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
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"verificationCode":{"dataType":"string"},"verificationUrl":{"dataType":"string"},"transactionId":{"dataType":"string","required":true},"receiptOfferUrl":{"dataType":"string","required":true}}},
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
                body: {"in":"body","name":"body","dataType":"nestedObjectLiteral","nestedProperties":{"reason":{"dataType":"string"}}},
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
        const argsOidcIssuerController_getCredentialStatus: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/custom-oidc/issuer/credentials/:id/status',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController)),
            ...(fetchMiddlewares<RequestHandler>(OidcIssuerController.prototype.getCredentialStatus)),

            async function OidcIssuerController_getCredentialStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcIssuerController_getCredentialStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcIssuerController>(OidcIssuerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialStatus',
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
                data: {"in":"body","name":"data","required":true,"dataType":"any"},
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
                credentialToVerify: {"in":"body","name":"credentialToVerify","required":true,"dataType":"any"},
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
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
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
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
        };
        app.post('/oidc/verifier/verify',
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
        const argsOidcMetadataController_getIssuerAuthorizationServerMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                issuerId: {"in":"path","name":"issuerId","required":true,"dataType":"string"},
        };
        app.get('/oidc/issuer/:issuerId/.well-known/oauth-authorization-server',
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController)),
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController.prototype.getIssuerAuthorizationServerMetadata)),

            async function OidcMetadataController_getIssuerAuthorizationServerMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcMetadataController_getIssuerAuthorizationServerMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcMetadataController>(OidcMetadataController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getIssuerAuthorizationServerMetadata',
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
        const argsOidcMetadataController_getPlatformAuthorizationServerMetadata: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/.well-known/oauth-authorization-server',
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController)),
            ...(fetchMiddlewares<RequestHandler>(OidcMetadataController.prototype.getPlatformAuthorizationServerMetadata)),

            async function OidcMetadataController_getPlatformAuthorizationServerMetadata(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOidcMetadataController_getPlatformAuthorizationServerMetadata, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OidcMetadataController>(OidcMetadataController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPlatformAuthorizationServerMetadata',
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
        app.get('/api/wallet/:walletId/credentials',
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
        const argsWalletController_listCredentialsPaged: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                limit: {"default":20,"in":"query","name":"limit","dataType":"double"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                type: {"in":"query","name":"type","dataType":"string"},
        };
        app.get('/api/wallet/:walletId/credentials/list',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.listCredentialsPaged)),

            async function WalletController_listCredentialsPaged(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_listCredentialsPaged, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listCredentialsPaged',
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
        const argsWalletController_getCredentialDetail: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                walletId: {"in":"path","name":"walletId","required":true,"dataType":"string"},
                credentialId: {"in":"path","name":"credentialId","required":true,"dataType":"string"},
        };
        app.get('/api/wallet/:walletId/credentials/detail/:credentialId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletController)),
            ...(fetchMiddlewares<RequestHandler>(WalletController.prototype.getCredentialDetail)),

            async function WalletController_getCredentialDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletController_getCredentialDetail, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletController>(WalletController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCredentialDetail',
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
        app.get('/api/wallet/:walletId/credentials/exists/:credentialType',
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
        app.get('/api/wallet/:walletId/dids',
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
        app.get('/api/wallet/:walletId/credentials/:credentialId',
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
        app.post('/api/wallet/:walletId/exchange/resolveCredentialOffer',
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
        app.get('/api/wallet/:walletId/exchange/resolveIssuerOpenIDMetadata',
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
        app.post('/api/wallet/:walletId/exchange/useOfferRequest',
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
        app.post('/api/wallet/:walletId/exchange/resolvePresentationRequest',
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
        app.post('/api/wallet/:walletId/exchange/matchCredentialsForPresentationDefinition',
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
        app.post('/api/wallet/:walletId/exchange/usePresentationRequest',
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
        const argsSSIAuthController_register: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"SSIRegisterRequest"},
        };
        app.post('/api/ssi/auth/register',
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.register)),

            async function SSIAuthController_register(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_register, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
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
        const argsSSIAuthController_createSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","dataType":"nestedObjectLiteral","nestedProperties":{"expiresInSeconds":{"dataType":"double"}}},
        };
        app.post('/api/ssi/auth/session',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.createSession)),

            async function SSIAuthController_createSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_createSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createSession',
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
        const argsSSIAuthController_createLoginChallenge: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.post('/api/ssi/auth/login/challenge',
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.createLoginChallenge)),

            async function SSIAuthController_createLoginChallenge(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_createLoginChallenge, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createLoginChallenge',
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
        const argsSSIAuthController_loginWithVC: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"VCLoginRequest"},
        };
        app.post('/api/ssi/auth/login/vc',
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.loginWithVC)),

            async function SSIAuthController_loginWithVC(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_loginWithVC, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'loginWithVC',
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
        const argsSSIAuthController_loginWithPin: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"PinLoginRequest"},
        };
        app.post('/api/ssi/auth/login/pin',
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.loginWithPin)),

            async function SSIAuthController_loginWithPin(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_loginWithPin, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'loginWithPin',
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
        const argsSSIAuthController_getSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/ssi/auth/session',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.getSession)),

            async function SSIAuthController_getSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_getSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
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
        const argsSSIAuthController_logout: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.post('/api/ssi/auth/logout',
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController)),
            ...(fetchMiddlewares<RequestHandler>(SSIAuthController.prototype.logout)),

            async function SSIAuthController_logout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSSIAuthController_logout, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SSIAuthController>(SSIAuthController);
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
        const argsSsiVerificationController_verify: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"presentationSubmission":{"dataType":"any"},"verifiablePresentation":{"dataType":"string","required":true},"state":{"dataType":"string","required":true}}},
        };
        app.post('/api/platform/ssi/verify',
            ...(fetchMiddlewares<RequestHandler>(SsiVerificationController)),
            ...(fetchMiddlewares<RequestHandler>(SsiVerificationController.prototype.verify)),

            async function SsiVerificationController_verify(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSsiVerificationController_verify, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SsiVerificationController>(SsiVerificationController);
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
        const argsWalletCredentialsController_getPendingOffers: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/wallet/credentials/pending-offers',
            authenticateMiddleware([{"jwt":["tenant"]},{"jwt":["wallet"]}]),
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
        const argsWalletCredentialsController_dismissOffer: Record<string, TsoaRoute.ParameterSchema> = {
                offerId: {"in":"path","name":"offerId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/wallet/credentials/offers/:offerId',
            authenticateMiddleware([{"jwt":["tenant"]},{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController)),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController.prototype.dismissOffer)),

            async function WalletCredentialsController_dismissOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletCredentialsController_dismissOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletCredentialsController>(WalletCredentialsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'dismissOffer',
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
        const argsWalletCredentialsController_getPendingReceipts: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/wallet/credentials/pending-receipts',
            authenticateMiddleware([{"jwt":["tenant"]},{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController)),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController.prototype.getPendingReceipts)),

            async function WalletCredentialsController_getPendingReceipts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletCredentialsController_getPendingReceipts, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletCredentialsController>(WalletCredentialsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPendingReceipts',
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
        const argsWalletCredentialsController_syncReceipts: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/wallet/credentials/sync-receipts',
            authenticateMiddleware([{"jwt":["tenant"]},{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController)),
            ...(fetchMiddlewares<RequestHandler>(WalletCredentialsController.prototype.syncReceipts)),

            async function WalletCredentialsController_syncReceipts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWalletCredentialsController_syncReceipts, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WalletCredentialsController>(WalletCredentialsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'syncReceipts',
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
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"offerUrl":{"dataType":"string"},"offerUri":{"dataType":"string"}}},
        };
        app.post('/api/wallet/credentials/accept-offer',
            authenticateMiddleware([{"jwt":["tenant"]},{"jwt":["wallet"]}]),
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
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
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
        const argsSsiTrustController_createPresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"expiresAt":{"dataType":"string","required":true},"transactionRef":{"dataType":"string"},"presentationDefinition":{"dataType":"any"},"dcqlQuery":{"dataType":"any"},"queryLanguage":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["dcql"]},{"dataType":"enum","enums":["pex_v2"]}]},"purposeTextRef":{"dataType":"string"},"purposeCode":{"dataType":"string","required":true},"verifierRef":{"dataType":"string","required":true}}},
        };
        app.post('/api/platform/ssi/presentation-requests',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SsiTrustController)),
            ...(fetchMiddlewares<RequestHandler>(SsiTrustController.prototype.createPresentationRequest)),

            async function SsiTrustController_createPresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSsiTrustController_createPresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SsiTrustController>(SsiTrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createPresentationRequest',
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
        const argsSsiTrustController_bindVerifierSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"verifierClientIdRef":{"dataType":"string"},"verificationSessionId":{"dataType":"string","required":true},"verifierRef":{"dataType":"string","required":true}}},
        };
        app.post('/api/platform/ssi/presentation-requests/:requestId/bind-verifier-session',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SsiTrustController)),
            ...(fetchMiddlewares<RequestHandler>(SsiTrustController.prototype.bindVerifierSession)),

            async function SsiTrustController_bindVerifierSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSsiTrustController_bindVerifierSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SsiTrustController>(SsiTrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'bindVerifierSession',
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
        const argsSsiTrustController_recordConsent: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"consentVersion":{"dataType":"string","required":true},"privacyNoticeRef":{"dataType":"string"},"disclosedCategories":{"dataType":"array","array":{"dataType":"string"}},"requestedCategories":{"dataType":"array","array":{"dataType":"string"},"required":true},"decision":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["approved"]},{"dataType":"enum","enums":["declined"]}],"required":true},"requestId":{"dataType":"string","required":true}}},
        };
        app.post('/api/platform/ssi/presentation-consents',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SsiTrustController)),
            ...(fetchMiddlewares<RequestHandler>(SsiTrustController.prototype.recordConsent)),

            async function SsiTrustController_recordConsent(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSsiTrustController_recordConsent, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<SsiTrustController>(SsiTrustController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'recordConsent',
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
        const argsWorkflowTemplateController_listTemplates: Record<string, TsoaRoute.ParameterSchema> = {
                category: {"in":"query","name":"category","dataType":"string"},
                industry: {"in":"query","name":"industry","dataType":"string"},
        };
        app.get('/workflow-templates',
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.listTemplates)),

            async function WorkflowTemplateController_listTemplates(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_listTemplates, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listTemplates',
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
        const argsWorkflowTemplateController_getTemplate: Record<string, TsoaRoute.ParameterSchema> = {
                templateId: {"in":"path","name":"templateId","required":true,"dataType":"string"},
        };
        app.get('/workflow-templates/:templateId',
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.getTemplate)),

            async function WorkflowTemplateController_getTemplate(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_getTemplate, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTemplate',
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
        const argsWorkflowTemplateController_getCategories: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/workflow-templates/meta/categories',
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.getCategories)),

            async function WorkflowTemplateController_getCategories(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_getCategories, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCategories',
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
        const argsWorkflowTemplateController_getIndustries: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/workflow-templates/meta/industries',
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.getIndustries)),

            async function WorkflowTemplateController_getIndustries(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_getIndustries, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getIndustries',
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
        const argsWorkflowTemplateController_getVcTypes: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/workflow-templates/meta/vc-types',
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.getVcTypes)),

            async function WorkflowTemplateController_getVcTypes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_getVcTypes, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getVcTypes',
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
        const argsWorkflowTemplateController_instantiate: Record<string, TsoaRoute.ParameterSchema> = {
                templateId: {"in":"path","name":"templateId","required":true,"dataType":"string"},
                request: {"in":"body","name":"request","required":true,"ref":"InstantiateTemplateRequest"},
        };
        app.post('/workflow-templates/:templateId/instantiate',
            authenticateMiddleware([{"jwt":["admin","tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.instantiate)),

            async function WorkflowTemplateController_instantiate(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_instantiate, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'instantiate',
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
        const argsWorkflowTemplateController_preview: Record<string, TsoaRoute.ParameterSchema> = {
                templateId: {"in":"path","name":"templateId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"config":{"ref":"Record_string.unknown_","required":true},"tenantId":{"dataType":"string","required":true}}},
        };
        app.post('/workflow-templates/:templateId/preview',
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowTemplateController.prototype.preview)),

            async function WorkflowTemplateController_preview(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowTemplateController_preview, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowTemplateController>(WorkflowTemplateController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'preview',
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
                body: {"in":"body","name":"body","required":true,"ref":"ExecuteWorkflowRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/:workflowId/execute',
            authenticateMiddleware([{"jwt":["tenant"]}]),
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
        const argsWorkflowController_resumeWorkflow: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                resumeData: {"in":"body","name":"resumeData","required":true,"dataType":"any"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/resume',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.resumeWorkflow)),

            async function WorkflowController_resumeWorkflow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_resumeWorkflow, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'resumeWorkflow',
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
        const argsWorkflowController_retryWorkflow: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/retry',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.retryWorkflow)),

            async function WorkflowController_retryWorkflow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_retryWorkflow, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'retryWorkflow',
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
        const argsWorkflowController_createStageProofRequest: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"StageProofRequestBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/proof/request',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.createStageProofRequest)),

            async function WorkflowController_createStageProofRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_createStageProofRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createStageProofRequest',
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
        const argsWorkflowController_completeStageProof: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"StageProofCompleteBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/proof/complete',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.completeStageProof)),

            async function WorkflowController_completeStageProof(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_completeStageProof, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'completeStageProof',
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
        const argsWorkflowController_completeStageProofWithEmbeddedWallet: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"StageProofEmbeddedWalletBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/proof/embedded-wallet',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.completeStageProofWithEmbeddedWallet)),

            async function WorkflowController_completeStageProofWithEmbeddedWallet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_completeStageProofWithEmbeddedWallet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'completeStageProofWithEmbeddedWallet',
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
        const argsWorkflowController_reassignRun: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"assigneeUserId":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/reassign',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.reassignRun)),

            async function WorkflowController_reassignRun(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_reassignRun, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reassignRun',
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
        const argsWorkflowController_getRunHandoffs: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/workflows/runs/:runId/handoffs',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.getRunHandoffs)),

            async function WorkflowController_getRunHandoffs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_getRunHandoffs, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getRunHandoffs',
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
        const argsWorkflowController_startRunHandoff: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"StartHandoffBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows/runs/:runId/handoffs',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.startRunHandoff)),

            async function WorkflowController_startRunHandoff(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_startRunHandoff, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'startRunHandoff',
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
        const argsWorkflowController_getRunStatus: Record<string, TsoaRoute.ParameterSchema> = {
                runId: {"in":"path","name":"runId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/workflows/runs/:runId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.getRunStatus)),

            async function WorkflowController_getRunStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_getRunStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getRunStatus',
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
        const argsWorkflowController_listRuns: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                workflowId: {"in":"query","name":"workflowId","dataType":"string"},
                status: {"in":"query","name":"status","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/workflows/runs',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.listRuns)),

            async function WorkflowController_listRuns(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_listRuns, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
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
        const argsWorkflowController_listWorkflows: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                category: {"in":"query","name":"category","dataType":"string"},
        };
        app.get('/workflows',
            authenticateMiddleware([{"jwt":["tenant"]}]),
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
        const argsWorkflowController_getWorkflow: Record<string, TsoaRoute.ParameterSchema> = {
                workflowId: {"in":"path","name":"workflowId","required":true,"dataType":"string"},
        };
        app.get('/workflows/:workflowId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.getWorkflow)),

            async function WorkflowController_getWorkflow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_getWorkflow, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getWorkflow',
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
                definition: {"in":"body","name":"definition","required":true,"ref":"RegisterWorkflowRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/workflows',
            authenticateMiddleware([{"jwt":["tenant"]}]),
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
        const argsWorkflowController_deleteWorkflow: Record<string, TsoaRoute.ParameterSchema> = {
                workflowId: {"in":"path","name":"workflowId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/workflows/:workflowId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.deleteWorkflow)),

            async function WorkflowController_deleteWorkflow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_deleteWorkflow, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteWorkflow',
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
        const argsWorkflowController_listActions: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/workflows/actions/available',
            ...(fetchMiddlewares<RequestHandler>(WorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowController.prototype.listActions)),

            async function WorkflowController_listActions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowController_listActions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowController>(WorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listActions',
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
        const argsTriggerController_createWebhookTrigger: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"CreateWebhookTriggerRequest"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.post('/triggers/webhook',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.createWebhookTrigger)),

            async function TriggerController_createWebhookTrigger(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_createWebhookTrigger, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createWebhookTrigger',
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
        const argsTriggerController_createScheduleTrigger: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"CreateScheduleTriggerRequest"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.post('/triggers/schedule',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.createScheduleTrigger)),

            async function TriggerController_createScheduleTrigger(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_createScheduleTrigger, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createScheduleTrigger',
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
        const argsTriggerController_createEventTrigger: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"CreateEventTriggerRequest"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.post('/triggers/event',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.createEventTrigger)),

            async function TriggerController_createEventTrigger(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_createEventTrigger, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createEventTrigger',
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
        const argsTriggerController_listTriggers: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                workflowId: {"in":"query","name":"workflowId","dataType":"string"},
                triggerType: {"in":"query","name":"triggerType","dataType":"string"},
                isActive: {"in":"query","name":"isActive","dataType":"boolean"},
        };
        app.get('/triggers',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.listTriggers)),

            async function TriggerController_listTriggers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_listTriggers, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listTriggers',
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
        const argsTriggerController_getTrigger: Record<string, TsoaRoute.ParameterSchema> = {
                triggerId: {"in":"path","name":"triggerId","required":true,"dataType":"string"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/triggers/:triggerId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.getTrigger)),

            async function TriggerController_getTrigger(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_getTrigger, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTrigger',
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
        const argsTriggerController_setTriggerActive: Record<string, TsoaRoute.ParameterSchema> = {
                triggerId: {"in":"path","name":"triggerId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"isActive":{"dataType":"boolean","required":true}}},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.put('/triggers/:triggerId/active',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.setTriggerActive)),

            async function TriggerController_setTriggerActive(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_setTriggerActive, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'setTriggerActive',
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
        const argsTriggerController_deleteTrigger: Record<string, TsoaRoute.ParameterSchema> = {
                triggerId: {"in":"path","name":"triggerId","required":true,"dataType":"string"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.delete('/triggers/:triggerId',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.deleteTrigger)),

            async function TriggerController_deleteTrigger(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_deleteTrigger, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteTrigger',
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
        const argsTriggerController_invokeWebhook: Record<string, TsoaRoute.ParameterSchema> = {
                triggerId: {"in":"path","name":"triggerId","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"Record_string.any_"},
                signature: {"in":"header","name":"X-Webhook-Signature","dataType":"string"},
        };
        app.post('/triggers/webhook/:triggerId/invoke',
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.invokeWebhook)),

            async function TriggerController_invokeWebhook(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_invokeWebhook, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'invokeWebhook',
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
        const argsTriggerController_emitEvent: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"EmitEventRequest"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.post('/triggers/events/emit',
            authenticateMiddleware([{"jwt":["tenant","admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.emitEvent)),

            async function TriggerController_emitEvent(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_emitEvent, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'emitEvent',
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
        const argsTriggerController_listEventTypes: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/triggers/events/types',
            ...(fetchMiddlewares<RequestHandler>(TriggerController)),
            ...(fetchMiddlewares<RequestHandler>(TriggerController.prototype.listEventTypes)),

            async function TriggerController_listEventTypes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTriggerController_listEventTypes, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TriggerController>(TriggerController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listEventTypes',
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
        const argsRequestController_create: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"Omit_CreatePlatformRequestInput.tenantId-or-subjectRef_"},
        };
        app.post('/api/platform/requests',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.create)),

            async function RequestController_create(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_create, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'create',
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
        const argsRequestController_submit: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
        };
        app.post('/api/platform/requests/:requestId/submit',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.submit)),

            async function RequestController_submit(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_submit, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'submit',
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
        const argsRequestController_transition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"payload":{"ref":"Record_string.unknown_"},"toStatus":{"ref":"RequestStatus","required":true},"requestId":{"dataType":"string","required":true}}},
        };
        app.post('/api/platform/requests/transition',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.transition)),

            async function RequestController_transition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_transition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'transition',
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
        const argsRequestController_list: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","ref":"RequestStatus"},
                requestType: {"in":"query","name":"requestType","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
        };
        app.get('/api/platform/requests',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.list)),

            async function RequestController_list(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_list, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'list',
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
        const argsRequestController_get: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
        };
        app.get('/api/platform/requests/:requestId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.get)),

            async function RequestController_get(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_get, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'get',
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
        const argsRequestController_nextSteps: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
        };
        app.get('/api/platform/requests/:requestId/next',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.nextSteps)),

            async function RequestController_nextSteps(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_nextSteps, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'nextSteps',
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
        const argsRequestController_startNext: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"toType":{"dataType":"string","required":true}}},
        };
        app.post('/api/platform/requests/:requestId/next',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RequestController)),
            ...(fetchMiddlewares<RequestHandler>(RequestController.prototype.startNext)),

            async function RequestController_startNext(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequestController_startNext, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequestController>(RequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'startNext',
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
        const argsPlatformWorkflowController_start: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
                workflowId: {"in":"path","name":"workflowId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","dataType":"nestedObjectLiteral","nestedProperties":{"input":{"ref":"Record_string.unknown_"}}},
        };
        app.post('/api/platform/requests/:requestId/workflow/:workflowId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PlatformWorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(PlatformWorkflowController.prototype.start)),

            async function PlatformWorkflowController_start(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPlatformWorkflowController_start, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PlatformWorkflowController>(PlatformWorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'start',
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
        const argsPlatformWorkflowController_status: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
        };
        app.get('/api/platform/requests/:requestId/workflow/status',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PlatformWorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(PlatformWorkflowController.prototype.status)),

            async function PlatformWorkflowController_status(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPlatformWorkflowController_status, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PlatformWorkflowController>(PlatformWorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'status',
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
        const argsPlatformWorkflowController_completeTask: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                requestId: {"in":"path","name":"requestId","required":true,"dataType":"string"},
                taskId: {"in":"path","name":"taskId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","dataType":"nestedObjectLiteral","nestedProperties":{"outcomeRef":{"dataType":"string"}}},
        };
        app.post('/api/platform/requests/:requestId/tasks/:taskId/complete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PlatformWorkflowController)),
            ...(fetchMiddlewares<RequestHandler>(PlatformWorkflowController.prototype.completeTask)),

            async function PlatformWorkflowController_completeTask(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPlatformWorkflowController_completeTask, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PlatformWorkflowController>(PlatformWorkflowController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'completeTask',
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
                config: {"in":"body","name":"config","required":true,"dataType":"any"},
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
                body: {"in":"body","name":"body","required":true,"dataType":"any"},
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
                config: {"in":"body","name":"config","required":true,"dataType":"any"},
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
                config: {"in":"body","name":"config","dataType":"any"},
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
                config: {"in":"body","name":"config","required":true,"dataType":"any"},
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
                invitationRequest: {"in":"body","name":"invitationRequest","required":true,"dataType":"any"},
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
                invitationRequest: {"in":"body","name":"invitationRequest","required":true,"dataType":"any"},
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
                acceptInvitationConfig: {"in":"body","name":"acceptInvitationConfig","required":true,"dataType":"any"},
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
                state: {"in":"query","name":"state","ref":"DidCommCredentialState"},
                role: {"in":"query","name":"role","ref":"DidCommCredentialRole"},
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
                state: {"in":"query","name":"state","ref":"DidCommDidExchangeState"},
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
        const argsRequisitionController_listRequisitions: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/finance/requisitions',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.listRequisitions)),

            async function RequisitionController_listRequisitions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_listRequisitions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listRequisitions',
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
        const argsRequisitionController_getRequisition: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/finance/requisitions/:id',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.getRequisition)),

            async function RequisitionController_getRequisition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_getRequisition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getRequisition',
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
        const argsRequisitionController_requestRequisition: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"RequisitionRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/request',
            authenticateMiddleware([{"jwt":["tenant"]},{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.requestRequisition)),

            async function RequisitionController_requestRequisition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_requestRequisition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'requestRequisition',
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
        const argsRequisitionController_approveRequisition: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ApproveRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/approve',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.approveRequisition)),

            async function RequisitionController_approveRequisition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_approveRequisition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'approveRequisition',
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
        const argsRequisitionController_createApprovalPresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/approval/request',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.createApprovalPresentationRequest)),

            async function RequisitionController_createApprovalPresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_createApprovalPresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createApprovalPresentationRequest',
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
        const argsRequisitionController_approveWithEmbeddedWallet: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"walletId":{"dataType":"string","required":true},"presentationRequestUrl":{"dataType":"string","required":true},"requestId":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/approve/embedded-wallet',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.approveWithEmbeddedWallet)),

            async function RequisitionController_approveWithEmbeddedWallet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_approveWithEmbeddedWallet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'approveWithEmbeddedWallet',
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
        const argsRequisitionController_releaseFunds: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ReleaseRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/release',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.releaseFunds)),

            async function RequisitionController_releaseFunds(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_releaseFunds, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'releaseFunds',
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
        const argsRequisitionController_createReleasePresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/release/request',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.createReleasePresentationRequest)),

            async function RequisitionController_createReleasePresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_createReleasePresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createReleasePresentationRequest',
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
        const argsRequisitionController_releaseWithEmbeddedWallet: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"description":{"dataType":"string"},"currency":{"dataType":"string"},"amount":{"dataType":"double"},"walletId":{"dataType":"string","required":true},"presentationRequestUrl":{"dataType":"string","required":true},"requestId":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/release/embedded-wallet',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.releaseWithEmbeddedWallet)),

            async function RequisitionController_releaseWithEmbeddedWallet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_releaseWithEmbeddedWallet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'releaseWithEmbeddedWallet',
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
        const argsRequisitionController_createAckPresentationRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/ack/request',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.createAckPresentationRequest)),

            async function RequisitionController_createAckPresentationRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_createAckPresentationRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createAckPresentationRequest',
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
        const argsRequisitionController_acknowledgeWithEmbeddedWallet: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"notes":{"dataType":"string"},"walletId":{"dataType":"string","required":true},"presentationRequestUrl":{"dataType":"string","required":true},"requestId":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/ack/embedded-wallet',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.acknowledgeWithEmbeddedWallet)),

            async function RequisitionController_acknowledgeWithEmbeddedWallet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_acknowledgeWithEmbeddedWallet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acknowledgeWithEmbeddedWallet',
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
        const argsRequisitionController_acknowledgeExecution: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"AckRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/finance/requisitions/:id/ack',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController)),
            ...(fetchMiddlewares<RequestHandler>(RequisitionController.prototype.acknowledgeExecution)),

            async function RequisitionController_acknowledgeExecution(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRequisitionController_acknowledgeExecution, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RequisitionController>(RequisitionController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acknowledgeExecution',
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
        const argsWorkflowRequestController_createRequest: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateRequestBody"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.post('/workflow-requests',
            authenticateMiddleware([{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.createRequest)),

            async function WorkflowRequestController_createRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_createRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
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
        const argsWorkflowRequestController_listContactCapabilities: Record<string, TsoaRoute.ParameterSchema> = {
                contactId: {"in":"path","name":"contactId","required":true,"dataType":"string"},
        };
        app.get('/workflow-requests/contacts/:contactId/capabilities',
            authenticateMiddleware([{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.listContactCapabilities)),

            async function WorkflowRequestController_listContactCapabilities(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_listContactCapabilities, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listContactCapabilities',
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
        const argsWorkflowRequestController_addContactCapability: Record<string, TsoaRoute.ParameterSchema> = {
                contactId: {"in":"path","name":"contactId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"AddContactCapabilityBody"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.post('/workflow-requests/contacts/:contactId/capabilities',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.addContactCapability)),

            async function WorkflowRequestController_addContactCapability(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_addContactCapability, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'addContactCapability',
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
        const argsWorkflowRequestController_listOutboundRequests: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","ref":"WorkflowRequestStatus"},
                requestType: {"in":"query","name":"requestType","ref":"WorkflowRequestType"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/workflow-requests/outbound',
            authenticateMiddleware([{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.listOutboundRequests)),

            async function WorkflowRequestController_listOutboundRequests(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_listOutboundRequests, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listOutboundRequests',
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
        const argsWorkflowRequestController_listAssignedRequests: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","ref":"WorkflowRequestStatus"},
                requestType: {"in":"query","name":"requestType","ref":"WorkflowRequestType"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/workflow-requests/assigned',
            authenticateMiddleware([{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.listAssignedRequests)),

            async function WorkflowRequestController_listAssignedRequests(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_listAssignedRequests, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listAssignedRequests',
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
        const argsWorkflowRequestController_listInboundRequests: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","ref":"WorkflowRequestStatus"},
                requestType: {"in":"query","name":"requestType","ref":"WorkflowRequestType"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/workflow-requests/inbound',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.listInboundRequests)),

            async function WorkflowRequestController_listInboundRequests(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_listInboundRequests, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listInboundRequests',
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
        const argsWorkflowRequestController_getRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/workflow-requests/:id',
            authenticateMiddleware([{"jwt":["tenant","wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.getRequest)),

            async function WorkflowRequestController_getRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_getRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
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
        const argsWorkflowRequestController_approveRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ApproveRequestBody"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.put('/workflow-requests/:id/approve',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.approveRequest)),

            async function WorkflowRequestController_approveRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_approveRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
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
        const argsWorkflowRequestController_approveFromInbox: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ApproveRequestBody"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.put('/workflow-requests/:id/approve-from-inbox',
            authenticateMiddleware([{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.approveFromInbox)),

            async function WorkflowRequestController_approveFromInbox(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_approveFromInbox, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'approveFromInbox',
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
        const argsWorkflowRequestController_rejectRequest: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"RejectRequestBody"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.put('/workflow-requests/:id/reject',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.rejectRequest)),

            async function WorkflowRequestController_rejectRequest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_rejectRequest, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'rejectRequest',
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
        const argsWorkflowRequestController_rejectFromInbox: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"RejectRequestBody"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.put('/workflow-requests/:id/reject-from-inbox',
            authenticateMiddleware([{"jwt":["wallet"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowRequestController.prototype.rejectFromInbox)),

            async function WorkflowRequestController_rejectFromInbox(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowRequestController_rejectFromInbox, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowRequestController>(WorkflowRequestController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'rejectFromInbox',
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
        const argsWorkflowEvidenceController_captureEvidence: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"EvidenceCaptureRequest"},
        };
        app.post('/api/workflows/evidence',
            authenticateMiddleware([{"jwt":["tenant"]}]),
            ...(fetchMiddlewares<RequestHandler>(WorkflowEvidenceController)),
            ...(fetchMiddlewares<RequestHandler>(WorkflowEvidenceController.prototype.captureEvidence)),

            async function WorkflowEvidenceController_captureEvidence(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWorkflowEvidenceController_captureEvidence, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WorkflowEvidenceController>(WorkflowEvidenceController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'captureEvidence',
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
