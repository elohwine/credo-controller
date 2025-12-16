# Error Handling & Notifications System

## Overview
Implemented comprehensive error handling with user-friendly snackbar notifications across both demo wallet and dev wallet UIs.

## Components Added

### 1. Notification Store (`libs/stores/useNotificationStore.ts`)
- Pinia store managing notification state
- Supports 4 types: success, error, warning, info
- Auto-dismisses after configurable duration (default 5s)
- Methods: `success()`, `error()`, `warning()`, `info()`, `showNotification()`, `removeNotification()`

### 2. Notification Container (`libs/components/NotificationContainer.vue`)
- Visual notification component with icons and animations
- Color-coded by type (green=success, red=error, orange=warning, blue=info)
- Positioned top-right with smooth slide-in/slide-out animations
- Click to dismiss
- Teleported to body for proper z-index

### 3. Error Handler Plugin (`src/plugins/error-handler.client.ts`)
- Global `$fetch` wrapper that auto-catches errors
- Extracts meaningful messages from various error shapes
- Shows notifications automatically unless `skipErrorNotification` option is set
- Provides `$handleError()` and `$notify` to all components

### 4. Notifications Composable (`libs/composables/notifications.ts`)
- Helper: `useNotifications()` returns `{ success, error, warning, info }`
- Utility: `extractErrorMessage(error)` normalizes error messages from API/fetch/exceptions

## Integration Points

### App.vue (Both wallets)
```vue
<NotificationContainer />
```
Added to body alongside ModalBase

### Error Handler Plugin
Automatically intercepts all `$fetch` calls:
```typescript
globalThis.$fetch = async (request, options) => {
  try {
    return await originalFetch(request, options)
  } catch (error) {
    if (!options?.skipErrorNotification) {
      handleFetchError(error, options?.errorContext)
    }
    throw error
  }
}
```

### Updated Composables
- **accountWallet.ts**: `listWallets()` shows error if fetch fails
- **presentation.ts**: `resolvePresentationRequest()` and `acceptPresentation()` display errors
- **issuance.ts**: Already had error handling, now integrated with global handler

## Error Message Mapping

| Error Type | User Message |
|------------|--------------|
| 401 Unauthorized | "Unauthorized - please log in again" |
| 403 Forbidden | "Access denied" |
| 404 Not Found | "Resource not found" |
| 422 Validation | Backend `details` or `message` field |
| 500+ Server Error | "Server error - please try again later" |
| Network failure | "Network error - please check your connection" |
| TenantRecord not found | "Account not found - please register or log in again" |

## Usage Examples

### In Components
```typescript
import { useNotifications } from '@credentis-web-wallet/composables/notifications'

const { success, error, warning } = useNotifications()

// Show success
success('Credential accepted successfully!')

// Show error
error('Failed to load wallet')

// Custom duration
warning('Session will expire soon', 10000)
```

### In Composables
```typescript
import { extractErrorMessage } from '@credentis-web-wallet/composables/notifications'

try {
  await $fetch('/api/endpoint')
} catch (e) {
  const message = extractErrorMessage(e)
  console.error('Operation failed:', message)
  // Error notification shown automatically by global handler
}
```

### Skip Auto-Notification
```typescript
try {
  await $fetch('/api/endpoint', {
    skipErrorNotification: true // Handle error manually
  })
} catch (e) {
  // Custom error handling
  const { error } = useNotifications()
  error('Custom error message')
}
```

### With Context
```typescript
await $fetch('/api/wallet/credentials', {
  errorContext: 'Loading credentials' // Shows "Loading credentials: Not found" on 404
})
```

## Files Modified/Created

### Created
- `credo-ui/wallet/libs/stores/useNotificationStore.ts`
- `credo-ui/wallet/libs/components/NotificationContainer.vue`
- `credo-ui/wallet/src/plugins/error-handler.client.ts`
- `credo-ui/wallet/libs/composables/notifications.ts`
- `credo-ui/wallet-dev/libs/stores/useNotificationStore.ts` (copied)
- `credo-ui/wallet-dev/libs/components/NotificationContainer.vue` (copied)
- `credo-ui/wallet-dev/src/plugins/error-handler.client.ts` (copied)
- `credo-ui/wallet-dev/libs/composables/notifications.ts` (copied)

### Modified
- `credo-ui/wallet/src/app.vue` - Added NotificationContainer
- `credo-ui/wallet-dev/src/app.vue` - Added NotificationContainer
- `credo-ui/wallet/libs/composables/accountWallet.ts` - Error handling
- `credo-ui/wallet/libs/composables/presentation.ts` - Error messages

## Testing Checklist

- [x] Database cleaned (wallet_users, wallet_credentials, wallet_sessions)
- [x] Notification store created
- [x] Notification UI component with animations
- [x] Global error handler plugin
- [x] Integration in both wallet apps
- [ ] Test: Register new user → success notification
- [ ] Test: Login with wrong password → error notification
- [ ] Test: Backend offline → network error notification
- [ ] Test: API 401 → session expired notification
- [ ] Test: Tenant not found → account not found notification
- [ ] Test: Accept credential → success notification
- [ ] Test: Share presentation → error handling

## Next Steps

1. **Test full flow**: Register → Login → Accept credential → Verify all notifications display
2. **Refine messages**: Adjust wording based on user feedback
3. **Add success notifications**: For login, registration, credential acceptance, etc.
4. **Portal integration**: Apply same pattern to `credo-ui/portal`
5. **Backend improvements**: Ensure all endpoints return consistent `{ message, details }` error format
6. **Logging**: Add correlation IDs to error notifications for debugging
