type FetchLike = (input: any, init?: any) => Promise<any>

function originOf(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Wraps fetch so calls the agent makes to its own public URL (offers, issuer metadata, token and
 * credential endpoints behind a tunnel such as ngrok) go straight to the local listener. Leaving
 * the server and coming back through the tunnel is slow and can time out, which made valid offers
 * fail. The issuer derives request URLs from its metadata, not the Host header, so this is safe.
 */
export function createLoopbackFetch(baseFetch: FetchLike, publicUrls: string[], internalOrigin: string): FetchLike {
  const publicOrigins = new Set(
    publicUrls.map(originOf).filter((origin): origin is string => Boolean(origin) && origin !== internalOrigin),
  )
  if (publicOrigins.size === 0) return baseFetch

  const rewrite = (url: string): string => {
    const origin = originOf(url)
    return origin && publicOrigins.has(origin) ? internalOrigin + url.slice(origin.length) : url
  }

  return (input: any, init?: any) => {
    if (typeof input === 'string') return baseFetch(rewrite(input), init)
    if (input instanceof URL) return baseFetch(rewrite(input.toString()), init)
    if (input && typeof input.url === 'string' && typeof Request !== 'undefined' && input instanceof Request) {
      const target = rewrite(input.url)
      return baseFetch(target === input.url ? input : new Request(target, input), init)
    }
    return baseFetch(input, init)
  }
}
