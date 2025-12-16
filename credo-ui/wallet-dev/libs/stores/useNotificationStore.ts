import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([])

  function showNotification(message: string, type: Notification['type'] = 'info', duration = 5000) {
    const id = `notification-${Date.now()}-${Math.random()}`
    const notification: Notification = { id, message, type, duration }
    
    notifications.value.push(notification)

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }

    return id
  }

  function removeNotification(id: string) {
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  function success(message: string, duration?: number) {
    return showNotification(message, 'success', duration)
  }

  function error(message: string, duration?: number) {
    return showNotification(message, 'error', duration)
  }

  function warning(message: string, duration?: number) {
    return showNotification(message, 'warning', duration)
  }

  function info(message: string, duration?: number) {
    return showNotification(message, 'info', duration)
  }

  return {
    notifications,
    showNotification,
    removeNotification,
    success,
    error,
    warning,
    info,
  }
})

export default useNotificationStore
