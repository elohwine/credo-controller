import axios from 'axios'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Alert, Loader, Text } from '@mantine/core'
import CredentialOfferCard from '@/components/credential/CredentialOfferCard'
import { useRequireOrgContext } from '@/lib/portalContext'
import { holderCardName } from '@/lib/holderActivity'
import { getPreferredTenantId, getPreferredTenantToken, isOrgContextActive } from '@/utils/portalTenant'

type Offer = { rowId: string; credentialType: string; offerUri: string; expiresAt: string | null }

export default function OfferPage() {
  const router = useRouter()
  const ctx = useRequireOrgContext('/inbox')
  const orgTenantId = ctx.activeOrg?.orgTenantId
  const rowId = typeof router.query.rowId === 'string' ? router.query.rowId : null
  const [offer, setOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localOffer, setLocalOffer] = useState(false)

  useEffect(() => {
    if (!router.isReady || !ctx.mounted || !ctx.isOrg || !orgTenantId) return
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && isOrgContextActive() && getPreferredTenantId() === orgTenantId
    setOffer(null)
    setError(null)
    setLocalOffer(false)
    if (!rowId) {
      setError(
        'Choose a current offer from Credential operations. Legacy selections do not create offers automatically.',
      )
      setLoading(false)
      return
    }
    const token = getPreferredTenantToken()
    if (!token) {
      setError('Your organization session is unavailable. Sign in again.')
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const backend = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
        const response = await axios.get<Offer>(
          `${backend}/api/organizations/credential-operations/offers/${encodeURIComponent(rowId)}/link`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
        )
        if (current()) {
          const wrapper = new URL(response.data.offerUri)
          const inner = wrapper.searchParams.get('credential_offer_uri')
          const host = (inner ? new URL(inner) : wrapper).hostname
          setLocalOffer(['localhost', '127.0.0.1', '[::1]'].includes(host))
          setOffer(response.data)
        }
      } catch (failure: unknown) {
        if (!current()) return
        setError(
          axios.isAxiosError<{ message?: string }>(failure)
            ? failure.response?.data?.message || failure.message
            : failure instanceof Error
              ? failure.message
              : 'Could not load the offer.',
        )
      } finally {
        if (current()) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [ctx.isOrg, ctx.mounted, orgTenantId, router.isReady, rowId])

  return (
    <>
      <Head>
        <title>Credential offer | Credentis</title>
      </Head>
      <div className="min-h-screen bg-white px-4 py-10">
        <div className="flex justify-center mb-8">
          <Link href="/organization/credential-operations">
            <img src="/credentis-logo.png" alt="Credentis" style={{ height: 35, width: 'auto' }} />
          </Link>
        </div>
        <div className="max-w-md mx-auto">
          <Link href="/organization/credential-operations" className="inline-block text-sm text-gray-600 mb-6">
            &larr; Back to credentials
          </Link>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader aria-label="Loading credential offer" />
            </div>
          ) : error ? (
            <Alert color="red" title="Offer unavailable">
              {error}
            </Alert>
          ) : (
            ctx.isOrg &&
            offer && (
              <>
                {localOffer && (
                  <Alert color="yellow" mb="lg" title="Local-only offer">
                    This older offer points to localhost and cannot be opened on a phone. Replace it from its source
                    flow using the public API address; resending the same offer will not fix its address.
                  </Alert>
                )}
                <CredentialOfferCard
                  key={offer.rowId}
                  offerUri={offer.offerUri}
                  credentialType={holderCardName(offer.credentialType)}
                />
                <Text size="sm" c="dimmed" ta="center" mt="lg">
                  Share privately with the intended recipient. Acceptance is confirmed separately in their wallet.
                </Text>
                {offer.expiresAt && (
                  <Text size="xs" c="dimmed" ta="center" mt="xs">
                    Expires {new Date(offer.expiresAt).toLocaleString()}
                  </Text>
                )}
              </>
            )
          )}
        </div>
      </div>
    </>
  )
}
