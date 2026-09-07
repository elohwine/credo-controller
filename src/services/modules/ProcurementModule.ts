import { PlatformRequestService } from '../PlatformRequestService'

const platformRequestService = new PlatformRequestService()

export interface ProcurementRequisitionInput {
  tenantId: string
  subjectRef: string
  title: string
  amount: number
  currency: string
  categoryCode: string
  supplierRef?: string
  projectRef?: string
  budgetRef?: string
  deliveryRef?: string
  justificationRef?: string
  urgency?: 'low' | 'normal' | 'high' | 'urgent'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
  }>
}

export interface ProcurementSupplierOnboardingInput {
  tenantId: string
  subjectRef: string
  title: string
  supplierRef: string
  categoryCode: string
  verificationRef?: string
  contractRef?: string
  countryCode?: string
  registrationRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

/**
 * Procurement module — thin domain layer over the shared platform request
 * lifecycle. All approval routing, authorization, and workflow execution is
 * handled by PlatformRequestService and AuthorizationService.
 *
 * Context keys are validated by RequestContextValidator against the
 * 'procurement.*' schemas registered in Step 12.
 */
export class ProcurementModule {
  public createRequisition(input: ProcurementRequisitionInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'procurement.requisition',
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      priority: input.priority ?? input.urgency ?? 'normal',
      targetModule: 'procurement',
      context: {
        categoryCode: input.categoryCode,
        ...(input.supplierRef ? { supplierRef: input.supplierRef } : {}),
        ...(input.projectRef ? { projectRef: input.projectRef } : {}),
        ...(input.budgetRef ? { budgetRef: input.budgetRef } : {}),
        ...(input.deliveryRef ? { deliveryRef: input.deliveryRef } : {}),
        ...(input.justificationRef ? { justificationRef: input.justificationRef } : {}),
        ...(input.urgency ? { urgency: input.urgency } : {}),
      },
      items: input.lineItems?.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        itemType: 'line_item',
      })),
    })
  }

  public createSupplierOnboarding(input: ProcurementSupplierOnboardingInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'procurement.supplier_onboarding',
      title: input.title,
      priority: input.priority ?? 'normal',
      targetModule: 'procurement',
      context: {
        supplierRef: input.supplierRef,
        categoryCode: input.categoryCode,
        ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
        ...(input.contractRef ? { contractRef: input.contractRef } : {}),
        ...(input.countryCode ? { countryCode: input.countryCode } : {}),
        ...(input.registrationRef ? { registrationRef: input.registrationRef } : {}),
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
    requestType?: 'procurement.requisition' | 'procurement.supplier_onboarding',
    limit = 20,
    cursor?: string,
  ) {
    return platformRequestService.list(tenantId, subjectRef, undefined, requestType, limit, cursor)
  }
}

export const procurementModule = new ProcurementModule()
