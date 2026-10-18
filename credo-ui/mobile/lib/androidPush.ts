import { api } from '@/lib/api'

/** Matches the server channel. Importance 4 is Android HIGH: sound and a banner. */
export const ANDROID_ALERT_CHANNEL = 'credentis_alerts'

let started = false
let deviceToken: string | null = null

function inboxPath(data: unknown): string {
  const path = data && typeof data === 'object' ? (data as { path?: unknown }).path : undefined
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/inbox'
}

export async function registerAndroidPush(): Promise<void> {
  if (started || typeof window === 'undefined') return

  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() !== 'android') {
    started = true
    return
  }

  started = true
  // register() crashes the app when the build has no google-services.json.
  const pushBridge = (window as { CredentisPush?: { isConfigured?: () => boolean } }).CredentisPush
  if (!pushBridge?.isConfigured?.()) return

  const { PushNotifications } = await import('@capacitor/push-notifications')

  try {
    await PushNotifications.createChannel({
      id: ANDROID_ALERT_CHANNEL,
      name: 'Alerts',
      description: 'Jobs, requests and records that need you',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#2188ca',
    })
  } catch {
    // The browser preview has no Android channels.
  }

  let status = await PushNotifications.checkPermissions()
  if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
    status = await PushNotifications.requestPermissions()
  }
  if (status.receive !== 'granted') return

  await PushNotifications.addListener('registration', (token) => {
    const value = token?.value?.trim()
    if (!value) return
    deviceToken = value
    void api.post('/api/wallet/push-device', { token: value, platform: 'android' }).catch(() => undefined)
  })

  await PushNotifications.addListener('registrationError', () => {
    // Missing Firebase setup. The message can echo a token, so it is not logged.
  })

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const path = inboxPath(action.notification?.data)
    window.location.assign(path)
  })

  await PushNotifications.register()
}

export async function unregisterAndroidPush(): Promise<void> {
  const token = deviceToken
  deviceToken = null
  started = false
  if (!token) return
  await Promise.race([
    api.delete('/api/wallet/push-device', { data: { token } }).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
}
