type ActivityDetails = Record<string, any>;

type InboxLikeItem = {
  title?: string;
  description?: string;
  itemType?: string;
  module?: string;
  workflowRunId?: string;
  workflowRequestId?: string;
  workflowStage?: string;
  status?: string;
  actionLabel?: string;
  assignmentRole?: string;
  ownerDisplayName?: string;
  paymentCode?: string;
  invoiceRef?: string;
  offerUri?: string;
  flowType?: string;
  priority?: string;
};

const FEPT_STAGES = new Set([
  'DRAFT',
  'REQUEST_CREATED',
  'APPROVAL_PENDING',
  'APPROVED',
  'RELEASE_AUTHORIZED',
  'ASSIGNED',
  'IN_PROGRESS',
  'EVIDENCE_CAPTURED',
  'ACKNOWLEDGED',
  'PAYMENT_TRIGGERED',
  'RECEIPT_ISSUED',
  'RECONCILED',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
  'REVOKED',
]);

function normalizeActionText(value?: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/[._-]+/g, ' ');
}

function normalizeStage(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function extractFeptStage(details?: ActivityDetails, fallback?: { workflowStep?: string, workflowStage?: string, status?: string, eventType?: string }): string {
  const merged = {
    ...(details || {}),
    ...(details?.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}),
    ...(fallback || {}),
  };

  const candidates = [
    merged.workflowStage,
    merged.stage,
    merged.state,
    details?.workflowStage,
    details?.status,
    details?.eventType,
    fallback?.workflowStep,
    fallback?.workflowStage,
    fallback?.status,
    fallback?.eventType,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStage(candidate);
    if (normalized && FEPT_STAGES.has(normalized)) return normalized;
  }

  return '';
}

function toFeptStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    REQUEST_CREATED: 'New request',
    APPROVAL_PENDING: 'Awaiting approval',
    APPROVED: 'Approved',
    RELEASE_AUTHORIZED: 'Funds cleared',
    ASSIGNED: 'Job assigned',
    IN_PROGRESS: 'Work in progress',
    EVIDENCE_CAPTURED: 'Evidence captured',
    ACKNOWLEDGED: 'Acknowledged',
    PAYMENT_TRIGGERED: 'Payment triggered',
    RECEIPT_ISSUED: 'Receipt ready',
    RECONCILED: 'Reconciled',
    COMPLETED: 'Completed',
    DISPUTED: 'Needs attention',
    CANCELLED: 'Cancelled',
    REVOKED: 'Revoked',
  };

  return labels[stage] || stage.toLowerCase().replace(/_/g, ' ');
}

function toSentenceCase(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function inferDomainTarget(details?: ActivityDetails): string {
  if (!details || typeof details !== 'object') return 'activity';

  const requestSummary = details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {};
  const all = { ...requestSummary, ...details };
  const path = String(all.path || all.route || '').toLowerCase();
  const workflowType = String(all.workflowType || all.templateId || all.workflowId || '').toLowerCase();
  const workflowStage = extractFeptStage(details, { workflowStep: all.workflowStep });
  const ref = String(all.providerRef || all.sourceReference || all.reference || '').toLowerCase();

  if (path.includes('/payment-link') || ref.startsWith('paylink-')) return 'payment request';
  if (
    workflowType.includes('fept')
    || workflowType.includes('field')
    || FEPT_STAGES.has(workflowStage)
    || path.includes('/workflows/runs')
  ) return 'field_execution';
  if (path.includes('/requis') || String(all.requisitionId || '').trim()) return 'requisition';
  if (String(all.invoiceId || all.invoiceRef || '').trim()) return 'invoice';
  if (String(all.transactionId || all.paymentId || all.paymentReference || '').trim()) return 'payment';
  if (path.includes('/credential') || String(all.credentialType || '').trim()) return 'credential';

  return 'activity';
}

export function getFriendlyActivityActionLabel(actionType?: string, workflowStep?: string, details?: ActivityDetails): string {
  const normalized = normalizeActionText(actionType || workflowStep);
  const target = inferDomainTarget(details);
  const feptStage = extractFeptStage(details, { workflowStep, workflowStage: details?.workflowStage, status: details?.status, eventType: details?.eventType });

  if (target === 'field_execution' && feptStage) return toFeptStageLabel(feptStage);

  if (!normalized) return 'Activity updated';
  if (normalized.includes('payment settled') || normalized === 'paid') return 'Payment confirmed';
  if (normalized.includes('payment link')) return 'Payment ready';
  if (normalized.includes('receipt issued') || normalized.includes('receipt')) return 'Receipt ready';
  if (normalized.includes('invoice issued') || normalized.includes('invoice')) return 'Invoice ready';
  if (normalized.includes('quote issued') || normalized.includes('quote')) return 'Quote ready';
  if (normalized.includes('approved') || normalized.includes('approval')) return 'Approved';
  if (normalized.includes('reject')) return 'Needs attention';
  if (normalized.includes('submitted') || normalized.includes('request created')) {
    return 'Needs your review';
  }
  if (normalized.includes('api post')) {
    if (target === 'payment request') return 'Payment ready';
    if (target === 'field_execution') return 'Field job update';
    if (target === 'requisition') return 'Needs your review';
    if (target === 'invoice') return 'Invoice ready';
    if (target === 'payment') return 'Payment confirmed';
    return 'Needs your review';
  }
  if (normalized.includes('api put') || normalized.includes('api patch')) {
    if (normalized.includes('approve')) return 'Approved';
    if (normalized.includes('reject')) return 'Needs attention';
    if (target === 'field_execution') return 'Field job update';
    return 'Updated';
  }
  if (normalized.includes('requisition')) return 'Needs your review';
  if (normalized.includes('presentation verified') || normalized.includes('verified')) return 'Verified';
  if (normalized.includes('failed') || normalized.includes('mismatch') || normalized.includes('dispute')) {
    return 'Needs attention';
  }
  if (normalized.includes('credential')) return 'Document ready';
  if (normalized.includes('evidence')) return 'Evidence captured';

  return toSentenceCase(normalized);
}

export function getFriendlyActivitySummary(actionLabel: string, contextText: string, amountText?: string): string {
  if (actionLabel === 'Approved') return `${contextText}, everything is all set.`;
  if (actionLabel === 'Needs attention') return `${contextText}, this needs a quick follow-up.`;
  if (actionLabel === 'Payment ready') {
    return amountText ? `${contextText}, this payment is ready to share for ${amountText}.` : `${contextText}, this payment is ready to share.`;
  }
  if (actionLabel === 'Payment confirmed') {
    return amountText ? `${contextText}, payment has been confirmed for ${amountText}.` : `${contextText}, payment has been confirmed.`;
  }
  if (actionLabel === 'Invoice ready') return `${contextText}, an invoice is ready for review.`;
  if (actionLabel === 'Receipt ready') return `${contextText}, a receipt is ready to save.`;
  if (actionLabel === 'Needs your review') return `${contextText}, this needs your review.`;
  if (actionLabel === 'Field job update') return `${contextText}, the field job is ready for the next step.`;
  if (actionLabel === 'Updated') return `${contextText}, the request was updated.`;
  if (actionLabel === 'Verified') return `${contextText}, the record was verified.`;
  if (actionLabel === 'Evidence captured') return `${contextText}, evidence was captured.`;
  return `${contextText}, ${actionLabel.toLowerCase()}.`;
}

export function getInboxDisplayTitle(item: InboxLikeItem): string {
  const rawTitle = String(item.title || '').trim();
  const actionLabel = normalizeActionText(item.actionLabel || item.title);
  const stage = extractFeptStage(
    { workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
    { workflowStep: item.actionLabel, workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
  );
  const stageLabel = stage ? toFeptStageLabel(stage) : '';

  if (item.itemType === 'payment_link') return 'Payment ready';
  if (item.itemType === 'invoice_offer') return rawTitle.includes('Invoice') ? rawTitle : 'Invoice ready';
  if (item.itemType === 'receipt_offer') return rawTitle.includes('Receipt') ? rawTitle : 'Receipt ready';
  if (item.itemType === 'credential_offer') return rawTitle.includes('Credential') || rawTitle.includes('Offer') ? 'Document ready' : rawTitle;
  if (stageLabel) return stageLabel;
  if (item.module === 'field' || item.workflowRunId) return 'Field job update';
  if (item.module === 'present' || item.itemType === 'workflow' || item.workflowRequestId) {
    if (actionLabel.includes('approve') || actionLabel.includes('review')) return 'Needs your review';
    if (actionLabel.includes('payment')) return 'Payment ready';
    return 'Needs your review';
  }
  if (rawTitle) return rawTitle;
  return 'New update';
}

export function getInboxDisplayDescription(item: InboxLikeItem): string {
  const stage = extractFeptStage(
    { workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
    { workflowStep: item.actionLabel, workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
  );
  if (item.itemType === 'payment_link') return 'Review the payment details and continue.';
  if (item.itemType === 'invoice_offer') return 'An invoice is ready for you to review.';
  if (item.itemType === 'receipt_offer') return 'Your receipt is ready to save.';
  if (item.itemType === 'credential_offer') return 'A document was shared with you.';
  if (stage) return `The latest update is ${toFeptStageLabel(stage).toLowerCase()}.`;
  if (item.module === 'field' || item.workflowRunId) return 'Open to continue this step.';
  if (item.module === 'present') return 'Open to share the requested information.';
  if (item.workflowRequestId || item.module === 'approvals') return 'Open to review and respond.';
  if (item.description) return item.description;
  return 'Open to see what needs attention.';
}

export function getInboxPrimaryActionLabel(item: InboxLikeItem): string {
  const stage = extractFeptStage(
    { workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
    { workflowStep: item.actionLabel, workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
  );
  if (item.itemType === 'payment_link') return 'Pay';
  if (item.itemType === 'invoice_offer') return 'Review';
  if (item.itemType === 'receipt_offer') return 'Save';
  if (stage) return 'Continue';
  if (item.module === 'field' || item.workflowRunId) return 'Continue';
  if (item.module === 'present' || item.workflowRequestId || item.module === 'approvals') return 'Review';
  return 'Open';
}
