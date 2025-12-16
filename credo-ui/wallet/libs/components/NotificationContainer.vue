<template>
  <Teleport to="body">
    <div class="notification-container">
      <TransitionGroup name="notification">
        <div
          v-for="notification in store.notifications"
          :key="notification.id"
          :class="['notification', `notification-${notification.type}`]"
          @click="store.removeNotification(notification.id)"
        >
          <div class="notification-icon">
            <svg v-if="notification.type === 'success'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <svg v-else-if="notification.type === 'error'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <svg v-else-if="notification.type === 'warning'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
          </div>
          <div class="notification-message">{{ notification.message }}</div>
          <button 
            class="notification-close" 
            @click.stop="store.removeNotification(notification.id)"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { useNotificationStore } from '../stores/useNotificationStore'

const store = useNotificationStore()
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 24rem;
  pointer-events: none;
}

.notification {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.3s ease;
  background: white;
}

.notification:hover {
  transform: translateX(-4px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.notification-success {
  background: #10b981;
  color: white;
}

.notification-error {
  background: #ef4444;
  color: white;
}

.notification-warning {
  background: #f59e0b;
  color: white;
}

.notification-info {
  background: #3b82f6;
  color: white;
}

.notification-icon {
  flex-shrink: 0;
}

.notification-message {
  flex: 1;
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.notification-close {
  flex-shrink: 0;
  font-size: 1.5rem;
  line-height: 1;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-close:hover {
  opacity: 1;
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%) scale(0.8);
}

.notification-move {
  transition: transform 0.3s ease;
}
</style>
