/**
 * An organisation sign-in names the organisation's own wallet. Only the people who run the
 * organisation may open the records it holds (site inspections, completions, receipts); other
 * members still read their own wallet through their personal sign-in.
 */
export function canReadOrganisationRecords(
  user: { tenantId?: string; orgRole?: string } | undefined,
  walletId: string,
) {
  if (!user?.orgRole || user.tenantId !== walletId) return true
  return ['owner', 'admin'].includes(String(user.orgRole))
}
