import 'reflect-metadata'

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { container } from 'tsyringe'

import { CredentialIssuanceService } from '../src/services/CredentialIssuanceService'
import {
  credentialDefinitionStore,
  issuerConfigurationIdFor,
  issuerConfigurationsForDefinition,
} from '../src/utils/credentialDefinitionStore'

const tenantId = 'org-tenant-issuer-selection-test'

describe('CredentialIssuanceService issuer selection', () => {
  const definition = {
    name: 'EmployeeCredential',
    version: '1.0.0',
    schemaId: 'employee-schema',
    issuerDid: 'did:key:org',
    credentialType: ['VerifiableCredential', 'EmployeeCredential'],
    format: 'jwt_vc_json',
    tenantId,
  }

  const config = Object.fromEntries(issuerConfigurationsForDefinition(definition).map((entry) => [entry.id, entry]))

  const orgIssuer = {
    getAllIssuers: jest.fn(async () => [{ issuerId: 'org-issuer', credentialConfigurationsSupported: config }]),
    createCredentialOffer: jest.fn(async () => ({
      credentialOffer: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Forg.example%2Foffer',
      issuanceSession: { id: 'org-offer', preAuthorizedCode: 'org-code' },
    })),
  }
  const platformIssuer = {
    getAllIssuers: jest.fn(async () => [{ issuerId: 'platform-issuer', credentialConfigurationsSupported: config }]),
    createCredentialOffer: jest.fn(async () => ({
      credentialOffer: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fplatform.example%2Foffer',
      issuanceSession: { id: 'platform-offer', preAuthorizedCode: 'platform-code' },
    })),
  }
  const tenantAgent = {
    dids: { getCreatedDids: jest.fn(async () => [{ did: 'did:key:org' }]) },
    openid4vc: { issuer: orgIssuer },
    endSession: jest.fn(async () => undefined),
  }
  const baseAgent = {
    openid4vc: { issuer: platformIssuer },
    modules: {
      openId4VcIssuer: platformIssuer,
      tenants: { getTenantAgent: jest.fn(async () => tenantAgent) },
    },
  }

  let resolveSpy: jest.SpyInstance
  let definitionsSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    resolveSpy = jest.spyOn(container, 'resolve').mockReturnValue(baseAgent as any)
    definitionsSpy = jest.spyOn(credentialDefinitionStore, 'list').mockReturnValue([definition] as any)
  })

  afterEach(() => {
    resolveSpy.mockRestore()
    definitionsSpy.mockRestore()
  })

  it('prefers the tenant organization issuer for its own credential definition by default', async () => {
    const result = await new CredentialIssuanceService().createOffer({
      credentialType: 'EmployeeCredential',
      claims: { orgTenantId: tenantId },
      tenantId,
    })

    expect(result.signedBy).toBe('organisation')
    expect(orgIssuer.createCredentialOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        issuerId: 'org-issuer',
        credentialConfigurationIds: [issuerConfigurationIdFor('EmployeeCredential')],
      }),
    )
    expect(platformIssuer.createCredentialOffer).not.toHaveBeenCalled()
  })

  it('fails instead of silently using the platform issuer when organisation signing was required', async () => {
    definitionsSpy.mockReturnValue([])

    await expect(
      new CredentialIssuanceService().createOffer({
        credentialType: 'EmployeeCredential',
        claims: { orgTenantId: tenantId },
        tenantId,
        signAs: 'organisation',
      }),
    ).rejects.toThrow(`organisation issuer for tenant ${tenantId} is not configured`)

    expect(platformIssuer.createCredentialOffer).not.toHaveBeenCalled()
  })
})
