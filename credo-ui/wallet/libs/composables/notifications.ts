import { useNotificationStore } from '../stores/useNotificationStore'

/**
 * Composable for showing notifications
 * Usage: const { success, error, warning, info } = useNotifications()
 */
export function useNotifications() {
  const store = useNotificationStore()

  return {
    success: (message: string, duration?: number) => store.success(message, duration),
    error: (message: string, duration?: number) => store.error(message, duration),
    warning: (message: string, duration?: number) => store.warning(message, duration),
    info: (message: string, duration?: number) => store.info(message, duration),
  }
}

/**
 * Helper to extract user-friendly error message from various error shapes
 */
export function extractErrorMessage(error: any): string {
  // Handle API error responses
  if (error?.response) {
    const data = error.response._data || error.response.data
    if (data?.details) return data.details
    if (data?.message) return data.message
    
    const status = error.response.status
    if (status === 401) return 'Unauthorized - please log in again'
    if (status === 403) return 'Access denied'
    if (status === 404) return 'Resource not found'
    if (status >= 500) return 'Server error - please try again later'
  }

  // Handle Nuxt/fetch errors
  if (error?.data) {
    if (typeof error.data === 'string') {
      try {
        const parsed = JSON.parse(error.data)
        if (parsed.details) return parsed.details
        if (parsed.message) return parsed.message
      } catch {
        return error.data
      }
    } else if (error.data.details) {
      return error.data.details
    } else if (error.data.message) {
      return error.data.message
    }
  }

  // Handle standard Error objects
  if (error?.message) {
    if (error.message.includes('TenantRecord')) {
      return 'Account not found - please register or log in again'
    }
    if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
      return 'Network error - please check your connection'
    }
    return error.message
  }

  // Handle string errors
  if (typeof error === 'string') return error

  return 'An unexpected error occurred'
}
