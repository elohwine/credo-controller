import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'RequestContextValidator' })

/**
 * Keys that must never appear in any request context regardless of request type.
 *
 * This prevents credential material, auth tokens, key material, and PII from
 * leaking into the operational requests table via context_json.
 */
const GLOBAL_DENIED_KEYS = new Set<string>([
  // Raw credential / presentation material
  'credential',
  'vc',
  'vp',
  'jwt',
  'token',
  'sd_jwt',
  'sdjwt',
  'mdoc',
  'rawCredential',
  'raw_credential',
  'credentialJwt',
  'credential_jwt',
  'verifiableCredential',
  'verifiable_credential',
  // Key material
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'seed',
  'mnemonic',
  'keyMaterial',
  'key_material',
  'signingKey',
  'signing_key',
  'encryptionKey',
  'encryption_key',
  // Auth secrets
  'password',
  'passphrase',
  'pin',
  'secret',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'bearerToken',
  'bearer_token',
])

/**
 * Per-requestType allowed context key sets.
 * Only known, safe metadata keys are permitted for each module.
 * Unknown requestTypes are warned but allowed for forward compatibility.
 */
const CONTEXT_SCHEMAS = new Map<string, ReadonlySet<string>>([
  [
    'finance.payment_request',
    new Set([
      'paymentReference',
      'invoiceRef',
      'payeeRef',
      'purposeCode',
      'ledgerRef',
      'accountRef',
      'bankRef',
      'paymentMethod',
    ]),
  ],
  [
    'finance.expense_claim',
    new Set(['receiptRef', 'categoryCode', 'projectRef', 'costCentreRef', 'periodRef', 'merchantRef', 'currencyCode']),
  ],
  [
    'finance.purchase_order',
    new Set(['supplierRef', 'deliveryRef', 'termsRef', 'lineItemCount', 'poRef', 'contractRef', 'deliveryLocationRef']),
  ],
  [
    'procurement.requisition',
    new Set(['categoryCode', 'supplierRef', 'urgency', 'justificationRef', 'projectRef', 'budgetRef', 'deliveryRef']),
  ],
  [
    'procurement.supplier_onboarding',
    new Set(['supplierRef', 'categoryCode', 'verificationRef', 'contractRef', 'countryCode', 'registrationRef']),
  ],
  [
    'hr.onboarding',
    new Set(['roleRef', 'departmentRef', 'startDate', 'locationRef', 'contractRef', 'gradeRef', 'managerRef']),
  ],
  [
    'hr.offboarding',
    new Set(['roleRef', 'departmentRef', 'endDate', 'handoverRef', 'reasonCode', 'equipmentReturnRef']),
  ],
  ['hr.delegation_request', new Set(['delegateRef', 'scopeRef', 'validFrom', 'validUntil', 'reasonCode'])],
  [
    'field.site_access',
    new Set([
      'siteRef',
      'accessPurpose',
      'validFrom',
      'validUntil',
      'supervisorRef',
      'equipmentRef',
      'safetyBriefingRef',
    ]),
  ],
  [
    'field.inspection',
    new Set(['siteRef', 'checklistRef', 'scheduledAt', 'assetRef', 'reportRef', 'inspectionTypeCode']),
  ],
  [
    'field.maintenance',
    new Set(['assetRef', 'workOrderRef', 'priorityCode', 'scheduledAt', 'technicianRef', 'partsRef', 'locationRef']),
  ],
  ['platform.general', new Set(['purposeCode', 'referenceCode', 'notes', 'tags', 'externalRef'])],
])

export interface ContextValidationResult {
  valid: boolean
  /** Hard failures that must block persistence. */
  errors: string[]
  /** Non-blocking advisory messages. */
  warnings: string[]
}

/**
 * Validates `context_json` before it is persisted into the `requests` table.
 *
 * Validation is layered:
 *  1. Global denied-key check across all top-level and one-level-nested keys.
 *  2. JWT/credential-string pattern detection in scalar values.
 *  3. JSON-LD `@context` field detection (would indicate a raw credential object).
 *  4. Per-requestType allowed-key whitelist for known module types.
 *  5. Unknown requestTypes emit a warning but are not rejected.
 */
export class RequestContextValidator {
  public validate(requestType: string, context: Record<string, unknown>): ContextValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Layer 1: global denied keys (top-level)
    const deniedTopLevel = Object.keys(context).filter((k) => GLOBAL_DENIED_KEYS.has(k))
    if (deniedTopLevel.length > 0) {
      errors.push(`Context contains disallowed keys: ${deniedTopLevel.join(', ')}`)
    }

    for (const [key, value] of Object.entries(context)) {
      // Layer 2: JWT-like string detection
      if (typeof value === 'string' && this.looksLikeJwt(value)) {
        errors.push(
          `Context key '${key}' appears to contain a JWT — credential material must not be stored in context_json`,
        )
      }

      // Layer 3: JSON-LD / raw credential object detection
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>
        if ('@context' in nested) {
          errors.push(
            `Context key '${key}' appears to contain a JSON-LD document — raw credentials must not be stored in context_json`,
          )
        }
        // Denied keys inside nested objects
        const deniedNested = Object.keys(nested).filter((k) => GLOBAL_DENIED_KEYS.has(k))
        if (deniedNested.length > 0) {
          errors.push(`Nested context key '${key}' contains disallowed sub-keys: ${deniedNested.join(', ')}`)
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings }
    }

    // Layer 4: per-requestType allowed-key whitelist
    const schema = CONTEXT_SCHEMAS.get(requestType)
    if (!schema) {
      warnings.push(
        `No context schema registered for requestType '${requestType}' — persisting without field-level validation`,
      )
      logger.warn({ requestType, contextKeys: Object.keys(context) }, 'Context stored for unregistered requestType')
      return { valid: true, errors, warnings }
    }

    const unknownKeys = Object.keys(context).filter((k) => !schema.has(k))
    if (unknownKeys.length > 0) {
      errors.push(
        `Context contains keys not permitted for requestType '${requestType}': ${unknownKeys.join(', ')}. ` +
          `Allowed keys: ${[...schema].join(', ')}`,
      )
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * Detects three-part base64url strings that look like JWTs.
   * Does NOT attempt JWT decoding — pattern matching is sufficient to block storage.
   */
  private looksLikeJwt(value: string): boolean {
    const trimmed = value.trim()
    // Three base64url segments separated by dots; each segment non-empty
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return false
    try {
      const headerJson = Buffer.from(trimmed.split('.')[0], 'base64url').toString('utf8')
      const header = JSON.parse(headerJson) as Record<string, unknown>
      return typeof header?.alg === 'string'
    } catch {
      return false
    }
  }
}

export const requestContextValidator = new RequestContextValidator()
