import api from '@/lib/api'
import { getPersonalWalletToken, getWalletToken } from '@/lib/auth'

export interface DeviceAssertion {
  deviceKeyId: string
  nonce: string
  purpose: string
  signedAt: string
  signature: string
}

interface DeviceBridge {
  loginAvailable?: () => boolean
  enrollForAccount?: (input: string) => string
  hasKey?: (alias: string) => boolean
  removeKey?: (alias: string) => string
  signForKey?: (alias: string, payload: string) => void
  isAvailable?: () => boolean
  enroll?: () => string
  describe?: () => string
  sign?: (payload: string) => void
}

interface EnrolledKey {
  alias?: string
  publicJwk: Record<string, unknown>
  attestation: Record<string, unknown>
  platform: string
  error?: string
}

const DEVICE_ID_KEY = 'credentisDeviceKeyId'
const WALLET_ID_KEY = 'credentisPhoneWalletId'
const LOGIN_KEYS = 'credentisLoginDevicesV1'
const PAYMENT_ALIAS = 'credentisPaymentAlias:'

export interface LoginDevice {
  walletId: string
  deviceKeyId: string
  alias: string
  label: string
}

export function loginDevices(): LoginDevice[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(LOGIN_KEYS)
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item.walletId === 'string' &&
      typeof item.deviceKeyId === 'string' && typeof item.alias === 'string' && typeof item.label === 'string')) {
    throw new Error('The saved device registration is damaged. Sign in with your account PIN and enroll again.')
  }
  return parsed
}

export function loginDeviceAvailable(walletId?: string): boolean {
  const native = bridge()
  return native?.loginAvailable?.() === true &&
    loginDevices().some((item) => (!walletId || item.walletId === walletId) && native.hasKey?.(item.alias))
}

export function deviceLoginWalletId(): string {
  const native = bridge()
  if (!native?.loginAvailable?.()) {
    throw new Error('Phone sign-in is unavailable. Check your phone screen lock, or use your account PIN.')
  }
  const devices = loginDevices().filter((item) => native.hasKey?.(item.alias))
  const remembered = devices.find((item) => item.walletId === rememberedWalletId())
  if (remembered) return remembered.walletId
  if (devices.length === 1) return devices[0].walletId
  if (devices.length > 1) {
    throw new Error('Sign in with your account PIN once to choose which enrolled account to use on this phone.')
  }
  throw new Error('No sign-in key was found for this app. Sign in with your account PIN, then enroll under Account security. Payment enrollment alone does not enable phone sign-in.')
}

export function supportsDeviceLogin(): boolean {
  return bridge()?.loginAvailable?.() === true
}

export function hasLocalLoginKey(deviceKeyId: string): boolean {
  const device = loginDevices().find((item) => item.deviceKeyId === deviceKeyId)
  return !!device && bridge()?.hasKey?.(device.alias) === true
}

export async function enrollLoginDevice(pin: string, label = 'This Android phone'): Promise<void> {
  const walletId = walletTenantFromToken()
  if (loginDeviceAvailable(walletId)) throw new Error('This account already has a key on this phone. Remove its existing access before enrolling again.')
  const registration = await registerDevice(walletId, pin, label, 'login')
  const old = loginDevices()
  window.localStorage.setItem(LOGIN_KEYS, JSON.stringify([
    ...old.filter((item) => item.walletId !== walletId),
    { walletId, deviceKeyId: registration.id, alias: registration.alias, label },
  ]))
  rememberPhoneWallet(walletId)
}

async function registerDevice(walletId: string, pin: string, label: string, usage: 'login' | 'payment') {
  const native = bridge()
  if (!native?.enrollForAccount || !walletId) throw new Error('Sign in with your account PIN in the updated Android app.')
  const challenge = await api.post('/api/wallet/auth/device-enrollment', { pin }, { headers: walletHeaders() })
  const parsed = JSON.parse(native.enrollForAccount(JSON.stringify({
    walletTenantId: walletId, challenge: challenge.data.nonce, usage,
  }))) as EnrolledKey
  if (parsed.error || !parsed.alias) throw new Error(parsed.error || 'The device did not create a secure key.')
  try {
    const response = await api.post('/api/wallet/device-keys', {
      publicJwk: parsed.publicJwk,
      attestation: parsed.attestation,
      platform: parsed.platform,
      label, enrollmentChallenge: challenge.data.nonce, usage,
    }, { headers: walletHeaders() })
    const id = String(response.data?.id || '')
    if (!id) throw new Error('The device registration was not confirmed.')
    return { id, alias: parsed.alias }
  } catch (error) {
    const removed = native.removeKey?.(parsed.alias)
    if (removed && JSON.parse(removed).error) console.error('Failed to remove unused device enrollment key.')
    throw error
  }
}

interface DeviceAuthorizationInput {
  purpose: 'device_login' | 'web_login' | 'change_pin'
  walletId?: string
  authorizationRequest?: string
  newPin?: string
}

export interface PreparedDeviceAuthorization {
  challengeId: string
  payload: string
  expiresAt: string
  requester: string
  requestedClaims: string[]
  alias: string
}

export async function prepareDeviceAuthorization(input: DeviceAuthorizationInput): Promise<PreparedDeviceAuthorization> {
  const walletId = input.walletId || rememberedWalletId()
  const native = bridge()
  const device = loginDevices().find((item) => item.walletId === walletId && native?.hasKey?.(item.alias))
  if (!device) throw new Error('Use your account PIN, then enroll this phone under Account security.')
  const challenge = await api.post('/api/wallet/auth/device-login/start', {
    deviceKeyId: device.deviceKeyId, purpose: input.purpose,
    authorizationRequest: input.authorizationRequest, newPin: input.newPin,
  })
  return { ...challenge.data, alias: device.alias }
}

export async function completeDeviceAuthorization(challenge: PreparedDeviceAuthorization): Promise<{
  token?: string; tenantId?: string; presented?: boolean
}> {
  if (Date.parse(challenge.expiresAt) <= Date.now()) throw new Error('This confirmation has expired. Start again.')
  const signature = await signPayload(challenge.payload, challenge.alias)
  const result = await api.post('/api/wallet/auth/device-login/finish', {
    challengeId: challenge.challengeId, signature,
  })
  return result.data
}

export async function authorizeDevice(input: DeviceAuthorizationInput) {
  return completeDeviceAuthorization(await prepareDeviceAuthorization(input))
}

export async function removeLoginDevice(deviceKeyId: string): Promise<void> {
  await api.delete(`/api/wallet/device-keys/${encodeURIComponent(deviceKeyId)}`, { headers: walletHeaders() })
  const devices = loginDevices()
  const local = devices.find((item) => item.deviceKeyId === deviceKeyId)
  if (local) {
    const removed = bridge()?.removeKey?.(local.alias)
    if (removed && JSON.parse(removed).error) throw new Error('Access was revoked, but the local key could not be removed.')
    window.localStorage.setItem(LOGIN_KEYS, JSON.stringify(devices.filter((item) => item.deviceKeyId !== deviceKeyId)))
  }
}

export function rememberedWalletId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(WALLET_ID_KEY)
}

export function rememberPhoneWallet(walletId: string): void {
  if (typeof window === 'undefined' || !walletId) return
  window.localStorage.setItem(WALLET_ID_KEY, walletId)
}

function bridge(): DeviceBridge | null {
  if (typeof window === 'undefined') return null
  return (window as { CredentisDeviceKey?: DeviceBridge }).CredentisDeviceKey || null
}

export function deviceTrustAvailable(): boolean {
  try {
    return bridge()?.isAvailable?.() === true
  } catch {
    return false
  }
}

function walletHeaders(): Record<string, string> | undefined {
  const token = getPersonalWalletToken?.() || getWalletToken()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

export function rememberedDeviceKeyId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(DEVICE_ID_KEY)
}

/** Create the hardware key and register its public half. Fingerprint is required later, on each use. */
export async function enrollThisPhone(label = 'This phone', pin = ''): Promise<string> {
  const walletId = walletTenantFromToken()
  const { id, alias } = await registerDevice(walletId, pin, label, 'payment')
  window.localStorage.setItem(DEVICE_ID_KEY, id)
  window.localStorage.setItem(PAYMENT_ALIAS + walletId, alias)
  rememberPhoneWallet(walletId)
  return id
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

function signPayload(payload: string, alias?: string): Promise<string> {
  const native = bridge()
  if (!native || (alias ? !native.signForKey : !native.sign)) return Promise.reject(new Error('Device confirmation requires the updated Android app.'))
  return new Promise((resolve, reject) => {
    const win = window as Window & { __credentisDeviceSign?: (signature: string | null, error: string | null) => void }
    if (win.__credentisDeviceSign) {
      reject(new Error('Finish the device confirmation already on screen.'))
      return
    }
    const timer = window.setTimeout(() => {
      win.__credentisDeviceSign = undefined
      reject(new Error('Confirmation timed out.'))
    }, 60_000)
    win.__credentisDeviceSign = (signature, error) => {
      window.clearTimeout(timer)
      win.__credentisDeviceSign = undefined
      if (signature) resolve(signature)
      else reject(new Error(error || 'Confirmation was cancelled.'))
    }
    try {
      if (alias) native.signForKey?.(alias, payload)
      else native.sign?.(payload)
    } catch (error) {
      window.clearTimeout(timer)
      win.__credentisDeviceSign = undefined
      reject(error)
    }
  })
}

/**
 * Ask for fingerprint or face and return the signature the server can check.
 * Returns undefined when this organisation has not asked for it and no phone is enrolled.
 */
export async function confirmWithDevice(input: {
  purpose: string
  transaction?: Record<string, unknown>
  required?: boolean
}): Promise<DeviceAssertion | undefined> {
  const deviceKeyId = rememberedDeviceKeyId()
  if (!deviceKeyId) {
    if (input.required) throw new Error('Enroll this phone under Settings before releasing money.')
    return undefined
  }
  const challenge = await api.post('/api/wallet/device-keys/challenge', {}, { headers: walletHeaders() })
  const { nonce, audience } = challenge.data as { nonce: string; audience: string }
  const signedAt = new Date().toISOString()
  const walletTenantId = walletTenantFromToken()
  const payload = canonical({
    aud: audience,
    nonce,
    purpose: input.purpose,
    signedAt,
    transaction: input.transaction || {},
    walletTenantId,
  })
  const alias = window.localStorage.getItem(PAYMENT_ALIAS + walletTenantId) || undefined
  const signature = await signPayload(payload, alias)
  return { deviceKeyId, nonce, purpose: input.purpose, signedAt, signature }
}

function walletTenantFromToken(): string {
  const token = getPersonalWalletToken?.() || getWalletToken() || ''
  const payload = token.split('.')[1]
  if (!payload) return ''
  try {
    const claims = JSON.parse(window.atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return String(claims.tenantId || claims.walletId || '')
  } catch {
    return ''
  }
}

export async function revokeRememberedPhone(): Promise<void> {
  const id = rememberedDeviceKeyId()
  if (!id) return
  await api.delete(`/api/wallet/device-keys/${encodeURIComponent(id)}`, { headers: walletHeaders() })
  window.localStorage.removeItem(DEVICE_ID_KEY)
}
