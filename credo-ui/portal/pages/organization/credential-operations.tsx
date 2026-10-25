import { feedback } from '@/lib/feedback';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import Credential from '@/components/walt/credential/Credential'
import BaseModal from '@/components/walt/modal/BaseModal'
import VCClaimsForm, { ClaimsSchema } from '@/components/forms/VCClaimsForm'
import { useRequireOrgContext } from '@/lib/portalContext'
import { holderCardName } from '@/lib/holderActivity'
import { getPreferredTenantId, getPreferredTenantToken, isOrgContextActive } from '@/utils/portalTenant'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react'

type OfferRow = {
  rowId: string
  walletTenantId: string
  sourceType: string
  credentialType: string
  title: string | null
  createdAt: string
  acceptedAt: string | null
  lastError: string | null
  lifecycleStatus: 'pending' | 'accepted' | 'withdrawn' | 'resolved' | 'expired'
}

type IssuedRow = {
  credentialId: string
  credentialDefinitionId: string
  issuedAt: string | null
  revoked: boolean
  revocationReason: string | null
  allocationStatus: 'valid' | 'revoked' | 'suspended' | null
}

type LifecycleResponse = {
  offers: OfferRow[]
  issued: IssuedRow[]
}

type CatalogueItem = {
  credentialType: string
  directIssue: boolean
  schemaId?: string
  workflows: Array<{ workflowType: string; name: string }>
}

const statusColor = (status: string) => {
  if (status === 'accepted' || status === 'valid') return 'green'
  if (status === 'revoked' || status === 'withdrawn') return 'red'
  if (status === 'suspended') return 'yellow'
  return 'blue'
}

export default function CredentialOperationsPage() {
  const router = useRouter()
  const ctx = useRequireOrgContext('/inbox')
  const [tab, setTab] = useState<string | null>('credentials')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [lifecycle, setLifecycle] = useState<LifecycleResponse>({ offers: [], issued: [] })
  const [directTypes, setDirectTypes] = useState<string[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [sourceCredential, setSourceCredential] = useState<CatalogueItem | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [issueOpen, setIssueOpen] = useState(false)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [claimsSchema, setClaimsSchema] = useState<ClaimsSchema | null>(null)
  const [claims, setClaims] = useState<Record<string, unknown>>({})
  const [rawClaims, setRawClaims] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  const schemaRequest = useRef(0)
  const [walletTenantId, setWalletTenantId] = useState('')
  const [credentialType, setCredentialType] = useState<string | null>(null)
  const [claimsText, setClaimsText] = useState('{}')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueBody, setIssueBody] = useState('')
  const [operatorReason, setOperatorReason] = useState('')
  const [pendingAction, setPendingAction] = useState<{
    id: string
    action: 'reoffer' | 'replace' | 'revoke'
    title: string
  } | null>(null)

  const activeOrgTenantId = ctx.activeOrg?.orgTenantId || null
  const token = useMemo(() => (ctx.isOrg ? getPreferredTenantToken() || null : null), [activeOrgTenantId, ctx.isOrg])

  const backend = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const isCurrentOrg = useCallback(
    () => Boolean(activeOrgTenantId && isOrgContextActive() && getPreferredTenantId() === activeOrgTenantId),
    [activeOrgTenantId],
  )
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token])

  const load = useCallback(async () => {
    if (!headers || !ctx.isOrg || !activeOrgTenantId || !isCurrentOrg()) return
    setLoading(true)
    try {
      const [lifecycleRes, catalogueRes] = await Promise.all([
        axios.get(`${backend}/api/organizations/credential-operations/lifecycle`, { headers }),
        axios.get<{ items: CatalogueItem[] }>(`${backend}/api/organizations/credential-operations/catalogue`, {
          headers,
        }),
      ])
      if (!isCurrentOrg()) return
      setLifecycle(lifecycleRes.data || { offers: [], issued: [] })
      setCatalogue(catalogueRes.data.items)
      setDirectTypes(catalogueRes.data.items.filter((item) => item.directIssue).map((item) => item.credentialType))
      setLoadError(null)
    } catch (error: any) {
      if (!isCurrentOrg()) return
      setLoadError(error?.response?.data?.message || error?.message || 'Request failed')
      feedback.fromError(error, { title: 'Could not load credential operations', fallback: 'Request failed' })
    } finally {
      if (isCurrentOrg()) setLoading(false)
    }
  }, [activeOrgTenantId, backend, ctx.isOrg, headers, isCurrentOrg])

  useEffect(() => {
    schemaRequest.current += 1
    setIssueOpen(false)
    setSourceCredential(null)
    setPendingAction(null)
    setTab('credentials')
    setCredentialType(null)
    setClaimsSchema(null)
    setWalletTenantId('')
    setOperatorReason('')
    setLifecycle({ offers: [], issued: [] })
    setDirectTypes([])
    setCatalogue([])
    if (!ctx.mounted || !ctx.isOrg) return
    void load()
  }, [ctx.mounted, ctx.isOrg, load])

  const closeIssue = () => {
    if (submitting) return
    schemaRequest.current += 1
    setIssueOpen(false)
  }

  const openIssue = async (type: string) => {
    if (!headers || !isCurrentOrg() || !directTypes.includes(type)) return
    const requestId = ++schemaRequest.current
    setCredentialType(type)
    setClaims({})
    setClaimsText('{}')
    setRawClaims(false)
    setIssueTitle('')
    setIssueBody('')
    setWalletTenantId('')
    setClaimsSchema(null)
    setIssueError(null)
    setSchemaLoading(true)
    setIssueOpen(true)
    try {
      const definition = catalogue.find((item) => item.credentialType === type)
      if (!definition?.schemaId) throw new Error('The credential definition is unavailable. Refresh and try again.')
      const response = await axios.get<{ jsonSchema: ClaimsSchema }>(
        `${backend}/oidc/schemas/${encodeURIComponent(definition.schemaId)}`,
        { headers },
      )
      if (!isCurrentOrg() || requestId !== schemaRequest.current) return
      const subject = response.data.jsonSchema?.properties?.credentialSubject
      if (!subject?.properties)
        throw new Error('The credential claims schema is unavailable. Review the registered definition.')
      setClaimsSchema(subject)
    } catch (error: any) {
      if (!isCurrentOrg() || requestId !== schemaRequest.current) return
      setIssueError(error?.response?.data?.message || error?.message || 'Could not load credential schema')
    } finally {
      if (isCurrentOrg() && requestId === schemaRequest.current) setSchemaLoading(false)
    }
  }

  const openOfferLink = useCallback(
    async (rowId: string) => {
      if (!isCurrentOrg()) return
      await router.push({ pathname: '/offer', query: { rowId } })
    },
    [isCurrentOrg, router],
  )

  const callOfferAction = useCallback(
    async (offerRowId: string, path: 'reoffer' | 'replace') => {
      if (!headers || !isCurrentOrg()) return
      setSubmitting(true)
      try {
        const response = await axios.post<{ newRowId?: string }>(
          `${backend}/api/organizations/credential-operations/offers/${encodeURIComponent(offerRowId)}/${path}`,
          { reason: operatorReason },
          { headers },
        )
        if (!isCurrentOrg()) return
        feedback.success('The inbox item was updated.', { title: path === 'replace' ? 'Replacement sent' : 'Offer re-sent' })
        setPendingAction(null)
        await load()
        await openOfferLink(path === 'replace' && response.data.newRowId ? response.data.newRowId : offerRowId)
      } catch (error: any) {
        if (!isCurrentOrg()) return
        feedback.fromError(error, { title: path === 'replace' ? 'Could not replace offer' : 'Could not reoffer', fallback: 'Request failed' })
      } finally {
        setSubmitting(false)
      }
    },
    [backend, headers, isCurrentOrg, load, openOfferLink, operatorReason],
  )

  const callStatusAction = useCallback(
    async (credentialId: string) => {
      if (!headers || !isCurrentOrg()) return
      setSubmitting(true)
      try {
        await axios.post(
          `${backend}/api/organizations/credential-operations/credentials/${encodeURIComponent(credentialId)}/status`,
          { action: 'revoke', reason: operatorReason },
          { headers },
        )
        if (!isCurrentOrg()) return
        feedback.success('The revocation was recorded in the credential status list.', { title: 'Credential revoked' })
        setPendingAction(null)
        await load()
      } catch (error: any) {
        if (!isCurrentOrg()) return
        feedback.fromError(error, { title: 'Could not revoke credential', fallback: 'Request failed' })
      } finally {
        setSubmitting(false)
      }
    },
    [backend, headers, isCurrentOrg, load, operatorReason],
  )

  const issueDirect = useCallback(async () => {
    if (!headers || !isCurrentOrg()) return
    if (!walletTenantId.trim() || !credentialType || !claimsSchema || !directTypes.includes(credentialType)) {
      feedback.warn('Wallet tenant and type are required.', { title: 'Missing details' })
      return
    }
    let submittedClaims: Record<string, unknown> = claims
    try {
      if (rawClaims) {
        const parsed: unknown = JSON.parse(claimsText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('Claims must be a JSON object.')
        submittedClaims = parsed as Record<string, unknown>
      }
    } catch {
      setIssueError('Claims must be a valid JSON object.')
      return
    }
    if (Object.prototype.hasOwnProperty.call(submittedClaims, 'id')) {
      setIssueError('The holder identity is supplied by the recipient wallet; claims cannot override it.')
      return
    }
    setIssueError(null)
    setSubmitting(true)
    try {
      const response = await axios.post<{ rowId: string }>(
        `${backend}/api/organizations/credential-operations/direct-offers`,
        {
          walletTenantId: walletTenantId.trim(),
          credentialType,
          claims: submittedClaims,
          title: issueTitle || undefined,
          body: issueBody || undefined,
        },
        { headers },
      )
      if (!isCurrentOrg()) return
      feedback.success('The recipient will accept this from their personal inbox.', { title: 'Direct offer queued' })
      setIssueOpen(false)
      await load()
      await openOfferLink(response.data.rowId)
    } catch (error: any) {
      if (!isCurrentOrg()) return
      setIssueError(error?.response?.data?.message || error?.message || 'Request failed')
      feedback.fromError(error, { title: 'Could not queue direct offer', fallback: 'Request failed' })
    } finally {
      setSubmitting(false)
    }
  }, [
    backend,
    claims,
    claimsSchema,
    claimsText,
    credentialType,
    directTypes,
    headers,
    isCurrentOrg,
    issueBody,
    issueTitle,
    load,
    openOfferLink,
    rawClaims,
    walletTenantId,
  ])

  return (
    <Layout title="Credential operations">
      <Stack gap="xl" maw={1080} mx="auto" py="lg">
        <Box ta="center">
          <Title order={1} c="#0A3D5C">
            Credentials
          </Title>
          <Text c="dimmed" mt="sm">
            Issue and manage {ctx.activeOrg?.name || 'your organization'} records.
          </Text>
          <Button
            variant="subtle"
            size="xs"
            mt="sm"
            leftSection={<IconRefresh size={14} />}
            onClick={() => void load()}
            loading={loading || submitting}
          >
            Refresh
          </Button>
        </Box>

        {loadError && (
          <Alert color="red" title="Could not load credential operations">
            {loadError}
          </Alert>
        )}

        <Tabs value={tab} onChange={setTab}>
          <Tabs.List justify="center" mb="xl">
            <Tabs.Tab value="credentials">Credential types</Tabs.Tab>
            <Tabs.Tab value="offers">Offers ({lifecycle.offers.length})</Tabs.Tab>
            <Tabs.Tab value="issued">Issued ({lifecycle.issued.length})</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="credentials">
            <Stack gap="lg" maw={960} mx="auto">
              <Text c="dimmed" size="sm" ta="center">
                Choose a record configured for this organization.
              </Text>
              {loading ? (
                <Loader size="sm" />
              ) : !loadError && catalogue.length === 0 ? (
                <Text c="dimmed">
                  No credential types are enabled by this organization’s current setup and workflows.
                </Text>
              ) : (
                !loadError && (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
                    {catalogue.map((item) => (
                      <Credential
                        key={item.credentialType}
                        id={item.credentialType}
                        title={holderCardName(item.credentialType)}
                        description={
                          item.directIssue
                            ? 'Prepare offer · recipient acceptance required'
                            : `From ${item.workflows.map((source) => source.name).join(', ')}`
                        }
                        actionLabel={`${item.directIssue ? 'Issue' : 'View'} ${item.credentialType}`}
                        onClick={() =>
                          item.directIssue ? void openIssue(item.credentialType) : setSourceCredential(item)
                        }
                      />
                    ))}
                  </SimpleGrid>
                )
              )}
            </Stack>
          </Tabs.Panel>

          <BaseModal
            show={issueOpen && ctx.isOrg}
            onClose={closeIssue}
            title={`Issue ${holderCardName(credentialType || undefined)}`}
            size="lg"
            showClose={!submitting}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void issueDirect()
              }}
            >
              <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <Stack gap="md">
                  <Text size="sm" c="dimmed">
                    Prepare an offer for the recipient to review and accept in their wallet.
                  </Text>
                  <TextInput
                    required
                    label="Recipient wallet tenant ID"
                    description="Use the recipient’s personal wallet, not the organization tenant."
                    value={walletTenantId}
                    onChange={(event) => setWalletTenantId(event.currentTarget.value)}
                  />
                  <TextInput
                    label="Title (optional)"
                    value={issueTitle}
                    onChange={(event) => setIssueTitle(event.currentTarget.value)}
                  />
                  <TextInput
                    label="Message (optional)"
                    value={issueBody}
                    onChange={(event) => setIssueBody(event.currentTarget.value)}
                  />
                  {schemaLoading ? (
                    <Loader size="sm" />
                  ) : (
                    claimsSchema && (
                      <>
                        <Group justify="space-between">
                          <Title order={4}>Credential claims</Title>
                          <Button
                            size="xs"
                            variant="subtle"
                            type="button"
                            onClick={() => {
                              if (!rawClaims) setClaimsText(JSON.stringify(claims, null, 2))
                              else {
                                try {
                                  const parsed: unknown = JSON.parse(claimsText)
                                  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                                    throw new Error('Invalid claims')
                                  setClaims(parsed as Record<string, unknown>)
                                } catch {
                                  setIssueError('Claims must be a valid JSON object before returning to the form.')
                                  return
                                }
                              }
                              setIssueError(null)
                              setRawClaims(!rawClaims)
                            }}
                          >
                            {rawClaims ? 'Use form view' : 'Edit JSON (advanced)'}
                          </Button>
                        </Group>
                        {rawClaims ? (
                          <Textarea
                            label="Claims JSON"
                            minRows={6}
                            autosize
                            value={claimsText}
                            onChange={(event) => setClaimsText(event.currentTarget.value)}
                          />
                        ) : (
                          <VCClaimsForm
                            key={credentialType}
                            credentialType={credentialType || ''}
                            claims={claims}
                            onChange={setClaims}
                            schema={claimsSchema}
                          />
                        )}
                      </>
                    )
                  )}
                  {issueError && (
                    <Alert color="red" title="Could not prepare offer">
                      {issueError}
                    </Alert>
                  )}
                  <Group justify="flex-end">
                    <Button type="button" variant="default" onClick={closeIssue}>
                      Cancel
                    </Button>
                    <Button type="submit" loading={submitting} disabled={schemaLoading || !claimsSchema}>
                      Queue offer for acceptance
                    </Button>
                  </Group>
                </Stack>
              </fieldset>
            </form>
          </BaseModal>

          <BaseModal
            show={Boolean(sourceCredential) && ctx.isOrg}
            onClose={() => setSourceCredential(null)}
            title={holderCardName(sourceCredential?.credentialType)}
            size="lg"
          >
            <Stack gap="md">
              <Text c="dimmed">This record is prepared by its workflow after the required approvals and evidence.</Text>
              <Title order={4}>Configured source workflows</Title>
              {sourceCredential?.workflows.map((source) => <Text key={source.workflowType}>{source.name}</Text>)}
              <Group justify="flex-end">
                <Button component="a" href="/organization/setup" variant="subtle">
                  Workflow settings
                </Button>
                <Button
                  onClick={() => {
                    setSourceCredential(null)
                    setTab('offers')
                  }}
                >
                  View existing offers
                </Button>
              </Group>
            </Stack>
          </BaseModal>

          <BaseModal
            show={Boolean(pendingAction) && ctx.isOrg}
            onClose={() => {
              if (!submitting) setPendingAction(null)
            }}
            title={`${pendingAction?.action === 'revoke' ? 'Revoke credential' : pendingAction?.action === 'replace' ? 'Replace offer' : 'Reoffer credential'}`}
            size="md"
            showClose={!submitting}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!pendingAction || operatorReason.trim().length < 3) return
                if (pendingAction.action === 'revoke') void callStatusAction(pendingAction.id)
                else void callOfferAction(pendingAction.id, pendingAction.action)
              }}
            >
              <Stack gap="md">
                <Text fw={500}>{pendingAction?.title}</Text>
                <Text size="sm" c="dimmed">
                  {pendingAction?.action === 'revoke'
                    ? 'Revocation invalidates this credential. This action is recorded in the status list.'
                    : 'The recipient must still review and accept the offer. This action does not accept it for them.'}
                </Text>
                <Textarea
                  required
                  minLength={3}
                  maxLength={240}
                  label="Reason"
                  value={operatorReason}
                  onChange={(event) => setOperatorReason(event.currentTarget.value)}
                  disabled={submitting}
                />
                <Group justify="flex-end">
                  <Button variant="default" disabled={submitting} onClick={() => setPendingAction(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    color={pendingAction?.action === 'revoke' ? 'red' : undefined}
                    disabled={operatorReason.trim().length < 3}
                    loading={submitting}
                  >
                    Confirm
                  </Button>
                </Group>
              </Stack>
            </form>
          </BaseModal>

          <Tabs.Panel value="offers">
            <Card withBorder radius="lg" p="lg">
              <Title order={4} mb="sm">
                Credential offers
              </Title>
              {loading ? (
                <Loader size="sm" />
              ) : lifecycle.offers.length === 0 ? (
                <Text c="dimmed">No offers found for this organization.</Text>
              ) : (
                <Table.ScrollContainer minWidth={760}>
                  <Table highlightOnHover verticalSpacing="md">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Recipient wallet</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Created</Table.Th>
                        <Table.Th>Last error</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {lifecycle.offers.map((offer) => (
                        <Table.Tr key={offer.rowId}>
                          <Table.Td>{offer.title || holderCardName(offer.credentialType)}</Table.Td>
                          <Table.Td>{offer.walletTenantId}</Table.Td>
                          <Table.Td>
                            <Badge color={statusColor(offer.lifecycleStatus)}>{offer.lifecycleStatus}</Badge>
                          </Table.Td>
                          <Table.Td>{new Date(offer.createdAt).toLocaleString()}</Table.Td>
                          <Table.Td>{offer.lastError || '—'}</Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => void openOfferLink(offer.rowId)}
                                disabled={offer.lifecycleStatus !== 'pending'}
                              >
                                View offer
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => {
                                  setOperatorReason('')
                                  setPendingAction({
                                    id: offer.rowId,
                                    action: 'reoffer',
                                    title: offer.title || offer.credentialType,
                                  })
                                }}
                                disabled={offer.lifecycleStatus !== 'pending' || submitting}
                              >
                                Reoffer
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => {
                                  setOperatorReason('')
                                  setPendingAction({
                                    id: offer.rowId,
                                    action: 'replace',
                                    title: offer.title || offer.credentialType,
                                  })
                                }}
                                disabled={!['pending', 'expired'].includes(offer.lifecycleStatus) || submitting}
                              >
                                Replace
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="issued">
            <Card withBorder radius="lg" p="lg">
              <Title order={4} mb="sm">
                Issued credentials
              </Title>
              {loading ? (
                <Loader size="sm" />
              ) : lifecycle.issued.length === 0 ? (
                <Text c="dimmed">No issued credentials found for this organization.</Text>
              ) : (
                <Table.ScrollContainer minWidth={680}>
                  <Table highlightOnHover verticalSpacing="md">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Credential</Table.Th>
                        <Table.Th>Definition</Table.Th>
                        <Table.Th>Status list</Table.Th>
                        <Table.Th>Issued</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {lifecycle.issued.map((item) => (
                        <Table.Tr key={item.credentialId}>
                          <Table.Td>{item.credentialId}</Table.Td>
                          <Table.Td>{item.credentialDefinitionId}</Table.Td>
                          <Table.Td>
                            <Badge
                              color={statusColor(item.allocationStatus || (item.revoked ? 'revoked' : 'untracked'))}
                            >
                              {item.allocationStatus || (item.revoked ? 'revoked' : 'untracked')}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{item.issuedAt ? new Date(item.issuedAt).toLocaleString() : '—'}</Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => {
                                  setOperatorReason('')
                                  setPendingAction({
                                    id: item.credentialId,
                                    action: 'revoke',
                                    title: item.credentialDefinitionId,
                                  })
                                }}
                                disabled={item.allocationStatus !== 'valid' || submitting}
                              >
                                Revoke
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>
          </Tabs.Panel>
        </Tabs>

        {!ctx.isOrg && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            Switch into an organization to use credential operations.
          </Alert>
        )}
      </Stack>
    </Layout>
  )
}
