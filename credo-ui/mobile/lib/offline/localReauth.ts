type ReauthPlugin = {
  verifyIdentity?: (options?: Record<string, unknown>) => Promise<void> | void
  authenticate?: (options?: Record<string, unknown>) => Promise<void> | void
  isAvailable?: () => Promise<{ available: boolean }> | { available: boolean }
}

function getReauthPlugin(): ReauthPlugin | null {
  if (typeof window === 'undefined') return null

  const plugins = (window as any).Capacitor?.Plugins || {}
  return plugins.BiometricAuth || plugins.NativeBiometric || plugins.LocalAuth || null
}

async function tryPluginReauth(reason: string): Promise<boolean> {
  const plugin = getReauthPlugin()
  if (!plugin) return false

  try {
    if (typeof plugin.isAvailable === 'function') {
      const availability = await plugin.isAvailable()
      if (!availability || availability.available === false) return false
    }

    const options = {
      reason,
      title: 'Re-authenticate',
      subtitle: reason,
    }

    if (typeof plugin.verifyIdentity === 'function') {
      await plugin.verifyIdentity(options)
      return true
    }

    if (typeof plugin.authenticate === 'function') {
      await plugin.authenticate(options)
      return true
    }
  } catch {
    return false
  }

  return false
}

export async function requireSensitiveOrgReauth(reason: string): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const pluginResult = await tryPluginReauth(reason)
  if (pluginResult) return true

  return window.confirm(`Re-authenticate to continue: ${reason}`)
}
