import { useNotificationStore } from '@credentis-web-wallet/stores/useNotificationStore'

export default defineNuxtPlugin(() => {
  const notifications = useNotificationStore()

  // Global error handler for fetch requests
  const handleFetchError = (error: any, context?: string) => {
    console.error('Fetch error:', error)
    
    let message = 'An unexpected error occurred'
    
    if (error?.response) {
      // Server responded with error status
      const status = error.response.status
      const data = error.response._data || error.response.data
      
      if (status === 401) {
        message = 'Unauthorized. Please log in again.'
      } else if (status === 403) {
        message = 'Access denied'
      } else if (status === 404) {
        message = context ? `${context}: Not found` : 'Resource not found'
      } else if (status === 422) {
        message = data?.message || data?.details || 'Validation error'
      } else if (status >= 500) {
        message = 'Server error. Please try again later.'
      } else if (data?.message) {
        message = data.message
      } else if (data?.details) {
        message = data.details
      }
    } else if (error?.message) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Network Error')) {
        message = 'Network error. Please check your connection.'
      } else if (error.message.includes('Unauthorized')) {
        message = 'Session expired. Please log in again.'
      } else if (error.message.includes('TenantRecord')) {
        message = 'Account not found. Please register or log in again.'
      } else {
        message = error.message
      }
    } else if (typeof error === 'string') {
      message = error
    }

    notifications.error(message)
    return message
  }

  // Wrap $fetch to auto-handle errors
  const originalFetch = globalThis.$fetch

  globalThis.$fetch = async (request: any, options: any = {}) => {
    try {
      return await originalFetch(request, options)
    } catch (error: any) {
      // Only show notification if not explicitly handled
      if (!options?.skipErrorNotification) {
        handleFetchError(error, options?.errorContext)
      }
      throw error
    }
  }

  // Preserve raw method
  if (originalFetch.raw) {
    globalThis.$fetch.raw = originalFetch.raw
  }
  if (originalFetch.native) {
    globalThis.$fetch.native = originalFetch.native
  }
  if (originalFetch.create) {
    globalThis.$fetch.create = originalFetch.create
  }

  return {
    provide: {
      handleError: handleFetchError,
      notify: notifications,
    },
  }
})
