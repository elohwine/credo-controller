import fs from 'fs'
import path from 'path'

import {
  RICH_TEMPLATES,
  headerImageUrl,
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
    expect(vars).toBe(3)
    expect(fs.existsSync(path.resolve(process.cwd(), `assets/whatsapp/${definition.event}.png`))).toBe(true)
    expect(definition.footer.length).toBeLessThanOrEqual(60)
    expect(definition.body.length).toBeLessThanOrEqual(1024)
    expect(definition.buttonText.length).toBeLessThanOrEqual(25)
    expect(definition.body.trim()).not.toMatch(/^[*_]*\{\{\d+\}\}|\{\{\d+\}\}[*_]*$/)
    expect(definition.name).toMatch(/^[a-z0-9_]{1,512}$/)
  })

  it('builds the Meta definition with a fixed origin and a variable link suffix', () => {
    const payload = metaTemplateDefinition(RICH_TEMPLATES.task, ORIGIN) as any
    expect(payload.category).toBe('UTILITY')
    expect(payload.components[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['<uploaded banner handle>'] },
    })
    const withHandle = metaTemplateDefinition(RICH_TEMPLATES.task, ORIGIN, '4::abc') as any
    expect(withHandle.components[0].example.header_handle).toEqual(['4::abc'])
    const buttons = payload.components.find((c: any) => c.type === 'BUTTONS').buttons
    expect(buttons[0]).toMatchObject({ type: 'URL', url: `${ORIGIN}/inbox?item={{1}}` })
    expect(buttons[1]).toEqual({ type: 'QUICK_REPLY', text: STOP_BUTTON_TEXT })
    const invite = metaTemplateDefinition(RICH_TEMPLATES.invite, ORIGIN) as any
    expect(invite.components.find((c: any) => c.type === 'BUTTONS').buttons).toHaveLength(1)
    // A plain account update: Meta rejected the PIN and expiry wording as the wrong category.
    expect(invite.category).toBe('UTILITY')
    expect(RICH_TEMPLATES.invite.body).not.toMatch(/PIN|expire|works once/i)
  })

  it('sends the banner, body, encoded link and the stop payload', () => {
    const imageUrl = headerImageUrl(ORIGIN, 'vc_offer')
    expect(imageUrl).toBe(`${ORIGIN}/wa/vc_offer.png?v=1`)
    const components = richTemplateComponents(RICH_TEMPLATES.vc_offer, {
      imageUrl,
      body: ['Moyo Hardware', 'Staff card', 'Ready to keep.'],
      link: 'item:1/2',
    }) as any[]
    expect(components[0]).toEqual({ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] })
    expect(components[2]).toMatchObject({ sub_type: 'url', parameters: [{ text: 'item%3A1%2F2' }] })
    expect(components[3]).toMatchObject({ sub_type: 'quick_reply', parameters: [{ payload: 'STOP_ALERTS' }] })
    expect(() =>
      richTemplateComponents(RICH_TEMPLATES.invite, { imageUrl: 'x', body: ['only one'], link: 'c' }),
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
    const invite = { ...metaTemplateDefinition(RICH_TEMPLATES.invite, ORIGIN), status: 'APPROVED' }
    expect(isApprovedRichTemplate(invite, RICH_TEMPLATES.invite, ORIGIN)).toBe(true)
    expect(isApprovedRichTemplate({ ...invite, category: 'MARKETING' }, RICH_TEMPLATES.invite, ORIGIN)).toBe(false)
    expect(isApprovedRichTemplate({ ...stored, status: 'PENDING' }, definition, ORIGIN)).toBe(false)
    expect(isApprovedRichTemplate(stored, definition, 'https://other.example')).toBe(false)
    const textHeader = stored.components.map((c: any) =>
      c.type === 'HEADER' ? { type: 'HEADER', format: 'TEXT', text: 'x' } : c,
    )
    expect(isApprovedRichTemplate({ ...stored, components: textHeader }, definition, ORIGIN)).toBe(false)
  })

  it('cleans parameters and names card types', () => {
    expect(templateText('  *Approve*\n\tpurchase   now ', 60, 'x')).toBe('Approve purchase now')
    expect(templateText('', 60, 'Record')).toBe('Record')
    expect(templateText('a'.repeat(80), 10, 'x')).toHaveLength(10)
    expect(credentialTypeLabel('EmployeeCredential')).toBe('Staff card')
    expect(credentialTypeLabel('PaymentReceiptVC')).toBe('Payment receipt')
  })
})
