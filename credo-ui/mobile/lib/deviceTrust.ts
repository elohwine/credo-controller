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
  isAvailable?: () => boolean
  enroll?: () => string
  describe?: () => string
  sign?: (payload: string) => void
}

interface EnrolledKey {
  publicJwk: Record<string, unknown>
  attestation: Record<string, unknown>
  platform: string
  error?: string
}

const DEVICE_ID_KEY = 'credentisDeviceKeyId'
const WALLET_ID_KEY = 'credentisPhoneWalletId'

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
export async function enrollThisPhone(label = 'This phone'): Promise<string> {
  const native = bridge()
  if (!native?.enroll) throw new Error('Fingerprint or face is only available in the Credentis phone app.')
  const raw = native.enroll()
  const parsed = JSON.parse(raw) as EnrolledKey
  if (parsed.error) throw new Error(parsed.error)
  const response = await api.post('/api/wallet/device-keys', { ...parsed, label }, { headers: walletHeaders() })
  const id = String(response.data?.id || '')
  if (!id) throw new Error('The phone could not be enrolled.')
  window.localStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

function signPayload(payload: string): Promise<string> {
  const native = bridge()
  if (!native?.sign) return Promise.reject(new Error('Fingerprint or face is only available in the Credentis phone app.'))
  return new Promise((resolve, reject) => {
    const win = window as Window & { __credentisDeviceSign?: (signature: string | null, error: string | null) => void }
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
    native.sign?.(payload)
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
  const signature = await signPayload(payload)
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
