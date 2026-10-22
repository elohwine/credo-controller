import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core'
import { IconBuilding, IconCards, IconDownload, IconHandStop, IconShare, IconShieldCheck, IconX } from '@tabler/icons-react'
import dayjs from 'dayjs'
import {
  HOLDER_ACTIVITY_CSV_COLUMNS,
  HOLDER_ACTIVITY_FILTERS,
  describeHolderActivity,
  holderActivityCsvRow,
  holderActivityKindsFor,
  holderActivityPurpose,
  holderCardName,
  holderClaimLabels,
  partnerScopeLine,
  partnerSummaryLine,
  type HolderActivityCopy,
  type HolderActivityEntry,
  type HolderActivityFilter,
  type HolderActivityPartner,
} from '@/lib/holderActivity'
import { csvFrom, EXPORT_MIME, exportFileName, saveExport } from '@/lib/exportFile'

/**
 * Your activity: who has your data, what you shared, and for what.
 *
 * Two sections. "Who has your data" is one card per organisation: the cards they gave you,
 * what the card lets them check, how often you shared with them, whether you are a member.
 * "Everything" is the log itself, as a timeline or a table, with an export. A row opens the
 * detail: date and time, organisation, step and job, what was asked, what you shared, what
 * stayed on your phone, the outcome and the reference.
 *
 * Same file on the website (`credo-ui/portal/components/activity/PersonalActivityPanel.tsx`)
 * and the phone (`credo-ui/mobile/components/shared/PersonalActivityPanel.tsx`). The caller
 * passes the HTTP client and the step-label function, so this file stays identical.
 */

export interface PersonalActivityClient {
  get: (path: string, params?: Record<string, unknown>) => Promise<any>
}

export interface PersonalActivityPanelProps {
  client: PersonalActivityClient
  labelStep: HolderActivityCopy['labelStep']
  /** Open this row's detail straight away (from a Home strip tap). */
  initialEntryId?: string
  /** Fewer rows and no partner section (Home strip embedding). */
  compact?: boolean
  /** Called when the detail opened from `initialEntryId` is closed, so the caller can drop it from the URL. */
  onEntryClosed?: () => void
  /** `bottom` slides the detail up from the bottom (phone); `center` is a popup (website). */
  sheet?: 'bottom' | 'center'
}

const PAGE_SIZE = 30

function when(value: string | undefined): string {
  if (!value) return ''
  const date = dayjs(value)
  return date.isValid() ? date.format('D MMM YYYY, HH:mm') : value
}

function KindIcon({ entry }: { entry: HolderActivityEntry }) {
  const { color } = describeHolderActivity(entry, { labelStep: () => undefined })
  const icon =
    entry.kind === 'card_received' ? <IconCards size={14} />
      : entry.kind === 'card_withdrawn' ? <IconX size={14} />
        : entry.kind === 'share_declined' ? <IconHandStop size={14} />
          : entry.kind === 'share_verified' ? <IconShieldCheck size={14} />
            : <IconShare size={14} />
  return (
    <ThemeIcon size={22} radius="xl" color={color} variant="light">
      {icon}
    </ThemeIcon>
  )
}

export default function PersonalActivityPanel({
  client,
  labelStep,
  initialEntryId,
  compact = false,
  onEntryClosed,
  sheet = 'center',
}: PersonalActivityPanelProps) {
  const copy = useMemo<HolderActivityCopy>(() => ({ labelStep }), [labelStep])
  const [partners, setPartners] = useState<HolderActivityPartner[]>([])
  const [items, setItems] = useState<HolderActivityEntry[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<HolderActivityFilter>('all')
  const [orgFilter, setOrgFilter] = useState<string | null>(null)
  const [view, setView] = useState<'timeline' | 'table'>('timeline')
  const [open, setOpen] = useState<HolderActivityEntry | null>(null)
  // The linked row opens once. Without this, closing it re-opened it from the link straight away.
  const openedFromLink = useRef<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(
    async (cursor?: string) => {
      const params: Record<string, unknown> = { limit: compact ? 5 : PAGE_SIZE }
      const kinds = holderActivityKindsFor(filter)
      if (kinds.length) params.kind = kinds.join(',')
      if (orgFilter) params.orgTenantId = orgFilter
      if (cursor) params.cursor = cursor
      const page = await client.get('/api/wallet/activity', params)
      const rows: HolderActivityEntry[] = Array.isArray(page?.items) ? page.items : []
      setTotal(Number(page?.total) || 0)
      setNextCursor(typeof page?.nextCursor === 'string' ? page.nextCursor : undefined)
      setItems((previous) => (cursor ? [...previous, ...rows] : rows))
      return rows
    },
    [client, compact, filter, orgFilter],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      load(),
      compact ? Promise.resolve({ items: [] }) : client.get('/api/wallet/activity/partners').catch(() => ({ items: [] })),
    ])
      .then(([, partnerPage]) => {
        if (cancelled) return
        setPartners(Array.isArray(partnerPage?.items) ? partnerPage.items : [])
      })
      .catch((err: any) => {
        if (cancelled) return
        setError(String(err?.response?.data?.message || err?.message || 'Could not load your activity'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, compact, load])

  // A Home strip tap names one row: open it once the first page is in.
  useEffect(() => {
    if (!initialEntryId || openedFromLink.current === initialEntryId) return
    const found = items.find((entry) => entry.id === initialEntryId)
    if (!found) return
    openedFromLink.current = initialEntryId
    setOpen(found)
  }, [initialEntryId, items])

  const closeDetail = () => {
    const fromLink = Boolean(open && initialEntryId && open.id === initialEntryId)
    setOpen(null)
    if (fromLink) onEntryClosed?.()
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      // The whole log, not only the page on screen.
      const all: HolderActivityEntry[] = []
      let cursor: string | undefined
      for (let page = 0; page < 20; page += 1) {
        const params: Record<string, unknown> = { limit: 200 }
        if (orgFilter) params.orgTenantId = orgFilter
        const kinds = holderActivityKindsFor(filter)
        if (kinds.length) params.kind = kinds.join(',')
        if (cursor) params.cursor = cursor
        const result = await client.get('/api/wallet/activity', params)
        all.push(...((Array.isArray(result?.items) ? result.items : []) as HolderActivityEntry[]))
        cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : undefined
        if (!cursor) break
      }
      const body = csvFrom([...HOLDER_ACTIVITY_CSV_COLUMNS], all.map((entry) => holderActivityCsvRow(entry, copy)))
      await saveExport(exportFileName(`my-activity-${dayjs().format('YYYY-MM-DD')}`, 'csv'), EXPORT_MIME.csv, body)
    } finally {
      setExporting(false)
    }
  }

  const detail = open ? describeHolderActivity(open, copy) : null
  const detailBody = (
    <>
      {open && detail && (
        <Stack gap="sm">
          <Group gap="xs">
            <Badge color={detail.color} variant="light">{detail.outcomeLabel}</Badge>
            <Text size="xs" c="dimmed">{when(open.occurredAt)}</Text>
          </Group>
          <DetailRow label="Organisation" value={open.orgName || 'Unknown'} />
          {holderActivityPurpose(open, copy) && <DetailRow label="Step and job" value={holderActivityPurpose(open, copy)} />}
          {open.requestedTypes.length > 0 && (
            <DetailRow
              label={open.kind.startsWith('card') ? 'Card' : 'Cards asked for'}
              value={Array.from(new Set(open.requestedTypes.map(holderCardName))).join(', ')}
            />
          )}
          {open.requestedClaims.length > 0 && (
            <DetailRow
              label={open.kind.startsWith('card') ? 'What the card says' : 'Details asked for'}
              value={holderClaimLabels(open.requestedClaims).join(', ')}
            />
          )}
          {!open.kind.startsWith('card') && open.kind !== 'share_declined' && (
            <DetailRow
              label="What you shared"
              value={
                open.sharedClaims.length
                  ? holderClaimLabels(open.sharedClaims).join(', ')
                  : open.requestedClaims.length
                    ? 'Only that the card is valid'
                    : 'Not written down for this older share'
              }
            />
          )}
          {open.withheldClaims.length > 0 && (
            <DetailRow label="Stayed on your phone" value={holderClaimLabels(open.withheldClaims).join(', ')} />
          )}
          {open.signedLine && <DetailRow label="Signed line" value={open.signedLine} />}
          {open.reason && <DetailRow label={open.kind === 'share_refused' ? 'Why it was not accepted' : 'Note'} value={open.reason} />}
          {(open.reference || open.requestId) && (
            <DetailRow label="Reference" value={open.reference || open.requestId || ''} mono />
          )}
        </Stack>
      )}
    </>
  )
  const orgName = (id: string | null) => partners.find((partner) => partner.orgTenantId === id)?.orgName || ''

  return (
    <Stack gap="md">
      {!compact && (
        <Box>
          <Title order={3}>Your activity</Title>
          <Text size="sm" c="dimmed">
            Who has your data, what you shared, and for what. This list keeps the names of what was
            asked and shared, never the details themselves.
          </Text>
        </Box>
      )}

      {error && (
        <Paper withBorder radius="md" p="md">
          <Text size="sm" c="red">{error}</Text>
        </Paper>
      )}

      {!compact && (
        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="sm">
            <Text fw={600} size="sm">Who has your data</Text>
            {orgFilter && (
              <Button size="xs" variant="subtle" onClick={() => setOrgFilter(null)}>Show everyone</Button>
            )}
          </Group>
          {loading && partners.length === 0 && <Loader size="sm" />}
          {!loading && partners.length === 0 && (
            <Text size="sm" c="dimmed">No organisation holds a card of yours yet.</Text>
          )}
          <Stack gap="sm">
            {partners.map((partner) => {
              const live = partner.cards.filter((card) => !card.withdrawn)
              const selected = orgFilter === partner.orgTenantId
              return (
                <Paper
                  key={partner.orgTenantId}
                  withBorder
                  radius="md"
                  p="sm"
                  style={{ cursor: 'pointer', borderColor: selected ? 'var(--mantine-color-indigo-5)' : undefined }}
                  onClick={() => setOrgFilter(selected ? null : partner.orgTenantId)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                      <ThemeIcon size={34} radius="md" color="indigo" variant="light">
                        <IconBuilding size={18} />
                      </ThemeIcon>
                      <Box style={{ minWidth: 0 }}>
                        <Text fw={600} size="sm" truncate>{partner.orgName}</Text>
                        <Text size="xs" c="dimmed">{partnerSummaryLine(partner)}</Text>
                        <Text size="xs" mt={4}>{partnerScopeLine(partner, copy)}</Text>
                        {live.length > 0 && (
                          <Group gap={4} mt={6}>
                            {Array.from(new Set(live.map((card) => holderCardName(card.type)))).map((name) => (
                              <Badge key={name} size="xs" variant="light" color="violet">{name}</Badge>
                            ))}
                          </Group>
                        )}
                      </Box>
                    </Group>
                    <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                      <Badge size="xs" color={partner.member ? 'green' : 'gray'} variant="light">
                        {partner.member ? 'Member' : 'Not a member'}
                      </Badge>
                      {partner.lastSharedAt && (
                        <Text size="xs" c="dimmed">Last share {dayjs(partner.lastSharedAt).format('D MMM')}</Text>
                      )}
                    </Stack>
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        </Card>
      )}

      <Card withBorder radius="md" padding={compact ? 'sm' : 'md'}>
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Box>
            <Text fw={600} size="sm">
              {orgFilter ? `With ${orgName(orgFilter) || 'this organisation'}` : 'Everything'}
            </Text>
            {!compact && <Text size="xs" c="dimmed">{total === 1 ? '1 entry' : `${total} entries`}</Text>}
          </Box>
          {!compact && (
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportCsv} loading={exporting}>
                Export CSV
              </Button>
              <SegmentedControl
                size="xs"
                value={view}
                onChange={(value) => setView(value as 'timeline' | 'table')}
                data={[{ value: 'timeline', label: 'Timeline' }, { value: 'table', label: 'Table' }]}
              />
            </Group>
          )}
        </Group>
        {!compact && (
          <Group gap={4} mb="sm" style={{ overflowX: 'auto' }} wrap="nowrap">
            {HOLDER_ACTIVITY_FILTERS.map((chip) => (
              <Button
                key={chip.value}
                size="xs"
                radius="xl"
                variant={filter === chip.value ? 'filled' : 'subtle'}
                color={filter === chip.value ? 'indigo' : 'gray'}
                style={{ flexShrink: 0 }}
                onClick={() => setFilter(chip.value)}
              >
                {chip.label}
              </Button>
            ))}
          </Group>
        )}

        {loading && items.length === 0 && <Loader size="sm" />}
        {!loading && items.length === 0 && (
          <Text size="sm" c="dimmed">
            {filter === 'declined'
              ? 'You have not turned down a request yet.'
              : filter === 'shares'
                ? 'You have not shared a card yet. When a step asks for your staff card, the share lands here.'
                : 'Nothing yet. Cards you accept and steps you share land here.'}
          </Text>
        )}

        {items.length > 0 && view === 'timeline' && (
          <Timeline bulletSize={22} lineWidth={2} active={items.length} color="gray">
            {items.map((entry) => {
              const line = describeHolderActivity(entry, copy)
              return (
                <Timeline.Item
                  key={entry.id}
                  bullet={<KindIcon entry={entry} />}
                  color={line.color}
                  title={(
                    <Box onClick={() => setOpen(entry)} style={{ cursor: 'pointer' }}>
                      <Group gap={6} wrap="nowrap" justify="space-between">
                        <Text size="sm" fw={600} style={{ minWidth: 0 }}>{line.title}</Text>
                        <Badge size="xs" variant="light" color={line.color} style={{ flexShrink: 0 }}>{line.outcomeLabel}</Badge>
                      </Group>
                    </Box>
                  )}
                >
                  <Text size="xs" c="dimmed">{when(entry.occurredAt)}</Text>
                  <Text size="xs">{line.summary}</Text>
                </Timeline.Item>
              )
            })}
          </Timeline>
        )}

        {items.length > 0 && view === 'table' && (
          <ScrollArea>
            <Table striped highlightOnHover withTableBorder fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date and time</Table.Th>
                  <Table.Th>What happened</Table.Th>
                  <Table.Th>Organisation</Table.Th>
                  <Table.Th>Step</Table.Th>
                  <Table.Th>Shared</Table.Th>
                  <Table.Th>Kept on your phone</Table.Th>
                  <Table.Th>Outcome</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((entry) => {
                  const line = describeHolderActivity(entry, copy)
                  return (
                    <Table.Tr key={entry.id} onClick={() => setOpen(entry)} style={{ cursor: 'pointer' }}>
                      <Table.Td>{when(entry.occurredAt)}</Table.Td>
                      <Table.Td>{line.title}</Table.Td>
                      <Table.Td>{entry.orgName || ''}</Table.Td>
                      <Table.Td>{holderActivityPurpose(entry, copy)}</Table.Td>
                      <Table.Td>{holderClaimLabels(entry.sharedClaims).join(', ')}</Table.Td>
                      <Table.Td>{holderClaimLabels(entry.withheldClaims).join(', ')}</Table.Td>
                      <Table.Td><Badge size="xs" variant="light" color={line.color}>{line.outcomeLabel}</Badge></Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}

        {!compact && nextCursor && (
          <Button
            mt="sm"
            fullWidth
            variant="default"
            size="xs"
            loading={loadingMore}
            onClick={() => {
              setLoadingMore(true)
              load(nextCursor).finally(() => setLoadingMore(false))
            }}
          >
            Show more
          </Button>
        )}
      </Card>

      {sheet === 'bottom' ? (
        <Drawer
          opened={Boolean(open)}
          onClose={closeDetail}
          position="bottom"
          size="auto"
          title={detail?.title || 'Activity'}
          radius="lg"
          overlayProps={{ backgroundOpacity: 0.6, blur: 2 }}
          styles={{ content: { maxHeight: '85svh' }, body: { paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
        >
          {detailBody}
          <Button fullWidth variant="default" mt="md" onClick={closeDetail}>
            Close
          </Button>
        </Drawer>
      ) : (
        <Modal opened={Boolean(open)} onClose={closeDetail} title={detail?.title || 'Activity'} size="md" centered>
          {detailBody}
        </Modal>
      )}
    </Stack>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="sm" ff={mono ? 'monospace' : undefined} style={{ overflowWrap: 'anywhere' }}>{value}</Text>
    </Box>
  )
}
