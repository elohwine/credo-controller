import { PlatformRequestService } from '../PlatformRequestService'

const platformRequestService = new PlatformRequestService()

export interface HrOnboardingInput {
  tenantId: string
  subjectRef: string
  title: string
  roleRef: string
  departmentRef: string
  startDate: string
  locationRef?: string
  contractRef?: string
  gradeRef?: string
  managerRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface HrOffboardingInput {
  tenantId: string
  subjectRef: string
  title: string
  roleRef: string
  departmentRef: string
  endDate: string
  handoverRef?: string
  reasonCode?: string
  equipmentReturnRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface HrDelegationRequestInput {
  tenantId: string
  subjectRef: string
  title: string
  delegateRef: string
  scopeRef: string
  validFrom: string
  validUntil?: string
  reasonCode?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

/**
 * HR module — thin domain layer over the shared platform request lifecycle.
 *
 * HR events may drive credential issuance/status changes downstream via
 * workflow actions; they do NOT expose raw HR records to other modules.
 *
 * Context keys validated against 'hr.*' schemas in RequestContextValidator.
 */
export class HrModule {
  public createOnboardingRequest(input: HrOnboardingInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'hr.onboarding',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'hr',
      context: {
        roleRef: input.roleRef,
        departmentRef: input.departmentRef,
        startDate: input.startDate,
        ...(input.locationRef ? { locationRef: input.locationRef } : {}),
        ...(input.contractRef ? { contractRef: input.contractRef } : {}),
        ...(input.gradeRef ? { gradeRef: input.gradeRef } : {}),
        ...(input.managerRef ? { managerRef: input.managerRef } : {}),
      },
    })
  }

  public createOffboardingRequest(input: HrOffboardingInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'hr.offboarding',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'hr',
      context: {
        roleRef: input.roleRef,
        departmentRef: input.departmentRef,
        endDate: input.endDate,
        ...(input.handoverRef ? { handoverRef: input.handoverRef } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
        ...(input.equipmentReturnRef ? { equipmentReturnRef: input.equipmentReturnRef } : {}),
      },
    })
  }

  public createDelegationRequest(input: HrDelegationRequestInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'hr.delegation_request',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'hr',
      context: {
        delegateRef: input.delegateRef,
        scopeRef: input.scopeRef,
        validFrom: input.validFrom,
        ...(input.validUntil ? { validUntil: input.validUntil } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
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
    requestType?: 'hr.onboarding' | 'hr.offboarding' | 'hr.delegation_request',
    limit = 20,
    cursor?: string,
  ) {
    return platformRequestService.list(tenantId, subjectRef, undefined, requestType, limit, cursor)
  }
}

export const hrModule = new HrModule()
