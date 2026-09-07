import { PlatformRequestService } from '../PlatformRequestService'

const platformRequestService = new PlatformRequestService()

export interface FieldSiteAccessInput {
  tenantId: string
  subjectRef: string
  title: string
  siteRef: string
  accessPurpose: string
  validFrom: string
  validUntil?: string
  supervisorRef?: string
  equipmentRef?: string
  safetyBriefingRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface FieldInspectionInput {
  tenantId: string
  subjectRef: string
  title: string
  siteRef: string
  checklistRef: string
  scheduledAt: string
  assetRef?: string
  reportRef?: string
  inspectionTypeCode?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface FieldMaintenanceInput {
  tenantId: string
  subjectRef: string
  title: string
  assetRef: string
  workOrderRef: string
  scheduledAt: string
  priorityCode?: string
  technicianRef?: string
  partsRef?: string
  locationRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

/**
 * Field Operations module — thin domain layer over the shared platform request
 * lifecycle. Workers present credentials from their wallet to prove identity,
 * certification, and authorization; the platform verifies via DCQL before
 * authorizing field tasks.
 *
 * Context keys validated against 'field.*' schemas in RequestContextValidator.
 */
export class FieldOpsModule {
  public requestSiteAccess(input: FieldSiteAccessInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'field.site_access',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'field_ops',
      context: {
        siteRef: input.siteRef,
        accessPurpose: input.accessPurpose,
        validFrom: input.validFrom,
        ...(input.validUntil ? { validUntil: input.validUntil } : {}),
        ...(input.supervisorRef ? { supervisorRef: input.supervisorRef } : {}),
        ...(input.equipmentRef ? { equipmentRef: input.equipmentRef } : {}),
        ...(input.safetyBriefingRef ? { safetyBriefingRef: input.safetyBriefingRef } : {}),
      },
    })
  }

  public scheduleInspection(input: FieldInspectionInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'field.inspection',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'field_ops',
      context: {
        siteRef: input.siteRef,
        checklistRef: input.checklistRef,
        scheduledAt: input.scheduledAt,
        ...(input.assetRef ? { assetRef: input.assetRef } : {}),
        ...(input.reportRef ? { reportRef: input.reportRef } : {}),
        ...(input.inspectionTypeCode ? { inspectionTypeCode: input.inspectionTypeCode } : {}),
      },
    })
  }

  public createMaintenanceTask(input: FieldMaintenanceInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'field.maintenance',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'field_ops',
      context: {
        assetRef: input.assetRef,
        workOrderRef: input.workOrderRef,
        scheduledAt: input.scheduledAt,
        ...(input.priorityCode ? { priorityCode: input.priorityCode } : {}),
        ...(input.technicianRef ? { technicianRef: input.technicianRef } : {}),
        ...(input.partsRef ? { partsRef: input.partsRef } : {}),
        ...(input.locationRef ? { locationRef: input.locationRef } : {}),
      },
    })
  }

  public submit(requestId: string, tenantId: string, subjectRef: string) {
    return platformRequestService.submit(requestId, tenantId, subjectRef)
  }

  public get(requestId: string, tenantId: string, subjectRef: string) {
    return platformRequestService.getForSubject(requestId, tenantId, subjectRef)
  }

  public list(
    tenantId: string,
    subjectRef: string,
    requestType?: 'field.site_access' | 'field.inspection' | 'field.maintenance',
    limit = 20,
    cursor?: string,
  ) {
    return platformRequestService.list(tenantId, subjectRef, undefined, requestType, limit, cursor)
  }
}

export const fieldOpsModule = new FieldOpsModule()
