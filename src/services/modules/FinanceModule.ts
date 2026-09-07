import { PlatformRequestService } from '../PlatformRequestService'

const platformRequestService = new PlatformRequestService()

export interface FinancePaymentRequestInput {
  tenantId: string
  subjectRef: string
  title: string
  amount: number
  currency: string
  paymentReference: string
  payeeRef: string
  purposeCode?: string
  invoiceRef?: string
  accountRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface FinanceExpenseClaimInput {
  tenantId: string
  subjectRef: string
  title: string
  amount: number
  currency: string
  receiptRef: string
  categoryCode: string
  projectRef?: string
  costCentreRef?: string
  periodRef?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface FinancePurchaseOrderInput {
  tenantId: string
  subjectRef: string
  title: string
  amount: number
  currency: string
  supplierRef: string
  poRef: string
  deliveryRef?: string
  termsRef?: string
  lineItemCount?: number
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
  }>
}

/**
 * Finance module — thin domain layer over the shared platform request lifecycle.
 *
 * Does NOT implement its own approval engine, workflow state machine, or RBAC.
 * All of that is delegated to PlatformRequestService + AuthorizationService.
 *
 * Context keys are validated by RequestContextValidator against the
 * 'finance.*' schemas registered in Step 12.
 */
export class FinanceModule {
  public createPaymentRequest(input: FinancePaymentRequestInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'finance.payment_request',
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      priority: input.priority ?? 'normal',
      targetModule: 'finance',
      context: {
        paymentReference: input.paymentReference,
        payeeRef: input.payeeRef,
        ...(input.purposeCode ? { purposeCode: input.purposeCode } : {}),
        ...(input.invoiceRef ? { invoiceRef: input.invoiceRef } : {}),
        ...(input.accountRef ? { accountRef: input.accountRef } : {}),
      },
    })
  }

  public createExpenseClaim(input: FinanceExpenseClaimInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'finance.expense_claim',
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      priority: input.priority ?? 'normal',
      targetModule: 'finance',
      context: {
        receiptRef: input.receiptRef,
        categoryCode: input.categoryCode,
        ...(input.projectRef ? { projectRef: input.projectRef } : {}),
        ...(input.costCentreRef ? { costCentreRef: input.costCentreRef } : {}),
        ...(input.periodRef ? { periodRef: input.periodRef } : {}),
      },
    })
  }

  public createPurchaseOrder(input: FinancePurchaseOrderInput) {
    return platformRequestService.create({
      tenantId: input.tenantId,
      subjectRef: input.subjectRef,
      requestType: 'finance.purchase_order',
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      priority: input.priority ?? 'normal',
      targetModule: 'finance',
      context: {
        supplierRef: input.supplierRef,
        poRef: input.poRef,
        ...(input.deliveryRef ? { deliveryRef: input.deliveryRef } : {}),
        ...(input.termsRef ? { termsRef: input.termsRef } : {}),
        ...(input.lineItemCount !== undefined ? { lineItemCount: input.lineItemCount } : {}),
      },
      items: input.lineItems?.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        itemType: 'line_item',
      })),
    })
  }

  /** Delegates to the platform submit lifecycle — no duplicate state machine. */
  public submit(requestId: string, tenantId: string, subjectRef: string) {
    return platformRequestService.submit(requestId, tenantId, subjectRef)
  }

  public get(requestId: string, tenantId: string, subjectRef: string) {
    return platformRequestService.getForSubject(requestId, tenantId, subjectRef)
  }

  public list(
    tenantId: string,
    subjectRef: string,
    requestType?: 'finance.payment_request' | 'finance.expense_claim' | 'finance.purchase_order',
    limit = 20,
    cursor?: string,
  ) {
    return platformRequestService.list(tenantId, subjectRef, undefined, requestType, limit, cursor)
  }
}

export const financeModule = new FinanceModule()
