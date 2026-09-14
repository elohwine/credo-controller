import { evaluateOrgActionPolicy, type OrgContextBundleCacheEntry } from './orgContextBundle'
import type { ScanMode } from '@/components/scan/ScanModeSheet'

const SCAN_MODE_ACTION_TYPES: Partial<Record<ScanMode, string>> = {
  'approve-requisition': 'workflow.approve_requisition',
  'capture-evidence': 'workflow.capture_evidence',
  'verify-presentation': 'verify.presentation',
  'verify-delivery': 'verify.consume',
}

export function getOrgPolicyActionTypeForScanMode(mode: ScanMode): string | null {
  return SCAN_MODE_ACTION_TYPES[mode] || null
}

export function evaluateScanModePolicy(
  bundle: OrgContextBundleCacheEntry | null,
  mode: ScanMode,
): ReturnType<typeof evaluateOrgActionPolicy> {
  const actionType = getOrgPolicyActionTypeForScanMode(mode)
  if (!actionType) {
    return {
      allowed: true,
      source: 'fallback',
    }
  }

  return evaluateOrgActionPolicy(bundle, {
    actionType,
    evidenceProvided: mode === 'capture-evidence',
    actionTimestamp: new Date().toISOString(),
  })
}
