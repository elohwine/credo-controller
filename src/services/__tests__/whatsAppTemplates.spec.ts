import {
  RICH_TEMPLATES,
  STOP_BUTTON_TEXT,
  credentialTypeLabel,
  isApprovedRichTemplate,
  metaTemplateDefinition,
  richTemplateComponents,
  templateText,
} from '../whatsAppTemplates'

const ORIGIN = 'https://wallet.example'

describe('branded WhatsApp templates', () => {
  it.each(Object.values(RICH_TEMPLATES))('$name fits Meta limits and its examples', (definition) => {
    const vars = new Set(definition.body.match(/\{\{\d+\}\}/g) || []).size
    expect(definition.examples.body).toHaveLength(vars)
    expect(definition.header.replace('{{1}}', definition.examples.header).length).toBeLessThanOrEqual(60)
    expect(definition.header).not.toMatch(/[*_~`\u{1F300}-\u{1FAFF}]/u)
    expect(definition.footer.length).toBeLessThanOrEqual(60)
    expect(definition.body.length).toBeLessThanOrEqual(1024)
    expect(definition.buttonText.length).toBeLessThanOrEqual(25)
    expect(definition.body.trim()).not.toMatch(/^\{\{\d+\}\}|\{\{\d+\}\}$/)
    expect(definition.name).toMatch(/^[a-z0-9_]{1,512}$/)
  })

  it('builds the Meta definition with a fixed origin and a variable link suffix', () => {
    const payload = metaTemplateDefinition(RICH_TEMPLATES.task, ORIGIN) as any
    expect(payload.category).toBe('UTILITY')
    const buttons = payload.components.find((c: any) => c.type === 'BUTTONS').buttons
    expect(buttons[0]).toMatchObject({ type: 'URL', url: `${ORIGIN}/inbox?item={{1}}` })
    expect(buttons[1]).toEqual({ type: 'QUICK_REPLY', text: STOP_BUTTON_TEXT })
    const invite = metaTemplateDefinition(RICH_TEMPLATES.invite, ORIGIN) as any
    expect(invite.components.find((c: any) => c.type === 'BUTTONS').buttons).toHaveLength(1)
  })

  it('sends header, body, encoded link and the stop payload', () => {
    const components = richTemplateComponents(RICH_TEMPLATES.vc_offer, {
      header: 'Moyo Hardware',
      body: ['Staff card'],
      link: 'item:1/2',
    }) as any[]
    expect(components[2]).toMatchObject({ sub_type: 'url', parameters: [{ text: 'item%3A1%2F2' }] })
    expect(components[3]).toMatchObject({ sub_type: 'quick_reply', parameters: [{ payload: 'STOP_ALERTS' }] })
    expect(() =>
      richTemplateComponents(RICH_TEMPLATES.invite, { header: 'x', body: ['only one'], link: 'c' }),
    ).toThrow()
  })

  it('only trusts an approved utility copy that matches this code', () => {
    const definition = RICH_TEMPLATES.task
    const stored = {
      name: definition.name,
      language: definition.language,
      status: 'APPROVED',
      category: 'UTILITY',
      components: (metaTemplateDefinition(definition, ORIGIN) as any).components,
    }
    expect(isApprovedRichTemplate(stored, definition, ORIGIN)).toBe(true)
    expect(isApprovedRichTemplate({ ...stored, category: 'MARKETING' }, definition, ORIGIN)).toBe(false)
    expect(isApprovedRichTemplate({ ...stored, status: 'PENDING' }, definition, ORIGIN)).toBe(false)
    expect(isApprovedRichTemplate(stored, definition, 'https://other.example')).toBe(false)
  })

  it('cleans parameters and names card types', () => {
    expect(templateText('  *Approve*\n\tpurchase   now ', 60, 'x')).toBe('Approve purchase now')
    expect(templateText('', 60, 'Record')).toBe('Record')
    expect(templateText('a'.repeat(80), 10, 'x')).toHaveLength(10)
    expect(credentialTypeLabel('EmployeeCredential')).toBe('Staff card')
    expect(credentialTypeLabel('PaymentReceiptVC')).toBe('Payment receipt')
  })
})
