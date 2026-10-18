/**
 * Turn a failed request into words a person can act on.
 *
 * The server's own 4xx message is kept because it explains what to fix. Gateway, server and
 * connection failures never show raw codes such as "Request failed with status code 502".
 */
export function friendlyRequestError(err: any, fallback = 'Something went wrong. Try again.'): string {
  const status = Number(err?.response?.status || 0)
  const serverMessage = String(err?.response?.data?.error || err?.response?.data?.message || '').trim()
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''))) {
    return 'The server took too long to answer. Your entries are kept; try again.'
  }
  if (!err?.response) {
    return 'No connection to the server. Check your data or Wi-Fi; your entries are kept, try again.'
  }
  if (status === 413) return 'That is too large to send. Use a smaller photo or fewer photos.'
  if (status >= 500) {
    return status === 502 || status === 503 || status === 504
      ? 'The server is not reachable right now. Your entries are kept; try again in a moment.'
      : 'The server hit a problem saving this. Your entries are kept; try again.'
  }
  return serverMessage || String(err?.message || '') || fallback
}
