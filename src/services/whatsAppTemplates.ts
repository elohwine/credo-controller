/**
 * Branded WhatsApp utility templates, one per alert type, sent from the shared platform number.
 *
 * Each template has a short header naming the organisation, a formatted body, a footer and a
 * tap-to-open button whose link ends in the inbox item (or invite code). The generic
 * `credentis_inbox_update` template remains the fallback while these await Meta approval.
 *
 * Kept free of imports so `scripts/whatsapp-templates.js` can submit the same definitions to Meta.
 */

export type RichTemplateEvent = 'invite' | 'task' | 'vc_offer' | 'proof_request' | 'payment_link' | 'remittance'

export interface RichTemplateDefinition {
  /** Meta classes invites to people with no relationship yet as marketing; alerts are utility. */
  category: 'UTILITY' | 'MARKETING'
  event: RichTemplateEvent
  name: string
  language: string
  /** One `{{1}}`: the organisation name. No emoji or formatting (Meta rejects them in headers). */
  header: string
  /** Positional `{{n}}` variables, filled in order from `bodyValues`. */
  body: string
  footer: string
  /** Path and query the button opens; the variable (item ID or invite code) is appended. */
  linkPath: '/inbox?item=' | '/login/join?code='
  buttonText: string
  /** Alerts offer a one-tap opt-out; invites go to people who have not opted in to alerts yet. */
  stopButton: boolean
  examples: { header: string; body: string[]; link: string }
}

export const STOP_BUTTON_TEXT = 'Stop alerts'
const FOOTER = 'Credentis · verified records you keep'

export const RICH_TEMPLATES: Record<RichTemplateEvent, RichTemplateDefinition> = {
  invite: {
    event: 'invite',
    name: 'credentis_join_invite',
    category: 'MARKETING',
    language: 'en',
    header: 'Join {{1}} on Credentis',
    body:
      'Hi {{1}} 👋\n\n*{{2}}* added you to their team as *{{3}}*.\n\n' +
      'Tap *Accept invite* to confirm your name and choose your own PIN. Only you will know it.\n\n' +
      '_The link works once and expires in 7 days._',
    footer: FOOTER,
    linkPath: '/login/join?code=',
    buttonText: 'Accept invite',
    stopButton: false,
    examples: {
      header: 'Moyo Hardware',
      body: ['Rudo', 'Moyo Hardware', 'Field worker'],
      link: 'Xk3pQ9vT2mLr8sWc1nB7yFh4',
    },
  },
  task: {
    event: 'task',
    name: 'credentis_task_alert',
    category: 'UTILITY',
    language: 'en',
    header: 'New task from {{1}}',
    body: '📋 *{{1}}* is waiting for you.\n\nOpen it in Credentis to review the details and take the next step.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'Open task',
    stopButton: true,
    examples: { header: 'Moyo Hardware', body: ['Approve purchase request'], link: 'item-7f3a9c' },
  },
  vc_offer: {
    event: 'vc_offer',
    name: 'credentis_card_offer',
    category: 'UTILITY',
    language: 'en',
    header: '{{1}} sent you a card',
    body:
      '🪪 Your *{{1}}* is ready.\n\nAccept it to keep it in your Credentis wallet. ' +
      'You can show it any time, even without data.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'View and accept',
    stopButton: true,
    examples: { header: 'Moyo Hardware', body: ['Staff card'], link: 'item-7f3a9c' },
  },
  proof_request: {
    event: 'proof_request',
    name: 'credentis_proof_request',
    category: 'UTILITY',
    language: 'en',
    header: '{{1}} asked to check a record',
    body: '🔍 They would like to see your *{{1}}*.\n\n' + 'Nothing is shared until you look at the request and agree.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'Review request',
    stopButton: true,
    examples: { header: 'Moyo Hardware', body: ['Staff card'], link: 'item-7f3a9c' },
  },
  payment_link: {
    event: 'payment_link',
    name: 'credentis_payment_request',
    category: 'UTILITY',
    language: 'en',
    header: 'Payment request from {{1}}',
    body:
      '💳 *{{1}}*\n\nOpen it in Credentis to check the details and pay. ' +
      'You get a signed receipt you can show later.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'View and pay',
    stopButton: true,
    examples: { header: 'Moyo Hardware', body: ['Invoice INV-1042'], link: 'item-7f3a9c' },
  },
  remittance: {
    event: 'remittance',
    name: 'credentis_payment_advice',
    category: 'UTILITY',
    language: 'en',
    header: '{{1}} sent you a payment',
    body: '✅ *{{1}}* is in your Credentis wallet as a signed record.\n\nOpen it to see what was paid and when.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'View payment',
    stopButton: true,
    examples: { header: 'Moyo Hardware', body: ['Remittance advice'], link: 'item-7f3a9c' },
  },
}

export function richTemplateFor(event: string): RichTemplateDefinition | undefined {
  return (RICH_TEMPLATES as Record<string, RichTemplateDefinition>)[event]
}

/** Meta rejects parameters with newlines, tabs or long runs of spaces; keep them short and plain. */
export function templateText(value: unknown, max: number, fallback: string): string {
  const clean = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
  const text = clean || fallback
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** `StaffCredential` → `Staff card`; `PaymentReceiptVC` → `Payment receipt`. */
export function credentialTypeLabel(type?: string): string {
  const known: Record<string, string> = {
    EmployeeCredential: 'Staff card',
    PlatformIdentityCredential: 'Credentis ID card',
    DelegationCredential: 'Delegation card',
    WorkflowStageAction: 'Workflow task',
    WorkflowActionAssignment: 'Workflow task',
    WorkflowRequestApproval: 'Approval request',
    RequisitionStageAction: 'Requisition task',
    RemittanceAdviceVC: 'Remittance advice',
  }
  if (!type) return 'Record'
  if (known[type]) return known[type]
  const words = type
    .replace(/(VC|Credential)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Record'
}

export function roleText(role?: string): string {
  if (!role) return 'Team member'
  if (role === 'finance_manager') return 'Finance officer'
  const words = role
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function variableCount(text: string): number {
  return new Set(text.match(/\{\{\d+\}\}/g) || []).size
}

/** The button URL as registered with Meta: fixed wallet origin and path, variable suffix. */
export function expectedLinkUrl(origin: string, definition: RichTemplateDefinition): string {
  return `${origin}${definition.linkPath}{{1}}`
}

/** `POST /{waba-id}/message_templates` payload. */
export function metaTemplateDefinition(definition: RichTemplateDefinition, origin: string): Record<string, unknown> {
  const buttons: Array<Record<string, unknown>> = [
    {
      type: 'URL',
      text: definition.buttonText,
      url: expectedLinkUrl(origin, definition),
      example: [`${origin}${definition.linkPath}${definition.examples.link}`],
    },
  ]
  if (definition.stopButton) buttons.push({ type: 'QUICK_REPLY', text: STOP_BUTTON_TEXT })
  return {
    name: definition.name,
    language: definition.language,
    category: definition.category,
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: definition.header,
        example: { header_text: [definition.examples.header] },
      },
      { type: 'BODY', text: definition.body, example: { body_text: [definition.examples.body] } },
      { type: 'FOOTER', text: definition.footer },
      { type: 'BUTTONS', buttons },
    ],
  }
}

/** Template components for a send request. */
export function richTemplateComponents(
  definition: RichTemplateDefinition,
  values: { header: string; body: string[]; link: string },
): Array<Record<string, unknown>> {
  if (values.body.length !== variableCount(definition.body))
    throw new Error(`Template ${definition.name} needs ${variableCount(definition.body)} values`)
  const components: Array<Record<string, unknown>> = [
    { type: 'header', parameters: [{ type: 'text', text: templateText(values.header, 45, 'Credentis') }] },
    { type: 'body', parameters: values.body.map((text) => ({ type: 'text', text })) },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: encodeURIComponent(values.link) }],
    },
  ]
  if (definition.stopButton) {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: '1',
      parameters: [{ type: 'payload', payload: 'STOP_ALERTS' }],
    })
  }
  return components
}

/** True when Meta's stored copy is the approved utility template this code expects. */
export function isApprovedRichTemplate(item: any, definition: RichTemplateDefinition, origin: string): boolean {
  if (item?.name !== definition.name || item?.language !== definition.language) return false
  if (item?.status !== 'APPROVED' || item?.category !== definition.category) return false
  const components: any[] = item?.components || []
  const body = components.find((c) => c.type === 'BODY')
  const header = components.find((c) => c.type === 'HEADER')
  const buttons: any[] = components.find((c) => c.type === 'BUTTONS')?.buttons || []
  return (
    body?.text === definition.body &&
    header?.text === definition.header &&
    buttons[0]?.type === 'URL' &&
    buttons[0]?.url === expectedLinkUrl(origin, definition) &&
    (!definition.stopButton || buttons[1]?.type === 'QUICK_REPLY')
  )
}
