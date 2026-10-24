/**
 * Branded WhatsApp templates, one per alert type, sent from the shared platform number.
 *
 * Laid out like Meta's sample utility templates: a branded image header for the alert type, a body
 * that names the organisation and the exact item (title plus one detail line), a footer, a tap-to-open
 * button whose link ends in the inbox item (or invite code) and a one-tap opt-out. The generic
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
  /** Positional `{{n}}` variables, filled in order from `bodyValues`. */
  body: string
  footer: string
  /** Path and query the button opens; the variable (item ID or invite code) is appended. */
  linkPath: '/inbox?item=' | '/login/join?code='
  buttonText: string
  /** Alerts offer a one-tap opt-out; invites go to people who have not opted in to alerts yet. */
  stopButton: boolean
  /** Shown when the inbox item has no detail line of its own. */
  defaultDetail: string
  examples: { body: string[]; link: string }
}

export const STOP_BUTTON_TEXT = 'Stop alerts'
const FOOTER = 'Credentis · verified records you keep'
/** Bump when the banner artwork changes so WhatsApp fetches the new image. */
export const HEADER_IMAGE_VERSION = '1'

export const RICH_TEMPLATES: Record<RichTemplateEvent, RichTemplateDefinition> = {
  invite: {
    event: 'invite',
    // Meta rejected `credentis_team_join` (MARKETING) and the earlier text versions as the wrong
    // category: PIN, one-time-link and expiry wording reads as a sign-in message. This is a plain
    // account update about a change the organisation made, which is what UTILITY covers.
    name: 'credentis_team_added',
    category: 'UTILITY',
    language: 'en',
    body:
      'Hi {{1}},\n\n*{{2}}* has added you to their team on Credentis as *{{3}}*.\n\n' +
      'Tap *Open invite* to see the details and join the team.',
    footer: FOOTER,
    linkPath: '/login/join?code=',
    buttonText: 'Open invite',
    stopButton: false,
    defaultDetail: '',
    examples: { body: ['Rudo', 'Moyo Hardware', 'Field worker'], link: 'Xk3pQ9vT2mLr8sWc1nB7yFh4' },
  },
  task: {
    event: 'task',
    name: 'credentis_task_update',
    category: 'UTILITY',
    language: 'en',
    body:
      'New task from *{{1}}*.\n\n📋 *{{2}}*\n📝 {{3}}\n\n' +
      'Tap *Open task* to see the details and take the next step in Credentis.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'Open task',
    stopButton: true,
    defaultDetail: 'Open it to see what is needed.',
    examples: {
      body: [
        'Moyo Hardware',
        'Safety hold on job FR-1042',
        'The worker says it is not safe to start. Sort the issue out, then mark it resolved.',
      ],
      link: 'item-7f3a9c',
    },
  },
  vc_offer: {
    event: 'vc_offer',
    name: 'credentis_record_ready',
    category: 'UTILITY',
    language: 'en',
    body:
      'New record from *{{1}}*.\n\n🪪 *{{2}}*\n📝 {{3}}\n\n' +
      'Accept it to keep it in your Credentis wallet. It is signed, so anyone you show it to can check it is real, even offline.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'View and accept',
    stopButton: true,
    defaultDetail: 'It is ready for you to keep.',
    examples: {
      body: ['Moyo Hardware', 'Staff card', 'Your staff card for Moyo Hardware, role Field worker.'],
      link: 'item-7f3a9c',
    },
  },
  proof_request: {
    event: 'proof_request',
    name: 'credentis_check_request',
    category: 'UTILITY',
    language: 'en',
    body:
      'Record check from *{{1}}*. They asked to see one of your records.\n\n🔍 *{{2}}*\n📝 {{3}}\n\n' +
      'Nothing is shared until you review the request and agree.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'Review request',
    stopButton: true,
    defaultDetail: 'Review what they asked for before you share.',
    examples: {
      body: ['Moyo Hardware', 'Staff card', 'They need it before you can collect stock at the depot.'],
      link: 'item-7f3a9c',
    },
  },
  payment_link: {
    event: 'payment_link',
    name: 'credentis_bill_ready',
    category: 'UTILITY',
    language: 'en',
    body:
      'Payment request from *{{1}}*.\n\n💳 *{{2}}*\n📝 {{3}}\n\n' +
      'Check the details and pay in Credentis. You get a signed receipt you can show later.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'View and pay',
    stopButton: true,
    defaultDetail: 'Open it to see the amount and how to pay.',
    examples: {
      body: ['Moyo Hardware', 'Invoice INV-1042', 'USD 120.00 for 4 bags of cement, due 30 Oct.'],
      link: 'item-7f3a9c',
    },
  },
  remittance: {
    event: 'remittance',
    name: 'credentis_payment_sent',
    category: 'UTILITY',
    language: 'en',
    body:
      'Payment from *{{1}}*.\n\n✅ *{{2}}*\n📝 {{3}}\n\n' +
      'The signed payment advice is in your Credentis wallet, so you can show what was paid and when.',
    footer: FOOTER,
    linkPath: '/inbox?item=',
    buttonText: 'View payment',
    stopButton: true,
    defaultDetail: 'Open it to see what was paid and when.',
    examples: {
      body: ['Moyo Hardware', 'Remittance advice', 'USD 450.00 paid for invoice INV-1042.'],
      link: 'item-7f3a9c',
    },
  },
}

/** Earlier text-header versions, superseded by the image templates above (still on Meta, never sent). */
export const RETIRED_TEMPLATE_NAMES = [
  'credentis_task_alert',
  'credentis_card_offer',
  'credentis_proof_request',
  'credentis_payment_request',
  'credentis_payment_advice',
  'credentis_join_invite',
  'credentis_team_invite',
  'credentis_account_activation',
  'credentis_team_join',
]

/** Public banner for an alert type, served from `assets/whatsapp` by the API. */
export function headerImageUrl(origin: string, event: RichTemplateEvent): string {
  return `${origin}/wa/${event}.png?v=${HEADER_IMAGE_VERSION}`
}

/** Leading emoji for the generic fallback template, matching the branded body for the same alert. */
export const EVENT_EMOJI: Record<RichTemplateEvent, string> = {
  invite: '👋',
  task: '📋',
  vc_offer: '🪪',
  proof_request: '🔍',
  payment_link: '💳',
  remittance: '✅',
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

/**
 * `POST /{waba-id}/message_templates` payload. `headerHandle` is the sample banner uploaded with
 * Meta's Resumable Upload API; the dry run shows a placeholder.
 */
export function metaTemplateDefinition(
  definition: RichTemplateDefinition,
  origin: string,
  headerHandle = '<uploaded banner handle>',
): Record<string, unknown> {
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
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerHandle] } },
      { type: 'BODY', text: definition.body, example: { body_text: [definition.examples.body] } },
      { type: 'FOOTER', text: definition.footer },
      { type: 'BUTTONS', buttons },
    ],
  }
}

/** Template components for a send request. */
export function richTemplateComponents(
  definition: RichTemplateDefinition,
  values: { imageUrl: string; body: string[]; link: string },
): Array<Record<string, unknown>> {
  if (values.body.length !== variableCount(definition.body))
    throw new Error(`Template ${definition.name} needs ${variableCount(definition.body)} values`)
  const components: Array<Record<string, unknown>> = [
    { type: 'header', parameters: [{ type: 'image', image: { link: values.imageUrl } }] },
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

/** True when Meta's stored copy is the approved template, with the image header, this code expects. */
export function isApprovedRichTemplate(item: any, definition: RichTemplateDefinition, origin: string): boolean {
  if (item?.name !== definition.name || item?.language !== definition.language) return false
  if (item?.status !== 'APPROVED' || item?.category !== definition.category) return false
  const components: any[] = item?.components || []
  const body = components.find((c) => c.type === 'BODY')
  const header = components.find((c) => c.type === 'HEADER')
  const buttons: any[] = components.find((c) => c.type === 'BUTTONS')?.buttons || []
  return (
    body?.text === definition.body &&
    header?.format === 'IMAGE' &&
    buttons[0]?.type === 'URL' &&
    buttons[0]?.url === expectedLinkUrl(origin, definition) &&
    (!definition.stopButton || buttons[1]?.type === 'QUICK_REPLY')
  )
}
