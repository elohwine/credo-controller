const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function normalizeBaseUrl(rawUrl?: string | null): string | null {
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

export function isLoopbackUrl(rawUrl?: string | null): boolean {
  const normalized = normalizeBaseUrl(rawUrl)
  if (!normalized) {
    return false
  }

  return isLoopbackHost(new URL(normalized).hostname)
}

export function resolveConfiguredBaseUrl(candidates: Array<string | undefined | null>, purpose: string): string {
  let loopback: string | null = null
  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(candidate)
    if (!normalized) {
      continue
    }

    const { hostname } = new URL(normalized)
    if (isLoopbackHost(hostname)) {
      loopback = loopback || normalized
      continue
    }

    return normalized
  }

  if (loopback) return loopback

  throw new Error(
    `${purpose} must be configured with a non-loopback URL. Set PUBLIC_BASE_URL, BACKEND_BASE_URL, APP_EXTERNAL_URL, NGROK_URL, or ISSUER_API_URL.`,
  )
}
