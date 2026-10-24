/**
 * The web copy of the app is served under a sub-path (for example /app on the API host); the
 * native build and local dev use none. Hard navigations go through these helpers so both work.
 */
export const APP_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '')

/** Full browser path for an app route, e.g. appHref('/inbox') -> '/app/inbox'. */
export function appHref(path: string): string {
  if (!APP_BASE_PATH || !path.startsWith('/') || path.startsWith(`${APP_BASE_PATH}/`)) return path
  return `${APP_BASE_PATH}${path}`
}

/** App route for the current browser path, without the sub-path (what the Next router expects). */
export function appRoute(pathname: string): string {
  if (APP_BASE_PATH && (pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`))) {
    return pathname.slice(APP_BASE_PATH.length) || '/'
  }
  return pathname
}
