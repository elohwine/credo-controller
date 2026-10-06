const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * True only inside a native Capacitor shell (Android/iOS). Loading any Capacitor plugin in a
 * desktop browser (for example the camera when a photo is taken) also defines `window.Capacitor`,
 * so the presence of the global alone must not be read as "native".
 */
export function isCapacitorNativeRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as any).Capacitor
  if (!cap) return false
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform() === true
  if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
  return false
}

function isProductionLikeRuntime(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return true
  }

  return isCapacitorNativeRuntime()
}

function normalizeBaseUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) {
    return null
  }

  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    return parsed.origin.replace(/\/$/, '')
  } catch {
    return null
  }
}

function isLoopbackHost(hostname: string): boolean {
  if (LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
    return true
  }

  return /^127\./.test(hostname) || hostname === '0.0.0.0'
}

export function resolveMobileApiBaseUrl(): string {
  const productionLike = isProductionLikeRuntime()

  // When the browser is served from a loopback address (dev browser, not Capacitor),
  // always route to the local API. Tunnel URLs (ngrok etc.) in NEXT_PUBLIC_API_URL
  // are only reachable from Capacitor native builds and deployed environments.
  //
  // IMPORTANT: On Android, Capacitor hosts the webview at http://localhost internally.
  // We must NOT short-circuit to localhost when running inside Capacitor native —
  // that would send every request to the device's loopback, causing network errors.
  const isCapacitorNative = isCapacitorNativeRuntime()
  if (typeof window !== 'undefined' && !isCapacitorNative && isLoopbackHost(window.location.hostname)) {
    return 'http://localhost:3000'
  }

  const runtimeUrl = typeof window !== 'undefined' ? (window as any).__CAPACITOR_CONFIG__?.server?.url : undefined
  const candidates = [
    // Prefer an explicit runtime override when Capacitor provides one.
    // The baked NEXT_PUBLIC_API_URL is still the normal release path, but it
    // can become stale when a tunnel changes between APK rebuilds.
    runtimeUrl,
    process.env.NEXT_PUBLIC_API_URL,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(candidate)
    if (!normalized) {
      continue
    }

    const { hostname } = new URL(normalized)
    if (productionLike && isLoopbackHost(hostname)) {
      continue
    }

    return normalized
  }

  if (!productionLike) {
    return 'http://localhost:3000'
  }

  throw new Error('NEXT_PUBLIC_API_URL must be configured with a non-loopback https:// URL for the mobile app build.')
}
