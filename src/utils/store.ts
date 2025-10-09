// In-memory stores for OIDC & VC issuance (dev only). Replace with persistent DB layer later.

export const credentialOfferStore: Record<string, any> = {}
export const issuedVcStore: Record<string, any> = {}
export const presentationRequestStore: Record<string, any> = {}

// DID records handled in dedicated didStore.ts (remove legacy export here)
