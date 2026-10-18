/**
 * Android popup (heads-up) notifications.
 *
 * Android shows a banner like other apps only when the channel importance is
 * HIGH. On Android 8 and later, the message priority field is ignored and the
 * channel decides. Firebase still needs delivery priority HIGH so a sleeping
 * phone is woken. See:
 * - https://developer.android.com/develop/ui/views/notifications/channels
 * - https://firebase.google.com/docs/cloud-messaging/android/message-priority
 * - https://capacitorjs.com/docs/v7/apis/push-notifications
 *
 * @credo-ts/push-notifications only carries a device token between two agents
 * (Aries RFC 0734). It does not draw the banner. This phone is not an agent,
 * so the banner is sent with Firebase Cloud Messaging.
 */

import axios from 'axios'
import jwt from 'jsonwebtoken'

import { deleteDevicePushTokenValue, listDevicePushTokens } from '../persistence/DevicePushRepository'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'AndroidPushService' })

export const ANDROID_ALERT_CHANNEL = 'credentis_alerts'

export interface AndroidPopup {
  title: string
  body: string
  path: string
}

interface FcmAccess {
  token: string
  exp: number
}

let cachedAccess: FcmAccess | null = null
let missingConfigLogged = false

export function popupForOffer(payload: Record<string, unknown>): AndroidPopup {
  const source = String(payload.sourceType || '')
  const job = /job|field|requisition|execution|inspection/i.test(source)
  if (job) {
    return {
      title: 'A job is waiting',
      body: 'Open Credentis to see what to do next.',
      path: '/inbox',
    }
  }
  return {
    title: 'Something needs you',
    body: 'Open Credentis to see it.',
    path: '/inbox',
  }
}

export function buildAndroidPopupMessage(deviceToken: string, popup: AndroidPopup) {
  return {
    message: {
      token: deviceToken,
      notification: {
        title: popup.title,
        body: popup.body,
      },
      android: {
        priority: 'HIGH',
        ttl: '86400s',
        notification: {
          channel_id: ANDROID_ALERT_CHANNEL,
          icon: 'ic_stat_credentis',
          color: '#2188CA',
          notification_priority: 'PRIORITY_HIGH',
          visibility: 'PUBLIC',
          default_sound: true,
          default_vibrate_timings: true,
        },
      },
      data: {
        path: popup.path,
      },
    },
  }
}

function fcmConfig(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim()
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

async function fcmAccessToken(): Promise<{ projectId: string; accessToken: string } | null> {
  const config = fcmConfig()
  if (!config) {
    if (!missingConfigLogged) {
      missingConfigLogged = true
      logger.warn('Android popup notifications are not configured')
    }
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (cachedAccess && cachedAccess.exp - 60 > now) {
    return { projectId: config.projectId, accessToken: cachedAccess.token }
  }

  const assertion = jwt.sign(
    {
      iss: config.clientEmail,
      sub: config.clientEmail,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    },
    config.privateKey,
    { algorithm: 'RS256' },
  )

  const { data } = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
  )

  const accessToken = typeof data?.access_token === 'string' ? data.access_token : ''
  const expiresIn = Number(data?.expires_in) || 3600
  if (!accessToken) return null
  cachedAccess = { token: accessToken, exp: now + expiresIn }
  return { projectId: config.projectId, accessToken }
}

export async function notifyAndroidPopup(payload: Record<string, unknown>): Promise<void> {
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId.trim() : ''
  if (!tenantId) return

  let access: { projectId: string; accessToken: string } | null = null
  try {
    access = await fcmAccessToken()
  } catch (error) {
    logger.warn(
      { tenantId, err: error instanceof Error ? error.message : 'token request failed' },
      'Android popup could not be authorised',
    )
    return
  }
  if (!access) return

  const popup = popupForOffer(payload)
  const tokens = listDevicePushTokens(tenantId)
  for (const deviceToken of tokens) {
    try {
      await axios.post(
        `https://fcm.googleapis.com/v1/projects/${access.projectId}/messages:send`,
        buildAndroidPopupMessage(deviceToken, popup),
        {
          headers: { Authorization: `Bearer ${access.accessToken}` },
          timeout: 10000,
        },
      )
      logger.info({ tenantId }, 'Android popup sent')
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status === 404 || status === 410) {
        deleteDevicePushTokenValue(deviceToken)
      }
      logger.warn({ tenantId, status }, 'Android popup was not delivered')
    }
  }
}
