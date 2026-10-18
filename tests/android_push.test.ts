import { describe, expect, test } from '@jest/globals'

import { ANDROID_ALERT_CHANNEL, buildAndroidPopupMessage, popupForOffer } from '../src/services/AndroidPushService'

describe('Android popup notifications', () => {
  test('a waiting job uses a plain banner and opens the inbox', () => {
    expect(popupForOffer({ sourceType: 'field_job', tenantId: 'person-1' })).toEqual({
      title: 'A job is waiting',
      body: 'Open Credentis to see what to do next.',
      path: '/inbox',
    })
  })

  test('the Firebase message is high priority on the alert channel', () => {
    const message = buildAndroidPopupMessage('device-token', popupForOffer({ sourceType: 'contact-offer' }))
    expect(message.message.android.priority).toBe('HIGH')
    expect(message.message.android.notification.channel_id).toBe(ANDROID_ALERT_CHANNEL)
    expect(message.message.android.notification.icon).toBe('ic_stat_credentis')
    expect(message.message.android.notification.color).toBe('#2188CA')
    expect(message.message.android.notification.notification_priority).toBe('PRIORITY_HIGH')
    expect(message.message.data).toEqual({ path: '/inbox' })
    expect(JSON.stringify(message)).not.toMatch(/offer|uri|credential/i)
  })
})
