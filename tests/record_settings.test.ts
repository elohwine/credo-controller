import { describe, expect, test } from '@jest/globals'

import {
  configuredCredentialCatalogue,
  issuedRecordTypes,
  sanitizeRecordSettings,
} from '../src/services/workflow/recordSettings'
import type { WorkflowTemplateDefinition } from '../src/types/WorkflowTemplate'
import type { CredentialDefinitionStoreRecord } from '../src/utils/credentialDefinitionStore'

describe('organisation record settings', () => {
  const steps = [
    { action: 'field.assign', description: 'Assign' },
    { action: 'credential.issue', description: 'Job assignment record', config: { type: 'JobAssignmentVC' } },
    { action: 'credential.issue', description: 'Site', config: { type: 'SiteInspectionVC' } },
    { action: 'credential.issue', description: 'Receipt', config: { type: 'ReceiptVC' } },
    { action: 'credential.issue', description: 'Done', config: { type: 'ExecutionAckVC' } },
  ]

  test('lists only the records the steps issue', () => {
    expect(issuedRecordTypes(steps)).toEqual(['JobAssignmentVC', 'SiteInspectionVC', 'ReceiptVC', 'ExecutionAckVC'])
  })

  describe('organization credential catalogue', () => {
    const template = (overrides: Partial<WorkflowTemplateDefinition> = {}): WorkflowTemplateDefinition => ({
      id: 'field-template',
      tenantId: 'field-org',
      workflowType: 'field_execution_fept',
      name: 'Field jobs',
      enabled: true,
      version: 1,
      sector: 'field_execution',
      steps: [],
      credentialPolicy: { outputVCs: ['JobAssignmentVC', 'SiteInspectionVC'], autoIssue: true },
      paymentModes: [],
      reconciliationPolicy: { mode: 'manual_close', events: [] },
      evidencePolicy: {},
      brandingPolicy: {},
      ...overrides,
    })
    const definition = (name: string, tenantId = 'field-org'): CredentialDefinitionStoreRecord => ({
      name,
      tenantId,
      credentialDefinitionId: name,
      schemaId: `${name}-schema`,
      issuerDid: 'did:key:issuer',
      version: '1',
      credentialType: ['VerifiableCredential', name],
      createdAt: '2026-10-17T00:00:00Z',
    })

    test('seeded health, identity, commerce and staff models do not associate them with field workflows', () => {
      const catalogue = configuredCredentialCatalogue(
        'field-org',
        [template()],
        [
          definition('MdocHealthSummary'),
          definition('EHRSummary'),
          definition('GenericIDCredential'),
          definition('CartSnapshotVC'),
          definition('EmploymentContractVC'),
          definition('JobAssignmentVC'),
        ],
      )
      expect(catalogue.map((item) => item.credentialType)).toEqual(['JobAssignmentVC', 'SiteInspectionVC'])
      expect(catalogue.every((item) => !item.directIssue)).toBe(true)
      expect(catalogue[0].workflows).toEqual([{ workflowType: 'field_execution_fept', name: 'Field jobs' }])
    })

    test('foreign, global and disabled templates never add types', () => {
      expect(
        configuredCredentialCatalogue(
          'field-org',
          [template({ tenantId: 'another-org' }), template({ tenantId: null }), template({ enabled: false })],
          [],
        ),
      ).toEqual([])
    })

    test('record settings exclude disabled records, and optional records once optional records are turned off', () => {
      const configured = template({
        steps: [{ action: 'credential.issue', description: 'Receipt', config: { type: 'ReceiptVC' } }],
        credentialPolicy: {
          outputVCs: ['JobAssignmentVC', 'SiteInspectionVC'],
          autoIssue: true,
          vcOfferModes: { SiteInspectionVC: 'disabled', ReceiptVC: 'optional' },
        },
      })
      expect(configuredCredentialCatalogue('field-org', [configured], []).map((item) => item.credentialType)).toEqual([
        'JobAssignmentVC',
        'ReceiptVC',
      ])
      configured.credentialPolicy.sendOptionalOffers = false
      expect(configuredCredentialCatalogue('field-org', [configured], []).map((item) => item.credentialType)).toEqual([
        'JobAssignmentVC',
      ])
    })

    test('optional records stay on when a save leaves the switch out', () => {
      expect(sanitizeRecordSettings(['ReceiptVC'], { vcOfferModes: { ReceiptVC: 'optional' } }).sendOptionalOffers).toBe(true)
      expect(sanitizeRecordSettings(['ReceiptVC'], { sendOptionalOffers: false }).sendOptionalOffers).toBe(false)
    })

    test('custom generic credential workflows use exact tenant definitions, not sector-name guesses', () => {
      const generic = template({
        workflowType: 'custom_training',
        name: 'Training',
        credentialPolicy: { outputVCs: ['TrainingBadge'], autoIssue: false },
      })
      expect(configuredCredentialCatalogue('field-org', [generic], [definition('TrainingBadge')])[0]).toMatchObject({
        credentialType: 'TrainingBadge',
        directIssue: true,
        schemaId: 'TrainingBadge-schema',
      })
      expect(
        configuredCredentialCatalogue('field-org', [generic], [definition('TrainingBadge', 'another-org')])[0]
          .directIssue,
      ).toBe(false)
      expect(configuredCredentialCatalogue('field-org', [], [definition('TrainingBadge')])).toEqual([])
    })

    test('shared output types retain each workflow association once', () => {
      const copies = [template(), template({ workflowType: 'inspection', name: 'Inspections' }), template()]
      const item = configuredCredentialCatalogue('field-org', copies, [])[0]
      expect(item.workflows).toHaveLength(2)
    })
  })

  test('keeps Always, optional and Off, and drops anything else', () => {
    expect(
      sanitizeRecordSettings(issuedRecordTypes(steps), {
        sendOptionalOffers: true,
        vcOfferModes: {
          JobAssignmentVC: 'required',
          SiteInspectionVC: 'disabled',
          ReceiptVC: 'optional',
          InvoiceVC: 'disabled',
          ExecutionAckVC: 'sometimes',
        },
      }),
    ).toEqual({
      sendOptionalOffers: true,
      vcOfferModes: {
        JobAssignmentVC: 'required',
        SiteInspectionVC: 'disabled',
        ReceiptVC: 'optional',
      },
    })
  })
})
