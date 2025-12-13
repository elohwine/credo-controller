export default defineNuxtPlugin(() => {
  // Wrap the global $fetch to log requests and responses in dev
  if (process.client && typeof globalThis.$fetch === 'function') {
    const origFetch = globalThis.$fetch
    // create a wrapper that preserves additional helpers like `.raw`
    // @ts-ignore
    const wrapped: any = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        console.debug('[client.fetch] request', input, init)
      } catch (e) {
        // ignore
      }
      const res = await origFetch(input as any, init as any)
      try {
        console.debug('[client.fetch] response', input, res)
      } catch (e) {
        // ignore
      }
      return res
    }

    // preserve .raw if present (nuxt uses $fetch.raw)
    if (typeof origFetch.raw === 'function') {
      wrapped.raw = async (input: RequestInfo | URL, init?: RequestInit) => {
        try {
          console.debug('[client.fetch.raw] request', input, init)
        } catch (e) {}
        const res = await origFetch.raw(input as any, init as any)
        try {
          console.debug('[client.fetch.raw] response', input, res)
        } catch (e) {}
        return res
      }
    }

    // copy any other enumerable properties to wrapped
    try {
      Object.keys(origFetch).forEach((k) => {
        if (!(k in wrapped)) (wrapped as any)[k] = (origFetch as any)[k]
      })
    } catch (e) {
      // ignore
    }

    // @ts-ignore
    globalThis.$fetch = wrapped
  }
})
