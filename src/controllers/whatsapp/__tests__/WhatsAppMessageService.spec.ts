import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import axios from 'axios'

import { WhatsAppMessageService } from '../WhatsAppPayloadController'

jest.mock('../../../persistence/DatabaseManager', () => ({}))
jest.mock('../../../services/InventoryService', () => ({}))
jest.mock('../../../services/NotificationService', () => ({}))
jest.mock('../../../services/WhatsAppSenderService', () => ({}))
jest.mock('../../../services/SSIAuthService', () => ({}))
jest.mock('../../../services/documentFacts', () => ({}))
jest.mock('../../../utils/serviceApiKey', () => ({}))

describe('WhatsAppMessageService delivery switch', () => {
  const saved = { ...process.env }
  let post: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    process.env.WABA_PHONE_NUMBER_ID = '123'
    process.env.WABA_TOKEN = 'token'
    post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [{ id: 'wamid.1' }] } } as never)
  })

  afterEach(() => {
    process.env = { ...saved }
    post.mockRestore()
  })

  it('does not send when WHATSAPP_DELIVERY_ENABLED is unset, even with credentials', async () => {
    delete process.env.WHATSAPP_DELIVERY_ENABLED
    const service = new WhatsAppMessageService()

    await expect(service.sendTextMessage('263770000000', 'hi')).resolves.toEqual({
      skipped: true,
      reason: 'delivery_disabled',
    })
    await service.sendCtaUrlButton('263770000000', 'h', 'b', 'Open', 'https://example.com')
    await service.sendReplyButtons('263770000000', 'b', [{ id: 'a', title: 'A' }])
    expect(post).not.toHaveBeenCalled()
  })

  it('sends when WHATSAPP_DELIVERY_ENABLED is "true"', async () => {
    process.env.WHATSAPP_DELIVERY_ENABLED = 'true'
    const service = new WhatsAppMessageService()

    await service.sendTextMessage('263770000000', 'hi')
    expect(post).toHaveBeenCalledTimes(1)
  })
})
