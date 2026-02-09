# Shop Invoice/Receipt Save Issue - Fixed

## Issue Summary

When saving Invoice VC or Receipt VC to wallet from the shop checkout flow, the frontend was receiving **401 Unauthorized** errors when calling the accept-offer endpoint.

```
POST http://localhost:3000/api/wallet/credentials/accept-offer 401 (Unauthorized)
```

## Root Cause

The shop page was routing the `accept-offer` call to the holder-api (port 6000) instead of the main backend API (port 3000), and cached portal tokens were reused after API restarts:

```typescript
// WRONG - Was using holder-api
const { tenantToken } = await ensurePortalTenant(holderUrl);  // holderUrl = port 6000
await axios.post(`${holderUrl}/api/wallet/credentials/accept-offer`, ...);
```

The problem:
- The holder-api service is a separate container without direct access to the portal tenant's JWT validation context
- The `accept-offer` endpoint requires `@Security('jwt', [SCOPES.TENANT_AGENT])` 
- Portal tenant tokens weren't properly validated on the holder-api container
- Cached tokens in localStorage became stale after restarts, causing 401s until cleared

## Solution Applied

### 1. Fixed Shop Save Handlers (lines 213-245)

Changed both `handleSaveInvoice` and `handleSaveReceipt` to use the main backend API:

```typescript
// CORRECT - Use main backend API with proper tenant context
const { tenantToken } = await ensurePortalTenant(backendUrl);  // backendUrl = port 3000
const response = await axios.post(`${backendUrl}/api/wallet/credentials/accept-offer`, {
    offerUri: invoiceUrl
}, {
    headers: { 
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json'
    }
});
```

**Why this works:**
- Main backend API (port 3000) has the complete tenant security context
- Portal tenant tokens are validated against the same agent that created them
- Accept-offer endpoint can properly resolve the tenant and store credentials

### 2. Added token refresh on 401

If `accept-offer` returns 401, the shop now forces a tenant token refresh and retries once:

```typescript
const { tenantToken } = await ensurePortalTenant(backendUrl, { forceRefresh: true });
```

### 3. Fixed Excessive Cart Polling (line 71-82)

Reduced unnecessary polling requests to the cart endpoint:

```typescript
// OLD - Polled continuously even during invoice/receipt stages
const { cart: pollingCart } = useCartPolling(
    (checkoutStep === 'invoice' || checkoutStep === 'receipt') && cart?.id ? cart.id : null,
    ...
);

// NEW - Only poll AFTER user saves invoice and we're waiting for payment
const { cart: pollingCart } = useCartPolling(
    invoiceSaved && checkoutStep === 'invoice' && cart?.id ? cart.id : null,
    ...
);
```

**Benefits:**
- Stops polling GET requests before invoice is saved to wallet
- Reduces server load during invoice confirmation stage
- Only enables polling when payment is actually expected

## Testing

To verify the fix:

1. **Navigate to shop**: http://localhost:5000/shop
2. **Add items to cart** and proceed to checkout
3. **Enter phone number** for payment
4. **In invoice step**, click "Save Invoice to Wallet"
   - Should show success message instead of 401 error
   - Credential will be stored in wallet
5. **Simulate payment** via EcoCash webhook
6. **In receipt step**, click "Save Receipt to Wallet"  
   - Should succeed and store receipt credential

## Related Files Modified

- `credo-ui/portal/pages/shop/index.tsx` - Fixed handlers, retry on 401, and polling logic
- `credo-ui/portal/utils/portalTenant.ts` - Force-refresh token support + always use API backend
- `credo-ui/portal/pages/index.tsx` - Updated dashboard for MVP focus
- `credo-ui/portal/components/Layout.tsx` - Simplified nav to MVP features

## Architecture Notes

The endpoint flow is now:

```
Portal App (port 5000)
  ↓
  ├─ Portal tenant auth → creates token
  └─ POST /api/wallet/credentials/accept-offer
      ↓
      Main API (port 3000)
      ├─ Validates tenant token
      ├─ Resolves issuer credential offer
      ├─ Uses base agent for OID4VC holder module
      └─ Stores credential in tenant wallet
```

**Never** route `accept-offer` to holder-api (port 6000) - it lacks proper tenant security context.
