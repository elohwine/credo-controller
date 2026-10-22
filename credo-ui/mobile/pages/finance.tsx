import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Stack,
  Title,
  Text,
  Box,
  Group,
  Badge,
  Card,
  Center,
  Loader,
  Alert,
  Skeleton,
  ThemeIcon,
  Drawer,
  Divider,
  Button,
  TextInput,
  Select,
  ActionIcon,
  Tabs,
  Paper,
  CopyButton,
  Tooltip,
  Modal,
  Code,
  Image,
  Textarea,
  Grid,
  Timeline,
  Progress,
  SegmentedControl,
  NumberInput,
  Checkbox,
  UnstyledButton,
  Collapse,
  Radio,
  Menu,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { usePullRefresh } from '@/lib/pullRefresh'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys, STALE_TIME } from '@/lib/queries/keys'
import { useSessionStore } from '@/lib/state/session'
import { useUiStore } from '@/lib/state/ui'
import {
  IconLink,
  IconPlus,
  IconRefresh,
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconBrandWhatsapp,
  IconClock,
  IconCash,
  IconX,
  IconSchool,
  IconUsers,
  IconChevronRight,
  IconTrash,
  IconExternalLink,
  IconQrcode,
  IconShieldCheck,
  IconWallet,
  IconReceipt,
  IconPlayerPlay,
  IconCamera,
  IconCircleFilled,
  IconFileText,
  IconChevronDown,
  IconMapPin,
  IconUser,
  IconCalendar,
  IconPhoto,
  IconReceipt2,
  IconFiles,
  IconHistory,
  IconDots,
} from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import ErrorAlert from '@/components/shared/ErrorAlert'
import JobHandoffsPanel, { FamilyStrip, useRelatedWorkNavigation } from '@/components/shared/JobHandoffsPanel'
import { familyLinks, handoffLinks } from '../../shared/relatedWork'
import { captureOrganizationSwitchContext, isBoundTaskPath } from '../../shared/taskContext'
import JobAuditTrailPanel from '@/components/shared/JobAuditTrailPanel'
import { ClientBillingDetails } from '@/components/shared/ClientBillingDetails'
import { fieldJobBillingExceptions } from '../../shared/fieldJobOutcomes'
import { assertFieldStepSucceeded } from '../../shared/fieldEvidence'
import type { FinanceListRow } from '@/components/shared/FinanceListCard'
import { FINANCE_TABLE_HEADERS, FinanceListRows, financeRowsToCells } from '@/components/shared/FinanceListTable'
import { FinanceViewToggle, useFinanceListView } from '@/components/shared/FinanceViewToggle'
import { csvFrom, EXPORT_MIME, exportFileName, saveExport } from '@/lib/exportFile'
import { StepHelp } from '@/components/help/StepHelp'
import { StageActorTimeline } from '@/components/shared/StageActorTimeline'
import {
  buildJobAuditTrail,
  chainHistoryTitle,
  holdIsLive,
  holdWaitsForOrganisation,
  jobHeading,
  jobSheetEvidence,
  liveHoldOf,
  purchaseReceiptsFromHandoffs,
  stageMedia,
  stageRelatedWork,
  trailFromPaymentLink,
  trailFromRequest,
  trailFromSupplierBill,
  whoDidStages,
  type JobAuditTrail,
  type JobSheetPhoto,
  type StageMediaItem,
} from '@/lib/jobAuditTrail'
import { relatedWorkLine, requestStatusWords } from '@/lib/uxCopy'
import { formatTxnTime } from '@/lib/inboxAttention'
import { captureHashedPhoto } from '@/lib/evidenceHash'
import { jobContactOption, OUTSIDE_CONTACT_NEEDS_APP, parseJobContactSelection } from '@/lib/jobPeople'
import api, { safeArray } from '@/lib/api'
import { friendlyRequestError } from '@/lib/requestError'
import {
  beginTaskContext,
  bindTaskPath,
  endTaskContext,
  getTaskContext,
  getTaskPass,
  getActiveOrgLabel,
  getActiveOrgId,
  getContextMode,
  getPersonalWalletTenantId,
  getPreferredToken,
  isEmployeeOrgRole,
  getOrgRoleClaim,
  getUserRole,
  getWalletToken,
  decodeJwtPayload,
  isReleaseRole,
} from '@/lib/auth'
import { openOrganizationForTask, taskRefs, type OrgTaskPurpose } from '@/lib/orgTaskAccess'
import { findTemplateForCapability, getWorkflowCapabilityFlags } from '@/lib/workflowCapabilities'
import { readOrgProfile, persistOrgProfile, profileFromServer, SETUP_PROFILE_PATH, type OrgProfile } from '@/lib/orgProfile'
import { requireSensitiveOrgReauth } from '@/lib/offline/localReauth'
import { confirmWithDevice } from '@/lib/deviceTrust'
import {
  evaluateOrgActionPolicy,
  getCachedOrgContextBundle,
  refreshOrgContextBundle,
  type OrgContextBundleCacheEntry,
  type OrgRoleCapabilities,
} from '@/lib/offline/orgContextBundle'
import dayjs from 'dayjs'
import { useRouter } from 'next/router'
import QRCode from 'react-qr-code'
import {
  REQUISITION_STEPS,
  SAFETY_HOLD_COPY,
  actorDisplay,
  actorForStage,
  actorsForWorkflow,
  feptStages,
  fieldJobStatusLabel,
  handoffWaitingLine,
  holdCountWords,
  isSchoolFeeRun,
  moneyInKindWord,
  requisitionEventTitle,
  requisitionNextStep,
  requisitionStatusLabel,
  safetyHoldStateWords,
  schoolFeeProgress,
  schoolFeeStatusWords,
  schoolFeeTitle,
  type JobActorStage,
  type SafetyHoldFixBy,
  type SchoolFeeRunLike,
} from '@/lib/uxCopy'

/* ── Types ── */

interface PaymentLink {
  id: string
  merchantId: string
  merchantName?: string
  description: string
  amount: number
  currency: string
  invoiceRef?: string
  status: 'active' | 'paid' | 'expired' | 'cancelled'
  expiry?: string
  shortlinkCode?: string
  shortlinkUrl?: string
  plan_type?: string
  collectionType?: string
  payer_name?: string
  plan_id?: string
  installment_number?: number | string
  installments_total?: number | string
  paidAt?: string
  providerRef?: string
  payerPhone?: string
  sector?: string
  transactionId?: string
  obligationId?: string
  obligationStatus?: string
  balanceDue?: number
  settledAmount?: number
  createdAt: string
}

interface OrgContact {
  id: string
  name: string
  phone?: string
  email?: string
  contactScope?: 'internal' | 'external'
}

type AssigneeResolution = {
  assigneeId?: string
  assigneeUserId?: string
}

interface RequisitionRow {
  id: string
  status: string
  workflowRequestId?: string
  metadata?: {
    department?: string
    amount?: number
    totalAmount?: number
    currency?: string
    notes?: string
  }
  updatedAt: string
}

interface RequisitionDetail {
  status?: string
  currentStatus?: string
  /** 'one' when a single person confirms a request; 'both' when manager and finance each confirm. */
  approvalSignMode?: 'one' | 'both'
  timeline?: Array<{
    id?: string
    eventType?: string
    source?: string
    occurredAt?: string
    amount?: number
    currency?: string
    metadata?: Record<string, any>
  }>
  summary?: {
    providerRef?: string
    tenantId?: string
    status?: string
    paymentAmount?: number
    paymentCurrency?: string
    firstEventAt?: string
    eventCount?: number
  }
  events?: Array<{
    id?: string
    eventType?: string
    source?: string
    occurredAt?: string
    amount?: number
    currency?: string
    metadata?: Record<string, any>
  }>
  workflowRequestId?: string
  workflowRequestStatus?: string
}

interface WorkflowRequestLookup {
  id?: string
  payload?: {
    requisitionId?: string
  }
}

interface OrgMemberLite {
  userId: string
  role: string
  status: string
  displayName?: string
  phone?: string
}

interface ApWorkflowActionItem {
  id: string
  invoice_ref?: string
  invoice_description?: string
  workflow_stage?: string
  status?: string
  required_action?: string | null
  required_actor_role?: string | null
  required_proof_type?: string | null
  myActionRequired?: boolean
  updated_at?: string
  supplier_name?: string
  amount?: number
  currency?: string
  proof_response_id?: string | null
  consent_timestamp?: string | null
}

interface ArObligationItem {
  id: string
  buyer_tenant_id?: string
  collector_org_name?: string
  description?: string
  total_amount?: number
  amount_due?: number
  amount_paid?: number
  currency?: string
  trust_status?: string
  status?: string
  required_action?: string | null
  required_proof_type?: string | null
  next_due_date?: string | null
  overdue_installments?: number
  proof_request_id?: string | null
  proof_response_id?: string | null
}

interface LinkAuditItem {
  id: string
  actionType?: string
  actorName?: string
  resourceId?: string
  createdAt: string
  details?: Record<string, any>
}

interface PaymentFlowStepState {
  key: string
  label: string
  description: string
  status: 'done' | 'active' | 'pending'
  occurredAt?: string
}

interface PaymentAuditNarrative {
  title: string
  subtitle: string
  note?: string
}

interface DetailStatusLine {
  text: string
}

interface DetailTimelineItem {
  id: string
  title: string
  source: string
  description?: string
  note?: string
  timestamp?: string
  badge?: {
    label: string
    color: string
  }
  /** Photos and attached records for this step, shown as small previews. */
  media?: StageMediaItem[]
}

interface WorkflowDetailSection {
  title: string
  content: React.ReactNode
}

interface CredentialArtifactDetail {
  title: string
  credentialId: string
  credentialType: string
  status: string
  issuedAt?: string | null
  sourceRef?: string | null
  counterpart?: string | null
  amount?: number | null
  currency?: string | null
  note?: string | null
}

interface ContactSelectFieldProps {
  label: string
  placeholder: string
  contacts: OrgContact[]
  value: string | null
  onChange: (contact: OrgContact | null) => void
  description?: string
  required?: boolean
  clearable?: boolean
}

/* ── Helpers ── */

const statusColor: Record<string, string> = {
  active: 'green',
  paid: 'blue',
  expired: 'orange',
  cancelled: 'red',
}

const statusIcon: Record<string, React.ReactNode> = {
  active: <IconCheck size={12} />,
  paid: <IconCash size={12} />,
  expired: <IconClock size={12} />,
  cancelled: <IconX size={12} />,
}

function fmt(n: any, c = 'USD') {
  const num = typeof n === 'number' ? n : Number(n)
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('en', { style: 'currency', currency: c || 'USD', minimumFractionDigits: 2 }).format(num)
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0) return trimmed
    }
  }
  return undefined
}

function makeIdempotencyKey(scope: string, parts: Array<string | number | undefined>): string {
  const normalized = parts
    .map((part) =>
      String(part ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9:_-]+/g, '-'),
    )
    .join(':')
    .slice(0, 140)
  return `${scope}:${normalized}`
}

function extractPaymentCode(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined
  try {
    const parsed = new URL(rawUrl)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const vIndex = parts.findIndex((part) => part === 'v')
    if (vIndex >= 0 && parts[vIndex + 1]) {
      return decodeURIComponent(parts[vIndex + 1])
    }
    const payIndex = parts.findIndex((part) => part === 'pay')
    if (payIndex >= 0 && parts[payIndex + 1]) {
      return decodeURIComponent(parts[payIndex + 1])
    }
  } catch {
    const match = rawUrl.match(/\/(?:v|pay)\/([^/?#]+)/i)
    if (match?.[1]) {
      return decodeURIComponent(match[1])
    }
  }
  return undefined
}

function getLinkCheckoutUrl(link: PaymentLink): string | undefined {
  return firstNonEmptyString(link.shortlinkUrl, (link as any).paymentUrl, (link as any).url, (link as any).shortUrl)
}

function getLinkRouteToken(link: PaymentLink): string | undefined {
  // Prefer the 6-char shortlink code because link.id may be a plan/collection ID
  // (not a payment link token) when the link comes from the AR collections API.
  return firstNonEmptyString(
    link.shortlinkCode,
    (link as any).paymentCode,
    extractPaymentCode(getLinkCheckoutUrl(link)),
    link.id,
  )
}

type FieldJobTab = 'details' | 'photos' | 'receipts' | 'documents' | 'history'

function JobEvidenceTabs({
  run,
  orgMembers,
  actors,
  assigneeName,
  tab,
  onTab,
  onRefresh,
  details,
}: {
  run: any
  orgMembers: OrgMemberLite[]
  actors?: JobActorStage[]
  assigneeName?: string
  tab: FieldJobTab
  onTab: (tab: FieldJobTab) => void
  onRefresh: () => Promise<void>
  details: React.ReactNode
}) {
  const sheets = jobSheetEvidence(run?.output)
  const auditTrail = buildJobAuditTrail(run, orgMembers)
  const [preview, setPreview] = useState<StageMediaItem | null>(null)
  const [replacing, setReplacing] = useState(false)
  const openPhoto = (photo: JobSheetPhoto) => {
    const lines = [
      photo.deviceAt || photo.capturedAt
        ? `Taken: ${formatTxnTime(photo.deviceAt || photo.capturedAt) || 'time not recorded'}`
        : '',
      photo.capturedAt && photo.deviceAt ? `Recorded by the system: ${formatTxnTime(photo.capturedAt)}` : '',
      photo.location ? `Location: ${photo.location}` : 'Location: not shared',
      photo.notes || '',
    ]
      .map((line) => line.trim())
      .filter(Boolean)
    setPreview({ src: photo.photoUri, label: photo.label, lines })
  }
  const photoCard = (photo: JobSheetPhoto | undefined, fallback: string) => (
    <Card withBorder radius="md" p={0}>
      {photo?.photoUri ? (
        <UnstyledButton aria-label={`Open ${photo.label}`} onClick={() => openPhoto(photo)} style={{ width: '100%' }}>
          <Image src={photo.photoUri} height={140} alt={photo.label} fit="cover" />
        </UnstyledButton>
      ) : (
        <Center h={140} bg="gray.1">
          <Stack align="center" gap={4}>
            <IconPhoto size={28} color="gray" />
            <Text size="xs" c="dimmed">
              {photo ? 'Record kept without a photo' : 'Not taken yet'}
            </Text>
          </Stack>
        </Center>
      )}
      {photo && photo.extras.length > 0 && (
        <Group gap={6} px="sm" pt="sm">
          {photo.extras.map((thumb) => (
            <UnstyledButton
              key={thumb.label}
              aria-label={`Open ${thumb.label}`}
              onClick={() => setPreview({ src: thumb.src, label: thumb.label, lines: [`${photo.label}`] })}
            >
              <Image src={thumb.src} w={56} h={56} radius="sm" alt={thumb.label} fit="cover" />
            </UnstyledButton>
          ))}
        </Group>
      )}
      <Stack gap={4} p="md">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {photo?.label || fallback}
          </Text>
          {photo?.sealed && (
            <Badge size="xs" color="green" variant="light">
              Sealed
            </Badge>
          )}
        </Group>
        {photo && (
          <>
            <Text size="xs" c="dimmed">
              Taken: {formatTxnTime(photo.deviceAt || photo.capturedAt) || 'time not recorded'}
            </Text>
            {photo.capturedAt && photo.deviceAt && (
              <Text size="xs" c="dimmed">
                Recorded by the system: {formatTxnTime(photo.capturedAt)}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {photo.location ? `Location: ${photo.location}` : 'Location: not shared'}
            </Text>
            {photo.notes && <Text size="xs">{photo.notes}</Text>}
          </>
        )}
      </Stack>
    </Card>
  )
  return (
    <Box id={`job-receipts-${run?.id || ''}`}>
      <Tabs
        value={tab}
        onChange={(value) => {
          const next = (value as FieldJobTab) || 'details'
          onTab(next)
        }}
        variant="pills"
      >
        <Tabs.List mb="sm" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          <Tabs.Tab value="details" leftSection={<IconFileText size={14} />}>
            Details
          </Tabs.Tab>
          <Tabs.Tab value="photos" leftSection={<IconPhoto size={14} />}>
            Photos ({sheets.photoCount})
          </Tabs.Tab>
          <Tabs.Tab value="receipts" leftSection={<IconReceipt2 size={14} />}>
            Receipts ({sheets.receiptCount})
          </Tabs.Tab>
          <Tabs.Tab value="documents" leftSection={<IconFiles size={14} />}>
            Records ({sheets.records.length})
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>
            History
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details">
          <Stack gap="md">
            <Card withBorder radius="md">
              <StageActorTimeline
                stages={feptStages(
                  String(run?.output?.workflowStage || run?.output?.stage || run?.status || ''),
                  run?.output,
                )}
                actors={actors}
                people={orgMembers}
                assigneeName={assigneeName}
                hasAssignee={Boolean(
                  run?.output?.assignment?.assigneeId || run?.output?.workflowInput?.assigneeId || run?.input?.assigneeId,
                )}
                whoDid={whoDidStages(auditTrail)}
                media={stageMedia(auditTrail)}
                links={stageRelatedWork(auditTrail)}
              />
            </Card>
            {details}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="photos">
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Photos are taken live on the worker’s phone, one step at a time: before any work, then after the work is
              finished. Each photo is sealed with its time and location when it is taken.
            </Text>
            <Stack gap="sm">
              {photoCard(sheets.before, 'Before work')}
              {photoCard(sheets.after, 'After work')}
              {sheets.otherPhotos.map((photo) => (
                <Box key={photo.key}>{photoCard(photo, 'Photo')}</Box>
              ))}
            </Stack>
            {sheets.workDuration && (
              <Text size="xs" c="dimmed">
                Time between the before and after photos: {sheets.workDuration}
              </Text>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="receipts">
          <Stack gap="md">
            <Card withBorder radius="md">
              <Group justify="space-between" mb="md">
                <Text fw={600}>Digital receipts from suppliers</Text>
                <Badge color="green" variant="light">
                  Checked
                </Badge>
              </Group>
              {sheets.supplierReceipts.length === 0 ? (
                <Text size="sm" c="dimmed" fs="italic">
                  No digital receipts from suppliers on this job yet.
                </Text>
              ) : (
                <Stack gap="sm">
                  {sheets.supplierReceipts.map((vc, idx) => (
                    <Group key={idx} justify="space-between" align="flex-start" wrap="nowrap">
                      <Box>
                        <Text size="sm" fw={500}>
                          {vc.supplierName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Supplier reference: {vc.reference}
                        </Text>
                      </Box>
                      {vc.amount && (
                        <Text size="sm" fw={700}>
                          {vc.amount}
                        </Text>
                      )}
                    </Group>
                  ))}
                </Stack>
              )}
            </Card>
            <Card withBorder radius="md">
              <Text fw={600} mb="md">
                Receipt photos
              </Text>
              {sheets.receiptPhotos.length === 0 ? (
                <Text size="sm" c="dimmed" fs="italic">
                  No receipt photos on this job yet.
                </Text>
              ) : (
                <Stack gap="sm">
                  {sheets.receiptPhotos.map((photo) => (
                    <Box key={photo.key}>{photoCard(photo, 'Receipt')}</Box>
                  ))}
                </Stack>
              )}
            </Card>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="documents">
          <Card withBorder radius="md" p="md">
            <Text fw={600} mb="xs">
              Records issued by this job
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              Assignment records go to the worker. Organisation records stay in the organisation wallet.
            </Text>
            {['owner', 'admin'].includes(getOrgRoleClaim() || '') && run.output?.issuedCredentials?.RequisitionVC && !run.output?.issuedCredentials?.JobAssignmentVC && (
              <Button size="xs" mb="sm" variant="light" loading={replacing} onClick={async () => {
                setReplacing(true)
                try {
                  await api.post(`/workflows/runs/${encodeURIComponent(run.id)}/assignment-record/replace`, {})
                  await onRefresh()
                } catch (err: any) {
                  notifications.show({ color: 'red', message: err.response?.data?.message || 'Could not replace the assignment record' })
                } finally { setReplacing(false) }
              }}>Replace legacy assignment record</Button>
            )}
            {sheets.records.length === 0 ? (
              <Text size="sm" c="dimmed" fs="italic">
                No records issued yet. The job card is issued when a worker is assigned.
              </Text>
            ) : (
              <Stack gap={6}>
                {sheets.records.map((record) => (
                  <Group key={record.type} justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <ThemeIcon size="sm" color="green" variant="light" radius="xl">
                        <IconCheck size={12} />
                      </ThemeIcon>
                      <Text size="sm">{record.label}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {record.to ? `to: ${record.to}` : 'issued'}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <JobAuditTrailPanel trail={buildJobAuditTrail(run, orgMembers)} compact embedded />
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.label}
        size="lg"
        centered
      >
        <Stack gap="sm">
          {preview?.src && <Image src={preview.src} alt={preview.label} fit="contain" mah="70vh" />}
          {preview?.lines?.map((line) => (
            <Text key={line} size="sm">
              {line}
            </Text>
          ))}
          {!preview?.src && !preview?.lines?.length && (
            <Text size="sm" c="dimmed">
              Nothing else was recorded for this.
            </Text>
          )}
        </Stack>
      </Modal>
    </Box>
  )
}

function DetailSectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        {title ? (
          <Text size="xs" c="dimmed" fw={600}>
            {title}
          </Text>
        ) : null}
        {children}
      </Stack>
    </Paper>
  )
}

function DetailStatusCard({
  status,
  amount,
  currency,
  lines,
  amountColor = 'indigo',
  footer,
}: {
  status: string
  amount: number | string | undefined
  currency?: string
  lines: DetailStatusLine[]
  amountColor?: string
  footer?: React.ReactNode
}) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" align="center">
        <Box>
          <Text size="xs" c="dimmed" fw={600}>
            CURRENT STATUS
          </Text>
          <Text fw={700}>{status}</Text>
        </Box>
        <Text fw={700} c={amountColor}>
          {fmt(amount, currency)}
        </Text>
      </Group>
      <Stack gap={2} mt="sm">
        {lines.map((line, index) => (
          <Text key={`${line.text}-${index}`} size="xs" c="dimmed">
            {line.text}
          </Text>
        ))}
      </Stack>
      {footer}
    </Paper>
  )
}

function DetailTimelineList({
  items,
  emptyText,
  loading = false,
}: {
  items: DetailTimelineItem[]
  emptyText: string
  loading?: boolean
}) {
  const [preview, setPreview] = useState<StageMediaItem | null>(null)
  if (loading) {
    return (
      <Stack gap="xs">
        <Skeleton height={48} radius="md" />
        <Skeleton height={48} radius="md" />
        <Skeleton height={48} radius="md" />
      </Stack>
    )
  }
  if (items.length === 0)
    return (
      <Text size="sm" c="dimmed">
        {emptyText}
      </Text>
    )

  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Paper key={item.id} p="sm" withBorder radius="md">
          <Group justify="space-between" align="flex-start">
            <Box>
              <Group gap={6} wrap="nowrap" align="center">
                {item.badge?.color === 'green' && (
                  <ThemeIcon size={18} radius="xl" color="green" variant="filled">
                    <IconCheck size={12} />
                  </ThemeIcon>
                )}
                <Text size="sm" fw={600}>
                  {item.title}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                Source: {item.source}
              </Text>
              {item.description && (
                <Text size="xs" c="dimmed" mt={4}>
                  {item.description}
                </Text>
              )}
              {item.note && (
                <Text size="xs" c="dimmed" mt={4}>
                  {item.note}
                </Text>
              )}
              {item.badge && (
                <Badge size="xs" mt={6} color={item.badge.color} variant="light">
                  {item.badge.label}
                </Badge>
              )}
              {item.media && item.media.length > 0 && (
                <Group gap={6} mt={8} wrap="wrap">
                  {item.media.map((media, index) => (
                    <UnstyledButton
                      key={`${item.id}-media-${index}`}
                      onClick={() => setPreview(media)}
                      aria-label={`Open ${media.label}`}
                    >
                      <Stack gap={2} align="center" maw={72}>
                        {media.src && !media.record ? (
                          <Image src={media.src} w={48} h={48} radius="sm" fit="cover" alt={media.label} />
                        ) : (
                          <Paper
                            withBorder
                            radius="sm"
                            w={48}
                            h={48}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <IconFileText size={20} />
                          </Paper>
                        )}
                        <Text size="xs" c="dimmed" ta="center" lineClamp={2}>
                          {media.label}
                        </Text>
                      </Stack>
                    </UnstyledButton>
                  ))}
                </Group>
              )}
            </Box>
            <Text size="xs" c="dimmed">
              {item.timestamp || '—'}
            </Text>
          </Group>
        </Paper>
      ))}
      <Modal
        opened={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.label}
        size="lg"
        centered
      >
        <Stack gap="sm">
          {preview?.src && <Image src={preview.src} alt={preview.label} fit="contain" mah="70vh" />}
          {preview?.lines?.map((line) => (
            <Text key={line} size="sm">
              {line}
            </Text>
          ))}
          {!preview?.src && !preview?.lines?.length && (
            <Text size="sm" c="dimmed">
              Nothing else was recorded for this.
            </Text>
          )}
        </Stack>
      </Modal>
    </Stack>
  )
}

function WorkflowDetailBody({
  statusCard,
  sections,
  auditItems,
  auditEmptyText,
  auditLoading = false,
  showHistory = true,
}: {
  statusCard: React.ReactNode
  sections: WorkflowDetailSection[]
  auditItems: DetailTimelineItem[]
  auditEmptyText: string
  auditLoading?: boolean
  /** A job already shows its steps above. Skip this list when it would only repeat them. */
  showHistory?: boolean
}) {
  return (
    <Stack gap="md" pb="lg">
      {statusCard}
      {sections.map((section) => (
        <DetailSectionCard key={section.title} title={section.title}>
          {section.content}
        </DetailSectionCard>
      ))}
      {showHistory && (
        <>
          <Divider label="History" labelPosition="left" />
          <DetailTimelineList items={auditItems} emptyText={auditEmptyText} loading={auditLoading} />
        </>
      )}
    </Stack>
  )
}

function formatLedgerLabel(value: unknown, fallback = 'Pending'): string {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (part) => part.toUpperCase())
}

function trustTone(value: unknown): string {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'settled' || normalized === 'verified') return 'teal'
  if (normalized === 'proof_presented') return 'indigo'
  if (normalized === 'disputed' || normalized === 'failed') return 'red'
  if (normalized === 'revoked') return 'orange'
  return 'yellow'
}

function workflowTone(value: unknown): string {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'paid' || normalized === 'completed' || normalized === 'receipt_issued') return 'teal'
  if (normalized === 'proof_presented') return 'indigo'
  if (normalized === 'issued' || normalized === 'pending_payment') return 'blue'
  if (normalized === 'disputed' || normalized === 'failed') return 'red'
  return 'gray'
}

function deriveArProofStage(
  plan: any,
  latestWorkflow: any,
): {
  key: 'issued' | 'proof_requested' | 'proof_presented' | 'settled'
  label: string
  description: string
} {
  const trustStatus = String(plan?.trust_status || latestWorkflow?.trust_status || '').toLowerCase()
  const workflowStage = String(
    latestWorkflow?.workflow_stage || plan?.workflow_stage || plan?.status || '',
  ).toLowerCase()
  const hasReceipt = Boolean(plan?.receipt_vc_id || latestWorkflow?.workflow_stage === 'receipt_issued')
  const hasProofResponse = Boolean(plan?.proof_response_id || latestWorkflow?.proof_response_id)
  const hasProofRequest = Boolean(plan?.proof_request_id || latestWorkflow?.proof_request_id)

  if (
    hasReceipt ||
    trustStatus === 'settled' ||
    workflowStage === 'paid' ||
    workflowStage === 'receipt_issued' ||
    String(plan?.status || '').toLowerCase() === 'completed'
  ) {
    return {
      key: 'settled',
      label: 'settled',
      description: 'Wallet proof is complete, payment is settled, and receipt evidence is linked.',
    }
  }

  if (hasProofResponse || trustStatus === 'proof_presented' || workflowStage === 'proof_presented') {
    return {
      key: 'proof_presented',
      label: 'proof_presented',
      description: 'Consent proof was presented. The workflow is ready to continue settlement.',
    }
  }

  if (hasProofRequest) {
    return {
      key: 'proof_requested',
      label: 'proof_requested',
      description: 'A wallet proof request has been issued and is waiting for holder presentation.',
    }
  }

  return {
    key: 'issued',
    label: 'issued',
    description: 'The AR workflow has been issued to the debtor organization and is awaiting proof initiation.',
  }
}

function buildArWorkflowTimelineItems(workflowTransactions: any[]): DetailTimelineItem[] {
  return workflowTransactions.map((tx) => ({
    id: String(tx.id),
    title: `${formatLedgerLabel(tx.workflow_stage, 'Issued')} · ${String(tx.id).slice(0, 12)}`,
    source: 'ar/ap trust workflow',
    description: [
      tx.required_action ? `Action: ${formatLedgerLabel(tx.required_action)}` : null,
      tx.required_proof_type ? `Proof: ${tx.required_proof_type}` : null,
      tx.status ? `Status: ${formatLedgerLabel(tx.status)}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    note:
      [
        tx.proof_request_id ? `Request: ${tx.proof_request_id}` : null,
        tx.proof_response_id ? `Response: ${tx.proof_response_id}` : null,
        tx.consent_timestamp ? `Consent: ${dayjs(tx.consent_timestamp).format('D MMM YYYY HH:mm')}` : null,
        tx.source_payment_link_id ? `Link: ${tx.source_payment_link_id}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    timestamp: tx.updated_at ? dayjs(tx.updated_at).format('D MMM YYYY HH:mm') : '—',
    badge: {
      label: formatLedgerLabel(tx.trust_status || tx.status || 'pending'),
      color: trustTone(tx.trust_status || tx.status),
    },
  }))
}

function ContactSelectField({
  label,
  placeholder,
  contacts,
  value,
  onChange,
  description,
  required = false,
  clearable = true,
}: ContactSelectFieldProps) {
  if (contacts.length === 0) {
    return (
      <Alert color="gray" variant="light" icon={<IconUsers size={16} />}>
        No saved contacts yet. Create a contact first if you want to send this workflow directly to someone.
      </Alert>
    )
  }

  return (
    <Select
      label={label}
      required={required}
      placeholder={placeholder}
      description={description}
      data={contacts.map((contact) => ({
        value: contact.id,
        label: `${contact.name}${contact.phone ? ` — ${contact.phone}` : ''}`,
      }))}
      leftSection={<IconUsers size={16} />}
      searchable
      clearable={clearable}
      value={value}
      onChange={(nextValue) => {
        const contact = contacts.find((entry) => entry.id === nextValue) || null
        onChange(contact)
      }}
    />
  )
}

function fieldPauseLine(pauseReason: string, who: string): string | undefined {
  const name = who.trim() || 'The person assigned'
  const lines: Record<string, string> = {
    await_site_inspection: name === 'You' ? 'A site check now you are there' : `A site check from ${name}`,
    await_risk_assessment:
      name === 'You' ? 'Your safety check on site, before any work' : `A safety check from ${name}, before any work`,
    await_worker_start: `${name} to start the job`,
    await_arrival:
      name === 'You'
        ? 'You to confirm arrival (location or site code)'
        : `${name} to confirm arrival (location or site code)`,
    await_evidence_before: name === 'You' ? 'Before photos (take them before any work)' : `Before photos from ${name}`,
    await_evidence_concealed:
      name === 'You'
        ? 'Photo the in-progress work before it is covered'
        : `In-progress photo before work is covered from ${name}`,
    await_evidence_after:
      name === 'You' ? 'Finish the work, then take after photos' : `${name} to finish and take after photos`,
    await_evidence_receipt:
      name === 'You'
        ? 'Receipts for materials bought for this job, or none bought'
        : `Receipts for materials from ${name} (or none bought)`,
    await_completion_review: 'A review of the finished work',
    await_acknowledgement: 'Sign-off by the sign-off person',
    await_payout_release: 'Worker payout release by the money person',
  }
  return lines[pauseReason]
}

/** Steps that are not the worker's: the chosen person confirms them from their wallet. */
type FieldProofStage = 'acknowledgement' | 'payout'
const FIELD_PROOF_COPY: Record<FieldProofStage, { title: string; description: string; done: string }> = {
  acknowledgement: {
    title: 'Sign off this job',
    description:
      'Review what your wallet will share, then confirm you are the person chosen to sign off the finished work.',
    done: 'Job signed off. Payment is now waiting for release.',
  },
  payout: {
    title: 'Release worker payout',
    description:
      'Review what your wallet will share, then confirm you are the person chosen to release the worker payout for this job.',
    done: 'Payment released. The job is being closed.',
  },
}

/** The signed-in person's user id (same claim on personal and organization tokens). */
function currentUserId(): string {
  if (typeof window === 'undefined') return ''
  for (const key of ['credoOrgToken', 'walletToken']) {
    const token = localStorage.getItem(key)
    const payload = token ? decodeJwtPayload(token) : null
    const id = String(payload?.id || payload?.userId || payload?.sub || '').trim()
    if (id) return id
  }
  return ''
}

const FIELD_CHECKPOINT_PAUSES = new Set([
  'await_site_inspection',
  'await_risk_assessment',
  'await_arrival',
  'await_completion_review',
])

function getFieldPauseReason(run: any): string {
  if (String(run?.status || '').toLowerCase() !== 'paused') return ''
  return String(run?.output?.pauseReason || '').toLowerCase()
}

type PaymentFlowKind = 'generic' | 'checkout' | 'invoice' | 'instalment' | 'recurring' | 'one_time'

function getPaymentFlowKind(link: PaymentLink): PaymentFlowKind {
  const planType = String(link.plan_type || link.collectionType || '')
    .trim()
    .toLowerCase()
  if (planType === 'instalment' || planType === 'installment') return 'instalment'
  if (planType === 'recurring') return 'recurring'
  if (planType === 'one_time') return 'one_time'

  const invoiceRef = String(link.invoiceRef || '')
    .trim()
    .toLowerCase()
  const description = String(link.description || '')
    .trim()
    .toLowerCase()

  if (invoiceRef.startsWith('checkout-') || description.startsWith('checkout:')) {
    return 'checkout'
  }

  if (invoiceRef.length > 0) {
    return 'invoice'
  }

  return 'generic'
}

function getPaymentFlowBadge(flow: PaymentFlowKind): { label: string; color: string } {
  if (flow === 'checkout') return { label: 'CHECKOUT FLOW', color: 'cyan' }
  if (flow === 'invoice') return { label: 'INVOICE FLOW', color: 'indigo' }
  if (flow === 'instalment') return { label: 'INSTALMENT PLAN', color: 'orange' }
  if (flow === 'recurring') return { label: 'RECURRING BILL', color: 'pink' }
  if (flow === 'one_time') return { label: 'ONE-TIME COLLECTION', color: 'violet' }
  return { label: 'GENERIC FLOW', color: 'teal' }
}

function getPaymentAuditRefs(link: PaymentLink): string[] {
  const refs = [link.id, link.shortlinkCode, link.invoiceRef, link.providerRef]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  return Array.from(new Set(refs))
}

function normalizeSignal(raw: unknown): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9._:\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function eventMatches(entry: LinkAuditItem, tokens: string[]): boolean {
  const bag = [
    entry.actionType,
    entry.resourceId,
    entry.details?.path,
    entry.details?.method,
    entry.details?.error,
    entry.details?.requestSummary?.providerRef,
    entry.details?.requestSummary?.invoiceRef,
  ]
    .map(normalizeSignal)
    .join(' ')

  return tokens.some((token) => bag.includes(token))
}

function firstMatchTime(entries: LinkAuditItem[], tokens: string[]): string | undefined {
  const match = [...entries]
    .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
    .find((entry) => eventMatches(entry, tokens))
  return match?.createdAt
}

function buildPaymentFlowSteps(link: PaymentLink, audits: LinkAuditItem[]): PaymentFlowStepState[] {
  const isPaid = link.status === 'paid'
  const isStopped = link.status === 'cancelled' || link.status === 'expired'

  const sharedAt = firstMatchTime(audits, ['whatsapp', 'share', 'contact', 'payment-link'])
  const checkoutAt = firstMatchTime(audits, ['public/pay', 'checkout', 'storefront/checkout-link', '/pay/'])
  const initiatedAt = firstMatchTime(audits, ['payment initiated', 'payment request', '/pay', 'ecocash', 'provider'])
  const confirmedAt = isPaid
    ? link.paidAt || firstMatchTime(audits, ['paid', 'payment completed', 'receipt_issued', 'reconciled'])
    : firstMatchTime(audits, ['paid', 'payment completed', 'receipt_issued', 'reconciled'])
  const receiptAt = firstMatchTime(audits, ['receipt', 'receiptvc', 'sync-receipts', 'reconciled'])

  const progress = {
    created: true,
    shared: Boolean(sharedAt),
    checkout: Boolean(checkoutAt),
    initiated: Boolean(initiatedAt),
    confirmed: Boolean(confirmedAt) || isPaid,
    receipt: Boolean(receiptAt) || (isPaid && Boolean(confirmedAt)),
  }

  const steps: PaymentFlowStepState[] = [
    {
      key: 'created',
      label: 'Link created',
      description: 'Payment reference created and ready for buyer access.',
      status: 'done',
      occurredAt: link.createdAt,
    },
    {
      key: 'shared',
      label: 'Link shared',
      description: 'Buyer received the link from contact/inbox/share channel.',
      status: progress.shared ? 'done' : isStopped ? 'pending' : 'active',
      occurredAt: sharedAt,
    },
    {
      key: 'checkout',
      label: 'Checkout opened',
      description: 'Buyer opened in-app checkout or public checkout route.',
      status: progress.checkout ? 'done' : progress.shared && !isStopped ? 'active' : 'pending',
      occurredAt: checkoutAt,
    },
    {
      key: 'initiated',
      label: 'Payment initiated',
      description: 'Payment request sent to provider and awaiting confirmation.',
      status: progress.initiated ? 'done' : progress.checkout && !isStopped ? 'active' : 'pending',
      occurredAt: initiatedAt,
    },
    {
      key: 'confirmed',
      label: 'Payment confirmed',
      description: 'Provider confirmation received and link marked paid.',
      status: progress.confirmed ? 'done' : progress.initiated && !isStopped ? 'active' : 'pending',
      occurredAt: confirmedAt,
    },
    {
      key: 'receipt',
      label: 'Receipt & audit finalized',
      description: 'Receipt credential and traceability entries completed.',
      status: progress.receipt ? 'done' : progress.confirmed && !isStopped ? 'active' : 'pending',
      occurredAt: receiptAt,
    },
  ]

  if (isStopped) {
    return steps.map((step, index) => {
      if (index === 0 || step.status === 'done') return step
      return { ...step, status: 'pending' as const }
    })
  }

  return steps
}

function toFriendlyPaymentAction(actionType?: string): string {
  const raw = String(actionType || '').trim()
  if (!raw) return 'Payment event'
  const normalized = raw
    .replace(/[_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function describePaymentAuditEvent(entry: LinkAuditItem): PaymentAuditNarrative {
  const action = normalizeSignal(entry.actionType)
  const requestSummary = entry.details?.requestSummary || {}
  const actor = entry.actorName || 'System'
  const source = String(entry.details?.source || entry.details?.path || '').trim()
  const ref = String(
    requestSummary.providerRef || requestSummary.invoiceRef || requestSummary.paymentId || entry.resourceId || '',
  ).trim()

  if (action.includes('sync receipts') || action.includes('receipt') || action.includes('reconciled')) {
    return {
      title: 'Receipt reconciled',
      subtitle: `Source: ${source || 'wallet sync'}`,
      note: ref ? `Reference: ${ref}` : undefined,
    }
  }

  if (action.includes('public pay') || action.includes('checkout') || action.includes('payment link')) {
    return {
      title: 'Checkout activity',
      subtitle: `Actor: ${actor}`,
      note: ref ? `Reference: ${ref}` : undefined,
    }
  }

  if (action.includes('wallet auth') || action.includes('auth session')) {
    return {
      title: 'Wallet session established',
      subtitle: `Actor: ${actor}`,
      note: source ? `Source: ${source}` : undefined,
    }
  }

  return {
    title: toFriendlyPaymentAction(entry.actionType),
    subtitle: `Actor: ${actor}`,
    note: ref ? `Reference: ${ref}` : source ? `Source: ${source}` : undefined,
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeRunId(value: unknown): string | null {
  const runId = String(value ?? '').trim()
  if (!runId) return null

  const lowered = runId.toLowerCase()
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return null

  return runId
}

function resolveAssigneeSelection(value: string | null | undefined, _ownerUserId: string | null): AssigneeResolution {
  const raw = String(value || '').trim()
  // Blank or the stage-actor choice means the org's configured field worker, not the owner.
  if (!raw || raw === 'owner' || raw === 'stage-actor') {
    return {}
  }

  if (raw.startsWith('member:')) {
    const userId = raw.slice('member:'.length).trim()
    return userId ? { assigneeId: userId, assigneeUserId: userId } : {}
  }

  if (raw.startsWith('contact:')) {
    const phone = raw.slice('contact:'.length).trim()
    return phone ? { assigneeId: phone } : {}
  }

  return { assigneeId: raw, assigneeUserId: raw }
}

/** A stored "Organization owner" label is a role, not a person's name. */
function personName(member: { userId: string; role?: string; displayName?: string; phone?: string }): string {
  const name = String(member.displayName || '').trim()
  const generic = !name || /^(organization owner|team member)$/i.test(name)
  if (!generic) return name
  if (member.phone) return member.phone
  if (String(member.role || '').toLowerCase() === 'owner') return 'Organization owner'
  return `Team member · ${member.userId.slice(0, 6)}`
}

function memberOptionLabel(member: OrgMemberLite, duplicate: boolean): string {
  const role = String(member.role || 'member').replace(/_/g, ' ')
  const base = `${personName(member)} (${role})`
  return duplicate ? `${base} · ${member.userId.slice(0, 4)}` : base
}

function memberSelectData(members: OrgMemberLite[], valuePrefix = ''): Array<{ value: string; label: string }> {
  const active = members.filter((member) => member.status === 'active')
  const bases = active.map((member) => memberOptionLabel(member, false))
  const counts = new Map<string, number>()
  bases.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1))
  return active.map((member, index) => ({
    value: `${valuePrefix}${member.userId}`,
    label: memberOptionLabel(member, (counts.get(bases[index]) || 0) > 1),
  }))
}

async function ensureOnTeam(selection: string | null | undefined, role: string): Promise<AssigneeResolution> {
  const raw = String(selection || '').trim()
  const parsed = parseJobContactSelection(raw)
  if (!parsed) return resolveAssigneeSelection(raw, null)
  const orgId = getActiveOrgId()
  if (!orgId) return {}
  if (parsed.scope === 'external') {
    const lookup = await api.get(`/api/organizations/${encodeURIComponent(orgId)}/members/by-phone`, {
      params: { phone: parsed.phone },
    })
    const userId = String(lookup.data?.userId || '').trim()
    if (!userId) throw new Error(OUTSIDE_CONTACT_NEEDS_APP)
    return { assigneeId: userId, assigneeUserId: userId }
  }
  const res = await api.post(`/api/organizations/${encodeURIComponent(orgId)}/members/invite`, {
    phone: parsed.phone,
    role,
  })
  const userId = String(res.data?.targetUserId || '').trim()
  return userId ? { assigneeId: userId, assigneeUserId: userId } : {}
}

function inferNextEvidencePhase(run: any): 'before' | 'concealed' | 'after' | 'receipt' {
  const output = run?.output || {}
  const beforeHash = output?.evidenceBefore?.evidenceHash || output?.evidence?.before?.evidenceHash
  const receiptDone = Boolean(
    output?.evidenceReceipt?.evidenceHash ||
      output?.evidenceReceipt?.skipped ||
      output?.evidence?.receipt?.evidenceHash,
  )
  const concealedDone = Boolean(output?.evidenceConcealed?.evidenceHash || output?.evidence?.concealed?.evidenceHash)
  const concealedFlag = String(run?.input?.requireConcealedWorkPhoto ?? '').trim().toLowerCase()
  const concealedRequired =
    Boolean(run?.input?.requireConcealedWorkPhoto) && !['false', '0', 'no', 'off'].includes(concealedFlag)
  // Before photos → receipts for materials (or none) → optional concealed-work photo → after photos.
  if (!beforeHash) return 'before'
  if (concealedRequired && !concealedDone) return 'concealed'
  return receiptDone ? 'after' : 'receipt'
}

function getRequisitionEvents(detail: RequisitionDetail | null): NonNullable<RequisitionDetail['events']> {
  const fromEvents = safeArray(detail?.events)
  if (fromEvents.length > 0) return fromEvents as NonNullable<RequisitionDetail['events']>
  return safeArray((detail as any)?.timeline) as NonNullable<RequisitionDetail['events']>
}

function deriveRequestedAmount(
  detail: RequisitionDetail | null,
  row?: RequisitionRow | null,
): { amount: number; currency: string } {
  const events = getRequisitionEvents(detail)
  const createdEvent = events.find(
    (event: any) => String(event?.eventType || '').toUpperCase() === 'REQUISITION_CREATED',
  )
  const releasedEvent = events.find(
    (event: any) => String(event?.eventType || '').toUpperCase() === 'REQUISITION_RELEASED',
  )

  const amount =
    asNumber(createdEvent?.metadata?.amount) ??
    asNumber(createdEvent?.metadata?.totalAmount) ??
    asNumber(createdEvent?.amount) ??
    asNumber(row?.metadata?.amount) ??
    asNumber(row?.metadata?.totalAmount) ??
    asNumber(releasedEvent?.metadata?.amount) ??
    asNumber(releasedEvent?.metadata?.totalAmount) ??
    asNumber((detail as any)?.totalAmount) ??
    asNumber(detail?.summary?.paymentAmount) ??
    0

  const currency = String(
    createdEvent?.metadata?.currency ||
      createdEvent?.currency ||
      row?.metadata?.currency ||
      releasedEvent?.metadata?.currency ||
      detail?.summary?.paymentCurrency ||
      'USD',
  )

  return { amount, currency }
}

/**
 * Notify about a failed wallet confirmation in plain words. When the wallet has no role card for
 * the organization yet, point to the inbox where the card is waiting (same hint as the portal modal).
 */
function notifyWalletStepFailed(title: string, err: any) {
  const raw = String(err?.response?.data?.error || err?.message || 'Please try again.')
  const cleaned = raw.replace(/\s*\(missing:[^)]*\)\s*$/i, '').trim()
  // Raw technical dumps (JSON, stack traces, credential ids) are not for end users.
  const message =
    cleaned.length > 240 || /[{}"]|_jwt_vc|Error:/.test(cleaned)
      ? 'This step could not be completed right now. Please try again, or ask your administrator for help.'
      : cleaned
  const missingRoleCard = /role card/i.test(message)
  notifications.show({
    title,
    message: missingRoleCard ? `${message} Open Inbox and tap Accept on your role card.` : message,
    color: 'red',
    autoClose: missingRoleCard ? 10000 : 5000,
  })
}

function describeRequisitionEvent(event: NonNullable<RequisitionDetail['events']>[number]): string | null {
  const metadata = event?.metadata || {}
  const actorName = metadata.actorName || metadata.approverName || metadata.subjectName
  const role = metadata.approverRole
  const notes = metadata.notes
  const amount = asNumber(metadata.amount ?? event?.amount)
  const currency = String(metadata.currency || event?.currency || '').trim()

  const eventType = String(event?.eventType || '').toUpperCase()

  switch (eventType) {
    case 'REQUISITION_CREATED':
      return `Request created for ${fmt(amount, currency || 'USD')}${notes ? ` · Notes: ${notes}` : ''}`
    case 'AGENT_ASSIGNED':
      return `Field agent assigned: ${metadata.assigneeId || 'unknown'}`
    case 'JOB_STARTED':
      return 'Field operative has started the job on site.'
    case 'WORK_EVIDENCE_BEFORE':
      return 'Before-execution record captured and uploaded.'
    case 'WORK_EVIDENCE_AFTER':
      return 'Final performance record captured and uploaded.'
    case 'EXECUTION_ACKNOWLEDGED':
      return 'Service delivery acknowledged by the receiver.'
    case 'JOB_CLOSED':
      return 'Job successfully completed and reconciled.'
    default:
      const parts = [
        actorName ? `Actor: ${actorName}` : null,
        role ? `Role: ${role}` : null,
        amount != null ? `Amount: ${fmt(amount, currency || 'USD')}` : null,
        notes ? `Notes: ${notes}` : null,
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : null
  }
}

/* ── Page ── */

export default function FinancePage() {
  const router = useRouter()
  const openRelatedWork = useRelatedWorkNavigation()
  const currentInboxTask = typeof window !== 'undefined' ? getTaskContext() : null
  const taskUrl = currentInboxTask ? new URL(window.location.href) : null
  const itemTaskActive = Boolean(taskUrl)
  const canLoadFinance = typeof window !== 'undefined' && getContextMode() === 'org' &&
    (!currentInboxTask || isBoundTaskPath(currentInboxTask, `${window.location.pathname}${window.location.search}`))
  const fieldTaskRunId =
    taskUrl?.searchParams.get('tab') === 'field'
      ? normalizeRunId(taskUrl.searchParams.get('runId'))
      : null
  useEffect(() => {
    if (getContextMode() !== 'org') {
      router.replace('/inbox')
    }
  }, [router])

  const invoiceResumeRef = useRef<string | null>(null)
  const arPlanResumeRef = useRef<string | null>(null)
  const arTransactionResumeRef = useRef<string | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const [area, setArea] = useState<'operations' | 'money'>('operations')
  const [operationProfile, setOperationProfile] = useState<OrgProfile | null>(null)
  const [workflowConfigReady, setWorkflowConfigReady] = useState(false)
  const [workflowConfigError, setWorkflowConfigError] = useState('')
  const activeSessionOrg = useSessionStore(state => state.orgId)
  const operationScope = useSessionStore(state => state.scope)
  const [links, setLinks] = useState<PaymentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'USD',
    invoiceRef: '',
    merchantName: '',
    expiryHours: '336',
    collectionType: 'one_time',
    payerName: '',
    payerPhone: '',
    instalments: '3',
    cadence: 'monthly',
    firstDueDate: dayjs().format('YYYY-MM-DD'),
  })

  // Contact picker state
  const [contacts, setContacts] = useState<OrgContact[]>([])
  const [selectedContact, setSelectedContact] = useState<OrgContact | null>(null)
  const [selectedPlanContact, setSelectedPlanContact] = useState<OrgContact | null>(null)
  const [selectedInvoiceContact, setSelectedInvoiceContact] = useState<OrgContact | null>(null)
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [planForm, setPlanForm] = useState({
    description: '',
    totalAmount: '',
    currency: 'USD',
    payerName: '',
    payerPhone: '',
    payerEmail: '',
    instalments: '3',
    cadence: 'monthly',
    firstDueDate: dayjs().format('YYYY-MM-DD'),
  })
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<any | null>(null)
  const [loadingPlanDetails, setLoadingPlanDetails] = useState(false)
  const [creatingArProofRequest, setCreatingArProofRequest] = useState(false)
  const [activeTemplates, setActiveTemplates] = useState<any[]>([])
  const [requisitions, setRequisitions] = useState<RequisitionRow[]>([])
  const [requisitionsLoading, setRequisitionsLoading] = useState(false)
  const [showRequisition, setShowRequisition] = useState(false)
  const [creatingRequisition, setCreatingRequisition] = useState(false)
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<string | null>(null)
  const [chainRequest, setChainRequest] = useState<any>(null)
  const [chainDecisionReason, setChainDecisionReason] = useState('')
  const [chainDecisionLoading, setChainDecisionLoading] = useState(false)
  /** History of a client payment or a supplier bill without a purchase chain (same panel as a job). */
  const [historyItem, setHistoryItem] = useState<null | { title: string; trail: JobAuditTrail }>(null)
  const [listView, setListView] = useFinanceListView()
  /** Supplier bills from the payables ledger (money out), same list as the website. */
  const [apBills, setApBills] = useState<any[]>([])
  /** Purchase requests raised from jobs, listed under Requisitions like the website. */
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([])
  const [selectedRequisition, setSelectedRequisition] = useState<RequisitionDetail | null>(null)
  const [requisitionDecisionReason, setRequisitionDecisionReason] = useState('')

  // FEPT — completely separate from requisitions
  const [selectedFieldRun, setSelectedFieldRun] = useState<any | null>(null)
  /** Run id from a deep link that could not be opened, so the opening screen gives way to the list. */
  const [fieldDeepLinkFailed, setFieldDeepLinkFailed] = useState<string | null>(null)
  const [fieldJobTab, setFieldJobTab] = useState<FieldJobTab>('details')
  const [orgMembers, setOrgMembers] = useState<OrgMemberLite[]>([])
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [fieldReassignAssigneeId, setFieldReassignAssigneeId] = useState<string>('')
  // Pre-work checkpoints: site inspection, field worker risk assessment, arrival proof.
  const [checkpointRun, setCheckpointRun] = useState<any | null>(null)
  // Jobs currently waiting on related work (a purchase or quote); their step buttons are disabled.
  const [heldRuns, setHeldRuns] = useState<Record<string, boolean>>({})
  const markRunHeld = useCallback((runId: string, held: boolean) => {
    setHeldRuns((current) => (Boolean(current[runId]) === held ? current : { ...current, [runId]: held }))
  }, [])
  const [cpOutcome, setCpOutcome] = useState<string>('passed')
  const [cpFindings, setCpFindings] = useState('')
  const [cpHazards, setCpHazards] = useState('')
  const [cpControls, setCpControls] = useState('')
  const [cpPpe, setCpPpe] = useState(false)
  // Safety check: an explicit choice. Leaving it blank is an error, never a hold.
  const [cpDecision, setCpDecision] = useState<'' | 'safe' | 'not_safe'>('')
  const [cpHoldReason, setCpHoldReason] = useState('')
  const [cpHoldPhoto, setCpHoldPhoto] = useState<{ photoUri: string; evidenceHash: string } | null>(null)
  const [cpPhotoBusy, setCpPhotoBusy] = useState(false)
  const [cpWhatChanged, setCpWhatChanged] = useState('')
  // Who fixes the problem when the job is put on hold. The organisation by default.
  const [cpFixBy, setCpFixBy] = useState<SafetyHoldFixBy>('organisation')
  const [cpSiteCode, setCpSiteCode] = useState('')
  // The organisation's note when it marks a safety hold resolved.
  const [holdResolveNote, setHoldResolveNote] = useState('')
  const [fieldProofStage, setFieldProofStage] = useState<FieldProofStage | null>(null)
  const [fieldProofRunId, setFieldProofRunId] = useState<string | null>(null)
  const [fieldProofRequest, setFieldProofRequest] = useState<{
    requestId: string
    presentationRequestUrl: string
    purposeLine?: string
  } | null>(null)
  const [fieldProofCreating, setFieldProofCreating] = useState(false)
  const [feptActionLoading, setFeptActionLoading] = useState(false)
  const [requisitionLifecycleNote, setRequisitionLifecycleNote] = useState('Goods/services received and confirmed.')
  const [orgContextBundle, setOrgContextBundle] = useState<OrgContextBundleCacheEntry | null>(null)
  const [showFieldRun, setShowFieldRun] = useState(false)
  const [creatingFieldRun, setCreatingFieldRun] = useState(false)
  const [fieldRunForm, setFieldRunForm] = useState({
    poNumber: '',
    problemType: '',
    description: '',
    clientName: '',
    clientPhone: '',
    amount: '',
    payoutAmount: '',
    currency: 'USD',
    paymentTerms: 'one_time',
    instalments: '2',
    paymentCadence: 'monthly',
    firstDueDate: dayjs().format('YYYY-MM-DD'),
    firstPaymentAmount: '',
    location: '',
    vehicleReference: '',
    requireConcealedWorkPhoto: false,
    scheduledDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    assigneeId: 'stage-actor',
    receiverId: 'stage-actor',
  })
  const [requisitionActionLoading, setRequisitionActionLoading] = useState(false)
  const [requisitionStageActors, setRequisitionStageActors] = useState<
    Array<{
      stageAction: string
      actorDescription?: string
      credential?: { state?: string; stale?: boolean }
      actor?: { userId?: string; walletTenantId?: string; role?: string; mode?: string }
    }>
  >([])
  // Who does what for field jobs (reviewer, inspector, sign-off, payout), from the organization's setup.
  const [fieldStageActors, setFieldStageActors] = useState<
    Array<{
      stageAction: string
      actor?: { userId?: string; walletTenantId?: string; role?: string; mode?: string }
    }>
  >([])
  // Who does what for school fees (the receipt step), the same lookup the website uses.
  const [feeStageActors, setFeeStageActors] = useState<JobActorStage[]>([])
  const [contextSwitching, setContextSwitching] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  // Fallback ways to share a proof stay folded so the dialog has one action.
  const [proofMoreOpen, setProofMoreOpen] = useState(false)
  const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null)
  const [approvalRequestUrl, setApprovalRequestUrl] = useState<string | null>(null)
  const [creatingApprovalRequest, setCreatingApprovalRequest] = useState(false)
  const [approving, setApproving] = useState(false)
  // Release VP modal state
  const [showReleaseModal, setShowReleaseModal] = useState(false)
  const [releaseRequestId, setReleaseRequestId] = useState<string | null>(null)
  const [releaseRequestUrl, setReleaseRequestUrl] = useState<string | null>(null)
  const [creatingReleaseRequest, setCreatingReleaseRequest] = useState(false)
  const [releasing, setReleasing] = useState(false)
  // Acknowledge VP modal state
  const [showAckModal, setShowAckModal] = useState(false)
  const [ackRequestId, setAckRequestId] = useState<string | null>(null)
  const [ackRequestUrl, setAckRequestUrl] = useState<string | null>(null)
  const [creatingAckRequest, setCreatingAckRequest] = useState(false)
  const [acking, setAcking] = useState(false)
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false)
  const [showAckConfirm, setShowAckConfirm] = useState(false)
  const [requisitionForm, setRequisitionForm] = useState({
    department: 'Operations',
    payWith: 'supplier' as 'supplier' | 'cash',
    vendor: '',
    purchaseKind: 'goods' as 'goods' | 'service',
    receivingRequired: 'yes' as 'yes' | 'no',
    amount: '',
    currency: 'USD',
    notes: '',
  })

  // Created link result
  const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null)
  const [linkAuditLoading, setLinkAuditLoading] = useState(false)
  const [linkAuditItems, setLinkAuditItems] = useState<LinkAuditItem[]>([])

  // Invoice form state
  const [showInvoice, setShowInvoice] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    studentName: '',
    studentId: '',
    className: '',
    term: '',
    feeType: 'Tuition',
    amount: '',
    currency: 'USD',
    parentName: '',
    parentPhone: '',
    paymentTerms: 'one_time',
    instalments: '3',
    paymentCadence: 'monthly',
    firstDueDate: new Date().toISOString().slice(0, 10),
  })
  const [feeRuns, setFeeRuns] = useState<Array<SchoolFeeRunLike & { id: string; createdAt?: string }>>([])
  const [feeRunsLoading, setFeeRunsLoading] = useState(false)
  const [selectedFeeRunId, setSelectedFeeRunId] = useState<string | null>(null)

  const schoolClassGradeOptions = useMemo(
    () =>
      [
        'ECD A',
        'ECD B',
        'Grade 1',
        'Grade 2',
        'Grade 3',
        'Grade 4',
        'Grade 5',
        'Grade 6',
        'Grade 7',
        'Form 1',
        'Form 2',
        'Form 3',
        'Form 4',
        'Form 5',
        'Form 6',
      ].map((value) => ({ value, label: value })),
    [],
  )

  const schoolTermYearOptions = useMemo(() => {
    const currentYear = dayjs().year()
    const years = [currentYear - 1, currentYear, currentYear + 1]
    const terms = ['Term 1', 'Term 2', 'Term 3']

    return years.flatMap((year) =>
      terms.map((term) => {
        const value = `${term} - ${year}`
        return { value, label: value }
      }),
    )
  }, [])

  // Accounts Payable state variables
  const [apSuppliers, setApSuppliers] = useState<any[]>([])
  const [apWorkflowActions, setApWorkflowActions] = useState<ApWorkflowActionItem[]>([])
  const [selectedSupplierActions, setSelectedSupplierActions] = useState<ApWorkflowActionItem[]>([])
  const [apLoading, setApLoading] = useState(false)
  const [apErr, setApErr] = useState<string | null>(null)
  const [selectedApSupplier, setSelectedApSupplier] = useState<any | null>(null)
  const [supplierStatement, setSupplierStatement] = useState<any | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [selectedCredentialArtifact, setSelectedCredentialArtifact] = useState<CredentialArtifactDetail | null>(null)
  const [showRecordApInvoice, setShowRecordApInvoice] = useState(false)
  const [apInvoiceForm, setApInvoiceForm] = useState({
    supplierName: '',
    invoiceRef: '',
    description: '',
    amount: '',
    currency: 'USD',
    dueDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
  })
  const [showRecordApPayment, setShowRecordApPayment] = useState(false)
  const [apPaymentForm, setApPaymentForm] = useState({
    apInvoiceId: '',
    amountPaid: '',
    currency: 'USD',
    paymentMethod: 'ecocash',
    reference: '',
    proofImageUrl: '',
  })
  const [submittingApAction, setSubmittingApAction] = useState(false)

  // Holder receivables view state
  const [myRemittances, setMyRemittances] = useState<any[]>([])
  const [myRemittancesLoading, setMyRemittancesLoading] = useState(false)
  const [arObligations, setArObligations] = useState<ArObligationItem[]>([])
  const [arObligationsLoading, setArObligationsLoading] = useState(false)

  const scopedProfile = operationProfile?.orgTenantId === activeSessionOrg ? operationProfile : readOrgProfile()
  const capabilityFlags = getWorkflowCapabilityFlags(activeTemplates, scopedProfile?.access ?? null)
  const hasPaymentCollection = capabilityFlags.paymentCollection
  const hasArCollections = capabilityFlags.arCollections
  const hasEducation = capabilityFlags.educationFees
  const hasInternalRequisitions = capabilityFlags.internalRequisitions
  const hasFieldExecutionConfigured = capabilityFlags.fieldExecution
  const hasFieldExecution = hasFieldExecutionConfigured && isEmployeeOrgRole()
  const hasApPayables = capabilityFlags.apPayables
  const orgKinds = scopedProfile?.kinds || []
  const hasCommerce = capabilityFlags.cashCounter || capabilityFlags.ecommerce || orgKinds.includes('shop')
  const requisitionRows = requisitions
  const selectedRequisitionRow = selectedRequisitionId
    ? requisitions.find((row) => row.id === selectedRequisitionId) || null
    : null
  const requisitionEvents = getRequisitionEvents(selectedRequisition)
  const requestedAmount = deriveRequestedAmount(selectedRequisition, selectedRequisitionRow)
  const requisitionStatus = String(
    selectedRequisition?.summary?.status ||
      selectedRequisition?.status ||
      selectedRequisition?.currentStatus ||
      selectedRequisitionRow?.status ||
      'Unknown',
  ).toUpperCase()
  const contextMode = getContextMode()
  const activeOrgId = getActiveOrgId()

  const approvalCapabilities: OrgRoleCapabilities | null = orgContextBundle?.actor?.capabilities || null
  const approvalActionAllowed = approvalCapabilities
    ? approvalCapabilities.allowedActions.includes('workflow.approve_requisition')
    : null

  const approvalLimitLabel =
    approvalCapabilities?.maxApprovalAmount == null
      ? 'No amount ceiling for your role.'
      : `Offline approval ceiling: ${fmt(approvalCapabilities.maxApprovalAmount, requestedAmount.currency)}.`

  const evidenceThresholdLabel =
    typeof approvalCapabilities?.evidenceRequiredAboveAmount === 'number'
      ? `Evidence required above ${fmt(approvalCapabilities.evidenceRequiredAboveAmount, requestedAmount.currency)}.`
      : approvalCapabilities?.requireEvidenceForActions.includes('workflow.approve_requisition')
        ? 'Evidence required for approval actions.'
        : 'Evidence optional for approval actions.'

  const openPaymentLinkInApp = useCallback(
    (link: PaymentLink) => {
      const routeToken = getLinkRouteToken(link)
      if (!routeToken) {
        notifications.show({
          title: 'Payment link unavailable',
          message: 'This payment link is missing a checkout reference. Refresh and try again.',
          color: 'red',
        })
        return
      }

      const params = new URLSearchParams()
      if (link.invoiceRef) params.set('invoiceRef', link.invoiceRef)
      params.set('linkId', link.id)
      if (link.shortlinkCode) params.set('paymentCode', link.shortlinkCode)
      const orgId = getActiveOrgId()
      if (orgId) params.set('orgTenantId', orgId)

      void router.push(`/pay/${encodeURIComponent(routeToken)}?${params.toString()}`)
    },
    [router],
  )

  const openPaymentLinkDetails = useCallback((link: PaymentLink) => {
    setCreatedLink(link)
  }, [])

  const openPlanDetails = useCallback(async (planId: string) => {
    const token = getPreferredToken() || getWalletToken()
    if (!token) return
    setLoadingPlanDetails(true)
    try {
      const res = await api.get(`/api/finance/ar/plans/${planId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedPlanDetails(res.data)
      setSelectedPlanId(planId)
    } catch (err: any) {
      notifications.show({
        title: 'Failed to load plan',
        message: err.response?.data?.error || err.message,
        color: 'red',
      })
    } finally {
      setLoadingPlanDetails(false)
    }
  }, [])

  const openCredentialArtifact = useCallback((artifact: CredentialArtifactDetail) => {
    setSelectedCredentialArtifact(artifact)
  }, [])

  const loadLinkAudit = useCallback(async (link: PaymentLink) => {
    const token = getPreferredToken() || getWalletToken()
    if (!token) {
      setLinkAuditItems([])
      return
    }

    const refs = getPaymentAuditRefs(link)
    if (refs.length === 0) {
      setLinkAuditItems([])
      return
    }

    setLinkAuditLoading(true)
    try {
      const responses = await Promise.all(
        refs.map((ref) =>
          api.get(`/api/audit/activity/${encodeURIComponent(ref)}`, {
            params: { limit: 25 },
            headers: { Authorization: `Bearer ${token}` },
            skipAuthRedirect: true as any,
          } as any),
        ),
      )

      const merged = responses
        .flatMap((response) => safeArray(response.data))
        .map((entry: any) => ({
          id: String(entry?.id || ''),
          actionType: String(entry?.actionType || entry?.eventType || '').trim() || undefined,
          actorName: String(entry?.actorName || entry?.actorDid || '').trim() || undefined,
          resourceId: String(entry?.resourceId || entry?.workflowId || '').trim() || undefined,
          createdAt: String(entry?.createdAt || new Date().toISOString()),
          details: entry?.details && typeof entry.details === 'object' ? entry.details : undefined,
        }))
        .filter((entry: LinkAuditItem) => entry.id.length > 0)

      const deduped = Array.from(new Map(merged.map((entry) => [entry.id, entry])).values())
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
        .slice(0, 12)

      setLinkAuditItems(deduped)
    } catch {
      setLinkAuditItems([])
    } finally {
      setLinkAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!createdLink) {
      setLinkAuditItems([])
      setLinkAuditLoading(false)
      return
    }

    void loadLinkAudit(createdLink)
  }, [createdLink, loadLinkAudit])

  /* ── Fetch ── */

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const endpoint = hasArCollections ? '/api/finance/ar/collections' : '/api/payment-links'
      const res = await api.get(endpoint)
      const rawLinks = hasArCollections ? res.data?.collections || [] : res.data?.links || []
      const normalized = safeArray(rawLinks).map((link: any) => {
        const shortlinkUrl = firstNonEmptyString(
          link?.shortlinkUrl,
          link?.shortlink_url,
          link?.paymentUrl,
          link?.url,
          link?.shortUrl,
        )
        const shortlinkCode = firstNonEmptyString(
          link?.shortlinkCode,
          link?.shortlink_code,
          link?.paymentCode,
          extractPaymentCode(shortlinkUrl),
        )
        return {
          ...link,
          merchantId: link?.merchantId ?? link?.merchant_id,
          merchantName: link?.merchantName ?? link?.merchant_name,
          invoiceRef: link?.invoiceRef ?? link?.invoice_ref,
          paidAt: link?.paidAt ?? link?.paid_at,
          createdAt: link?.createdAt ?? link?.created_at,
          expiry: link?.expiry ?? link?.expiry,
          shortlinkUrl,
          shortlinkCode,
        } as PaymentLink
      })
      setLinks(normalized)
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to load payment links')
    } finally {
      setLoading(false)
    }
  }, [hasArCollections])

  const fetchContacts = useCallback(async () => {
    try {
      const token = getPreferredToken()
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined

      let data: any[] = []
      if (getContextMode() === 'org') {
        // Org contacts are split by scope. Fetch both so internal owner/member contacts are visible.
        const [externalRes, internalRes] = await Promise.allSettled([
          api.get('/api/contacts', { params: { contactScope: 'external' }, headers: authHeaders }),
          api.get('/api/contacts', { params: { contactScope: 'internal' }, headers: authHeaders }),
        ])

        const externalData =
          externalRes.status === 'fulfilled'
            ? safeArray(externalRes.value.data?.contacts ?? externalRes.value.data)
            : []
        const internalData =
          internalRes.status === 'fulfilled'
            ? safeArray(internalRes.value.data?.contacts ?? internalRes.value.data)
            : []

        const merged = [...externalData, ...internalData]
        data = Array.from(new Map(merged.map((entry: any) => [entry.id, entry])).values())
      } else {
        const res = await api.get('/api/contacts', { headers: authHeaders })
        data = safeArray(res.data?.contacts ?? res.data)
      }

      setContacts(
        data.map((c: any) => ({
          id: c.id,
          name: c.name ?? 'Unknown',
          phone: c.phone,
          email: c.email,
          contactScope: c.contactScope === 'internal' ? ('internal' as const) : ('external' as const),
        })),
      )
    } catch {
      /* optional */
    }
  }, [])

  const fetchWorkflowConfig = useCallback(async () => {
    const orgId = getActiveOrgId()
    if (!orgId) {
      return
    }
    try {
      const [res, profileResponse] = await Promise.all([
        api.get(`/api/organizations/${orgId}/workflows`),
        api.get(`/api/organizations/${orgId}${SETUP_PROFILE_PATH}`),
      ])
      if (getActiveOrgId() !== orgId || useSessionStore.getState().scope !== operationScope) return
      const profile = profileFromServer(profileResponse.data)
      setOperationProfile(profile)
      if (profile) persistOrgProfile(profile)
      const data = safeArray(res.data?.templates)
      const templates = data.filter((t: any) => t?.enabled)
      setActiveTemplates(templates)
      setWorkflowConfigReady(true)
      setWorkflowConfigError('')
    } catch (error) {
      if (useSessionStore.getState().scope === operationScope) {
        setWorkflowConfigError(friendlyRequestError(error, 'Retry to load the organisation setup.'))
      }
    }
  }, [operationScope])

  useEffect(() => {
    setOperationProfile(null)
    setActiveTemplates([])
    setWorkflowConfigReady(false)
    setWorkflowConfigError('')
    setTab(null)
  }, [operationScope])

  useEffect(() => {
    const refreshProfile = () => setOperationProfile(readOrgProfile())
    window.addEventListener('orgConfigurationChanged', refreshProfile)
    return () => window.removeEventListener('orgConfigurationChanged', refreshProfile)
  }, [])

  const fetchOrgMembers = useCallback(async () => {
    const orgId = getActiveOrgId()
    if (!orgId) {
      setOrgMembers([])
      setOwnerUserId(null)
      return
    }
    const token = getPreferredToken()
    if (!token) {
      setOrgMembers([])
      setOwnerUserId(null)
      return
    }

    try {
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgId)}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const members = safeArray<OrgMemberLite>(res.data).filter(
        (m: any) => String(m?.status || '').toLowerCase() === 'active',
      )
      setOrgMembers(members)

      const owner = members.find((m) => m.role === 'owner') || members.find((m) => m.role === 'admin') || null
      setOwnerUserId(owner?.userId || null)
    } catch {
      setOrgMembers([])
      setOwnerUserId(null)
    }

    try {
      const actorRes = await api.get(`/api/organizations/${encodeURIComponent(orgId)}/workflows/actors`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const workflows = safeArray<any>(actorRes.data?.workflows)
      const match = workflows.find((workflow) => /field|fept/i.test(String(workflow.workflowType || '')))
      setFieldStageActors(safeArray(match?.stages))
      setFeeStageActors(actorsForWorkflow(workflows, ['education', 'school', 'fee', 'collect']))
    } catch {
      setFieldStageActors([])
      setFeeStageActors([])
    }
  }, [])

  const fetchRequisitions = useCallback(async () => {
    if (!hasInternalRequisitions) {
      setRequisitions([])
      return
    }

    const token = getPreferredToken()
    if (!token) {
      setRequisitions([])
      return
    }

    setRequisitionsLoading(true)
    try {
      const [res, platform] = await Promise.all([
        api.get('/api/finance/requisitions', { headers: { Authorization: `Bearer ${token}` } }),
        api
          .get('/api/platform/requests', { params: { limit: 80 }, headers: { Authorization: `Bearer ${token}` } })
          .catch(() => null),
      ])
      const rows = safeArray<RequisitionRow>(res.data)
      setRequisitions(rows)
      const platformRows: any[] = Array.isArray(platform?.data?.items)
        ? platform.data.items
        : safeArray<any>(platform?.data)
      setPurchaseRequests(
        platformRows.filter((row) =>
          String(row.requestType || row.request_type || '')
            .toLowerCase()
            .includes('requisition'),
        ),
      )
    } catch (err: any) {
      const message = err.response?.data?.message || err.message
      if (
        String(message || '')
          .toLowerCase()
          .includes('organization context required')
      ) {
        setRequisitions([])
      }
    } finally {
      setRequisitionsLoading(false)
    }
  }, [hasInternalRequisitions])

  // FEPT runs are fetched from /workflows/runs — NOT from /api/finance/requisitions.
  // Kept in the shared cache per account + organisation, so the jobs list is there at once on return.
  const queryClient = useQueryClient()
  const sessionScope = useSessionStore((state) => state.scope)
  const fieldRunsEnabled = Boolean(canLoadFinance && hasFieldExecution && !(itemTaskActive && !fieldTaskRunId))
  const fieldRunsKey = useMemo(
    () => (fieldTaskRunId ? queryKeys.fieldRun(sessionScope, fieldTaskRunId) : queryKeys.fieldRuns(sessionScope)),
    [sessionScope, fieldTaskRunId],
  )
  const fieldRunsQuery = useQuery<any[]>({
    queryKey: fieldRunsKey,
    enabled: fieldRunsEnabled,
    staleTime: fieldTaskRunId ? STALE_TIME.fieldRun : STALE_TIME.fieldRuns,
    meta: { persist: !fieldTaskRunId },
    queryFn: async () => {
      const token = getPreferredToken()
      if (!token) return []
      try {
        const res = await api.get(fieldTaskRunId ? `/workflows/runs/${encodeURIComponent(fieldTaskRunId)}` : '/workflows/runs', {
          params: fieldTaskRunId ? undefined : { limit: 50 },
          headers: { Authorization: `Bearer ${token}` },
        })
        const raw = fieldTaskRunId ? [res.data] : safeArray(res.data)
        return raw.filter((run: any) => {
          const wfId = String(run.workflowId || run.workflow_id || '').toLowerCase()
          const stage = String(run.output?.workflowStage || run.output?.stage || '').toUpperCase()
          const FEPT_STAGES = new Set([
            'REQUEST_CREATED',
            'ASSIGNED',
            'IN_PROGRESS',
            'EVIDENCE_CAPTURED',
            'ACKNOWLEDGED',
            'PAYMENT_TRIGGERED',
            'RECEIPT_ISSUED',
            'RECONCILED',
            'COMPLETED',
            'DISPUTED',
            'CANCELLED',
          ])
          return wfId.includes('field') || wfId.includes('fept') || FEPT_STAGES.has(stage)
        })
      } catch (err: any) {
        if (fieldTaskRunId) {
          notifications.show({
            title: 'Could not load the job',
            message: err.response?.data?.error || err.response?.data?.message || err.message,
            color: 'red',
          })
        }
        // Keep the jobs already shown; a failed refresh should not empty the list.
        throw err
      }
    },
  })
  const fieldRuns = useMemo<any[]>(
    () => (fieldRunsEnabled ? fieldRunsQuery.data ?? [] : []),
    [fieldRunsEnabled, fieldRunsQuery.data],
  )
  // Only the first load (nothing saved yet) shows as loading in the list; refreshes use the header bar.
  const fieldRunsLoading = fieldRunsEnabled && fieldRunsQuery.isPending && fieldRunsQuery.isFetching
  // Keep the open job sheet on the latest copy of the job whenever the list reloads
  // (for example when a purchase finishes and its receipts come back to the job).
  useEffect(() => {
    if (!selectedFieldRun?.id) return
    const fresh = fieldRuns.find((run) => String(run?.id) === String(selectedFieldRun.id))
    if (!fresh || fresh === selectedFieldRun) return
    const signature = (run: any) =>
      JSON.stringify([
        run?.status,
        run?.output?.pauseReason,
        run?.output?.workflowStage,
        run?.output?.completedStages,
        (Array.isArray(run?.output?.handoffs) ? run.output.handoffs : []).map((h: any) => `${h?.id}:${h?.status}`),
      ])
    if (signature(fresh) !== signature(selectedFieldRun)) setSelectedFieldRun(fresh)
  }, [fieldRuns, selectedFieldRun])
  const fetchFieldRuns = useCallback(async () => {
    if (!fieldRunsEnabled) return
    await queryClient.refetchQueries({ queryKey: fieldRunsKey, exact: true }).catch(() => undefined)
    // A change to one job also changes the list and the job opened on its own.
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === sessionScope && (query.queryKey[1] === 'field-runs' || query.queryKey[1] === 'field-run'),
      refetchType: 'none',
    })
  }, [fieldRunsEnabled, queryClient, fieldRunsKey, sessionScope])

  // School fees: one run per fee, the same list the website shows.
  const fetchFeeRuns = useCallback(async () => {
    const token = getPreferredToken()
    if (!hasEducation || !token) {
      setFeeRuns([])
      return
    }
    setFeeRunsLoading(true)
    try {
      const res = await api.get('/workflows/runs', {
        params: { limit: 200 },
        headers: { Authorization: `Bearer ${token}` },
      })
      setFeeRuns(safeArray<any>(res.data).filter((run: any) => isSchoolFeeRun(run)))
    } catch {
      setFeeRuns([])
    } finally {
      setFeeRunsLoading(false)
    }
  }, [hasEducation])

  const fetchApSuppliers = useCallback(async () => {
    if (!hasApPayables) {
      setApSuppliers([])
      return
    }
    const token = getPreferredToken()
    if (!token) return
    setApLoading(true)
    setApErr(null)
    try {
      const [res, bills] = await Promise.all([
        api.get('/api/finance/ap/suppliers', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/finance/ap/invoices', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ])
      setApSuppliers(safeArray(res.data))
      setApBills(safeArray<any>(bills?.data))
    } catch (err: any) {
      setApErr(err.response?.data?.error || err.response?.data?.message || err.message)
    } finally {
      setApLoading(false)
    }
  }, [hasApPayables])

  const fetchApWorkflowActions = useCallback(async () => {
    if (!hasApPayables) {
      setApWorkflowActions([])
      return
    }
    const token = getPreferredToken()
    if (!token) {
      setApWorkflowActions([])
      return
    }
    try {
      const res = await api.get('/api/finance/ap/workflow-actions', {
        params: { onlyPending: true },
        headers: { Authorization: `Bearer ${token}` },
      })
      setApWorkflowActions(safeArray<ApWorkflowActionItem>(res.data))
    } catch {
      setApWorkflowActions([])
    }
  }, [hasApPayables])

  const fetchSupplierStatement = useCallback(async (supplierId: string) => {
    const token = getPreferredToken()
    if (!token) return
    setStatementLoading(true)
    try {
      const res = await api.get(`/api/finance/ap/supplier-statement/${supplierId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSupplierStatement(res.data)
    } catch (err: any) {
      notifications.show({
        title: 'Error loading statement',
        message: err.response?.data?.error || err.message,
        color: 'red',
      })
    } finally {
      setStatementLoading(false)
    }
  }, [])

  const fetchSupplierWorkflowActions = useCallback(async (supplierId: string) => {
    const token = getPreferredToken()
    if (!token) {
      setSelectedSupplierActions([])
      return
    }
    try {
      const res = await api.get('/api/finance/ap/workflow-actions', {
        params: { supplierId },
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedSupplierActions(safeArray<ApWorkflowActionItem>(res.data))
    } catch {
      setSelectedSupplierActions([])
    }
  }, [])

  const runApWorkflowTransition = useCallback(
    async (item: ApWorkflowActionItem) => {
      const token = getPreferredToken()
      if (!token) return
      const transition = String(item.required_action || '').trim()
      if (!transition || !item.id) return

      const supported = new Set([
        'present_payment_proof',
        'record_payment',
        'acknowledge_remittance',
        'issue_receipt_vc',
        'mark_disputed',
        'resolve_dispute',
      ])
      if (!supported.has(transition)) {
        notifications.show({
          title: 'Action not yet wired',
          message: `Unsupported transition: ${transition}`,
          color: 'yellow',
        })
        return
      }

      if (item.required_proof_type) {
        try {
          const proofRes = await api.post(
            `/api/finance/ap/workflow-actions/${item.id}/proof-request`,
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          )

          const requestId = String(proofRes.data?.requestId || '').trim()
          const presentationRequestUrl = String(proofRes.data?.presentationRequestUrl || '').trim()
          if (!requestId || !presentationRequestUrl) {
            throw new Error('AP workflow proof request was not returned by server.')
          }

          const params = new URLSearchParams({
            request_uri: presentationRequestUrl,
            requestId,
            mode: 'ap-workflow-transition',
            transactionId: item.id,
            transition,
            ...(getActiveOrgId() ? { orgTenantId: String(getActiveOrgId()) } : {}),
          })

          await router.push(`/present?${params.toString()}`)
          return
        } catch (err: any) {
          notifications.show({
            title: 'Proof request failed',
            message: err.response?.data?.error || err.message,
            color: 'red',
          })
          return
        }
      }

      try {
        await api.post(
          `/api/finance/ap/workflow-actions/${item.id}/transition`,
          {
            transition,
            consentTimestamp: new Date().toISOString(),
            notes: 'Mobile AP workflow transition',
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )

        notifications.show({
          title: 'Workflow advanced',
          message: `Moved stage using ${transition}.`,
          color: 'teal',
        })

        fetchApWorkflowActions()
        if (selectedApSupplier?.id) {
          fetchSupplierWorkflowActions(selectedApSupplier.id)
          fetchSupplierStatement(selectedApSupplier.id)
          fetchApSuppliers()
        }
      } catch (err: any) {
        notifications.show({
          title: 'Transition failed',
          message: err.response?.data?.error || err.message,
          color: 'red',
        })
      }
    },
    [
      fetchApSuppliers,
      fetchApWorkflowActions,
      fetchSupplierStatement,
      fetchSupplierWorkflowActions,
      router,
      selectedApSupplier?.id,
    ],
  )

  const launchArCollectionProof = useCallback(
    async (transactionId: string, options?: { planId?: string | null; orgTenantId?: string | null }) => {
      const token = getWalletToken() || getPreferredToken()
      if (!token) {
        notifications.show({
          title: 'Organization session required',
          message: 'Switch into the debtor organization context to launch this wallet proof.',
          color: 'yellow',
        })
        return
      }

      setCreatingArProofRequest(true)
      try {
        const proofRes = await api.post(
          `/api/finance/ap/workflow-actions/${encodeURIComponent(transactionId)}/proof-request`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        )

        const requestUrl = String(proofRes.data?.presentationRequestUrl || '').trim()
        const requestId = String(proofRes.data?.requestId || '').trim()
        const transition = String(proofRes.data?.requiredAction || 'present_payment_proof').trim()
        if (!requestUrl || !requestId) {
          throw new Error('Proof request URL was not returned by server')
        }

        const params = new URLSearchParams({
          request_uri: requestUrl,
          mode: 'ar-collection-consent',
          transactionId,
          requestId,
          transition,
        })

        const orgTenantId = options?.orgTenantId || getActiveOrgId() || undefined
        if (orgTenantId) params.set('orgTenantId', orgTenantId)
        if (options?.planId) params.set('planId', options.planId)

        await router.push(`/present?${params.toString()}`)
      } catch (err: any) {
        notifications.show({
          title: 'Proof request failed',
          message: err.response?.data?.error || err.response?.data?.message || err.message,
          color: 'red',
        })
      } finally {
        setCreatingArProofRequest(false)
      }
    },
    [router],
  )

  const fetchMyRemittances = useCallback(async () => {
    const token = getPreferredToken()
    if (!token) return
    setMyRemittancesLoading(true)
    try {
      const res = await api.get('/api/finance/ap/my-remittances', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setMyRemittances(safeArray(res.data))
    } catch (err: any) {
      console.error('Failed to load my remittances:', err)
    } finally {
      setMyRemittancesLoading(false)
    }
  }, [])

  const fetchArObligations = useCallback(async () => {
    const token = getPreferredToken()
    if (!token) {
      setArObligations([])
      return
    }

    setArObligationsLoading(true)
    try {
      const res = await api.get('/api/finance/ar/my-obligations', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setArObligations(safeArray<ArObligationItem>(res.data?.obligations))
    } catch {
      setArObligations([])
    } finally {
      setArObligationsLoading(false)
    }
  }, [])

  const refreshOrgPolicyBundle = useCallback(async (): Promise<OrgContextBundleCacheEntry | null> => {
    const orgId = getActiveOrgId()
    if (!orgId) {
      setOrgContextBundle(null)
      return null
    }

    const cached = getCachedOrgContextBundle(orgId)
    if (cached) {
      setOrgContextBundle(cached)
    }

    const refreshed = await refreshOrgContextBundle(orgId)
    if (refreshed) {
      setOrgContextBundle(refreshed)
      return refreshed
    }

    return cached
  }, [])

  const enforceOrgActionPolicy = useCallback(
    async (input: { actionType: string; amount?: number | null; evidenceProvided?: boolean }): Promise<boolean> => {
      const bundle = orgContextBundle || (await refreshOrgPolicyBundle())
      const decision = evaluateOrgActionPolicy(bundle, {
        actionType: input.actionType,
        amount: typeof input.amount === 'number' ? input.amount : null,
        evidenceProvided: input.evidenceProvided,
        actionTimestamp: new Date().toISOString(),
      })

      if (!decision.allowed) {
        const escalationHint = decision.suggestedEscalationRole
          ? ` Escalate to ${decision.suggestedEscalationRole}.`
          : ''
        notifications.show({
          title: 'Policy Check Failed',
          message: `${decision.reason || 'Action blocked by org policy.'}${escalationHint}`,
          color: 'red',
        })
        return false
      }

      return true
    },
    [orgContextBundle, refreshOrgPolicyBundle],
  )

  const ensureOrgContextForRequisition = useCallback(
    async (orgTenantId: string | null | undefined, purpose: OrgTaskPurpose, refs: Array<string | null | undefined>): Promise<boolean> => {
      if (!orgTenantId) return true

      const normalizedOrgId = String(orgTenantId).trim()
      if (!normalizedOrgId) return true

      const currentMode = getContextMode()
      const currentOrg = getActiveOrgId()
      const pass = getTaskPass()
      const passCoversItem = !pass || taskRefs(...refs).some((ref) => pass.refs.includes(ref))
      if (currentMode === 'org' && currentOrg === normalizedOrgId && passCoversItem) return true

      if (!getWalletToken()) return false

      setContextSwitching(true)
      try {
        const opened = await openOrganizationForTask({ orgId: normalizedOrgId, purpose, refs })
        if (currentMode === 'personal') {
          beginTaskContext({ orgId: normalizedOrgId, target: window.location.pathname + window.location.search })
        }

        notifications.show({
          title: opened.taskPass ? `Working on a task for ${opened.orgName}` : 'Organization context active',
          message: opened.taskPass ? 'Open for this item only.' : 'Switched to the organization.',
          color: 'blue',
        })
        return true
      } catch (error: any) {
        notifications.show({
          title: 'Could not open this task',
          message: error?.response?.data?.message || (error instanceof Error ? error.message : 'Please try again.'),
          color: 'red',
        })
        return false
      } finally {
        setContextSwitching(false)
      }
    },
    [],
  )

  const resolveRequisitionId = useCallback(
    async (targetId: string): Promise<string> => {
      if (/^REQ-/i.test(targetId)) return targetId

      const preferredToken = getPreferredToken()
      try {
        const { data } = await api.get<WorkflowRequestLookup>(`/workflow-requests/${encodeURIComponent(targetId)}`, {
          headers: preferredToken ? { Authorization: `Bearer ${preferredToken}` } : undefined,
        })

        const requisitionId = data?.payload?.requisitionId
        if (requisitionId) return requisitionId
      } catch {
        // Fall through to local requisition row matching.
      }

      const rowMatch = requisitions.find((row) => row.workflowRequestId === targetId)
      if (rowMatch?.id) return rowMatch.id

      throw new Error('Workflow request does not resolve to a requisition ID')
    },
    [requisitions],
  )

  const openRequisitionDetails = useCallback(
    async (targetId: string, orgTenantId?: string | null) => {
      try {
        setSelectedRequisition(null)

        // Ensure we are in the correct org context if an ID is provided.
        if (orgTenantId) {
          const switched = await ensureOrgContextForRequisition(orgTenantId, 'requisition', [targetId])
          if (!switched) {
            notifications.show({
              title: 'Context switch required',
              message: 'Please switch to the correct organization context to action this requisition.',
              color: 'yellow',
            })
          }
        }

        const requisitionId = await resolveRequisitionId(targetId)
        setSelectedRequisitionId(requisitionId)
        const token = getPreferredToken()
        const res = await api.get(`/api/finance/requisitions/${requisitionId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        setSelectedRequisition(res.data || null)
        setRequisitionDecisionReason('')
        const actorOrgId = orgTenantId || getActiveOrgId()
        if (actorOrgId) {
          api
            .get(`/api/organizations/${encodeURIComponent(actorOrgId)}/workflows/actors`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            })
            .then((actorRes) => {
              const workflows = safeArray<any>(actorRes.data?.workflows)
              const match = workflows.find((workflow) =>
                String(workflow.workflowType || '')
                  .toLowerCase()
                  .includes('requis'),
              )
              setRequisitionStageActors(safeArray(match?.stages))
            })
            .catch(() => setRequisitionStageActors([]))
        }
      } catch (err: any) {
        notifications.show({
          title: 'Unable to load requisition details',
          message: err.response?.data?.message ?? err.message,
          color: 'red',
        })
        setSelectedRequisition(null)
      }
    },
    [resolveRequisitionId, ensureOrgContextForRequisition],
  )

  const openFieldRunDetails = useCallback(
    async (targetRunId: string, orgTenantId?: string | null) => {
      const normalizedRunId = normalizeRunId(targetRunId)
      if (!normalizedRunId) return

      if (orgTenantId) {
        const switched = await ensureOrgContextForRequisition(orgTenantId, 'job', [normalizedRunId])
        if (!switched) {
          notifications.show({
            title: 'Context switch required',
            message: 'Switch to that organization to open this job.',
            color: 'yellow',
          })
        }
      }

      const existing = fieldRuns.find((run) => String(run.id || '') === normalizedRunId)
      if (existing) {
        setSelectedFieldRun(existing)
        return
      }

      const token = getPreferredToken()
      if (!token) return

      try {
        const res = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        const run = res.data
        const workflowId = String(run?.workflowId || run?.workflow_id || '').toLowerCase()
        const stage = String(run?.output?.workflowStage || run?.output?.stage || '').toUpperCase()
        const isFept =
          workflowId.includes('field') ||
          workflowId.includes('fept') ||
          [
            'REQUEST_CREATED',
            'APPROVAL_PENDING',
            'APPROVED',
            'ASSIGNED',
            'IN_PROGRESS',
            'EVIDENCE_CAPTURED',
            'ACKNOWLEDGED',
            'PAYMENT_TRIGGERED',
            'RECEIPT_ISSUED',
            'RECONCILED',
            'COMPLETED',
            'DISPUTED',
            'CANCELLED',
            'REVOKED',
          ].includes(stage)

        if (isFept) {
          setSelectedFieldRun(run)
        } else {
          setFieldDeepLinkFailed(normalizedRunId)
        }
      } catch (err: any) {
        setFieldDeepLinkFailed(normalizedRunId)
        notifications.show({
          title: 'Could not open the job',
          message: friendlyRequestError(err, 'Check your connection and try again from the inbox.'),
          color: 'red',
        })
      }
    },
    [ensureOrgContextForRequisition, fieldRuns],
  )

  useEffect(() => {
    if (!canLoadFinance) return
    fetchWorkflowConfig()
    fetchOrgMembers()
    if (!itemTaskActive) {
      fetchContacts()
      void refreshOrgPolicyBundle()
    }
  }, [fetchContacts, fetchWorkflowConfig, fetchOrgMembers, refreshOrgPolicyBundle, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (canLoadFinance && !itemTaskActive) fetchLinks()
  }, [fetchLinks, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (!canLoadFinance || itemTaskActive || contextMode !== 'org' || !activeOrgId) {
      setOrgContextBundle(null)
      return
    }

    void refreshOrgPolicyBundle()
  }, [contextMode, activeOrgId, refreshOrgPolicyBundle, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (canLoadFinance && !itemTaskActive) fetchRequisitions()
  }, [fetchRequisitions, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (canLoadFinance && !itemTaskActive) fetchFeeRuns()
  }, [fetchFeeRuns, itemTaskActive, canLoadFinance])
  usePullRefresh(() => {
    // Field jobs are refreshed with every other open list by the shared pull handler.
    if (canLoadFinance && !itemTaskActive) void fetchFeeRuns()
  })

  useEffect(() => {
    if (canLoadFinance && !itemTaskActive) fetchApSuppliers()
  }, [fetchApSuppliers, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (canLoadFinance && !itemTaskActive) fetchApWorkflowActions()
  }, [fetchApWorkflowActions, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (!canLoadFinance || itemTaskActive || !hasArCollections) {
      setArObligations([])
      return
    }
    void fetchArObligations()
  }, [hasArCollections, fetchArObligations, itemTaskActive, canLoadFinance])

  useEffect(() => {
    if (!canLoadFinance) return
    let cancelled = false

    const resolveQueryTarget = async () => {
      const queryTab = String(router.query.tab || '').toLowerCase()
      // Field tab: FEPT runs come from /workflows/runs — never touch requisition resolution
      if (queryTab === 'field') {
        if (hasFieldExecution) {
          setTab('field')
          const canDispatch = ['owner', 'admin', 'manager', 'dispatcher', 'supervisor'].includes(
            String(getOrgRoleClaim() || '').toLowerCase(),
          )
          if (router.query.new === '1') {
            if (canDispatch) setShowFieldRun(true)
            const { new: _new, ...rest } = router.query
            void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
          }
        }
        return
      }
      if (queryTab === 'requisitions') {
        if (!hasInternalRequisitions) return
        setTab('requisitions')
        if (router.query.source === 'platform') return
      } else {
        return
      }

      const requestId = typeof router.query.requestId === 'string' ? router.query.requestId : null
      const requisitionIdFromQuery = typeof router.query.requisitionId === 'string' ? router.query.requisitionId : null
      const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : null

      if (orgTenantId) {
        const switched = await ensureOrgContextForRequisition(orgTenantId, 'requisition', [requisitionIdFromQuery, requestId])
        if (!switched && !cancelled) {
          notifications.show({
            title: 'Context switch required',
            message: 'Sign in to your wallet and organization profile to action this requisition.',
            color: 'yellow',
          })
        }
      }

      const targetRequisition = requisitionIdFromQuery || requestId
      if (!targetRequisition) return
      if (!cancelled) {
        await openRequisitionDetails(targetRequisition)
      }
    }

    void resolveQueryTarget()

    return () => {
      cancelled = true
    }
  }, [
    router.query.tab,
    router.query.new,
    router.query.requestId,
    router.query.requisitionId,
    router.query.orgTenantId,
    hasInternalRequisitions,
    hasFieldExecution,
    ensureOrgContextForRequisition,
    openRequisitionDetails,
    canLoadFinance,
  ])

  /** Open the History of a purchase request, purchase order or supplier payment in the chain drawer. */
  const openChainRequest = useCallback((requestId: string) => {
    const token = getPreferredToken()
    if (!token || !requestId || getContextMode() !== 'org') return
    const assertCurrent = captureOrganizationSwitchContext(localStorage)
    const startingUrl = window.location.href
    setChainRequest(null)
    void api
      .get(`/api/platform/requests/${encodeURIComponent(requestId)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        assertCurrent()
        if (window.location.href !== startingUrl) return
        if (res.data?.id !== requestId) throw new Error('The request response did not match the item you opened.')
        setChainRequest(res.data)
      })
      .catch((error) => {
        notifications.show({ title: 'Could not open related work', message: error.response?.data?.error || error.response?.data?.message || error.message, color: 'red' })
      })
  }, [])

  const decideChainRequest = useCallback(async (decision: 'approve' | 'reject') => {
    if (!chainRequest?.id) return
    const reason = chainDecisionReason.trim()
    if (decision === 'reject' && !reason) {
      notifications.show({ title: 'Reason needed', message: 'Say why you are declining this request.', color: 'yellow' })
      return
    }
    const token = getPreferredToken()
    if (!token || getContextMode() !== 'org') {
      notifications.show({ title: 'Organization context required', message: 'Open this request in its organization to decide it.', color: 'yellow' })
      return
    }
    const permissionKey = decision === 'approve' ? 'canApprove' : 'canReject'
    if (!chainRequest.decision?.[permissionKey]) {
      notifications.show({
        title: 'Request is not assigned to you',
        message: chainRequest.decision?.actorLabel
          ? `This step is assigned to ${chainRequest.decision.actorLabel}.`
          : 'Your current organization role cannot decide this request.',
        color: 'yellow',
      })
      return
    }

    setChainDecisionLoading(true)
    try {
      const assertCurrent = captureOrganizationSwitchContext(localStorage)
      const headers = { Authorization: `Bearer ${token}` }
      await api.post(
        `/api/platform/requests/${encodeURIComponent(chainRequest.id)}/decision`,
        { decision, reason: decision === 'reject' ? reason : undefined },
        {
          headers: {
            ...headers,
            'x-idempotency-key': `request-decision:${chainRequest.id}:${decision}:${chainRequest.decision?.version || chainRequest.updated_at || chainRequest.status}`,
          },
        },
      )
      const res = await api.get(`/api/platform/requests/${encodeURIComponent(chainRequest.id)}`, { headers })
      assertCurrent()
      if (res.data?.id !== chainRequest.id) throw new Error('The request response did not match the item you decided.')
      setChainRequest(res.data)
      setChainDecisionReason('')
      notifications.show({
        title: decision === 'approve' ? 'Request approved' : 'Request declined',
        message: decision === 'approve'
          ? 'Approval is recorded. The linked job remains on hold until the purchase or required fulfillment is recorded.'
          : 'The request was declined.',
        color: decision === 'approve' ? 'green' : 'orange',
      })
    } catch (error: any) {
      notifications.show({
        title: 'Could not update request',
        message: error.response?.data?.message || error.response?.data?.error || error.message || 'Try again.',
        color: 'red',
      })
    } finally {
      setChainDecisionLoading(false)
    }
  }, [chainDecisionReason, chainRequest])

  useEffect(() => {
    if (!canLoadFinance) return
    const requestId = typeof router.query.requestId === 'string' ? router.query.requestId : ''
    const source = String(router.query.source || '')
    const queryTab = String(router.query.tab || '')
    if (!requestId) setChainRequest(null)
    if (!requestId || (source !== 'platform' && queryTab !== 'ap')) return
    if (queryTab === 'ap' && hasApPayables) setTab('ap')
    if (source === 'platform' && hasInternalRequisitions) setTab('requisitions')
    // A child opened from a job's "Where this fits" replaces the job sheet; the back button returns to the job.
    setSelectedFieldRun(null)
    setFieldJobTab('details')
    openChainRequest(requestId)
  }, [
    router.query.requestId,
    router.query.source,
    router.query.tab,
    hasApPayables,
    hasInternalRequisitions,
    openChainRequest,
    canLoadFinance,
  ])

  useEffect(() => {
    const queryTab = String(router.query.tab || '').toLowerCase()
    if (queryTab === 'requisitions' && hasInternalRequisitions && !selectedRequisitionId) {
      setTab('requisitions')
    }
    if (queryTab === 'field' && hasFieldExecution && !selectedRequisitionId) {
      setTab('field')
    }
    if (queryTab === 'ap' && hasApPayables) {
      setTab('ap')
    }
  }, [router.query.tab, hasInternalRequisitions, hasFieldExecution, hasApPayables, selectedRequisitionId])

  useEffect(() => {
    const queryTab = String(router.query.tab || '').toLowerCase()
    if (!canLoadFinance || queryTab !== 'ap' || !hasApPayables) return

    const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : null
    if (orgTenantId) {
      const transactionId = typeof router.query.transactionId === 'string' ? router.query.transactionId : null
      void ensureOrgContextForRequisition(orgTenantId, 'payable', [transactionId])
    }
  }, [router.query.tab, router.query.orgTenantId, router.query.transactionId, hasApPayables, ensureOrgContextForRequisition, canLoadFinance])

  // The inbox's "Opening the job…" screen hands over to this screen's own one as soon as it draws.
  const unblockScreen = useUiStore((state) => state.unblock)
  useEffect(() => {
    unblockScreen('open-job')
  }, [unblockScreen])

  // A deep link that never resolves (no field jobs here, the run vanished) must not hold the opening screen.
  useEffect(() => {
    const pending = typeof router.query.runId === 'string' ? normalizeRunId(router.query.runId) : null
    if (String(router.query.tab || '').toLowerCase() !== 'field' || !pending || selectedFieldRun) return
    const timer = window.setTimeout(() => setFieldDeepLinkFailed(pending), 25000)
    return () => window.clearTimeout(timer)
  }, [router.query.tab, router.query.runId, selectedFieldRun])

  useEffect(() => {
    const queryTab = String(router.query.tab || '').toLowerCase()
    if (queryTab !== 'field' || !hasFieldExecution) return

    const runIdFromQuery = normalizeRunId(
      typeof router.query.runId === 'string'
        ? router.query.runId
        : typeof router.query.requestId === 'string'
          ? router.query.requestId
          : null,
    )
    if (!runIdFromQuery) return

    const existing = fieldRuns.find((run) => String(run.id || '') === runIdFromQuery)
    if (existing) {
      setSelectedFieldRun(existing)
      return
    }

    const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : null
    void openFieldRunDetails(runIdFromQuery, orgTenantId)
  }, [
    router.query.tab,
    router.query.runId,
    router.query.requestId,
    router.query.orgTenantId,
    hasFieldExecution,
    fieldRuns,
    openFieldRunDetails,
  ])

  useEffect(() => {
    if (!router.isReady) return

    const queryTab = String(router.query.tab || '').toLowerCase()
    if (queryTab !== 'invoices' && queryTab !== 'ar' && queryTab !== 'links') return

    const invoiceRef = typeof router.query.invoiceRef === 'string' ? router.query.invoiceRef.trim() : ''
    const linkId = typeof router.query.linkId === 'string' ? router.query.linkId.trim() : ''
    const paymentCode =
      typeof router.query.paymentCode === 'string'
        ? router.query.paymentCode.trim()
        : typeof router.query.code === 'string'
          ? router.query.code.trim()
          : ''
    const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : ''

    if (!invoiceRef && !linkId && !paymentCode && !orgTenantId) return

    const fingerprint = [queryTab, invoiceRef, linkId, paymentCode, orgTenantId].join('|')
    if (invoiceResumeRef.current === fingerprint) return

    const openFromQuery = async () => {
      if (orgTenantId) {
        await ensureOrgContextForRequisition(orgTenantId, 'collection', [linkId, invoiceRef, paymentCode])
      }

      setTab('ar')
      if (loading) return

      const normalizedCode = paymentCode.toLowerCase()
      const normalizedInvoiceRef = invoiceRef.toLowerCase()
      const match = links.find((link) => {
        const checkoutUrl = getLinkCheckoutUrl(link)
        const linkCode = firstNonEmptyString(link.shortlinkCode, extractPaymentCode(checkoutUrl))?.toLowerCase() || ''
        const linkInvoiceRef = String(link.invoiceRef || '')
          .trim()
          .toLowerCase()
        if (linkId && link.id === linkId) return true
        if (normalizedInvoiceRef && linkInvoiceRef === normalizedInvoiceRef) return true
        if (normalizedCode && linkCode === normalizedCode) return true
        return false
      })

      if (match) {
        const assertContext = captureOrganizationSwitchContext(localStorage)
        try {
          const link = (await api.get(`/api/payment-links/${encodeURIComponent(match.id)}`)).data?.link
          assertContext()
          if (!link || link.id !== match.id) throw new Error('The client billing record is unavailable.')
          setBillingItem({ link })
        } catch (err: any) {
          if (!assertContext.isCurrent()) return
          notifications.show({ color: 'red', message: err.response?.data?.message || err.message || 'Could not open client billing' })
        }
      }

      invoiceResumeRef.current = fingerprint
    }

    void openFromQuery()
  }, [
    router.isReady,
    router.query.tab,
    router.query.invoiceRef,
    router.query.linkId,
    router.query.paymentCode,
    router.query.code,
    router.query.orgTenantId,
    hasEducation,
    ensureOrgContextForRequisition,
    links,
    loading,
  ])

  useEffect(() => {
    if (!router.isReady) return

    const queryTab = String(router.query.tab || '').toLowerCase()
    if (queryTab !== 'ar') return

    const planId = typeof router.query.planId === 'string' ? router.query.planId.trim() : ''
    const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : ''
    if (!planId) return

    const fingerprint = [queryTab, planId, orgTenantId].join('|')
    if (arPlanResumeRef.current === fingerprint) return

    const openPlanFromQuery = async () => {
      if (orgTenantId) {
        await ensureOrgContextForRequisition(orgTenantId, 'collection', [planId])
      }
      setTab('ar')
      await openPlanDetails(planId)
      arPlanResumeRef.current = fingerprint
    }

    void openPlanFromQuery()
  }, [
    router.isReady,
    router.query.tab,
    router.query.planId,
    router.query.orgTenantId,
    ensureOrgContextForRequisition,
    openPlanDetails,
  ])

  useEffect(() => {
    if (!router.isReady) return

    const queryTab = String(router.query.tab || '').toLowerCase()
    if (queryTab !== 'ar') return

    const transactionId = typeof router.query.transactionId === 'string' ? router.query.transactionId.trim() : ''
    const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : ''
    if (!transactionId) return

    const fingerprint = [queryTab, transactionId, orgTenantId].join('|')
    if (arTransactionResumeRef.current === fingerprint) return

    const openFromTransactionQuery = async () => {
      if (orgTenantId) {
        await ensureOrgContextForRequisition(orgTenantId, 'collection', [transactionId])
      }

      setTab('ar')

      const token = getPreferredToken() || getWalletToken()
      if (!token) return

      let sourcePlanId = ''
      let sourcePaymentLinkId = ''
      let sourceInvoiceRef = ''

      try {
        const workflowRes = await api.get('/api/finance/ap/workflow-actions', {
          params: { onlyPending: true },
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any)

        const rows = safeArray<any>(workflowRes.data)
        const tx = rows.find((row) => String(row?.id || '').trim() === transactionId)
        if (tx) {
          sourcePlanId = String(tx?.source_plan_id || tx?.sourcePlanId || '').trim()
          sourcePaymentLinkId = String(tx?.source_payment_link_id || tx?.sourcePaymentLinkId || '').trim()
          sourceInvoiceRef = String(tx?.invoice_ref || tx?.invoiceRef || '').trim()
        }
      } catch {
        // Best-effort lookup only.
      }

      if (sourcePlanId) {
        await openPlanDetails(sourcePlanId)
        arTransactionResumeRef.current = fingerprint
        return
      }

      if (!loading) {
        const normalizedInvoiceRef = sourceInvoiceRef.toLowerCase()
        const match = links.find((link) => {
          if (sourcePaymentLinkId && link.id === sourcePaymentLinkId) return true
          if (
            normalizedInvoiceRef &&
            String(link.invoiceRef || '')
              .trim()
              .toLowerCase() === normalizedInvoiceRef
          )
            return true
          return false
        })

        if (match) {
          const checkoutUrl = getLinkCheckoutUrl(match)
          if (checkoutUrl) {
            setCreatedLink({ ...match, shortlinkUrl: checkoutUrl })
          }
        }
      } else if (sourcePaymentLinkId || sourceInvoiceRef) {
        // Wait for AR links to load, then retry this transaction-focused deep link.
        return
      }

      arTransactionResumeRef.current = fingerprint
    }

    void openFromTransactionQuery()
  }, [
    router.isReady,
    router.query.tab,
    router.query.transactionId,
    router.query.orgTenantId,
    ensureOrgContextForRequisition,
    openPlanDetails,
    links,
    loading,
  ])

  useEffect(() => {
    if (!router.isReady) return
    const queryTab = String(router.query.tab || '').toLowerCase()
    const focusProof = String(router.query.focusProof || '').toLowerCase() === 'true'
    const planId = typeof router.query.planId === 'string' ? router.query.planId.trim() : ''
    if (queryTab !== 'ar' || !focusProof || !planId || selectedPlanId !== planId || !selectedPlanDetails) return

    const workflowTransactions = safeArray<any>(selectedPlanDetails.workflowTransactions)
    const latestWorkflow = workflowTransactions[0] || null
    if (
      !latestWorkflow?.id ||
      !latestWorkflow?.required_proof_type ||
      latestWorkflow?.proof_response_id ||
      creatingArProofRequest
    ) {
      return
    }

    void launchArCollectionProof(String(latestWorkflow.id), {
      planId,
      orgTenantId: String(selectedPlanDetails.debtor_org_id || getActiveOrgId() || ''),
    })
  }, [
    router.isReady,
    router.query.tab,
    router.query.focusProof,
    router.query.planId,
    selectedPlanId,
    selectedPlanDetails,
    creatingArProofRequest,
    launchArCollectionProof,
  ])

  // Generic payments (one-off links) are part of the Payments module now, so the Payments tab is
  // on whenever any of them is. The tab row and the guard below read the same answer.
  const hasArModule = hasArCollections || hasPaymentCollection || links.length > 0
  const hasMoneyArea = hasArModule || hasApPayables
  const hasOperationsArea = hasEducation || hasInternalRequisitions || hasFieldExecution

  useEffect(() => {
    if (!workflowConfigReady) return
    const enabledTabs = []
    if (hasFieldExecution) enabledTabs.push('field')
    if (hasEducation) enabledTabs.push('invoices')
    if (hasInternalRequisitions) enabledTabs.push('requisitions')
    if (hasArModule) enabledTabs.push('ar')
    if (hasApPayables) enabledTabs.push('ap')

    if (tab && !enabledTabs.includes(tab)) {
      setTab(enabledTabs[0] || null)
    } else if (!tab && enabledTabs.length > 0) {
      setTab(enabledTabs[0])
    }
  }, [
    hasArModule,
    hasArCollections,
    hasPaymentCollection,
    links.length,
    hasEducation,
    hasInternalRequisitions,
    hasFieldExecution,
    hasApPayables,
    tab,
    workflowConfigReady,
  ])

  useEffect(() => {
    if (tab === 'ar' || tab === 'ap') setArea('money')
    if (tab === 'invoices' || tab === 'requisitions' || tab === 'field') setArea('operations')
  }, [tab])

  useEffect(() => {
    if (!selectedFieldRun) return
    const assigned = String(
      selectedFieldRun?.output?.assignment?.assigneeId || selectedFieldRun?.input?.assigneeId || '',
    ).trim()
    if (!assigned || assigned === 'owner' || assigned === 'stage-actor') {
      setFieldReassignAssigneeId('')
      return
    }

    if (orgMembers.some((m) => m.userId === assigned)) {
      setFieldReassignAssigneeId(`member:${assigned}`)
      return
    }

    const matched = contacts.find((c) => c.phone === assigned)
    if (matched?.phone) {
      setFieldReassignAssigneeId(
        jobContactOption({ name: matched.name, phone: matched.phone, contactScope: matched.contactScope }).value,
      )
      return
    }

    setFieldReassignAssigneeId(assigned)
  }, [selectedFieldRun, orgMembers, contacts])

  /* ── Create Payment Link / AR Collection ── */

  const handleCreate = async () => {
    if (!form.description.trim() || !form.amount) return
    setCreating(true)
    setError(null)
    try {
      const amount = parseFloat(form.amount)

      if (hasArCollections) {
        // Route all AR creation through the plans API so one_time, instalment, and recurring
        // all appear in the AR collections list.
        const token = getPreferredToken()
        const body: Record<string, unknown> = {
          collectionType: form.collectionType,
          description: form.description.trim(),
          totalAmount: amount,
          currency: form.currency,
          payerName: form.payerName.trim() || undefined,
          payerPhone: form.payerPhone.trim() || undefined,
          contactId: selectedContact?.id || undefined,
          firstDueDate: form.firstDueDate || undefined,
        }
        if (form.collectionType !== 'one_time') {
          body.instalments = parseInt(form.instalments)
          if (form.collectionType === 'recurring') body.cadence = form.cadence
        }
        await api.post('/api/finance/ar/plans', body, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const typeLabel =
          form.collectionType === 'one_time'
            ? 'Payment link'
            : form.collectionType === 'instalment'
              ? 'Instalment plan'
              : 'Recurring billing'
        const apMirrorNote =
          form.collectionType !== 'one_time' ? ' AP mirror pending until payer is wallet-linked.' : ''
        notifications.show({
          title: `${typeLabel} created`,
          message: `${form.description.trim()} — ${fmt(amount, form.currency)}${apMirrorNote}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        })
        setShowCreate(false)
        setForm({
          description: '',
          amount: '',
          currency: 'USD',
          invoiceRef: '',
          merchantName: '',
          expiryHours: '336',
          collectionType: 'one_time',
          payerName: '',
          payerPhone: '',
          instalments: '3',
          cadence: 'monthly',
          firstDueDate: dayjs().format('YYYY-MM-DD'),
        })
        setSelectedContact(null)
        void fetchLinks()
        return
      }

      // Legacy path (no AR module): post direct payment link
      let link: PaymentLink
      if (selectedContact?.id) {
        const contactPaymentKey = makeIdempotencyKey('mobile-contact-payment-link', [
          selectedContact.id,
          form.description,
          amount,
          form.currency,
          form.invoiceRef,
        ])
        const { data } = await api.post(
          `/api/contacts/${selectedContact.id}/payment-link`,
          {
            description: form.description.trim(),
            amount,
            currency: form.currency,
            invoiceRef: form.invoiceRef || undefined,
            expiryHours: parseInt(form.expiryHours),
          },
          { headers: { 'x-idempotency-key': contactPaymentKey } },
        )
        link = {
          id: data.paymentLinkId,
          merchantId: '',
          description: form.description.trim(),
          amount,
          currency: form.currency,
          invoiceRef: form.invoiceRef || undefined,
          status: 'active',
          expiry: data.expiresAt,
          shortlinkCode: data.shortlinkCode,
          shortlinkUrl: data.shortUrl,
          createdAt: new Date().toISOString(),
        }
      } else {
        const paymentKey = makeIdempotencyKey('mobile-payment-link', [
          form.description,
          amount,
          form.currency,
          form.invoiceRef,
          form.merchantName,
        ])
        const { data } = await api.post(
          '/api/payment-links',
          {
            description: form.description.trim(),
            amount,
            currency: form.currency,
            invoiceRef: form.invoiceRef || undefined,
            merchantName: form.merchantName || undefined,
            expiryHours: parseInt(form.expiryHours),
          },
          { headers: { 'x-idempotency-key': paymentKey } },
        )
        link = data.link
      }
      setLinks((prev) => [link, ...prev])
      setCreatedLink(link)
      setShowCreate(false)
      setForm({
        description: '',
        amount: '',
        currency: 'USD',
        invoiceRef: '',
        merchantName: '',
        expiryHours: '336',
        collectionType: 'one_time',
        payerName: '',
        payerPhone: '',
        instalments: '3',
        cadence: 'monthly',
        firstDueDate: dayjs().format('YYYY-MM-DD'),
      })
      setSelectedContact(null)
      notifications.show({
        title: selectedContact?.id ? 'Link Sent' : 'Link Created',
        message: selectedContact?.id
          ? `Sent to ${selectedContact.name}. They can pay from inbox or public link.`
          : `${link.description} — ${fmt(link.amount, link.currency)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      })
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create payment link')
    } finally {
      setCreating(false)
    }
  }

  const handleCreatePlan = async () => {
    if (!planForm.description.trim() || !planForm.totalAmount || !planForm.payerName.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Description, Total Amount, and Customer Name are required.',
        color: 'red',
      })
      return
    }

    setCreatingPlan(true)
    setError(null)
    try {
      const body = {
        collectionType: 'instalment' as const,
        description: planForm.description.trim(),
        totalAmount: parseFloat(planForm.totalAmount),
        currency: planForm.currency,
        payerName: planForm.payerName.trim(),
        payerPhone: planForm.payerPhone || undefined,
        payerEmail: planForm.payerEmail || undefined,
        contactId: selectedPlanContact?.id || undefined,
        instalments: parseInt(planForm.instalments),
        cadence: planForm.cadence as 'weekly' | 'monthly',
        firstDueDate: planForm.firstDueDate || undefined,
      }

      const token = getPreferredToken()
      const res = await api.post('/api/finance/ar/plans', body, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (res.status === 200 || res.status === 201) {
        const apMirror = res.data?.apMirror as { mirrored?: boolean; mirroredInvoices?: number } | undefined
        const apMirrorMsg = apMirror?.mirrored
          ? ` AP mirror: ${apMirror.mirroredInvoices ?? 0} workflow item(s) visible to payer org.`
          : ' AP mirror pending until the payer contact is wallet-linked.'
        notifications.show({
          title: 'Plan Created',
          message: `Payment Plan for ${body.payerName} created successfully.${apMirrorMsg}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        })
        setShowCreatePlan(false)
        setSelectedPlanContact(null)
        setPlanForm({
          description: '',
          totalAmount: '',
          currency: 'USD',
          payerName: '',
          payerPhone: '',
          payerEmail: '',
          instalments: '3',
          cadence: 'monthly',
          firstDueDate: dayjs().format('YYYY-MM-DD'),
        })
        void fetchLinks()
        void fetchApSuppliers()
        void fetchApWorkflowActions()
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create payment plan')
    } finally {
      setCreatingPlan(false)
    }
  }

  /* ── Cancel Link ── */

  const handleCancel = async (id: string) => {
    try {
      await api.delete(`/api/payment-links/${id}`)
      setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'cancelled' as const } : l)))
      notifications.show({ title: 'Cancelled', message: 'Payment link cancelled', color: 'gray' })
    } catch (err: any) {
      notifications.show({ title: 'Error', message: err.response?.data?.message ?? err.message, color: 'red' })
    }
  }

  /* ── Create Invoice ── */

  const handleCreateInvoice = async () => {
    if (!invoiceForm.amount) return

    const invoiceAmount = Number.parseFloat(invoiceForm.amount)
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      notifications.show({
        title: 'Invalid Amount',
        message: 'Provide a valid invoice amount before submitting.',
        color: 'red',
      })
      return
    }

    const canIssueInvoice = await enforceOrgActionPolicy({
      actionType: 'finance.issue_invoice',
      amount: invoiceAmount,
      // Existing invoice flow has no explicit evidence capture step yet.
      evidenceProvided: false,
    })
    if (!canIssueInvoice) return

    if (!invoiceForm.studentName.trim() || !invoiceForm.studentId.trim() || !invoiceForm.parentPhone.trim()) {
      notifications.show({
        title: 'Missing details',
        message: 'Add the student name, student ID and the parent phone. The pay link goes to that phone.',
        color: 'orange',
      })
      return
    }

    setCreatingInvoice(true)
    try {
      const token = getPreferredToken()
      if (!token) throw new Error('Switch to the organization first.')
      const studentId = invoiceForm.studentId.trim()
      const instalment = invoiceForm.paymentTerms !== 'one_time'
      const body: Record<string, unknown> = {
        studentName: invoiceForm.studentName.trim(),
        studentId,
        grade: invoiceForm.className,
        term: invoiceForm.term,
        feeType: invoiceForm.feeType,
        amount: invoiceAmount,
        currency: invoiceForm.currency,
        payerName: invoiceForm.parentName.trim() || undefined,
        payerPhone: invoiceForm.parentPhone.trim(),
        reference: `FEE-${studentId.replace(/\s+/g, '').toUpperCase()}-${Date.now().toString().slice(-5)}`,
        paymentTerms: invoiceForm.paymentTerms,
        triggerRef: `mobile-fee-${Date.now()}`,
        ...(instalment
          ? {
              instalments: Number(invoiceForm.instalments) || 2,
              paymentCadence: invoiceForm.paymentCadence,
              firstDueDate: invoiceForm.firstDueDate,
            }
          : {}),
      }
      const { data } = await api.post('/workflows/education_fee_payment/execute', body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (data?.error) throw new Error(String(data.error))
      const runId = String(data?.runId || '')
      if (runId) {
        setFeeRuns((prev) => [
          {
            id: runId,
            status: String(data?.status || 'paused'),
            input: body,
            output: data?.output,
            createdAt: new Date().toISOString(),
          },
          ...prev.filter((run) => run.id !== runId),
        ])
        setSelectedFeeRunId(runId)
      }
      setTab('invoices')

      notifications.show({
        title: data?.output?.clientBill?.status === 'sent' ? 'Pay link sent to parent' : 'Fee saved',
        message: `${invoiceForm.studentName} — ${fmt(invoiceAmount, invoiceForm.currency)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      setShowInvoice(false)
      setInvoiceForm((prev) => ({
        ...prev,
        studentName: '',
        studentId: '',
        amount: '',
        parentName: '',
        parentPhone: '',
        paymentTerms: 'one_time',
      }))
      setSelectedInvoiceContact(null)
      await fetchFeeRuns()
    } catch (err: any) {
      notifications.show({
        title: 'Fee not saved',
        message: err.response?.data?.error ?? err.response?.data?.message ?? err.message,
        color: 'red',
      })
    } finally {
      setCreatingInvoice(false)
    }
  }

  const handleCreateRequisition = async () => {
    if (!requisitionForm.amount) return

    setCreatingRequisition(true)
    try {
      const amount = parseFloat(requisitionForm.amount)

      const itemName = requisitionForm.notes?.trim() || requisitionForm.vendor?.trim() || 'Requisition item'
      const body = {
        requestType: 'procurement.requisition',
        title: itemName,
        description: requisitionForm.notes || undefined,
        amount,
        currency: requisitionForm.currency,
        targetModule: 'finance',
        context: {
          department: requisitionForm.department,
          supplierRef: requisitionForm.payWith === 'cash' ? undefined : requisitionForm.vendor || undefined,
          paymentMethod: requisitionForm.payWith === 'cash' ? 'cash' : 'supplier',
          itemType: requisitionForm.purchaseKind,
          receivingRequired: requisitionForm.receivingRequired === 'yes',
        },
        items: [
          {
            description: itemName,
            unitPrice: amount,
            quantity: 1,
            itemType: requisitionForm.purchaseKind,
          },
        ],
      }

      const created = await api.post('/api/platform/requests/', body)
      await api.post(`/api/platform/requests/${encodeURIComponent(created.data.id)}/submit`, {})

      notifications.show({
        title: 'Request sent',
        message:
          requisitionForm.payWith === 'cash'
            ? 'Your cash request is with the approvers. It is paid out when released.'
            : 'Your request is with the approvers. A purchase order is created when it is approved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      })

      setShowRequisition(false)
      setRequisitionForm({
        department: 'Operations',
        payWith: 'supplier',
        vendor: '',
        purchaseKind: 'goods',
        receivingRequired: 'yes',
        amount: '',
        currency: 'USD',
        notes: '',
      })
      fetchRequisitions()
    } catch (err: any) {
      notifications.show({
        title: 'Could not send this request',
        message: err.response?.data?.message ?? err.message,
        color: 'red',
      })
    } finally {
      setCreatingRequisition(false)
    }
  }

  const handleCreateFieldRun = async () => {
    if (!fieldRunForm.amount) return

    setCreatingFieldRun(true)
    try {
      const amount = parseFloat(fieldRunForm.amount)
      const template = findTemplateForCapability(activeTemplates, 'field_execution')
      const workflowId = template?.id || 'field_execution_fept'

      const assignee = await ensureOnTeam(fieldRunForm.assigneeId, 'field_worker')
      const receiver = await ensureOnTeam(fieldRunForm.receiverId, 'member')
      const payoutAmount = parseFloat(fieldRunForm.payoutAmount)
      const reference = `FR-${Date.now()}`
      const body = {
        amount,
        // Only a job that pays a worker or subcontractor has a payout step.
        ...(Number.isFinite(payoutAmount) && payoutAmount > 0 ? { payoutAmount } : {}),
        currency: fieldRunForm.currency,
        paymentTerms: fieldRunForm.paymentTerms,
        ...(fieldRunForm.paymentTerms !== 'one_time'
          ? {
              instalments: Math.max(2, parseInt(fieldRunForm.instalments, 10) || 2),
              paymentCadence: fieldRunForm.paymentCadence,
              firstDueDate: fieldRunForm.firstDueDate,
              ...(Number(fieldRunForm.firstPaymentAmount) > 0
                ? { firstPaymentAmount: Number(fieldRunForm.firstPaymentAmount) }
                : {}),
            }
          : {}),
        description: fieldRunForm.description,
        poNumber: fieldRunForm.poNumber.trim(),
        ...(fieldRunForm.problemType ? { problemType: fieldRunForm.problemType } : {}),
        ...(fieldRunForm.vehicleReference.trim() ? { vehicleReference: fieldRunForm.vehicleReference.trim() } : {}),
        requireConcealedWorkPhoto: fieldRunForm.requireConcealedWorkPhoto,
        clientName: fieldRunForm.clientName.trim(),
        ...(fieldRunForm.clientPhone.trim() ? { customerMsisdn: fieldRunForm.clientPhone.trim() } : {}),
        location: fieldRunForm.location,
        scheduledDate: fieldRunForm.scheduledDate,
        reference,
        requestId: reference, // Required by template
        ...assignee,
        ...(receiver.assigneeUserId ? { receiverId: receiver.assigneeUserId } : {}),
        triggerRef: `manual-finance-${Date.now()}`,
      }

      const res = await api.post(`/workflows/${workflowId}/execute`, body)

      notifications.show({
        title: 'Job created',
        message: 'The job has been created and sent to the assigned worker.',
        color: 'teal',
        icon: <IconCheck size={16} />,
      })

      setShowFieldRun(false)
      setFieldRunForm({
        poNumber: '',
        problemType: '',
        description: '',
        clientName: '',
        clientPhone: '',
        amount: '',
        payoutAmount: '',
        currency: 'USD',
        paymentTerms: 'one_time',
        instalments: '2',
        paymentCadence: 'monthly',
        firstDueDate: dayjs().format('YYYY-MM-DD'),
        firstPaymentAmount: '',
        location: '',
        vehicleReference: '',
        requireConcealedWorkPhoto: false,
        scheduledDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        assigneeId: 'stage-actor',
        receiverId: 'stage-actor',
      })

      // Refresh FEPT runs after a short delay to allow background event processing
      setTimeout(fetchFieldRuns, 1000)
    } catch (err: any) {
      notifications.show({
        title: 'Could not create the job',
        message: err.response?.data?.message ?? err.message,
        color: 'red',
      })
    } finally {
      setCreatingFieldRun(false)
    }
  }

  // Sign-off and payment release: the chosen person confirms from their wallet; the server then moves the job.
  const openFieldProof = async (runId: string, stage: FieldProofStage) => {
    const normalizedRunId = normalizeRunId(runId)
    if (!normalizedRunId) return
    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Switch to your organization',
        message: 'This step is done as the organization.',
        color: 'red',
      })
      return
    }
    const allowed = await enforceOrgActionPolicy({
      actionType: stage === 'acknowledgement' ? 'workflow.acknowledge_completion' : 'finance.reconcile_offline',
      evidenceProvided: true,
    })
    if (!allowed) return

    setFieldProofStage(stage)
    setFieldProofRunId(normalizedRunId)
    setFieldProofRequest(null)
    setFieldProofCreating(true)
    try {
      const { data } = await api.post(
        `/workflows/runs/${encodeURIComponent(normalizedRunId)}/proof/request`,
        { stage },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (data?.error) throw new Error(String(data.error))
      setFieldProofRequest({
        requestId: String(data.requestId),
        presentationRequestUrl: String(data.presentationRequestUrl),
        purposeLine: String(data.purposeLine || ''),
      })
    } catch (err: any) {
      notifications.show({
        title: 'Not ready',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
        color: 'red',
      })
      setFieldProofStage(null)
      setFieldProofRunId(null)
    } finally {
      setFieldProofCreating(false)
    }
  }

  const openFieldProofInApp = () => {
    if (!fieldProofStage || !fieldProofRunId || !fieldProofRequest?.presentationRequestUrl) {
      notifications.show({
        title: 'Not ready',
        message: 'Close this and open the step again.',
        color: 'red',
      })
      return
    }
    const params = new URLSearchParams({
      request_uri: fieldProofRequest.presentationRequestUrl,
      requestId: fieldProofRequest.requestId,
      mode: fieldProofStage === 'payout' ? 'field-payout' : 'field-signoff',
      workflowRunId: fieldProofRunId,
      stage: fieldProofStage,
      ...(fieldProofRequest.purposeLine ? { purpose: fieldProofRequest.purposeLine } : {}),
    })
    const orgId = getActiveOrgId()
    if (orgId) params.set('orgTenantId', String(orgId))
    void router.push(`/present?${params.toString()}`)
  }

  // A job that stopped on an error can be run again from the step that failed (admins only).
  const handleRetryFieldRun = async (runId: string) => {
    const normalizedRunId = normalizeRunId(runId)
    if (!normalizedRunId) return
    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile first.',
        color: 'red',
      })
      return
    }
    setFeptActionLoading(true)
    try {
      const res = await api.post(
        `/workflows/runs/${encodeURIComponent(normalizedRunId)}/retry`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.data?.error) throw new Error(String(res.data.error))
      notifications.show({ title: 'Job resumed', message: 'The job carried on from where it stopped.', color: 'teal' })
      await fetchFieldRuns()
      try {
        const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setSelectedFieldRun(refreshed.data)
      } catch {
        // Keep existing drawer state if refresh fails.
      }
    } catch (err: any) {
      notifications.show({
        title: 'Could not resume this job',
        message: String(err?.response?.data?.error || err?.message || 'Please try again.'),
        color: 'red',
      })
    } finally {
      setFeptActionLoading(false)
    }
  }

  const handleStartFieldRun = async (runId: string) => {
    const normalizedRunId = normalizeRunId(runId)
    if (!normalizedRunId) return

    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile first.',
        color: 'red',
      })
      return
    }

    setFeptActionLoading(true)
    try {
      const startRes = await api.post(
        `/workflows/runs/${encodeURIComponent(normalizedRunId)}/resume`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-idempotency-key': `finance-start-job:${normalizedRunId}`,
          },
        },
      )
      assertFieldStepSucceeded(startRes.data)

      notifications.show({ title: 'Job Started', message: 'Field run moved to in-progress.', color: 'green' })
      await fetchFieldRuns()

      try {
        const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setSelectedFieldRun(refreshed.data)
      } catch {
        // Non-fatal if refreshed run fetch is unavailable.
      }
    } catch (err: any) {
      notifications.show({
        title: 'Start Job Failed',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
        color: 'red',
      })
    } finally {
      setFeptActionLoading(false)
    }
  }

  // Receipts step without a photo: no materials were bought, or the receipts that came back
  // from "Buy materials" are the receipt record.
  const handleNoMaterialsBought = async (run: any, source: 'none' | 'purchase' = 'none') => {
    const normalizedRunId = normalizeRunId(String(run?.id || ''))
    if (!normalizedRunId) return
    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile first.',
        color: 'red',
      })
      return
    }
    setFeptActionLoading(true)
    try {
      const res = await api.post(
        `/workflows/runs/${encodeURIComponent(normalizedRunId)}/resume`,
        source === 'purchase' ? { phase: 'receipt', usePurchaseReceipts: true } : { phase: 'receipt', noReceipt: true },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-idempotency-key': `finance-${source === 'purchase' ? 'purchase-receipt' : 'no-receipt'}:${normalizedRunId}`,
          },
        },
      )
      if (String(res?.data?.status || '').toLowerCase() === 'failed') {
        throw new Error(String(res?.data?.error || 'Could not save the receipts step'))
      }
      notifications.show({
        title: 'Noted',
        message:
          source === 'purchase'
            ? 'Purchase receipts added. Take the after photos when the work is done.'
            : 'No materials bought. Take the after photos when the work is done.',
        color: 'green',
      })
      await fetchFieldRuns()
      try {
        const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setSelectedFieldRun(refreshed.data)
      } catch {
        // Non-fatal if refreshed run fetch is unavailable.
      }
    } catch (err: any) {
      notifications.show({
        title: 'Could not carry on',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
        color: 'red',
      })
    } finally {
      setFeptActionLoading(false)
    }
  }

  const handleCaptureFieldEvidence = (run: any) => {
    const runId = String(run?.id || '')
    const normalizedRunId = normalizeRunId(runId)
    if (!normalizedRunId) return

    const runPolicyCheck = evaluateOrgActionPolicy(orgContextBundle, {
      actionType: 'workflow.capture_evidence',
      evidenceProvided: true,
      actionTimestamp: new Date().toISOString(),
    })
    if (!runPolicyCheck.allowed) {
      const escalationHint = runPolicyCheck.suggestedEscalationRole
        ? ` Escalate to ${runPolicyCheck.suggestedEscalationRole}.`
        : ''
      notifications.show({
        title: 'Policy Check Failed',
        message: `${runPolicyCheck.reason || 'Capture evidence is blocked by org policy.'}${escalationHint}`,
        color: 'red',
      })
      return
    }

    const pausePhase = getFieldPauseReason(run).replace('await_evidence_', '')
    const phase = ['before', 'concealed', 'after', 'receipt'].includes(pausePhase) ? pausePhase : inferNextEvidencePhase(run)
    void router.push(
      `/activity?ref=${encodeURIComponent(normalizedRunId)}&capture=1&phase=${encodeURIComponent(phase)}`,
    )
  }

  const openFieldCheckpoint = (run: any) => {
    setCpOutcome(getFieldPauseReason(run) === 'await_completion_review' ? 'approved' : 'passed')
    setCpFindings('')
    setCpHazards('')
    setCpControls('')
    setCpPpe(false)
    setCpDecision('')
    setCpHoldReason('')
    setCpHoldPhoto(null)
    setCpWhatChanged('')
    setCpFixBy('organisation')
    setCpSiteCode('')
    setCheckpointRun(run)
  }

  const handleTakeHoldPhoto = async () => {
    setCpPhotoBusy(true)
    try {
      const shot = await captureHashedPhoto()
      setCpHoldPhoto({ photoUri: shot.photoUri, evidenceHash: shot.evidenceHash })
    } catch (err: any) {
      notifications.show({
        title: 'No photo taken',
        message: err?.message || 'The camera did not return a photo.',
        color: 'orange',
      })
    } finally {
      setCpPhotoBusy(false)
    }
  }

  /** The organisation sorted the issue out; the worker is told to redo the safety check. */
  const handleResolveSafetyHold = async (runId: string, holdId: string) => {
    const normalizedRunId = normalizeRunId(String(runId || ''))
    const note = holdResolveNote.trim()
    if (!normalizedRunId || !holdId) return
    if (!note) {
      notifications.show({
        title: 'Say what was done',
        message: 'Write a short note on how the issue was sorted before you mark it resolved.',
        color: 'orange',
      })
      return
    }
    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile first.',
        color: 'red',
      })
      return
    }
    setFeptActionLoading(true)
    try {
      await api.post(
        `/workflows/runs/${encodeURIComponent(normalizedRunId)}/holds/${encodeURIComponent(holdId)}/resolve`,
        { note },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-idempotency-key': `safety-hold-resolve:${normalizedRunId}:${holdId}`,
          },
        },
      )
      notifications.show({
        title: 'Issue marked resolved',
        message: 'The worker has been told to redo the safety check.',
        color: 'green',
      })
      setHoldResolveNote('')
      await fetchFieldRuns()
      const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedFieldRun(refreshed.data)
    } catch (err: any) {
      notifications.show({
        title: 'Could not mark it resolved',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
        color: 'red',
      })
    } finally {
      setFeptActionLoading(false)
    }
  }

  const handleSubmitFieldCheckpoint = async () => {
    const run = checkpointRun
    if (!run) return
    const normalizedRunId = normalizeRunId(String(run.id || ''))
    const reason = getFieldPauseReason(run)
    if (!normalizedRunId || !FIELD_CHECKPOINT_PAUSES.has(reason)) return

    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile first.',
        color: 'red',
      })
      return
    }

    setFeptActionLoading(true)
    try {
      let payload: Record<string, unknown> = {}
      if (reason === 'await_site_inspection') {
        payload = {
          siteInspection: { outcome: cpOutcome, accessConfirmed: cpOutcome !== 'failed', findings: cpFindings.trim() },
        }
      } else if (reason === 'await_risk_assessment') {
        const hazards = cpHazards
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
        if (!cpDecision) {
          notifications.show({
            title: 'Choose one',
            message: 'Say whether it is safe to start or not safe (hold the job).',
            color: 'orange',
          })
          return
        }
        if (cpDecision === 'not_safe' && (!cpHoldReason.trim() || !cpHoldPhoto)) {
          notifications.show({
            title: 'Reason and photo needed',
            message: 'Say why it is not safe and take a photo of it before you put the job on hold.',
            color: 'orange',
          })
          return
        }
        payload = {
          riskAssessment: {
            decision: cpDecision,
            hazards,
            controls: cpControls.trim(),
            ppeConfirmed: cpPpe,
            safeToProceed: cpDecision === 'safe',
            holdReason: cpDecision === 'not_safe' ? cpHoldReason.trim() : undefined,
            holdPhoto: cpDecision === 'not_safe' ? cpHoldPhoto : undefined,
            fixBy: cpDecision === 'not_safe' ? cpFixBy : undefined,
            whatChanged: cpDecision === 'safe' && cpWhatChanged.trim() ? cpWhatChanged.trim() : undefined,
          },
        }
      } else if (reason === 'await_completion_review') {
        payload = { completionReview: { outcome: cpOutcome, notes: cpFindings.trim() } }
      } else {
        const siteCode = cpSiteCode.trim()
        let gps: { lat: number; lng: number; accuracy?: number } | undefined
        if (!siteCode && typeof navigator !== 'undefined' && navigator.geolocation) {
          gps = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
              () => resolve(undefined),
              { enableHighAccuracy: true, timeout: 10000 },
            )
          })
        }
        if (!siteCode && !gps) {
          notifications.show({
            title: 'Location Needed',
            message: 'Allow location access or enter the site code to prove arrival.',
            color: 'orange',
          })
          return
        }
        payload = { arrival: siteCode ? { qrToken: siteCode } : { gps } }
      }

      const { data } = await api.post(`/workflows/runs/${encodeURIComponent(normalizedRunId)}/resume`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assertFieldStepSucceeded(data)
      notifications.show({ title: 'Step saved', message: 'This step is now on the job.', color: 'green' })
      setCheckpointRun(null)
    } catch (err: any) {
      const message = String(err.response?.data?.error || err.response?.data?.message || err.message || '')
      // A stop-work call is saved as a hold, so the server answers with the hold message. Not an error.
      const heldOnPurpose = reason === 'await_risk_assessment' && cpDecision === 'not_safe' && /on hold/i.test(message)
      if (heldOnPurpose) {
        notifications.show({
          title: SAFETY_HOLD_COPY.savedTitle,
          message: cpFixBy === 'worker' ? SAFETY_HOLD_COPY.savedMessageWorker : SAFETY_HOLD_COPY.savedMessage,
          color: 'orange',
        })
        setCheckpointRun(null)
      } else {
        notifications.show({ title: 'Could not save this step', message: friendlyRequestError(err), color: 'red' })
      }
    } finally {
      setFeptActionLoading(false)
    }

    await fetchFieldRuns()
    try {
      const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedFieldRun(refreshed.data)
    } catch {
      // The list refresh above keeps the drawer usable.
    }
  }

  const handleReassignFieldTask = async (runId: string, assigneeId?: string | null) => {
    if (!runId) return
    const resolved = resolveAssigneeSelection(assigneeId || fieldReassignAssigneeId, ownerUserId)
    if (!resolved.assigneeUserId && !resolved.assigneeId) {
      notifications.show({
        title: 'Assignee Required',
        message: 'Choose an available member. The owner is not the default.',
        color: 'red',
      })
      return
    }

    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile first.',
        color: 'red',
      })
      return
    }

    setFeptActionLoading(true)
    try {
      const onTeam = await ensureOnTeam(assigneeId || fieldReassignAssigneeId, 'field_worker')
      const nextUserId = onTeam.assigneeUserId || onTeam.assigneeId
      if (!nextUserId) {
        throw new Error('Choose a team member or a saved contact with a phone number.')
      }
      await api.post(
        `/workflows/runs/${encodeURIComponent(runId)}/reassign`,
        { assigneeUserId: nextUserId },
        { headers: { Authorization: `Bearer ${token}` } },
      )

      notifications.show({
        title: 'Job moved',
        message: 'The job now belongs to the selected team member.',
        color: 'teal',
      })
      await fetchFieldRuns()

      try {
        const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(runId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setSelectedFieldRun(refreshed.data)
      } catch {
        // Keep existing drawer state if refresh fails.
      }
    } catch (err: any) {
      notifications.show({
        title: 'Reassign Failed',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
        color: 'red',
      })
    } finally {
      setFeptActionLoading(false)
    }
  }

  const parseRequestUri = (requestUrl: string): string | null => {
    try {
      const parsed = new URL(requestUrl)
      return parsed.searchParams.get('request_uri')
    } catch {
      return null
    }
  }

  /** QR codes hold ~2.9 KB; local-dev requests are sent by value and can be far larger. */
  const MAX_QR_LINK_LENGTH = 2500
  const buildWalletInteropQrValue = (requestUrl: string): string => {
    try {
      const parsed = new URL(requestUrl)
      const requestUri = parsed.searchParams.get('request_uri')
      if (requestUri) {
        return `openid-vc://?request_uri=${encodeURIComponent(requestUri)}`
      }
    } catch {
      // fall back to raw URL when deep-link transform fails
    }
    return requestUrl
  }

  const createExternalWalletLinks = (requestUrl: string) => {
    const requestUri = parseRequestUri(requestUrl)
    if (!requestUri) {
      return {
        openIdVc: requestUrl,
        openId4Vp: requestUrl,
      }
    }

    return {
      openIdVc: `openid-vc://?request_uri=${encodeURIComponent(requestUri)}`,
      openId4Vp: `openid4vp://authorize?request_uri=${encodeURIComponent(requestUri)}`,
    }
  }

  const handleOpenApprovalModal = async () => {
    if (!selectedRequisitionId) return

    const allowed = await enforceOrgActionPolicy({
      actionType: 'workflow.approve_requisition',
      amount: requestedAmount.amount,
      // Approval modal collects VP-based evidence before final submission.
      evidenceProvided: true,
    })
    if (!allowed) return

    setShowApprovalModal(true)
    setCreatingApprovalRequest(true)
    setApprovalRequestId(null)
    setApprovalRequestUrl(null)

    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile to approve.',
        color: 'red',
      })
      setShowApprovalModal(false)
      setCreatingApprovalRequest(false)
      return
    }

    try {
      const { data } = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/approval/request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setApprovalRequestId(data.requestId)
      setApprovalRequestUrl(data.presentationRequestUrl)
    } catch (err: any) {
      notifications.show({
        title: 'Approval Setup Failed',
        message: err.response?.data?.error || err.message || 'Could not generate approval request.',
        color: 'red',
      })
      setShowApprovalModal(false)
    } finally {
      setCreatingApprovalRequest(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedRequisitionId || !approvalRequestId || !approvalRequestUrl) {
      notifications.show({
        title: 'Approval Request Missing',
        message: 'Re-open the approval modal to generate a valid request.',
        color: 'red',
      })
      return
    }

    const allowed = await enforceOrgActionPolicy({
      actionType: 'workflow.approve_requisition',
      amount: requestedAmount.amount,
      evidenceProvided: Boolean(approvalRequestId && approvalRequestUrl),
    })
    if (!allowed) return

    const reauthOk = await requireSensitiveOrgReauth('approve this requisition')
    if (!reauthOk) {
      notifications.show({
        title: 'Re-authentication Cancelled',
        message: 'Approval was cancelled before submission.',
        color: 'yellow',
      })
      return
    }

    setApproving(true)
    try {
      const token = getPreferredToken()
      if (!token) throw new Error('No active organization session.')
      const personalWalletId = getPersonalWalletTenantId()
      if (!personalWalletId) throw new Error('Personal wallet session is required for embedded approval.')

      const res = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/approve/embedded-wallet`,
        {
          requestId: approvalRequestId,
          presentationRequestUrl: approvalRequestUrl,
          walletId: personalWalletId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      // The embedded-wallet endpoint may return { error } with HTTP 200 when the internal
      // approveRequisition call fails (e.g., wrong org role for the current stage).
      if (res.data?.error) throw new Error(res.data.error)

      notifications.show({
        title: 'Approved',
        message: 'This requisition is approved.',
        color: 'green',
      })
      setShowApprovalModal(false)
      setApprovalRequestId(null)
      setApprovalRequestUrl(null)
      setSelectedRequisitionId(null)
      setSelectedRequisition(null)
      await fetchRequisitions()
    } catch (err: any) {
      notifyWalletStepFailed('Approval did not go through', err)
    } finally {
      setApproving(false)
    }
  }

  const handleCopyRequestUrl = async (requestUrl: string) => {
    try {
      await navigator.clipboard.writeText(requestUrl)
      notifications.show({
        title: 'Copied',
        message: 'Approval request URL copied to clipboard.',
        color: 'green',
      })
    } catch {
      notifications.show({
        title: 'Copy Failed',
        message: 'Unable to copy approval request URL.',
        color: 'red',
      })
    }
  }

  const handleOpenExternalWallet = (url: string) => {
    if (typeof window === 'undefined') return
    window.location.href = url
  }

  const handleOpenApprovalInApp = () => {
    if (!selectedRequisitionId || !approvalRequestUrl) {
      notifications.show({
        title: 'Approval Request Missing',
        message: 'Generate the approval request before opening it in the mobile wallet.',
        color: 'red',
      })
      return
    }

    const params = new URLSearchParams({
      request_uri: approvalRequestUrl,
      mode: 'requisition-approve',
      requisitionId: selectedRequisitionId,
    })
    const activeOrgId = getActiveOrgId()
    if (activeOrgId) {
      params.set('orgTenantId', activeOrgId)
    }

    void router.push(`/present?${params.toString()}`)
  }

  const handleOpenReleaseInApp = () => {
    if (!selectedRequisitionId || !releaseRequestUrl) {
      notifications.show({
        title: 'Release Request Missing',
        message: 'Generate the release request before opening it in the mobile wallet.',
        color: 'red',
      })
      return
    }

    const params = new URLSearchParams({
      request_uri: releaseRequestUrl,
      mode: 'requisition-release',
      requisitionId: selectedRequisitionId,
      amount: String(requestedAmount.amount),
      currency: requestedAmount.currency,
    })
    const activeOrgId = getActiveOrgId()
    if (activeOrgId) {
      params.set('orgTenantId', activeOrgId)
    }

    void router.push(`/present?${params.toString()}`)
  }

  const handleOpenAckInApp = () => {
    if (!selectedRequisitionId || !ackRequestUrl) {
      notifications.show({
        title: 'Ack Request Missing',
        message: 'Generate the acknowledge request before opening it in the mobile wallet.',
        color: 'red',
      })
      return
    }

    const params = new URLSearchParams({
      request_uri: ackRequestUrl,
      mode: 'requisition-ack',
      requisitionId: selectedRequisitionId,
    })
    const activeOrgId = getActiveOrgId()
    if (activeOrgId) {
      params.set('orgTenantId', activeOrgId)
    }

    void router.push(`/present?${params.toString()}`)
  }

  const handleScanPortalApproval = () => {
    if (!selectedRequisitionId) {
      notifications.show({
        title: 'Requisition Missing',
        message: 'Open a requisition before scanning a portal approval QR.',
        color: 'red',
      })
      return
    }

    const params = new URLSearchParams({
      mode: 'approve-requisition',
      requisitionId: selectedRequisitionId,
    })
    const activeOrgId = getActiveOrgId()
    if (activeOrgId) {
      params.set('orgTenantId', activeOrgId)
    }

    void router.push(`/scan?${params.toString()}`)
  }

  const handleScanPortalRelease = () => {
    if (!selectedRequisitionId) {
      notifications.show({
        title: 'Requisition Missing',
        message: 'Open a requisition before scanning a portal release QR.',
        color: 'red',
      })
      return
    }

    const params = new URLSearchParams({
      mode: 'release-funds',
      requisitionId: selectedRequisitionId,
      amount: String(requestedAmount.amount),
      currency: requestedAmount.currency,
    })
    const activeOrgId = getActiveOrgId()
    if (activeOrgId) {
      params.set('orgTenantId', activeOrgId)
    }

    void router.push(`/scan?${params.toString()}`)
  }

  const handleScanPortalAck = () => {
    if (!selectedRequisitionId) {
      notifications.show({
        title: 'Requisition Missing',
        message: 'Open a requisition before scanning a portal acknowledgment QR.',
        color: 'red',
      })
      return
    }

    const params = new URLSearchParams({
      mode: 'acknowledge-requisition',
      requisitionId: selectedRequisitionId,
    })
    const activeOrgId = getActiveOrgId()
    if (activeOrgId) {
      params.set('orgTenantId', activeOrgId)
    }

    void router.push(`/scan?${params.toString()}`)
  }

  const handleRequisitionDecision = async (action: 'approve' | 'reject') => {
    // This function is deprecated - approval now uses VP-based flow
    // Kept for backward compatibility
    return
  }

  const handleOpenReleaseModal = async () => {
    if (!selectedRequisitionId) return
    setShowReleaseModal(true)
    setCreatingReleaseRequest(true)
    setReleaseRequestId(null)
    setReleaseRequestUrl(null)
    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile to release funds.',
        color: 'red',
      })
      setShowReleaseModal(false)
      setCreatingReleaseRequest(false)
      return
    }
    try {
      const { data } = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/release/request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setReleaseRequestId(data.requestId)
      setReleaseRequestUrl(data.presentationRequestUrl)
    } catch (err: any) {
      notifications.show({
        title: 'Release Setup Failed',
        message: err.response?.data?.error || err.message || 'Could not generate secure verification request.',
        color: 'red',
      })
      setShowReleaseModal(false)
    } finally {
      setCreatingReleaseRequest(false)
    }
  }

  const handleRequisitionRelease = async () => {
    if (!selectedRequisitionId || !releaseRequestId || !releaseRequestUrl) {
      notifications.show({
        title: 'Release Request Missing',
        message: 'Re-open the release modal to generate a valid request.',
        color: 'red',
      })
      return
    }

    const reauthOk = await requireSensitiveOrgReauth('release funds for this requisition')
    if (!reauthOk) {
      notifications.show({
        title: 'Re-authentication Cancelled',
        message: 'Release was cancelled before submission.',
        color: 'yellow',
      })
      return
    }
    const deviceAssertion = await confirmWithDevice({
      purpose: 'release_funds',
      transaction: { requisitionId: selectedRequisitionId, amount: requestedAmount.amount, currency: requestedAmount.currency },
    }).catch((error: Error) => {
      notifications.show({ title: 'Confirmation needed', message: error.message, color: 'yellow' })
      return null
    })
    if (deviceAssertion === null) return

    setReleasing(true)
    try {
      const token = getPreferredToken()
      if (!token) throw new Error('No active organization session.')
      const personalWalletId = getPersonalWalletTenantId()
      if (!personalWalletId) throw new Error('Personal wallet session is required for embedded release.')
      const releaseRes = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/release/embedded-wallet`,
        {
          requestId: releaseRequestId,
          presentationRequestUrl: releaseRequestUrl,
          walletId: personalWalletId,
          amount: requestedAmount.amount,
          currency: requestedAmount.currency,
          ...(deviceAssertion ? { deviceAssertion } : {}),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (releaseRes.data?.error) throw new Error(releaseRes.data.error)
      notifications.show({
        title: 'Money released',
        message: 'The release is recorded for this requisition.',
        color: 'green',
      })
      setShowReleaseModal(false)
      setReleaseRequestId(null)
      setReleaseRequestUrl(null)
      setSelectedRequisitionId(null)
      setSelectedRequisition(null)
      await fetchRequisitions()
    } catch (err: any) {
      notifyWalletStepFailed('Release did not go through', err)
    } finally {
      setReleasing(false)
    }
  }

  const handleOpenAckModal = async () => {
    if (!selectedRequisitionId) return
    setShowAckModal(true)
    setCreatingAckRequest(true)
    setAckRequestId(null)
    setAckRequestUrl(null)
    const token = getPreferredToken()
    if (!token) {
      notifications.show({
        title: 'Organization profile needed',
        message: 'Switch to your organization profile to confirm delivery.',
        color: 'red',
      })
      setShowAckModal(false)
      setCreatingAckRequest(false)
      return
    }
    try {
      const { data } = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/ack/request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setAckRequestId(data.requestId)
      setAckRequestUrl(data.presentationRequestUrl)
    } catch (err: any) {
      notifications.show({
        title: 'Ack Setup Failed',
        message: err.response?.data?.error || err.message || 'Could not generate secure verification request.',
        color: 'red',
      })
      setShowAckModal(false)
    } finally {
      setCreatingAckRequest(false)
    }
  }

  const handleRequisitionAcknowledge = async () => {
    if (!selectedRequisitionId || !ackRequestId || !ackRequestUrl) {
      notifications.show({
        title: 'Ack Request Missing',
        message: 'Re-open the acknowledge modal to generate a valid request.',
        color: 'red',
      })
      return
    }

    const allowed = await enforceOrgActionPolicy({
      actionType: 'workflow.acknowledge_completion',
      evidenceProvided: true,
    })
    if (!allowed) return

    const reauthOk = await requireSensitiveOrgReauth('acknowledge this requisition')
    if (!reauthOk) {
      notifications.show({
        title: 'Re-authentication Cancelled',
        message: 'Acknowledgement was cancelled before submission.',
        color: 'yellow',
      })
      return
    }

    setAcking(true)
    try {
      const token = getPreferredToken()
      if (!token) throw new Error('No active organization session.')
      const personalWalletId = getPersonalWalletTenantId()
      if (!personalWalletId) throw new Error('Personal wallet session is required for embedded acknowledge.')
      const ackRes = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/ack/embedded-wallet`,
        {
          requestId: ackRequestId,
          presentationRequestUrl: ackRequestUrl,
          walletId: personalWalletId,
          notes: requisitionLifecycleNote.trim() || 'Goods/services received and confirmed.',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (ackRes.data?.error) throw new Error(ackRes.data.error)
      notifications.show({ title: 'Delivery confirmed', message: 'This requisition is now closed.', color: 'teal' })
      setShowAckModal(false)
      setAckRequestId(null)
      setAckRequestUrl(null)
      setSelectedRequisitionId(null)
      setSelectedRequisition(null)
      await fetchRequisitions()
    } catch (err: any) {
      notifyWalletStepFailed('Confirmation did not go through', err)
    } finally {
      setAcking(false)
    }
  }

  // Auto-open approval modal when returning from external wallet VP flow
  useEffect(() => {
    if (!selectedRequisitionId || !selectedRequisition) return

    const autoApproveModal = router.query.autoApproveModal === 'true'
    if (autoApproveModal && !showApprovalModal) {
      setTimeout(() => {
        handleOpenApprovalModal()
      }, 500)

      // Consume one-shot query flag so refresh/back does not reopen endlessly.
      const nextQuery = { ...router.query } as Record<string, any>
      delete nextQuery.autoApproveModal
      void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true })
    }
  }, [selectedRequisitionId, selectedRequisition, router.query.autoApproveModal, showApprovalModal])

  useEffect(() => {
    if (!selectedRequisitionId) return
    void openRequisitionDetails(selectedRequisitionId)
  }, [selectedRequisitionId, openRequisitionDetails])

  /* ── WhatsApp share helper ── */

  const shareWhatsApp = (link: PaymentLink, phone?: string) => {
    const checkoutUrl = getLinkCheckoutUrl(link)
    if (!checkoutUrl) {
      notifications.show({
        title: 'Missing Payment URL',
        message: 'This link is missing a checkout URL. Refresh and try again.',
        color: 'red',
      })
      return
    }

    const isSchoolFees =
      Boolean(link.invoiceRef) ||
      /school|fee|fees|tuition/i.test(`${link.description || ''} ${link.merchantName || ''}`)

    const message = isSchoolFees
      ? `School fees payment request: ${fmt(link.amount, link.currency)} for ${link.description}. Complete checkout here: ${checkoutUrl}`
      : `Please pay ${fmt(link.amount, link.currency)} for ${link.description}. Complete checkout here: ${checkoutUrl}`

    const msg = encodeURIComponent(message)
    const url = phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}` : `https://wa.me/?text=${msg}`
    window.open(url, '_blank')
  }

  /* ── Stats ── */

  const trackedPaymentLinks = links
  const inboundObligations = arObligations.filter((row) => String(row.status || '').toLowerCase() !== 'completed')
  const pendingProofCount = trackedPaymentLinks.filter((l) => {
    const a = l as any
    return l.status === 'active' && a.proof_request_id && !a.proof_response_id
  }).length
  const verifiedCount = trackedPaymentLinks.filter((l) => (l as any).receipt_vc_id || l.status === 'paid').length
  const disputedCount = trackedPaymentLinks.filter(
    (l) => String((l as any).status || '').toLowerCase() === 'disputed',
  ).length
  const pendingApProofActions = apWorkflowActions.filter(
    (item) => Boolean(item.required_action) && Boolean(item.required_proof_type) && !item.proof_response_id,
  )
  const activeCount = trackedPaymentLinks.filter((l) => l.status === 'active').length
  const paidCount = trackedPaymentLinks.filter((l) => l.status === 'paid').length
  const revenue = trackedPaymentLinks.filter((l) => l.status === 'paid').reduce((s, l) => s + l.amount, 0)

  /* ── List rows: one array per tab feeds both the Cards and the Table view ── */

  const paymentLinkRow = (
    link: PaymentLink,
    flowLabel: string,
    flowColor: string,
    extra?: React.ReactNode,
  ): FinanceListRow => {
    const flow = getPaymentFlowKind(link)
    const isInstalment = flow === 'instalment'
    return {
      id: link.id,
      title: link.description || 'Client payment',
      flowLabel,
      flowColor,
      status: String(link.status || '').toUpperCase(),
      statusColor: statusColor[link.status] || 'gray',
      dateLabel: formatTxnTime(link.createdAt) || undefined,
      note: link.invoiceRef ? `Reference ${link.invoiceRef}` : undefined,
      amountLabel: fmt(link.amount, link.currency),
      extra,
      trailing: (
        <Group gap={2} justify="flex-end" mt={4} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="History"
            onClick={(e) => {
              e.stopPropagation()
              setHistoryItem({ title: link.description || 'Client payment', trail: trailFromPaymentLink(link) })
            }}
          >
            <IconHistory size={14} />
          </ActionIcon>
          {link.status === 'active' && (
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              aria-label="Cancel"
              onClick={(e) => {
                e.stopPropagation()
                handleCancel(link.id)
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>
      ),
      onClick: () => {
        if (isInstalment && (link as any).plan_id) void openPlanDetails((link as any).plan_id)
        else openPaymentLinkDetails(link)
      },
    }
  }

  const paymentExtra = (link: PaymentLink): React.ReactNode => {
    const flow = getPaymentFlowKind(link)
    const isInstalment = flow === 'instalment'
    const isRecurring = flow === 'recurring'
    const linkAny = link as any
    const metadata = linkAny.metadata && typeof linkAny.metadata === 'object' ? linkAny.metadata : {}
    const debtorOrgName = String(
      linkAny.debtor_org_name || linkAny.debtorOrgName || metadata.debtorOrgName || '',
    ).trim()
    const debtorOrgId = String(linkAny.debtor_org_id || linkAny.debtorOrgId || metadata.debtorOrgId || '').trim()
    const debtorLabel = debtorOrgName || (debtorOrgId ? 'Another organisation' : 'Counterparty')
    const ts = String(linkAny.trust_status || '').toLowerCase()
    const proofStage =
      link.status === 'paid' || linkAny.receipt_vc_id
        ? 'settled'
        : linkAny.proof_response_id || ts === 'proof_presented'
          ? 'proof_presented'
          : linkAny.proof_request_id || ts === 'proof_requested'
            ? 'proof_requested'
            : 'pending'
    const apMirrored = Boolean(linkAny.ap_mirrored || linkAny.apMirrored)
    const hasDebtorOrg = Boolean(debtorOrgName || debtorOrgId)
    return (
      <>
        {(isInstalment || isRecurring) && (
          <Group gap={4} mt={4}>
            {isInstalment && (
              <Badge size="xs" variant="dot" color="orange">
                Instalment {linkAny.installmentNumber || '—'} of {linkAny.installmentsTotal || '—'}
              </Badge>
            )}
            {isRecurring && (
              <Badge size="xs" variant="dot" color="pink">
                {linkAny.cadence || 'recurring'} billing
                {linkAny.installments_paid != null &&
                  linkAny.installments_total != null &&
                  ` · ${linkAny.installments_paid}/${linkAny.installments_total} cycles`}
              </Badge>
            )}
            {linkAny.dueDate && (
              <Badge size="xs" variant="light" color={dayjs(linkAny.dueDate).isBefore(dayjs()) ? 'red' : 'gray'}>
                Due {dayjs(linkAny.dueDate).format('D MMM')}
              </Badge>
            )}
          </Group>
        )}
        <Group gap={4} mt={6}>
          {proofStage === 'settled' && (
            <Badge size="xs" color="teal" variant="light" leftSection={<IconShieldCheck size={10} />}>
              Receipt issued
            </Badge>
          )}
          {proofStage === 'proof_presented' && (
            <Badge size="xs" color="indigo" variant="light" leftSection={<IconShieldCheck size={10} />}>
              Payer confirmed
            </Badge>
          )}
          {proofStage === 'proof_requested' && (
            <Badge size="xs" color="orange" variant="light" leftSection={<IconClock size={10} />}>
              Waiting for payer
            </Badge>
          )}
          {proofStage === 'pending' && link.status === 'active' && (
            <Badge size="xs" color="yellow" variant="light" leftSection={<IconClock size={10} />}>
              Not paid yet
            </Badge>
          )}
          {hasDebtorOrg ? (
            <Badge size="xs" color="indigo" variant="dot" leftSection={<IconUsers size={9} />}>
              {debtorLabel}
            </Badge>
          ) : link.payerPhone ? (
            <Badge size="xs" color="blue" variant="dot">
              {link.payerPhone.replace(/^\+?263/, '0').substring(0, 8)}···
            </Badge>
          ) : linkAny.payer_name ? (
            <Badge size="xs" color="gray" variant="dot">
              {String(linkAny.payer_name).substring(0, 12)}
            </Badge>
          ) : null}
          {hasDebtorOrg && (
            <Badge size="xs" color={apMirrored ? 'green' : 'gray'} variant="dot">
              {apMirrored ? 'In their supplier bills' : 'Not yet in their bills'}
            </Badge>
          )}
        </Group>
      </>
    )
  }

  const arListRows: FinanceListRow[] = trackedPaymentLinks.map((link) => {
    const flowBadge = getPaymentFlowBadge(getPaymentFlowKind(link))
    return {
      ...paymentLinkRow(link, flowBadge.label, flowBadge.color, paymentExtra(link)),
      onClick: () => void openBillingLink(link.id),
      financeLine: link.obligationId
        ? `${moneyInKindWord(link)} · Owed ${fmt(Number(link.balanceDue ?? link.amount ?? 0), link.currency)} · Received ${fmt(Number(link.settledAmount || 0), link.currency)}`
        : undefined,
    }
  })
  const [billingItem, setBillingItem] = useState<{ link?: any; run?: any } | null>(null)
  const [billingBusy, setBillingBusy] = useState(false)
  const openBillingLink = async (id: string) => {
    const assertContext = captureOrganizationSwitchContext(localStorage)
    try {
      const link = (await api.get(`/api/payment-links/${encodeURIComponent(id)}`)).data?.link
      assertContext()
      if (!link || link.id !== id) throw new Error('The client billing record is unavailable.')
      setBillingItem({ link })
    } catch (err: any) {
      if (!assertContext.isCurrent()) return
      notifications.show({ color: 'red', message: err.response?.data?.message || err.message || 'Could not open client billing' })
    }
  }
  const openClientBilling = async (run: any) => {
    const assertContext = captureOrganizationSwitchContext(localStorage)
    try {
      const linkId = run.output?.clientBill?.linkId
      const link = linkId ? (await api.get(`/api/payment-links/${encodeURIComponent(linkId)}`)).data?.link : undefined
      assertContext()
      if (linkId && (!link || link.id !== linkId || link.sourceRunId !== run.id)) {
        throw new Error('The linked client billing record is unavailable or belongs to another job.')
      }
      setBillingItem({ run, link })
      setSelectedFieldRun(null)
    } catch (err: any) {
      if (!assertContext.isCurrent()) return
      notifications.show({ color: 'red', message: err.response?.data?.message || err.message || 'Could not open client billing' })
    }
  }
  const sendBilling = async (contact: { payerName: string; payerPhone: string }, renew: boolean) => {
    if (!billingItem) return
    const assertContext = captureOrganizationSwitchContext(localStorage)
    setBillingBusy(true)
    try {
      const linkId = billingItem.link?.id || billingItem.run?.output?.clientBill?.linkId
      await api.post(
        linkId
          ? `/api/payment-links/${encodeURIComponent(linkId)}/send`
          : `/workflows/runs/${encodeURIComponent(billingItem.run.id)}/billing/retry`,
        linkId ? { ...contact, renew } : { clientName: contact.payerName, clientPhone: contact.payerPhone },
        { headers: { 'x-idempotency-key': crypto.randomUUID() } },
      )
      assertContext()
      const fresh = await api.get(
        linkId
          ? `/api/payment-links/${encodeURIComponent(linkId)}`
          : `/workflows/runs/${encodeURIComponent(billingItem.run.id)}`,
      )
      assertContext()
      if (linkId) setBillingItem({ ...billingItem, link: fresh.data.link })
      else await openClientBilling(fresh.data)
      assertContext()
      await Promise.all([...(itemTaskActive ? [] : [fetchLinks()]), fetchFieldRuns()])
    } catch (err: any) {
      if (!assertContext.isCurrent()) return
      notifications.show({ color: 'red', message: err.response?.data?.message || err.message || 'Could not send the client invoice' })
    } finally {
      setBillingBusy(false)
    }
  }
  arListRows.push(
    ...fieldJobBillingExceptions(fieldRuns, trackedPaymentLinks).map((item) => ({
      id: `billing-${item.runId}`,
      title: item.reference,
      flowLabel: 'CLIENT BILLING',
      flowColor: 'orange',
      status: item.status,
      note: item.note,
      onClick: () => void openClientBilling(fieldRuns.find((run: any) => run.id === item.runId)),
    })),
  )

  const invoiceListRows: FinanceListRow[] = feeRuns.map((run) => {
    const status = schoolFeeStatusWords(run)
    const current = schoolFeeProgress(run).find((step) => step.status === 'active')
    const instalments = Number(run.output?.clientBill?.instalments || 1)
    const amount = Number(run.input?.amount || run.output?.finance?.grandTotal || 0)
    return {
      id: run.id,
      title: schoolFeeTitle(run),
      flowLabel: 'School fee',
      flowColor: 'teal',
      status: status.label,
      statusColor: status.color,
      dateLabel: run.createdAt ? dayjs(run.createdAt).format('D MMM YYYY') : undefined,
      note: [
        run.input?.feeType,
        instalments > 1 ? `${instalments} instalments` : '',
        current ? `Next: ${current.label}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      amountLabel: fmt(amount, String(run.input?.currency || 'USD')),
      onClick: () => setSelectedFeeRunId(run.id),
    }
  })
  const selectedFeeRun = feeRuns.find((run) => run.id === selectedFeeRunId) || null
  const selectedFeeLink =
    typeof selectedFeeRun?.output?.clientBill?.url === 'string' ? (selectedFeeRun.output.clientBill.url as string) : ''

  const REQUISITION_STATUS_COLOR: Record<string, string> = {
    REQUISITION_CREATED: 'blue',
    AGENT_ASSIGNED: 'indigo',
    JOB_STARTED: 'orange',
    WORK_EVIDENCE_BEFORE: 'violet',
    WORK_EVIDENCE_AFTER: 'grape',
    MANAGER_APPROVED: 'indigo',
    APPROVED: 'green',
    RELEASED: 'yellow',
    ACKNOWLEDGED: 'teal',
    EXECUTION_ACKNOWLEDGED: 'teal',
    RECONCILED: 'cyan',
    JOB_CLOSED: 'dark',
  }

  const requisitionListRows: FinanceListRow[] = [
    ...requisitionRows.map((req) => {
      const status = String(req.status || '').toUpperCase()
      return {
        id: req.id,
        title: req.metadata?.department ? `Requisition · ${req.metadata.department}` : `Requisition · ${req.id}`,
        flowLabel: 'REQUISITION',
        flowColor: 'indigo',
        status: requisitionStatusLabel(status),
        statusColor: REQUISITION_STATUS_COLOR[status] || 'gray',
        dateLabel: formatTxnTime(req.updatedAt) || undefined,
        note: req.metadata?.notes,
        amountLabel: fmt(req.metadata?.amount || 0, req.metadata?.currency || 'USD'),
        onClick: () => void openRequisitionDetails(req.id),
      }
    }),
    ...purchaseRequests.map((row) => ({
      id: String(row.id),
      title: row.title || 'Purchase request',
      flowLabel: 'PURCHASE',
      flowColor: 'indigo',
      status: String(row.status || '').toUpperCase(),
      dateLabel: formatTxnTime(row.updated_at || row.updatedAt || row.created_at || row.createdAt) || undefined,
      note: relatedWorkLine(row.family),
      amountLabel: row.amount != null ? fmt(Number(row.amount), row.currency || 'USD') : undefined,
      onClick: () => openChainRequest(String(row.id)),
    })),
  ]

  const fieldListRows: FinanceListRow[] = fieldRuns.map((run: any) => {
    const stage = String(run.output?.workflowStage || run.output?.stage || run.status || '').toUpperCase()
    const FEPT_STAGE_COLOR: Record<string, string> = {
      REQUEST_CREATED: 'blue',
      ASSIGNED: 'indigo',
      IN_PROGRESS: 'orange',
      EVIDENCE_CAPTURED: 'violet',
      ACKNOWLEDGED: 'teal',
      PAYMENT_TRIGGERED: 'yellow',
      RECEIPT_ISSUED: 'green',
      RECONCILED: 'cyan',
      COMPLETED: 'dark',
      DISPUTED: 'red',
      CANCELLED: 'gray',
    }
    const input = run.output?.workflowInput || run.input || {}
    const closed = ['completed', 'reconciled', 'cancelled'].includes(String(run.status || '').toLowerCase())
    return {
      id: String(run.id),
      title: jobHeading(input).title,
      flowLabel: 'JOB',
      flowColor: 'teal',
      status: fieldJobStatusLabel(run.status, stage, run.output?.pauseReason),
      statusColor: FEPT_STAGE_COLOR[stage] || 'gray',
      dateLabel: formatTxnTime(run.updatedAt || run.updated_at || run.createdAt || run.created_at) || undefined,
      note: [input.reference || input.poNumber, input.location].filter(Boolean).join(' · ') || undefined,
      amountLabel: input.amount ? fmt(Number(input.amount), input.currency || 'USD') : undefined,
      trailing: (
        <Badge size="xs" color={closed ? 'gray' : 'teal'} variant="dot">
          {closed ? 'Closed' : 'Open'}
        </Badge>
      ),
      onClick: () => {
        // Close the current run first so the transition is visible,
        // then open the new selection after the drawer animates out.
        setFieldJobTab('details')
        if (selectedFieldRun && selectedFieldRun.id !== run.id) {
          setSelectedFieldRun(null)
          setTimeout(() => setSelectedFieldRun(run), 180)
        } else {
          setSelectedFieldRun(run)
        }
      },
    }
  })

  const apListRows: FinanceListRow[] = [
    ...apBills.map((row) => {
      const supplier = apSuppliers.find((item) => item.id === row.supplier_id)
      return {
        id: String(row.id),
        title: `${row.invoice_ref || 'Bill'} · ${supplier?.supplier_name || 'Supplier'}`,
        flowLabel: 'MONEY OUT',
        flowColor: 'orange',
        status: String(row.status || '').toUpperCase(),
        statusColor: row.status === 'paid' ? 'green' : 'orange',
        dateLabel: formatTxnTime(row.updated_at || row.created_at) || undefined,
        note: row.project_ref ? `Job ${row.project_ref}` : row.description,
        amountLabel: fmt(
          Number(row.status === 'paid' ? (row.amount ?? 0) : (row.balance_due ?? row.amount ?? 0)),
          row.currency || 'USD',
        ),
        financeLine: row.obligation_id
          ? `Purchase · ${row.match_status === 'matched' ? 'Order, receipt and bill match' : row.match_status === 'disputed' ? 'Amounts do not match' : 'Direct supplier bill'} · Owed ${fmt(Number(row.obligation_balance_due ?? row.balance_due ?? 0), row.currency || 'USD')} · Paid ${fmt(Number(row.obligation_original_amount || row.amount || 0) - Number(row.obligation_balance_due ?? row.balance_due ?? 0), row.currency || 'USD')}`
          : undefined,
        trailing:
          row.match_status === 'disputed' ? (
            <Button
              size="compact-xs"
              color="red"
              variant="light"
              onClick={(event) => {
                event.stopPropagation()
                void api
                  .post(`/api/finance/ap/invoices/${encodeURIComponent(row.id)}/resolve-match`, {
                    decision: 'accept_variance',
                    note: 'Accepted by finance after reviewing the order, receipt and supplier bill.',
                  })
                  .then(() => fetchApSuppliers())
              }}
            >
              Accept difference
            </Button>
          ) : undefined,
        onClick: () => {
          if (row.source_request_id) {
            openChainRequest(String(row.source_request_id))
            return
          }
          setHistoryItem({
            title: `Supplier bill ${row.invoice_ref || ''}`.trim(),
            trail: trailFromSupplierBill({ ...row, supplierName: supplier?.supplier_name }),
          })
        },
      }
    }),
    ...apSuppliers.map((sup) => ({
      id: `supplier-${sup.id}`,
      title: sup.supplier_name || 'Supplier',
      flowLabel: 'SUPPLIER',
      flowColor: 'orange',
      status: sup.total_outstanding > 0 ? 'OUTSTANDING' : 'SETTLED',
      statusColor: sup.total_outstanding > 0 ? 'orange' : 'green',
      note: sup.supplier_email || undefined,
      amountLabel: fmt(sup.total_outstanding ?? 0),
      extra: (
        <Group gap={4} mt={6}>
          {(sup as any).supplier_wallet_tenant_id ? (
            <Badge size="xs" color="green" variant="dot" leftSection={<IconWallet size={9} />}>
              Can be paid in-app
            </Badge>
          ) : (
            <Badge size="xs" color="gray" variant="dot">
              Paid outside the app
            </Badge>
          )}
          {sup.total_outstanding > 0 ? (
            <Badge size="xs" color="orange" variant="light" leftSection={<IconReceipt size={10} />}>
              Payment due
            </Badge>
          ) : (
            <Badge size="xs" color="teal" variant="light" leftSection={<IconShieldCheck size={10} />}>
              Settled
            </Badge>
          )}
        </Group>
      ),
      onClick: () => {
        setSelectedApSupplier(sup)
        fetchSupplierStatement(sup.id)
        fetchSupplierWorkflowActions(sup.id)
      },
    })),
  ]

  const listForTab: Record<string, { rows: FinanceListRow[]; noteLabel: string }> = {
    ar: { rows: arListRows, noteLabel: 'Reference' },
    invoices: { rows: invoiceListRows, noteLabel: 'Next step' },
    requisitions: { rows: requisitionListRows, noteLabel: 'Note' },
    field: { rows: fieldListRows, noteLabel: 'Reference and place' },
    ap: { rows: apListRows, noteLabel: 'Job' },
  }

  const [inboxTask, setInboxTask] = useState(false)
  useEffect(() => {
    const task = getTaskContext()
    setInboxTask(Boolean(task && bindTaskPath(router.asPath)))
  }, [router.asPath, contextSwitching])
  const returnToInbox = () => {
    if (!getTaskContext()) return false
    endTaskContext()
    void router.replace('/inbox')
    return true
  }

  /** CSV of the rows on screen for the active tab: same columns, same order as the table. */
  const exportVisible = () => {
    const current = listForTab[String(tab)] || { rows: [], noteLabel: 'Note' }
    const body = csvFrom(FINANCE_TABLE_HEADERS(current.noteLabel), financeRowsToCells(current.rows))
    void saveExport(
      exportFileName(`finance-${String(tab)}-${dayjs().format('YYYY-MM-DD')}`, 'csv'),
      EXPORT_MIME.csv,
      body,
    )
  }

  return (
    <AppShellMobile>
      {inboxTask && (
        <Alert m="md">
          <Stack gap="xs">
            <Text size="sm">Opened for {getActiveOrgLabel() || 'your organisation'}</Text>
            <Button size="xs" onClick={returnToInbox}>
              Back to inbox
            </Button>
          </Stack>
        </Alert>
      )}
      <Stack gap="md" px="md" pt="md" style={inboxTask ? { display: 'none' } : undefined}>
        {/* Header */}
        <Group justify="space-between" align="center">
          <Box>
            <Title order={3}>{area === 'operations' ? 'Operations' : 'Money'}</Title>
            <Text size="sm" c="dimmed">
              {area === 'operations'
                ? 'Run jobs, purchases, school fees and services.'
                : 'Track what clients owe and what the organisation owes suppliers.'}
            </Text>
          </Box>
          <Group gap={4} wrap="nowrap">
            <FinanceViewToggle view={listView} onChange={setListView} onExport={exportVisible} />
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={fetchLinks} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>
        </Group>

        {/* One stat row, for money only */}
        {area === 'money' && (
        <Group grow wrap="nowrap" gap="xs">
          <Paper p="xs" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Active
            </Text>
            <Text fw={700} size="lg" c="green">
              {activeCount}
            </Text>
          </Paper>
          <Paper p="xs" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Paid
            </Text>
            <Text fw={700} size="lg" c="blue">
              {paidCount}
            </Text>
          </Paper>
          <Paper p="xs" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Revenue
            </Text>
            <Text fw={700} size="md" c="teal" truncate>
              {fmt(revenue)}
            </Text>
          </Paper>
        </Group>
        )}

        {workflowConfigError && <Alert color="red" title="Could not load work areas">
          {workflowConfigError}
          <Button variant="subtle" size="xs" onClick={() => void fetchWorkflowConfig()}>Retry</Button>
        </Alert>}
        {hasOperationsArea && hasMoneyArea && (
        <SegmentedControl
          fullWidth
          value={area}
          data={[
            { value: 'operations', label: 'Operations' },
            { value: 'money', label: 'Money' },
          ]}
          onChange={(value) => {
            const next = value as 'operations' | 'money'
            setArea(next)
            if (next === 'operations') {
              setTab(
                hasFieldExecution
                  ? 'field'
                  : hasInternalRequisitions
                    ? 'requisitions'
                    : hasEducation
                      ? 'invoices'
                      : null,
              )
            } else {
              setTab(hasArModule ? 'ar' : hasApPayables ? 'ap' : null)
            }
          }}
        />
        )}
        {area === 'operations' && hasCommerce && (
          <Group grow>
            {hasCommerce && (
              <Button variant="light" onClick={() => router.push('/shop')}>
                Shop & services
              </Button>
            )}
          </Group>
        )}

        <Tabs value={tab} onChange={setTab}>
          <Tabs.List grow>
            {area === 'money' && hasArModule && (
              <Tabs.Tab value="ar" leftSection={<IconReceipt size={14} />}>
                Money in
              </Tabs.Tab>
            )}
            {area === 'operations' && hasEducation && (
              <Tabs.Tab value="invoices" leftSection={<IconSchool size={14} />}>
                School fees
              </Tabs.Tab>
            )}
            {area === 'operations' && hasInternalRequisitions && (
              <Tabs.Tab value="requisitions" leftSection={<IconUsers size={14} />}>
                Purchases
              </Tabs.Tab>
            )}
            {area === 'operations' && hasFieldExecution && (
              <Tabs.Tab value="field" leftSection={<IconReceipt size={14} />}>
                Jobs
              </Tabs.Tab>
            )}
            {area === 'money' && hasApPayables && (
              <Tabs.Tab value="ap" leftSection={<IconCash size={14} />}>
                Money out
              </Tabs.Tab>
            )}
          </Tabs.List>

          {/* ── AR Collections Tab ── */}
          <Tabs.Panel value="ar" pt="md">
            {disputedCount > 0 && (
              <Text size="sm" c="red.7" fw={600} mb="sm">
                {disputedCount} disputed {disputedCount === 1 ? 'payment needs' : 'payments need'} attention
              </Text>
            )}

            <Group mb="md" wrap="nowrap" align="center" gap="xs">
              <Button
                style={{ flex: 1, minWidth: 0 }}
                radius="md"
                leftSection={<IconPlus size={18} />}
                onClick={() => setShowCreate(true)}
              >
                {hasArCollections ? 'Request payment' : 'New payment link'}
              </Button>
              {hasArCollections && (
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="light" color="gray" size={48} radius="md" aria-label="More money actions">
                      <IconDots size={20} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconWallet size={16} />}
                      onClick={() => {
                        const orgTenantId = getActiveOrgId()
                        const query = orgTenantId ? `?orgTenantId=${encodeURIComponent(orgTenantId)}` : ''
                        void router.push(`/finance/my-ar-obligations${query}`)
                      }}
                    >
                      Bills to pay
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
              <StepHelp
                title="Money in"
                points={[
                  'Money clients owe you: one-off pay links, instalment plans and repeat billing.',
                  'Use Request payment to ask for a payment now or collect over time.',
                  'Each card shows whether the client has agreed and whether the money has arrived.',
                ]}
              />
            </Group>

            {error && <ErrorAlert message={error} mb="md" />}

            {inboundObligations.length > 0 && (
            <Paper p="sm" radius="md" withBorder mb="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>
                  Received from others
                </Text>
                <Badge size="xs" color="grape" variant="light">
                  {inboundObligations.length}
                </Badge>
              </Group>
                <Stack gap={6}>
                  {inboundObligations.slice(0, 3).map((item) => (
                    <Paper key={item.id} p="xs" radius="sm" withBorder>
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Box style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>
                            {item.collector_org_name || 'Counterparty org'}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {item.description || item.id}
                          </Text>
                          <Badge
                            size="xs"
                            mt={4}
                            color={item.trust_status === 'settled' ? 'teal' : 'yellow'}
                            variant="light"
                          >
                            {item.trust_status === 'settled' ? 'Settled' : 'Waiting'}
                          </Badge>
                        </Box>
                        <Box ta="right" style={{ flexShrink: 0 }}>
                          <Text size="sm" fw={700}>
                            {fmt(item.amount_due ?? item.total_amount ?? 0, item.currency || 'USD')}
                          </Text>
                          {item.next_due_date && (
                            <Text size="xs" c="dimmed">
                              Due {dayjs(item.next_due_date).format('D MMM')}
                            </Text>
                          )}
                        </Box>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
            </Paper>
            )}

            <FinanceListRows
              rows={arListRows}
              view={listView}
              noteLabel="Reference"
              loading={loading}
              empty={
                <Center py="xl">
                  <Stack align="center" gap="sm">
                    <ThemeIcon size={56} radius="xl" variant="light" color="blue">
                      <IconLink size={28} />
                    </ThemeIcon>
                    <Text fw={600} c="dimmed">
                      No payment links yet
                    </Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Create a payment link to start tracking payments here.
                    </Text>
                  </Stack>
                </Center>
              }
            />
          </Tabs.Panel>

          {/* ── Invoices Tab ── */}
          {hasEducation && (
            <Tabs.Panel value="invoices" pt="md">
              <Group mb="md" wrap="nowrap" align="center" gap="sm">
                <Button
                  style={{ flex: 1, minWidth: 0 }}
                  size="lg"
                  radius="md"
                  leftSection={<IconPlus size={18} />}
                  onClick={() => setShowInvoice(true)}
                  color="teal"
                >
                  New school fee
                </Button>
                <StepHelp
                  title="School fees"
                  points={[
                    'Each fee sends the parent a pay link by phone: one payment or instalments.',
                    'When the parent pays, the fee moves to Paid and the school keeps the receipt.',
                    'The website School fees page shows the same list.',
                  ]}
                />
              </Group>

              <FinanceListRows
                rows={invoiceListRows}
                view={listView}
                noteLabel="Next step"
                loading={feeRunsLoading}
                empty="No school fees yet. Create one to send the parent a pay link."
              />
            </Tabs.Panel>
          )}

          {hasInternalRequisitions && (
            <Tabs.Panel value="requisitions" pt="md">
              {hasInternalRequisitions && (
                <Group mb="sm" wrap="nowrap" align="center" gap="sm">
                  <Button
                    style={{ flex: 1, minWidth: 0 }}
                    size="lg"
                    radius="md"
                    leftSection={<IconPlus size={18} />}
                    onClick={() => setShowRequisition(true)}
                    color="indigo"
                  >
                    New Requisition Request
                  </Button>
                  <StepHelp
                    title="Purchases"
                    points={[
                      'Requests to buy something for the organisation, separate from money clients owe you.',
                      'Each purchase moves through: requested, approved, money released, goods received.',
                      'The people who approve, release and receive confirm each step from their wallet, and every step is kept on record.',
                    ]}
                  />
                </Group>
              )}

              <FinanceListRows
                rows={requisitionListRows}
                view={listView}
                noteLabel="Note"
                loading={requisitionsLoading}
                empty={
                  <Center py="xl">
                    <Stack align="center" gap="sm">
                      <ThemeIcon size={56} radius="xl" variant="light" color="indigo">
                        <IconUsers size={28} />
                      </ThemeIcon>
                      <Text fw={600} c="dimmed">
                        No purchase requests yet
                      </Text>
                      <Text size="sm" c="dimmed" ta="center">
                        Create a requisition request to start the internal approval workflow.
                      </Text>
                    </Stack>
                  </Center>
                }
              />
            </Tabs.Panel>
          )}

          {hasFieldExecution && (
            <Tabs.Panel value="field" pt="md">
              <Group mb="md" wrap="nowrap" align="center" gap="sm" justify="flex-end">
                {['owner', 'admin', 'manager', 'dispatcher', 'supervisor'].includes(
                  String(getOrgRoleClaim() || '').toLowerCase(),
                ) && (
                  <Button
                    style={{ flex: 1, minWidth: 0 }}
                    size="lg"
                    radius="md"
                    leftSection={<IconPlus size={18} />}
                    onClick={() => setShowFieldRun(true)}
                    color="teal"
                  >
                    New job
                  </Button>
                )}
                <StepHelp
                  title="Jobs"
                  points={[
                    'Each job moves through: assigned, in progress, photos, sign-off, payment and receipt.',
                    'Workers start the job and add photos. The sign-off and payout people confirm from their wallet.',
                    'Tap a job to see its steps and what is waiting on whom.',
                  ]}
                />
              </Group>

              <FinanceListRows
                rows={fieldListRows}
                view={listView}
                noteLabel="Reference and place"
                loading={fieldRunsLoading}
                empty={
                  <Center py="xl">
                    <Stack align="center" gap="sm">
                      <ThemeIcon size={56} radius="xl" variant="light" color="teal">
                        <IconReceipt size={28} />
                      </ThemeIcon>
                      <Text fw={600} c="dimmed">
                        No jobs yet
                      </Text>
                      <Text size="sm" c="dimmed" ta="center">
                        Jobs assigned to you, or created by your organization, will show up here.
                      </Text>
                    </Stack>
                  </Center>
                }
              />
            </Tabs.Panel>
          )}

          {hasApPayables && (
            <Tabs.Panel value="ap" pt="md">
              <Group mb="md" wrap="nowrap" align="center" gap="sm">
                <Button
                  style={{ flex: 1, minWidth: 0 }}
                  size="lg"
                  radius="md"
                  leftSection={<IconPlus size={18} />}
                  onClick={() => {
                    setApInvoiceForm({
                      supplierName: '',
                      invoiceRef: '',
                      description: '',
                      amount: '',
                      currency: 'USD',
                      dueDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
                    })
                    setShowRecordApInvoice(true)
                  }}
                  color="indigo"
                >
                  Record Supplier Invoice
                </Button>
                <StepHelp
                  title="Money out"
                  points={[
                    'Money the organisation owes suppliers: record their bills, pay them and send a payment note.',
                    'This is separate from Money in and School fees.',
                    'The waiting list shows bills from other organisations that still need someone here to confirm a step.',
                  ]}
                />
              </Group>

              {pendingApProofActions.length > 0 && (
                <Alert
                  color="orange"
                  variant="light"
                  title="Proof Consent Required"
                  mb="md"
                  icon={<IconAlertCircle size={16} />}
                >
                  <Stack gap={6}>
                    {pendingApProofActions.slice(0, 2).map((item) => (
                      <Group key={`proof-${item.id}`} justify="space-between" wrap="nowrap">
                        <Text size="xs" style={{ minWidth: 0 }} truncate>
                          {item.invoice_ref || item.invoice_description || item.id} · {item.required_proof_type}
                        </Text>
                        {item.myActionRequired && (
                          <Button
                            size="xs"
                            variant="light"
                            color="orange"
                            onClick={() => runApWorkflowTransition(item)}
                          >
                            Present Proof
                          </Button>
                        )}
                      </Group>
                    ))}
                  </Stack>
                </Alert>
              )}

              {apWorkflowActions.length > 0 && (
                <Paper p="sm" radius="md" withBorder mb="md">
                  <Group justify="space-between" mb="xs">
                    <Text size="xs" c="dimmed" fw={700}>
                      CROSS-ORG ACTION QUEUE
                    </Text>
                    <Badge size="xs" color="indigo" variant="light">
                      {apWorkflowActions.length}
                    </Badge>
                  </Group>
                  <DetailTimelineList
                    items={apWorkflowActions.slice(0, 4).map((item) => ({
                      id: item.id,
                      title: `${item.invoice_ref || 'AR mirror'} · ${item.supplier_name || 'Counterparty'}`,
                      source: 'trust workflow',
                      description: `${item.workflow_stage || 'issued'} → ${item.required_action || 'awaiting update'}`,
                      note:
                        [
                          item.required_proof_type ? `Proof required: ${item.required_proof_type}` : null,
                          item.proof_response_id ? `Proof ref: ${item.proof_response_id}` : null,
                          item.consent_timestamp
                            ? `Consent: ${dayjs(item.consent_timestamp).format('D MMM YYYY HH:mm')}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined,
                      timestamp: item.updated_at ? dayjs(item.updated_at).format('D MMM YYYY HH:mm') : '—',
                      badge: {
                        label: item.myActionRequired ? 'MY ACTION' : (item.status || 'WATCH').toUpperCase(),
                        color: item.myActionRequired ? 'orange' : 'blue',
                      },
                    }))}
                    emptyText="No pending workflow actions"
                  />
                  {apWorkflowActions.some((item) => item.myActionRequired && item.required_action) && (
                    <Stack gap="xs" mt="sm">
                      {apWorkflowActions
                        .filter((item) => item.myActionRequired && item.required_action)
                        .slice(0, 2)
                        .map((item) => (
                          <Button
                            key={`cta-${item.id}`}
                            size="xs"
                            variant="light"
                            color="indigo"
                            onClick={() => runApWorkflowTransition(item)}
                          >
                            {`Action: ${item.required_action}`}
                          </Button>
                        ))}
                    </Stack>
                  )}
                </Paper>
              )}

              {apErr ? (
                <Alert color="red" variant="light" title="Could not load supplier bills">
                  {apErr}
                </Alert>
              ) : (
                <FinanceListRows
                  rows={apListRows}
                  view={listView}
                  noteLabel="Job"
                  loading={apLoading}
                  empty={
                    <Center py="xl">
                      <Stack align="center" gap="sm">
                        <ThemeIcon size={56} radius="xl" variant="light" color="indigo">
                          <IconCash size={28} />
                        </ThemeIcon>
                        <Text fw={600} c="dimmed">
                          No supplier balances or payments yet
                        </Text>
                        <Text size="sm" c="dimmed" ta="center">
                          Record a supplier bill above. The same form is on the website.
                        </Text>
                      </Stack>
                    </Center>
                  }
                />
              )}
            </Tabs.Panel>
          )}
        </Tabs>
      </Stack>

      {/* ── Created Link Result Drawer ── */}
      <Drawer
        opened={Boolean(billingItem)}
        onClose={() => {
          if (!returnToInbox()) setBillingItem(null)
        }}
        position="bottom"
        size="90%"
        title="Client billing"
      >
        {billingItem && (
          <ClientBillingDetails
            {...billingItem}
            busy={billingBusy}
            canManage={['owner', 'admin', 'issuer', 'manager', 'approver'].includes(getOrgRoleClaim() || '')}
            onSend={sendBilling}
            onOpenJob={
              billingItem.run || billingItem.link?.sourceRunId
                ? async () => {
                    try {
                      const run =
                        billingItem.run ||
                        (await api.get(`/workflows/runs/${encodeURIComponent(billingItem.link.sourceRunId)}`)).data
                      setSelectedFieldRun(run)
                      setBillingItem(null)
                    } catch (err: any) {
                      notifications.show({
                        color: 'red',
                        message: err.response?.data?.message || 'Could not open linked job',
                      })
                    }
                  }
                : undefined
            }
          />
        )}
      </Drawer>
      <Drawer
        opened={!!createdLink}
        onClose={() => {
          if (!returnToInbox()) setCreatedLink(null)
        }}
        position="bottom"
        size="auto"
        title={createdLink ? `Payment Flow · ${createdLink.id}` : 'Payment Flow Details'}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        {createdLink &&
          (() => {
            const flowSteps = buildPaymentFlowSteps(createdLink, linkAuditItems)
            const stepStatusColor: Record<PaymentFlowStepState['status'], string> = {
              done: 'green',
              active: 'blue',
              pending: 'gray',
            }
            const stepStatusLabel: Record<PaymentFlowStepState['status'], string> = {
              done: 'Done',
              active: 'In Progress',
              pending: 'Pending',
            }
            const paymentAuditItems: DetailTimelineItem[] = linkAuditItems.map((entry) => {
              const narrative = describePaymentAuditEvent(entry)
              return {
                id: entry.id,
                title: narrative.title,
                source: String(entry.details?.source || entry.details?.path || 'payment workflow'),
                description: narrative.subtitle,
                note: narrative.note,
                timestamp: dayjs(entry.createdAt).format('D MMM YYYY HH:mm'),
              }
            })
            const paymentFlowItems: DetailTimelineItem[] = flowSteps.map((step) => ({
              id: step.key,
              title: step.label,
              source: 'payment workflow',
              description: step.description,
              timestamp: step.occurredAt
                ? dayjs(step.occurredAt).format('D MMM YYYY HH:mm')
                : step.status === 'active'
                  ? 'In progress'
                  : '—',
              badge: {
                label: stepStatusLabel[step.status],
                color: stepStatusColor[step.status],
              },
            }))

            return (
              <WorkflowDetailBody
                statusCard={
                  <DetailStatusCard
                    status={String(createdLink.status || 'unknown').toUpperCase()}
                    amount={createdLink.amount}
                    currency={createdLink.currency}
                    lines={[
                      { text: `Flow: ${getPaymentFlowBadge(getPaymentFlowKind(createdLink)).label}` },
                      { text: `Link state: ${createdLink.status}` },
                      ...(createdLink.payer_name ? [{ text: `Customer: ${createdLink.payer_name}` }] : []),
                      ...(createdLink.plan_id
                        ? [
                            { text: `Plan: ${createdLink.plan_id}` },
                            {
                              text: `Instalment: ${createdLink.installment_number} of ${createdLink.installments_total || 'N'}`,
                            },
                          ]
                        : []),
                      ...(createdLink.invoiceRef ? [{ text: `Invoice reference: ${createdLink.invoiceRef}` }] : []),
                    ]}
                  />
                }
                sections={[
                  {
                    title: 'CLIENT BILLING',
                    content: (
                      <Button
                        variant="light"
                        onClick={async () => {
                          const assertContext = captureOrganizationSwitchContext(localStorage)
                          try {
                            const link = (await api.get(`/api/payment-links/${encodeURIComponent(createdLink.id)}`))
                              .data?.link
                            assertContext()
                            if (!link || link.id !== createdLink.id) throw new Error('The client billing record is unavailable.')
                            const run = link.sourceRunId
                              ? (await api.get(`/workflows/runs/${encodeURIComponent(link.sourceRunId)}`)).data
                              : undefined
                            assertContext()
                            setCreatedLink(null)
                            setBillingItem({ link, run })
                          } catch (err: any) {
                            if (!assertContext.isCurrent()) return
                            notifications.show({
                              color: 'red',
                              message: err.response?.data?.message || err.message || 'Could not open client billing',
                            })
                          }
                        }}
                      >
                        Client contact, delivery and payment details
                      </Button>
                    ),
                  },
                  {
                    title: 'PAYMENT ACTIONS',
                    content: createdLink.shortlinkUrl ? (
                      <>
                        {createdLink.status === 'active' ? (
                          <Button
                            size="md"
                            color="teal"
                            leftSection={<IconWallet size={16} />}
                            onClick={() => openPaymentLinkInApp(createdLink)}
                          >
                            Open In-App Checkout
                          </Button>
                        ) : (
                          <Alert color="gray" variant="light" icon={<IconAlertCircle size={16} />}>
                            This link is {createdLink.status}. Checkout action may be restricted, but sharing and audit
                            visibility remain available.
                          </Alert>
                        )}

                        <Paper p="sm" radius="md" withBorder>
                          <Text size="xs" c="dimmed" fw={600} mb={4}>
                            PAYMENT URL
                          </Text>
                          <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                            {createdLink.shortlinkUrl}
                          </Text>
                        </Paper>

                        <Group grow>
                          <CopyButton value={createdLink.shortlinkUrl}>
                            {({ copied, copy }) => (
                              <Button
                                variant={copied ? 'filled' : 'light'}
                                color={copied ? 'green' : 'blue'}
                                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                onClick={copy}
                                size="md"
                              >
                                {copied ? 'Copied!' : 'Copy Link'}
                              </Button>
                            )}
                          </CopyButton>
                          <Button
                            variant="light"
                            color="green"
                            size="md"
                            leftSection={<IconBrandWhatsapp size={16} />}
                            onClick={() => shareWhatsApp(createdLink)}
                          >
                            WhatsApp
                          </Button>
                        </Group>

                        <Text size="xs" c="dimmed">
                          Secured by Credentis Trust Layer · Instant receipt
                        </Text>
                      </>
                    ) : (
                      <Text size="xs" c="dimmed">
                        No checkout URL available for this payment link.
                      </Text>
                    ),
                  },
                  {
                    title: 'LIFECYCLE ACTIONS',
                    content: (
                      <>
                        <DetailTimelineList items={paymentFlowItems} emptyText="No timeline events available yet." />
                        {createdLink.status === 'paid' && (
                          <Paper p="sm" radius="md" withBorder>
                            <Stack gap={6}>
                              <Group justify="space-between" gap="xs">
                                <Text size="xs" c="dimmed">
                                  Paid at
                                </Text>
                                <Text size="xs">
                                  {createdLink.paidAt
                                    ? dayjs(createdLink.paidAt).format('D MMM YYYY HH:mm')
                                    : 'Not available'}
                                </Text>
                              </Group>
                              <Group justify="space-between" gap="xs">
                                <Text size="xs" c="dimmed">
                                  Provider reference
                                </Text>
                                <Text size="xs">{createdLink.providerRef || 'Not available'}</Text>
                              </Group>
                              <Group justify="space-between" gap="xs">
                                <Text size="xs" c="dimmed">
                                  Payer phone
                                </Text>
                                <Text size="xs">{createdLink.payerPhone || 'Not available'}</Text>
                              </Group>
                            </Stack>
                          </Paper>
                        )}
                      </>
                    ),
                  },
                ]}
                auditItems={paymentAuditItems}
                auditEmptyText="No timeline events available yet."
                auditLoading={linkAuditLoading}
              />
            )
          })()}
      </Drawer>

      {/* ── Supplier Detail Drawer / Mutual Ledger ── */}
      <Drawer
        opened={!!selectedApSupplier}
        onClose={() => {
          setSelectedApSupplier(null)
          setSupplierStatement(null)
          setSelectedSupplierActions([])
        }}
        position="bottom"
        size="90%"
        title={selectedApSupplier ? `Supplier Statement · ${selectedApSupplier.supplier_name}` : 'Supplier'}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0', overflowY: 'auto' } }}
      >
        {selectedApSupplier && (
          <Stack gap="md" p="md">
            <Paper p="sm" radius="md" withBorder>
              <Grid>
                <Grid.Col span={6}>
                  <Text size="xs" c="dimmed" fw={600}>
                    Supplier ID
                  </Text>
                  <Text size="sm">{selectedApSupplier.id}</Text>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="xs" c="dimmed" fw={600}>
                    Tax Number
                  </Text>
                  <Text size="sm">{selectedApSupplier.tax_number || '—'}</Text>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="xs" c="dimmed" fw={600}>
                    Phone
                  </Text>
                  <Text size="sm">{selectedApSupplier.supplier_phone || '—'}</Text>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text size="xs" c="dimmed" fw={600}>
                    Email
                  </Text>
                  <Text size="sm">{selectedApSupplier.supplier_email || '—'}</Text>
                </Grid.Col>
              </Grid>
            </Paper>

            {statementLoading ? (
              <Center py="xl">
                <Loader />
              </Center>
            ) : supplierStatement ? (
              (() => {
                const summary = supplierStatement.summary ?? {}
                const invoices: any[] = supplierStatement.invoices ?? []
                const payments: any[] = supplierStatement.payments ?? []
                const hasWallet = !!(selectedApSupplier as any).supplier_wallet_tenant_id
                const lastPayment = payments[payments.length - 1]
                const allAcknowledged = payments.length > 0 && payments.every((p: any) => !!p.supplier_acknowledged_at)
                const anyVc = payments.some((p: any) => !!p.remittance_vc_id)
                const paymentVcArtifacts = payments
                  .filter((p: any) => !!p.remittance_vc_id)
                  .map((p: any) => ({
                    paymentId: String(p.id),
                    credentialId: String(p.remittance_vc_id),
                    amount: Number(p.amount_paid || 0),
                    currency: String(p.currency || 'USD'),
                    issuedAt: p.paid_at || null,
                    sourceRef: p.reference || p.id,
                    acknowledged: Boolean(p.supplier_acknowledged_at),
                  }))

                const ssLifecycleItems: DetailTimelineItem[] = [
                  ...invoices.map((inv: any) => ({
                    id: `inv-${inv.id}`,
                    title: `Invoice · ${inv.invoice_ref}`,
                    source: 'accounts payable',
                    description: inv.description || `${fmt(inv.amount, inv.currency)}`,
                    note: inv.due_date ? `Due: ${dayjs(inv.due_date).format('D MMM YYYY')}` : undefined,
                    timestamp: dayjs(inv.created_at || inv.createdAt).format('D MMM YYYY HH:mm'),
                    badge: {
                      label: (inv.status || 'outstanding').toUpperCase(),
                      color: inv.status === 'paid' ? 'green' : inv.status === 'partial' ? 'yellow' : 'orange',
                    },
                  })),
                  ...payments.map((pay: any) => ({
                    id: `pay-${pay.id}`,
                    title: `Payment · ${pay.payment_method || 'transfer'}`,
                    source: 'accounts payable',
                    description: `Paid ${fmt(pay.amount_paid, pay.currency)}${pay.reference ? ` · Ref: ${pay.reference}` : ''}`,
                    note: pay.remittance_vc_id
                      ? `RemittanceAdviceVC: ${String(pay.remittance_vc_id).substring(0, 12)}…`
                      : 'VC not yet issued',
                    timestamp: dayjs(pay.paid_at).format('D MMM YYYY HH:mm'),
                    badge: pay.supplier_acknowledged_at
                      ? { label: '✓ ACKNOWLEDGED', color: 'teal' }
                      : { label: 'PENDING ACK', color: 'gray' },
                  })),
                ].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

                return (
                  <WorkflowDetailBody
                    statusCard={
                      <DetailStatusCard
                        status={(summary as any).totalOutstanding > 0 ? 'OUTSTANDING BALANCE' : 'FULLY SETTLED'}
                        amount={(summary as any).totalOutstanding ?? 0}
                        currency="USD"
                        amountColor={(summary as any).totalOutstanding > 0 ? 'orange' : 'teal'}
                        lines={[
                          { text: `Total invoiced: ${fmt((summary as any).totalInvoiced ?? 0)}` },
                          { text: `Total paid: ${fmt((summary as any).totalPaid ?? 0)}` },
                          { text: `${invoices.length} invoice(s) · ${payments.length} payment(s)` },
                        ]}
                      />
                    }
                    sections={[
                      {
                        title: 'CROSS-ORG WORKFLOW ACTIONS',
                        content:
                          selectedSupplierActions.length === 0 ? (
                            <Text size="xs" c="dimmed">
                              No staged actions recorded yet for this relationship.
                            </Text>
                          ) : (
                            <Stack gap="xs">
                              <DetailTimelineList
                                items={selectedSupplierActions.slice(0, 8).map((item) => ({
                                  id: item.id,
                                  title: `${item.invoice_ref || 'AR mirror'} · ${item.workflow_stage || 'issued'}`,
                                  source: 'trust workflow',
                                  description: item.required_action
                                    ? `Next: ${item.required_action}`
                                    : `State: ${item.status || 'pending'}`,
                                  note:
                                    [
                                      item.required_proof_type ? `Proof required: ${item.required_proof_type}` : null,
                                      item.proof_response_id ? `Proof ref: ${item.proof_response_id}` : null,
                                      item.consent_timestamp
                                        ? `Consent: ${dayjs(item.consent_timestamp).format('D MMM YYYY HH:mm')}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ') || undefined,
                                  timestamp: item.updated_at ? dayjs(item.updated_at).format('D MMM YYYY HH:mm') : '—',
                                  badge: {
                                    label: item.myActionRequired
                                      ? 'MY ACTION'
                                      : (item.status || 'TRACKING').toUpperCase(),
                                    color: item.myActionRequired ? 'orange' : 'indigo',
                                  },
                                }))}
                                emptyText="No workflow actions"
                              />
                              {selectedSupplierActions
                                .filter((item) => item.myActionRequired && item.required_action)
                                .slice(0, 1)
                                .map((item) => (
                                  <Button
                                    key={`supplier-action-${item.id}`}
                                    size="xs"
                                    variant="light"
                                    color="indigo"
                                    onClick={() => runApWorkflowTransition(item)}
                                  >
                                    {`Run: ${item.required_action}`}
                                  </Button>
                                ))}
                            </Stack>
                          ),
                      },
                      {
                        title: 'SSI TRUST & CREDENTIAL STATE',
                        content: (
                          <Stack gap="xs">
                            <Group gap="xs" wrap="wrap">
                              <Badge
                                size="sm"
                                color={hasWallet ? 'green' : 'gray'}
                                variant={hasWallet ? 'light' : 'outline'}
                                leftSection={<IconWallet size={11} />}
                              >
                                {hasWallet ? 'Wallet Linked' : 'No Wallet – Notify via WhatsApp'}
                              </Badge>
                              <Badge
                                size="sm"
                                color={anyVc ? 'teal' : 'yellow'}
                                variant="light"
                                leftSection={<IconShieldCheck size={11} />}
                              >
                                {anyVc ? 'RemittanceAdviceVC Issued' : 'No VC Yet'}
                              </Badge>
                              <Badge size="sm" color={allAcknowledged ? 'teal' : 'gray'} variant="light">
                                {allAcknowledged ? '✓ All Acknowledged' : 'Pending Supplier Ack'}
                              </Badge>
                            </Group>
                            {lastPayment?.remittance_vc_id && (
                              <Group justify="space-between" align="center" wrap="nowrap">
                                <Text size="xs" c="dimmed" ff="monospace" style={{ minWidth: 0 }} truncate>
                                  Latest VC: {lastPayment.remittance_vc_id}
                                </Text>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="teal"
                                  onClick={() =>
                                    openCredentialArtifact({
                                      title: 'Latest Remittance Credential',
                                      credentialId: String(lastPayment.remittance_vc_id),
                                      credentialType: 'RemittanceAdviceVC',
                                      status: lastPayment.supplier_acknowledged_at ? 'acknowledged' : 'issued',
                                      issuedAt: lastPayment.paid_at || null,
                                      sourceRef: lastPayment.reference || lastPayment.id,
                                      counterpart: selectedApSupplier?.supplier_name || null,
                                      amount: Number(lastPayment.amount_paid || 0),
                                      currency: lastPayment.currency || 'USD',
                                      note: lastPayment.supplier_acknowledged_at
                                        ? 'Supplier acknowledgment recorded.'
                                        : 'Waiting for supplier acknowledgment.',
                                    })
                                  }
                                >
                                  View VC
                                </Button>
                              </Group>
                            )}
                          </Stack>
                        ),
                      },
                      {
                        title: 'VC ARTIFACT DRILLDOWN',
                        content:
                          paymentVcArtifacts.length === 0 ? (
                            <Text size="xs" c="dimmed">
                              No RemittanceAdviceVC artifacts are available yet for this supplier.
                            </Text>
                          ) : (
                            <Stack gap="xs">
                              {paymentVcArtifacts.map((artifact) => (
                                <Paper
                                  key={`${artifact.paymentId}-${artifact.credentialId}`}
                                  withBorder
                                  radius="md"
                                  p="xs"
                                >
                                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <Box style={{ minWidth: 0 }}>
                                      <Text size="xs" fw={700}>
                                        RemittanceAdviceVC · {artifact.paymentId}
                                      </Text>
                                      <Text size="10px" c="dimmed" ff="monospace" truncate>
                                        {artifact.credentialId}
                                      </Text>
                                      <Text size="10px" c="dimmed">
                                        Amount: {fmt(artifact.amount, artifact.currency)}
                                      </Text>
                                      <Text size="10px" c="dimmed">
                                        Issued:{' '}
                                        {artifact.issuedAt ? dayjs(artifact.issuedAt).format('D MMM YYYY HH:mm') : '—'}
                                      </Text>
                                    </Box>
                                    <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                                      <Badge size="xs" color={artifact.acknowledged ? 'teal' : 'gray'} variant="light">
                                        {artifact.acknowledged ? 'Acknowledged' : 'Pending Ack'}
                                      </Badge>
                                      <Button
                                        size="xs"
                                        variant="subtle"
                                        color="teal"
                                        onClick={() =>
                                          openCredentialArtifact({
                                            title: `Remittance VC · ${artifact.paymentId}`,
                                            credentialId: artifact.credentialId,
                                            credentialType: 'RemittanceAdviceVC',
                                            status: artifact.acknowledged ? 'acknowledged' : 'issued',
                                            issuedAt: artifact.issuedAt,
                                            sourceRef: artifact.sourceRef,
                                            counterpart: selectedApSupplier?.supplier_name || null,
                                            amount: artifact.amount,
                                            currency: artifact.currency,
                                            note: artifact.acknowledged
                                              ? 'Supplier acknowledgment has been captured for this credential.'
                                              : 'Supplier acknowledgment is still pending for this credential.',
                                          })
                                        }
                                      >
                                        Inspect VC Artifact
                                      </Button>
                                    </Stack>
                                  </Group>
                                </Paper>
                              ))}
                            </Stack>
                          ),
                      },
                      {
                        title: 'INVOICES',
                        content:
                          invoices.length === 0 ? (
                            <Text size="xs" c="dimmed">
                              No recorded invoices
                            </Text>
                          ) : (
                            <Stack gap="xs">
                              {invoices.map((inv: any) => (
                                <Card key={inv.id} radius="md" withBorder padding="xs">
                                  <Group justify="space-between" wrap="nowrap">
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                      <Text fw={600} size="xs">
                                        {inv.invoice_ref}
                                      </Text>
                                      {inv.description && (
                                        <Text size="xs" c="dimmed" truncate>
                                          {inv.description}
                                        </Text>
                                      )}
                                      <Text size="10px" c="dimmed">
                                        Due: {inv.due_date ? dayjs(inv.due_date).format('D MMM YYYY') : '—'}
                                      </Text>
                                    </Box>
                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                      <Text fw={700} size="sm">
                                        {fmt(inv.amount)}
                                      </Text>
                                      {inv.status !== 'paid' ? (
                                        <Button
                                          size="xs"
                                          color="indigo"
                                          variant="light"
                                          mt={4}
                                          onClick={() => {
                                            setApPaymentForm({
                                              apInvoiceId: inv.id,
                                              amountPaid: String(inv.balance_due),
                                              currency: inv.currency,
                                              paymentMethod: 'ecocash',
                                              reference: '',
                                              proofImageUrl: '',
                                            })
                                            setShowRecordApPayment(true)
                                          }}
                                        >
                                          Pay
                                        </Button>
                                      ) : (
                                        <Badge size="xs" color="green">
                                          Paid
                                        </Badge>
                                      )}
                                    </Box>
                                  </Group>
                                </Card>
                              ))}
                            </Stack>
                          ),
                      },
                      {
                        title: 'PAYMENTS & REMITTANCE VCs',
                        content:
                          payments.length === 0 ? (
                            <Text size="xs" c="dimmed">
                              No recorded payments
                            </Text>
                          ) : (
                            <Stack gap="xs">
                              {payments.map((pay: any) => (
                                <Card key={pay.id} radius="md" withBorder padding="xs">
                                  <Group justify="space-between" wrap="nowrap">
                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                      <Text fw={600} size="xs">
                                        {pay.id}
                                      </Text>
                                      <Text size="xs" c="dimmed">
                                        Method: {pay.payment_method}
                                      </Text>
                                      <Text size="10px" c="dimmed">
                                        Paid: {formatTxnTime(pay.paid_at)}
                                      </Text>
                                      {pay.remittance_vc_id && (
                                        <Group gap={6} mt={4} wrap="wrap">
                                          <Badge
                                            size="xs"
                                            color="teal"
                                            variant="light"
                                            leftSection={<IconShieldCheck size={9} />}
                                          >
                                            VC: {String(pay.remittance_vc_id).substring(0, 10)}…
                                          </Badge>
                                          <Button
                                            size="xs"
                                            variant="subtle"
                                            color="teal"
                                            leftSection={<IconExternalLink size={12} />}
                                            onClick={() =>
                                              openCredentialArtifact({
                                                title: `Remittance VC · ${pay.id}`,
                                                credentialId: String(pay.remittance_vc_id),
                                                credentialType: 'RemittanceAdviceVC',
                                                status: pay.supplier_acknowledged_at ? 'acknowledged' : 'issued',
                                                issuedAt: pay.paid_at || null,
                                                sourceRef: pay.reference || pay.id,
                                                counterpart: selectedApSupplier?.supplier_name || null,
                                                amount: Number(pay.amount_paid || 0),
                                                currency: pay.currency || 'USD',
                                                note: pay.supplier_acknowledged_at
                                                  ? 'Supplier acknowledgment already captured.'
                                                  : 'Supplier acknowledgment is still pending.',
                                              })
                                            }
                                          >
                                            Open VC Details
                                          </Button>
                                        </Group>
                                      )}
                                    </Box>
                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                      <Text fw={700} size="sm" c="green">
                                        {fmt(pay.amount_paid)}
                                      </Text>
                                      {pay.supplier_acknowledged_at ? (
                                        <Badge size="xs" color="teal" variant="light">
                                          ✓ Acknowledged
                                        </Badge>
                                      ) : (
                                        <Badge size="xs" color="gray" variant="light">
                                          Pending Ack
                                        </Badge>
                                      )}
                                    </Box>
                                  </Group>
                                </Card>
                              ))}
                            </Stack>
                          ),
                      },
                    ]}
                    auditItems={ssLifecycleItems}
                    auditEmptyText="No payment history yet"
                  />
                )
              })()
            ) : null}
          </Stack>
        )}
      </Drawer>

      {/* ── Record Supplier Invoice Drawer ── */}
      <Drawer
        opened={showRecordApInvoice}
        onClose={() => setShowRecordApInvoice(false)}
        position="bottom"
        size="auto"
        title="Record Supplier Invoice"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="sm" p="md">
          <TextInput
            label="Supplier"
            placeholder="Supplier name"
            value={apInvoiceForm.supplierName}
            onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, supplierName: e.currentTarget.value })}
            required
          />
          {apSuppliers.length > 0 && (
            <Select
              label="Or choose a saved supplier"
              placeholder="Select supplier"
              data={apSuppliers.map((s) => ({ value: s.id, label: s.supplier_name }))}
              value={selectedApSupplier?.id || null}
              onChange={(val) => {
                if (val) {
                  const found = apSuppliers.find((s) => s.id === val)
                  if (found) {
                    setSelectedApSupplier(found)
                    setApInvoiceForm((prev) => ({ ...prev, supplierName: found.supplier_name || '' }))
                  }
                }
              }}
            />
          )}
          <TextInput
            label="Invoice Reference"
            placeholder="e.g. INV-100234"
            value={apInvoiceForm.invoiceRef}
            onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, invoiceRef: e.currentTarget.value })}
            required
          />
          <TextInput
            label="Amount"
            placeholder="e.g. 150.00"
            type="number"
            value={apInvoiceForm.amount}
            onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, amount: e.currentTarget.value })}
            required
          />
          <Select
            label="Currency"
            data={['USD', 'ZWL', 'ZIG']}
            value={apInvoiceForm.currency}
            onChange={(val) => setApInvoiceForm({ ...apInvoiceForm, currency: val || 'USD' })}
          />
          <TextInput
            label="Description"
            placeholder="e.g. Concrete mix delivery"
            value={apInvoiceForm.description}
            onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, description: e.currentTarget.value })}
          />
          <TextInput
            label="Due Date"
            type="date"
            value={apInvoiceForm.dueDate}
            onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, dueDate: e.currentTarget.value })}
          />

          <Button
            color="indigo"
            size="md"
            mt="xs"
            loading={submittingApAction}
            onClick={async () => {
              if (!apInvoiceForm.supplierName.trim() && !selectedApSupplier?.id) {
                notifications.show({ title: 'Validation Alert', message: 'Enter the supplier name.', color: 'orange' })
                return
              }
              if (!apInvoiceForm.invoiceRef || !apInvoiceForm.amount) {
                notifications.show({
                  title: 'Validation Alert',
                  message: 'Reference and Amount are required.',
                  color: 'orange',
                })
                return
              }

              setSubmittingApAction(true)
              const token = getPreferredToken()
              try {
                let supplierId = selectedApSupplier?.id
                const named = apInvoiceForm.supplierName.trim()
                const savedName = String(selectedApSupplier?.supplier_name || '').trim()
                if (!supplierId || (named && named !== savedName)) {
                  const created = await api.post(
                    '/api/finance/ap/suppliers',
                    {
                      supplierName: named,
                    },
                    {
                      headers: { Authorization: `Bearer ${token}` },
                    },
                  )
                  supplierId = created.data?.id
                }
                await api.post(
                  '/api/finance/ap/invoices',
                  {
                    supplierId,
                    invoiceRef: apInvoiceForm.invoiceRef,
                    amount: parseFloat(apInvoiceForm.amount),
                    currency: apInvoiceForm.currency,
                    description: apInvoiceForm.description || undefined,
                    dueDate: apInvoiceForm.dueDate || undefined,
                  },
                  {
                    headers: { Authorization: `Bearer ${token}` },
                  },
                )
                notifications.show({
                  title: 'Invoice Recorded',
                  message: `Invoice ${apInvoiceForm.invoiceRef} registered successfully.`,
                  color: 'green',
                })
                setShowRecordApInvoice(false)
                fetchApSuppliers()
                fetchApWorkflowActions()
                if (selectedApSupplier?.id) fetchSupplierStatement(selectedApSupplier.id)
              } catch (err: any) {
                notifications.show({
                  title: 'Recording failed',
                  message: err.response?.data?.error || err.message,
                  color: 'red',
                })
              } finally {
                setSubmittingApAction(false)
              }
            }}
          >
            Submit Invoice
          </Button>
        </Stack>
      </Drawer>

      {/* ── Record Payment Drawer ── */}
      <Drawer
        opened={showRecordApPayment}
        onClose={() => setShowRecordApPayment(false)}
        position="bottom"
        size="auto"
        title="Record Supplier Payment"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="sm" p="md">
          <TextInput
            label="Amount Paid"
            placeholder="e.g. 100.00"
            type="number"
            value={apPaymentForm.amountPaid}
            onChange={(e) => setApPaymentForm({ ...apPaymentForm, amountPaid: e.currentTarget.value })}
            required
          />
          <Select
            label="Payment Method"
            data={[
              { value: 'ecocash', label: 'EcoCash' },
              { value: 'bank_transfer', label: 'Bank Transfer' },
              { value: 'cash', label: 'Cash' },
              { value: 'cheque', label: 'Cheque' },
              { value: 'other', label: 'Other' },
            ]}
            value={apPaymentForm.paymentMethod}
            onChange={(val) => setApPaymentForm({ ...apPaymentForm, paymentMethod: val || 'ecocash' })}
          />
          <TextInput
            label="Reference Number"
            placeholder="e.g. EcoCash txn id or Bank ref"
            value={apPaymentForm.reference}
            onChange={(e) => setApPaymentForm({ ...apPaymentForm, reference: e.currentTarget.value })}
          />
          <TextInput
            label="Proof Image URL (Optional)"
            placeholder="Image URL or attachment proof"
            value={apPaymentForm.proofImageUrl}
            onChange={(e) => setApPaymentForm({ ...apPaymentForm, proofImageUrl: e.currentTarget.value })}
          />

          <Button
            color="indigo"
            size="md"
            mt="xs"
            loading={submittingApAction}
            onClick={async () => {
              if (!apPaymentForm.amountPaid || !selectedApSupplier?.id) {
                notifications.show({ title: 'Validation Alert', message: 'Amount Paid is required.', color: 'orange' })
                return
              }

              setSubmittingApAction(true)
              const token = getPreferredToken()
              try {
                const deviceAssertion = await confirmWithDevice({
                purpose: 'record_payment',
                transaction: {
                  apInvoiceId: apPaymentForm.apInvoiceId,
                  amountPaid: parseFloat(apPaymentForm.amountPaid),
                  currency: apPaymentForm.currency,
                },
              })
              await api.post(
                  '/api/finance/ap/payments',
                  {
                    supplierId: selectedApSupplier.id,
                    apInvoiceId: apPaymentForm.apInvoiceId,
                    amountPaid: parseFloat(apPaymentForm.amountPaid),
                    currency: apPaymentForm.currency,
                    paymentMethod: apPaymentForm.paymentMethod,
                    reference: apPaymentForm.reference || undefined,
                    proofImageUrl: apPaymentForm.proofImageUrl || undefined,
                    ...(deviceAssertion ? { deviceAssertion } : {}),
                  },
                  {
                    headers: { Authorization: `Bearer ${token}` },
                  },
                )
                notifications.show({
                  title: 'Payment Recorded',
                  message: 'The payment has been successfully recorded and Remittance VC offered config queued.',
                  color: 'green',
                })
                setShowRecordApPayment(false)
                fetchApSuppliers()
                fetchApWorkflowActions()
                if (selectedApSupplier?.id) fetchSupplierStatement(selectedApSupplier.id)
              } catch (err: any) {
                notifications.show({
                  title: 'Recording failed',
                  message: err.response?.data?.error || err.message,
                  color: 'red',
                })
              } finally {
                setSubmittingApAction(false)
              }
            }}
          >
            Submit Payment & Issue VC
          </Button>
        </Stack>
      </Drawer>

      {/* ── Create Instalment Plan Drawer ── */}
      <Drawer
        opened={showCreatePlan}
        onClose={() => {
          setShowCreatePlan(false)
          setSelectedPlanContact(null)
        }}
        position="bottom"
        size="auto"
        title="New Instalment Plan"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
            Instalment plans generate scheduled payment links and notify the customer.
          </Alert>

          <ContactSelectField
            label="Link from Contacts (recommended)"
            placeholder="Select counterparty org/contact"
            description="Selecting a wallet-linked contact auto-syncs this plan into the payer org AP workflow."
            contacts={contacts}
            value={selectedPlanContact?.id || null}
            onChange={(contact) => {
              setSelectedPlanContact(contact)
              if (contact) {
                setPlanForm((prev) => ({
                  ...prev,
                  payerName: contact.name || prev.payerName,
                  payerPhone: contact.phone || prev.payerPhone,
                  payerEmail: contact.email || prev.payerEmail,
                }))
              }
            }}
          />

          <TextInput
            label="Customer / Payer Name"
            required
            placeholder="e.g. Tendai Hove"
            value={planForm.payerName}
            onChange={(e) => setPlanForm({ ...planForm, payerName: e.currentTarget.value })}
          />

          <Group grow>
            <TextInput
              label="Payer Phone (optional)"
              placeholder="e.g. +26377123456"
              value={planForm.payerPhone}
              onChange={(e) => setPlanForm({ ...planForm, payerPhone: e.currentTarget.value })}
            />
            <TextInput
              label="Payer Email (optional)"
              placeholder="e.g. tendai@example.com"
              value={planForm.payerEmail}
              onChange={(e) => setPlanForm({ ...planForm, payerEmail: e.currentTarget.value })}
            />
          </Group>

          <TextInput
            label="Plan Description"
            required
            placeholder="e.g. Annual Subscription, Solar Kit Plan..."
            value={planForm.description}
            onChange={(e) => setPlanForm({ ...planForm, description: e.currentTarget.value })}
          />

          <Group grow>
            <TextInput
              label="Total Amount"
              required
              type="number"
              min={0.01}
              step={0.01}
              placeholder="300.00"
              value={planForm.totalAmount}
              onChange={(e) => setPlanForm({ ...planForm, totalAmount: e.currentTarget.value })}
            />
            <Select
              label="Currency"
              value={planForm.currency}
              onChange={(v) => setPlanForm({ ...planForm, currency: v ?? 'USD' })}
              data={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWL', label: 'ZWL' },
                { value: 'ZIG', label: 'ZiG' },
              ]}
            />
          </Group>

          <Group grow>
            <Select
              label="Instalments Count"
              value={planForm.instalments}
              onChange={(v) => setPlanForm({ ...planForm, instalments: v ?? '3' })}
              data={[
                { value: '2', label: '2 payments' },
                { value: '3', label: '3 payments (default)' },
                { value: '4', label: '4 payments' },
                { value: '6', label: '6 payments' },
                { value: '12', label: '12 payments' },
              ]}
            />
            <Select
              label="Billing Cadence"
              value={planForm.cadence}
              onChange={(v) => setPlanForm({ ...planForm, cadence: v ?? 'monthly' })}
              data={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          </Group>

          <TextInput
            label="First Due Date"
            type="date"
            value={planForm.firstDueDate}
            onChange={(e) => setPlanForm({ ...planForm, firstDueDate: e.currentTarget.value })}
          />

          <Button
            fullWidth
            size="lg"
            color="blue"
            leftSection={<IconPlus size={18} />}
            onClick={handleCreatePlan}
            loading={creatingPlan}
            disabled={!planForm.description.trim() || !planForm.totalAmount || !planForm.payerName.trim()}
          >
            Create Plan & Queue Links
          </Button>
        </Stack>
      </Drawer>

      {/* ── Create Payment Link Drawer ── */}
      <Drawer
        opened={showCreate}
        onClose={() => setShowCreate(false)}
        position="bottom"
        size="auto"
        title={hasArCollections ? 'New AR Collection' : 'New Payment Link'}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
            {hasArCollections
              ? 'Create a one-time link, instalment plan, or recurring billing schedule — all tracked under Payments.'
              : 'Active links support in-app checkout, copy, and WhatsApp share actions.'}
          </Alert>

          {hasArCollections && (
            <SegmentedControl
              fullWidth
              value={form.collectionType}
              onChange={(v) => setForm({ ...form, collectionType: v })}
              data={[
                { value: 'one_time', label: 'One-Time' },
                { value: 'instalment', label: 'Instalment' },
                { value: 'recurring', label: 'Recurring' },
              ]}
            />
          )}

          <ContactSelectField
            label="Recipient Contact (optional)"
            placeholder="Select customer/client"
            description="Choose a contact to send this payment link directly to their inbox while still generating a public checkout link."
            contacts={contacts}
            value={selectedContact?.id || null}
            onChange={(contact) => {
              setSelectedContact(contact)
              if (contact) {
                setForm((prev) => ({
                  ...prev,
                  description: prev.description || `Payment for ${contact.name}`,
                }))
              }
            }}
          />

          <TextInput
            label="Description"
            required
            placeholder="e.g. Laptop repair, Invoice #42..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
          />

          <Group grow>
            <TextInput
              label="Amount"
              required
              type="number"
              min={0.01}
              step={0.01}
              placeholder="45.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.currentTarget.value })}
            />
            <Select
              label="Currency"
              value={form.currency}
              onChange={(v) => setForm({ ...form, currency: v ?? 'USD' })}
              data={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWL', label: 'ZWL' },
                { value: 'ZIG', label: 'ZiG' },
              ]}
            />
          </Group>

          {!hasArCollections && (
            <TextInput
              label="Business Name (optional)"
              placeholder="e.g. Chipo Electronics"
              value={form.merchantName}
              onChange={(e) => setForm({ ...form, merchantName: e.currentTarget.value })}
            />
          )}

          {!hasArCollections && (
            <TextInput
              label="Invoice Ref (optional)"
              placeholder="INV-2026-042"
              value={form.invoiceRef}
              onChange={(e) => setForm({ ...form, invoiceRef: e.currentTarget.value })}
            />
          )}

          {hasArCollections && (
            <>
              <TextInput
                label="Customer Name"
                placeholder="Full name of payer"
                value={form.payerName}
                onChange={(e) => setForm({ ...form, payerName: e.currentTarget.value })}
              />
              <TextInput
                label="Customer Phone (optional)"
                placeholder="+263..."
                value={form.payerPhone}
                onChange={(e) => setForm({ ...form, payerPhone: e.currentTarget.value })}
              />
            </>
          )}

          {hasArCollections && form.collectionType !== 'one_time' && (
            <>
              <Group grow>
                <NumberInput
                  label="Number of Instalments"
                  value={parseInt(form.instalments) || 3}
                  onChange={(v) => setForm({ ...form, instalments: String(v ?? 3) })}
                  min={2}
                  max={60}
                />
                {form.collectionType === 'recurring' && (
                  <Select
                    label="Cadence"
                    value={form.cadence}
                    onChange={(v) => setForm({ ...form, cadence: v ?? 'monthly' })}
                    data={[
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'monthly', label: 'Monthly' },
                    ]}
                  />
                )}
              </Group>
              <TextInput
                label="First Due Date"
                type="date"
                value={form.firstDueDate}
                onChange={(e) => setForm({ ...form, firstDueDate: e.currentTarget.value })}
              />
            </>
          )}

          {!hasArCollections && (
            <Select
              label="Expires in"
              value={form.expiryHours}
              onChange={(v) => setForm({ ...form, expiryHours: v ?? '336' })}
              data={[
                { value: '24', label: '24 hours' },
                { value: '48', label: '48 hours' },
                { value: '72', label: '72 hours' },
                { value: '168', label: '1 week' },
                { value: '336', label: '2 weeks (default)' },
              ]}
            />
          )}

          <Button
            fullWidth
            size="lg"
            leftSection={<IconPlus size={18} />}
            onClick={handleCreate}
            loading={creating}
            disabled={!form.description.trim() || !form.amount}
          >
            {hasArCollections
              ? form.collectionType === 'one_time'
                ? 'Create Payment Link'
                : form.collectionType === 'instalment'
                  ? 'Create Instalment Plan'
                  : 'Create Recurring Billing'
              : 'Create & Get Link'}
          </Button>
        </Stack>
      </Drawer>

      {/* ── Create Invoice Drawer ── */}
      <Drawer
        opened={showInvoice}
        onClose={() => setShowInvoice(false)}
        position="bottom"
        size="auto"
        title="New school fee"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          <TextInput
            label="Student name"
            required
            placeholder="Full student name"
            value={invoiceForm.studentName}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, studentName: e.currentTarget.value })}
          />
          <TextInput
            label="Student ID"
            required
            placeholder="STU-0001"
            value={invoiceForm.studentId}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, studentId: e.currentTarget.value })}
          />

          <Group grow>
            <Select
              label="Class / Grade"
              searchable
              placeholder="Select class or grade"
              value={invoiceForm.className || null}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, className: v ?? '' })}
              data={schoolClassGradeOptions}
            />
            <Select
              label="Term / Year"
              searchable
              placeholder="Select term and year"
              value={invoiceForm.term || null}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, term: v ?? '' })}
              data={schoolTermYearOptions}
            />
          </Group>

          <Group grow>
            <Select
              label="Fee type"
              value={invoiceForm.feeType}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, feeType: v ?? 'Tuition' })}
              data={['Tuition', 'Transport', 'Uniform', 'Books', 'Boarding', 'Examination', 'Other']}
            />
            <TextInput
              label="Amount"
              required
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              value={invoiceForm.amount}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.currentTarget.value })}
            />
            <Select
              label="Currency"
              value={invoiceForm.currency}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, currency: v ?? 'USD' })}
              data={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWL', label: 'ZWL' },
                { value: 'ZIG', label: 'ZiG' },
              ]}
            />
          </Group>

          <SegmentedControl
            fullWidth
            value={invoiceForm.paymentTerms}
            onChange={(v) => setInvoiceForm({ ...invoiceForm, paymentTerms: v })}
            data={[
              { value: 'one_time', label: 'One payment' },
              { value: 'instalment', label: 'Instalments' },
            ]}
          />
          {invoiceForm.paymentTerms !== 'one_time' && (
            <Group grow>
              <TextInput
                label="Instalments"
                type="number"
                min={2}
                max={12}
                value={invoiceForm.instalments}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, instalments: e.currentTarget.value })}
              />
              <Select
                label="Every"
                value={invoiceForm.paymentCadence}
                onChange={(v) => setInvoiceForm({ ...invoiceForm, paymentCadence: v ?? 'monthly' })}
                data={[
                  { value: 'weekly', label: 'Week' },
                  { value: 'monthly', label: 'Month' },
                  { value: 'quarterly', label: 'Quarter' },
                ]}
              />
              <TextInput
                label="First due"
                type="date"
                value={invoiceForm.firstDueDate}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, firstDueDate: e.currentTarget.value })}
              />
            </Group>
          )}

          <ContactSelectField
            label="Parent from your contacts (optional)"
            placeholder="Select a contact"
            description="Fills in the parent name and phone."
            contacts={contacts}
            value={selectedInvoiceContact?.id || null}
            onChange={(contact) => {
              setSelectedInvoiceContact(contact)
              if (contact) {
                setInvoiceForm((prev) => ({
                  ...prev,
                  parentName: contact.name || prev.parentName,
                  parentPhone: String((contact as any).phone || prev.parentPhone),
                }))
              }
            }}
          />
          <Group grow>
            <TextInput
              label="Parent name"
              placeholder="Rudo Moyo"
              value={invoiceForm.parentName}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, parentName: e.currentTarget.value })}
            />
            <TextInput
              label="Parent phone"
              required
              placeholder="0772 123 456"
              description="The pay link goes to this number."
              value={invoiceForm.parentPhone}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, parentPhone: e.currentTarget.value })}
            />
          </Group>

          <Button
            fullWidth
            size="lg"
            color="teal"
            leftSection={<IconReceipt size={18} />}
            onClick={handleCreateInvoice}
            loading={creatingInvoice}
            disabled={!invoiceForm.amount || !invoiceForm.studentName || !invoiceForm.parentPhone}
          >
            Send pay link
          </Button>
        </Stack>
      </Drawer>

      {/* ── School fee detail ── */}
      <Drawer
        opened={Boolean(selectedFeeRun)}
        onClose={() => setSelectedFeeRunId(null)}
        position="bottom"
        size="auto"
        title={selectedFeeRun ? schoolFeeTitle(selectedFeeRun) : 'School fee'}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        {selectedFeeRun && (
          <Stack gap="md" pb="lg">
            <Group gap="xs">
              <Badge color={schoolFeeStatusWords(selectedFeeRun).color}>
                {schoolFeeStatusWords(selectedFeeRun).label}
              </Badge>
              <Text fw={700}>
                {fmt(Number(selectedFeeRun.input?.amount || 0), String(selectedFeeRun.input?.currency || 'USD'))}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {[
                selectedFeeRun.input?.studentId,
                selectedFeeRun.input?.feeType,
                selectedFeeRun.input?.payerName,
                selectedFeeRun.input?.payerPhone,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Timeline
              active={schoolFeeProgress(selectedFeeRun).filter((step) => step.status === 'done').length - 1}
              bulletSize={20}
              lineWidth={2}
            >
              {schoolFeeProgress(selectedFeeRun).map((step) => (
                <Timeline.Item
                  key={step.key}
                  color={step.status === 'done' ? 'teal' : step.status === 'active' ? 'blue' : 'gray'}
                  bullet={
                    step.status === 'done' ? (
                      <IconCheck size={10} />
                    ) : step.status === 'active' ? (
                      <IconClock size={10} />
                    ) : undefined
                  }
                  title={
                    <Text size="sm" fw={step.status === 'active' ? 700 : 500}>
                      {step.label}
                    </Text>
                  }
                >
                  {step.at && (
                    <Text size="xs" c="dimmed">
                      {formatTxnTime(step.at)}
                    </Text>
                  )}
                  {(step.by || step.key === 'RECEIPT') && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Who:{' '}
                      {step.by ||
                        actorDisplay(actorForStage(feeStageActors, 'issue_receipt_vc'), {
                          stageAction: 'issue_receipt_vc',
                        })}
                    </Text>
                  )}
                </Timeline.Item>
              ))}
            </Timeline>
            {selectedFeeLink && selectedFeeRun.status !== 'completed' && (
              <Stack gap="xs" align="center">
                <QRCode value={selectedFeeLink} size={160} />
                <Group grow w="100%">
                  <CopyButton value={selectedFeeLink}>
                    {({ copied, copy }) => (
                      <Button
                        variant="light"
                        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        onClick={copy}
                      >
                        {copied ? 'Copied' : 'Copy pay link'}
                      </Button>
                    )}
                  </CopyButton>
                  <Button
                    variant="light"
                    color="green"
                    component="a"
                    href={`https://wa.me/?text=${encodeURIComponent(`School fees\n${schoolFeeTitle(selectedFeeRun)}\nPay here: ${selectedFeeLink}`)}`}
                    target="_blank"
                    leftSection={<IconBrandWhatsapp size={14} />}
                  >
                    WhatsApp
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        )}
      </Drawer>

      <Drawer
        opened={showRequisition}
        onClose={() => setShowRequisition(false)}
        position="bottom"
        size="auto"
        title="New Requisition Request"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          <Select
            label="Department"
            value={requisitionForm.department}
            onChange={(v) => setRequisitionForm({ ...requisitionForm, department: v ?? 'Operations' })}
            data={['HR', 'IT', 'Operations', 'Procurement', 'Finance', 'Marketing'].map((value) => ({
              value,
              label: value,
            }))}
          />

          <Select
            label="How will this be paid?"
            data={[
              { value: 'supplier', label: 'Buy from a supplier (purchase order on approval)' },
              { value: 'cash', label: 'Cash or petty cash (paid out on release, no purchase order)' },
            ]}
            value={requisitionForm.payWith}
            onChange={(val) =>
              setRequisitionForm({ ...requisitionForm, payWith: val === 'cash' ? 'cash' : 'supplier' })
            }
            allowDeselect={false}
            required
          />

          <Group grow>
            <Select
              label="What are you buying?"
              data={[
                { value: 'goods', label: 'Goods or materials' },
                { value: 'service', label: 'A service' },
              ]}
              value={requisitionForm.purchaseKind}
              onChange={(value) =>
                setRequisitionForm({ ...requisitionForm, purchaseKind: value === 'service' ? 'service' : 'goods' })
              }
            />
            <Select
              label={requisitionForm.purchaseKind === 'goods' ? 'Confirm delivery?' : 'Confirm the service?'}
              data={[
                { value: 'yes', label: 'Yes, before payment' },
                { value: 'no', label: 'No separate confirmation' },
              ]}
              value={requisitionForm.receivingRequired}
              onChange={(value) =>
                setRequisitionForm({ ...requisitionForm, receivingRequired: value === 'no' ? 'no' : 'yes' })
              }
            />
          </Group>

          {requisitionForm.payWith === 'supplier' && (
            <TextInput
              label="Supplier"
              placeholder="e.g. BuildMart"
              description="Who you are buying from. Leave empty if you do not know yet."
              value={requisitionForm.vendor}
              onChange={(e) => setRequisitionForm({ ...requisitionForm, vendor: e.currentTarget.value })}
            />
          )}

          <Group grow>
            <TextInput
              label="Amount"
              required
              type="number"
              min={0.01}
              step={0.01}
              value={requisitionForm.amount}
              onChange={(e) => setRequisitionForm({ ...requisitionForm, amount: e.currentTarget.value })}
            />
            <Select
              label="Currency"
              value={requisitionForm.currency}
              onChange={(v) => setRequisitionForm({ ...requisitionForm, currency: v ?? 'USD' })}
              data={[
                { value: 'USD', label: 'USD' },
                { value: 'ZWL', label: 'ZWL' },
                { value: 'ZIG', label: 'ZiG' },
              ]}
            />
          </Group>

          <TextInput
            label="What is it for?"
            placeholder="Say what you need and why"
            value={requisitionForm.notes}
            onChange={(e) => setRequisitionForm({ ...requisitionForm, notes: e.currentTarget.value })}
          />

          <Button
            fullWidth
            size="lg"
            color="indigo"
            leftSection={<IconPlus size={18} />}
            onClick={handleCreateRequisition}
            loading={creatingRequisition}
            disabled={!requisitionForm.amount}
          >
            Submit Requisition
          </Button>
        </Stack>
      </Drawer>

      <Drawer
        opened={showFieldRun}
        onClose={() => setShowFieldRun(false)}
        position="bottom"
        size="85%"
        title="New job"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="xl" px="xs">
          <Text size="sm" c="dimmed">
            Create a job and send it to the worker. The sign-off person is notified when the work is done.
          </Text>

          <TextInput
            label="What is the job?"
            placeholder="e.g. Site maintenance at SGK Construction"
            value={fieldRunForm.description}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, description: e.currentTarget.value })}
            required
          />

          <TextInput
            label="Client PO / store number (if provided)"
            placeholder="e.g. PO-2026-004"
            value={fieldRunForm.poNumber}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, poNumber: e.currentTarget.value })}
          />

          <Select
            label="Problem type"
            placeholder="Select a type"
            clearable
            data={['Plumbing', 'Electrical', 'Painting', 'HVAC', 'General maintenance', 'Other']}
            value={fieldRunForm.problemType}
            onChange={(value) => setFieldRunForm({ ...fieldRunForm, problemType: value || '' })}
          />

          <TextInput
            label="Client / site name"
            value={fieldRunForm.clientName}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, clientName: e.currentTarget.value })}
          />

          <details>
          <summary style={{ minHeight: 48, cursor: 'pointer', paddingTop: 12 }}>Client contact (optional)</summary>
          <TextInput
            label="Client mobile number"
            description="The client gets the bill, and any extra-work quote, as a text with a pay link. Leave empty if the client is billed another way."
            placeholder="e.g. 0771234567"
            type="tel"
            value={fieldRunForm.clientPhone}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, clientPhone: e.currentTarget.value })}
          />
          </details>

          <Grid gutter="sm">
            <Grid.Col span={8}>
              <TextInput
                label="Amount to invoice the client"
                description="Sent to the client as soon as the work is signed off."
                placeholder="0.00"
                type="number"
                value={fieldRunForm.amount}
                onChange={(e) => setFieldRunForm({ ...fieldRunForm, amount: e.currentTarget.value })}
                leftSection={
                  <Text size="xs" fw={700}>
                    $
                  </Text>
                }
                required
              />
            </Grid.Col>
            <Grid.Col span={4}>
              <Select
                label="Currency"
                data={['USD', 'ZiG']}
                value={fieldRunForm.currency}
                onChange={(val) => setFieldRunForm({ ...fieldRunForm, currency: val || 'USD' })}
              />
            </Grid.Col>
          </Grid>

          <details>
          <summary style={{ minHeight: 48, cursor: 'pointer', paddingTop: 12 }}>Payment schedule & worker payout</summary>
          <Stack gap="md" mt="sm">
          <Select
            label="How will the client pay?"
            description="The job can close after sign-off while later payments remain in Finance."
            data={[
              { value: 'one_time', label: 'One payment' },
              { value: 'instalment', label: 'A fixed number of instalments' },
              { value: 'recurring', label: 'Recurring payments' },
            ]}
            value={fieldRunForm.paymentTerms}
            onChange={(value) => setFieldRunForm({ ...fieldRunForm, paymentTerms: value || 'one_time' })}
          />
          {fieldRunForm.paymentTerms !== 'one_time' && (
            <Grid gutter="sm">
              <Grid.Col span={4}>
                <TextInput
                  label="Payments"
                  type="number"
                  min={2}
                  value={fieldRunForm.instalments}
                  onChange={(e) => setFieldRunForm({ ...fieldRunForm, instalments: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={8}>
                <Select
                  label="How often"
                  data={[
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'quarterly', label: 'Every three months' },
                  ]}
                  value={fieldRunForm.paymentCadence}
                  onChange={(value) => setFieldRunForm({ ...fieldRunForm, paymentCadence: value || 'monthly' })}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label="First payment due"
                  type="date"
                  value={fieldRunForm.firstDueDate}
                  onChange={(e) => setFieldRunForm({ ...fieldRunForm, firstDueDate: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label="First payment amount (optional)"
                  type="number"
                  min={0}
                  value={fieldRunForm.firstPaymentAmount}
                  onChange={(e) => setFieldRunForm({ ...fieldRunForm, firstPaymentAmount: e.currentTarget.value })}
                />
              </Grid.Col>
            </Grid>
          )}

          <TextInput
            label="Worker payout (optional)"
            description="Only for a subcontractor or a per-job worker. Leave empty for salaried staff: the job then closes after sign-off with no payout step."
            placeholder="0.00"
            type="number"
            value={fieldRunForm.payoutAmount}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, payoutAmount: e.currentTarget.value })}
            leftSection={
              <Text size="xs" fw={700}>
                $
              </Text>
            }
          />
          </Stack>
          </details>

          <TextInput
            label="Location"
            placeholder="e.g. 123 Samora Machel Ave"
            value={fieldRunForm.location}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, location: e.currentTarget.value })}
          />

          <TextInput
            label="Assigned vehicle (optional)"
            placeholder="Registration or fleet reference"
            value={fieldRunForm.vehicleReference}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, vehicleReference: e.currentTarget.value })}
          />
          <Checkbox
            label="Require a photo before work is covered"
            description="Adds an in-progress, location-sealed photo step for work that will be hidden."
            checked={fieldRunForm.requireConcealedWorkPhoto}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, requireConcealedWorkPhoto: e.currentTarget.checked })}
          />

          <TextInput
            label="Date"
            type="date"
            value={fieldRunForm.scheduledDate}
            onChange={(e) => setFieldRunForm({ ...fieldRunForm, scheduledDate: e.currentTarget.value })}
          />

          <Select
            label="Who goes out"
            description="Someone on the team is added if they are not already. An outside contact gets this job only, and only if they already have the app."
            value={fieldRunForm.assigneeId}
            onChange={(val) => setFieldRunForm({ ...fieldRunForm, assigneeId: val || 'stage-actor' })}
            data={[
              { value: 'stage-actor', label: 'Use the person already chosen' },
              ...memberSelectData(orgMembers),
              ...contacts
                .filter((contact) => contact.phone)
                .map((contact) =>
                  jobContactOption({
                    name: contact.name,
                    phone: contact.phone || '',
                    contactScope: contact.contactScope,
                  }),
                ),
            ]}
          />

          <Select
            label="Who checks the work"
            description="They review the finished work. Not the person who does the job."
            value={fieldRunForm.receiverId}
            onChange={(val) => setFieldRunForm({ ...fieldRunForm, receiverId: val || 'stage-actor' })}
            data={[
              { value: 'stage-actor', label: 'Use the person already chosen' },
              ...memberSelectData(orgMembers),
              ...contacts
                .filter((contact) => contact.phone)
                .map((contact) =>
                  jobContactOption({
                    name: contact.name,
                    phone: contact.phone || '',
                    contactScope: contact.contactScope,
                  }),
                ),
            ]}
          />

          <Button
            fullWidth
            size="lg"
            color="teal"
            mt="md"
            loading={creatingFieldRun}
            onClick={handleCreateFieldRun}
            disabled={!fieldRunForm.amount || !fieldRunForm.description}
          >
            Create job
          </Button>
        </Stack>
      </Drawer>

      <Modal
        opened={Boolean(checkpointRun)}
        onClose={() => setCheckpointRun(null)}
        title={(() => {
          const reason = getFieldPauseReason(checkpointRun)
          return reason === 'await_site_inspection'
            ? 'Site Inspection'
            : reason === 'await_risk_assessment'
              ? 'Risk Assessment'
              : reason === 'await_arrival'
                ? 'Confirm Arrival'
                : 'Review Finished Work'
        })()}
        centered
      >
        {checkpointRun &&
          (() => {
            const reason = getFieldPauseReason(checkpointRun)
            return (
              <Stack gap="sm">
                {reason === 'await_site_inspection' && (
                  <>
                    <Text size="sm" c="dimmed">
                      Check the site now you are there. A failed check keeps the job on hold.
                    </Text>
                    <Select
                      label="Outcome"
                      value={cpOutcome}
                      onChange={(v) => setCpOutcome(v || 'passed')}
                      data={[
                        { value: 'passed', label: 'Passed' },
                        { value: 'passed_with_notes', label: 'Passed with notes' },
                        { value: 'failed', label: 'Failed - hold the job' },
                      ]}
                    />
                    <Textarea
                      label="Findings"
                      value={cpFindings}
                      onChange={(e) => setCpFindings(e.currentTarget.value)}
                    />
                  </>
                )}
                {reason === 'await_risk_assessment' &&
                  (() => {
                    const priorHold = liveHoldOf(checkpointRun, 'risk_assessment', orgMembers)
                    const waitingForOrg = holdWaitsForOrganisation(priorHold)
                    return (
                      <>
                        <Text size="sm" c="dimmed">
                          Check the hazards before any work. Choose on purpose: if it is not safe, the job goes on hold
                          and your organisation is told.
                        </Text>
                        {priorHold && (
                          <Alert
                            color={priorHold.status === 'resolved' ? 'blue' : 'orange'}
                            variant="light"
                            title={SAFETY_HOLD_COPY.sectionTitle}
                          >
                            <Text size="sm">{priorHold.reason}</Text>
                            <Text size="xs" c="dimmed">
                              {
                                safetyHoldStateWords(priorHold.status, 'worker', {
                                  resolvedBy: priorHold.resolvedBy,
                                  fixBy: priorHold.fixBy,
                                }).line
                              }
                            </Text>
                            {priorHold.resolutionNote && (
                              <Text size="xs" c="dimmed">
                                What was done: {priorHold.resolutionNote}
                              </Text>
                            )}
                            {waitingForOrg && (
                              <Text size="xs" fw={600} mt={4}>
                                {SAFETY_HOLD_COPY.waitingHelp}
                              </Text>
                            )}
                          </Alert>
                        )}
                        <Textarea
                          label={SAFETY_HOLD_COPY.hazardsLabel}
                          description={SAFETY_HOLD_COPY.hazardsHelp}
                          value={cpHazards}
                          onChange={(e) => setCpHazards(e.currentTarget.value)}
                        />
                        <SegmentedControl
                          fullWidth
                          value={cpDecision}
                          onChange={(value) => setCpDecision(value as 'safe' | 'not_safe')}
                          data={[
                            { value: 'safe', label: SAFETY_HOLD_COPY.choiceSafe },
                            { value: 'not_safe', label: SAFETY_HOLD_COPY.choiceNotSafe },
                          ]}
                          color={cpDecision === 'not_safe' ? 'orange' : 'green'}
                        />
                        {!cpDecision && (
                          <Text size="xs" c="dimmed">
                            Pick one. Leaving it blank does not put the job on hold.
                          </Text>
                        )}
                        {cpDecision === 'safe' && waitingForOrg && (
                          <Alert color="orange" variant="light" title={SAFETY_HOLD_COPY.waitingButton}>
                            <Text size="sm">{SAFETY_HOLD_COPY.waitingHelp}</Text>
                          </Alert>
                        )}
                        {cpDecision === 'safe' && !waitingForOrg && (
                          <>
                            <Textarea
                              label="What you did to make it safe (optional)"
                              value={cpControls}
                              onChange={(e) => setCpControls(e.currentTarget.value)}
                            />
                            <Checkbox
                              label="I have the protective equipment this job needs"
                              checked={cpPpe}
                              onChange={(e) => setCpPpe(e.currentTarget.checked)}
                            />
                            {priorHold && (
                              <Textarea
                                label={SAFETY_HOLD_COPY.whatChangedLabel}
                                required
                                placeholder="For example: the live wire was isolated by the site electrician"
                                value={cpWhatChanged}
                                onChange={(e) => setCpWhatChanged(e.currentTarget.value)}
                              />
                            )}
                          </>
                        )}
                        {cpDecision === 'not_safe' && (
                          <>
                            <Textarea
                              label={SAFETY_HOLD_COPY.reasonLabel}
                              description={SAFETY_HOLD_COPY.reasonHelp}
                              required
                              placeholder={SAFETY_HOLD_COPY.reasonPlaceholder}
                              value={cpHoldReason}
                              onChange={(e) => setCpHoldReason(e.currentTarget.value)}
                            />
                            <Radio.Group
                              label={SAFETY_HOLD_COPY.fixByLabel}
                              description={SAFETY_HOLD_COPY.fixByHelp}
                              value={cpFixBy}
                              onChange={(value) => setCpFixBy(value === 'worker' ? 'worker' : 'organisation')}
                            >
                              <Stack gap={6} mt={6}>
                                <Radio value="organisation" label={SAFETY_HOLD_COPY.fixByOrganisation} />
                                <Radio value="worker" label={SAFETY_HOLD_COPY.fixByWorker} />
                              </Stack>
                            </Radio.Group>
                            <Text size="sm">{SAFETY_HOLD_COPY.photoLabel}</Text>
                            {cpHoldPhoto ? (
                              <Group gap="sm" align="center">
                                <Image src={cpHoldPhoto.photoUri} alt="Hazard" w={64} h={64} radius="sm" fit="cover" />
                                <Button
                                  size="xs"
                                  variant="light"
                                  loading={cpPhotoBusy}
                                  onClick={() => void handleTakeHoldPhoto()}
                                >
                                  Retake
                                </Button>
                              </Group>
                            ) : (
                              <Button
                                variant="light"
                                leftSection={<IconCamera size={16} />}
                                loading={cpPhotoBusy}
                                onClick={() => void handleTakeHoldPhoto()}
                              >
                                Take the photo
                              </Button>
                            )}
                          </>
                        )}
                      </>
                    )
                  })()}
                {reason === 'await_arrival' && (
                  <>
                    <Text size="sm" c="dimmed">
                      Share your location to confirm you are on site, or enter the site code.
                    </Text>
                    <TextInput
                      label="Site code (optional)"
                      value={cpSiteCode}
                      onChange={(e) => setCpSiteCode(e.currentTarget.value)}
                    />
                  </>
                )}
                {reason === 'await_completion_review' && (
                  <>
                    <Text size="sm" c="dimmed">
                      Check the AFTER photos and receipts. Approve to release customer sign-off.
                    </Text>
                    <Select
                      label="Outcome"
                      value={cpOutcome}
                      onChange={(v) => setCpOutcome(v || 'approved')}
                      data={[
                        { value: 'approved', label: 'Approved' },
                        { value: 'approved_with_notes', label: 'Approved with notes' },
                        { value: 'rework_required', label: 'Rework required - hold the job' },
                      ]}
                    />
                    <Textarea label="Notes" value={cpFindings} onChange={(e) => setCpFindings(e.currentTarget.value)} />
                  </>
                )}
                {(() => {
                  const isSafety = reason === 'await_risk_assessment'
                  const priorHold = isSafety ? liveHoldOf(checkpointRun, 'risk_assessment', orgMembers) : undefined
                  const safetyReady =
                    !isSafety ||
                    (cpDecision === 'safe' &&
                      cpPpe &&
                      !holdWaitsForOrganisation(priorHold) &&
                      (!priorHold || Boolean(cpWhatChanged.trim()))) ||
                    (cpDecision === 'not_safe' && Boolean(cpHoldReason.trim()) && Boolean(cpHoldPhoto))
                  return (
                    <Button
                      fullWidth
                      color={isSafety && cpDecision === 'not_safe' ? 'orange' : undefined}
                      loading={feptActionLoading}
                      disabled={!safetyReady}
                      onClick={handleSubmitFieldCheckpoint}
                    >
                      {reason === 'await_arrival'
                        ? 'Share location & confirm'
                        : isSafety
                          ? cpDecision === 'not_safe'
                            ? SAFETY_HOLD_COPY.submitHold
                            : SAFETY_HOLD_COPY.submitSafe
                          : 'Submit'}
                    </Button>
                  )
                })()}
              </Stack>
            )
          })()}
      </Modal>

      {(() => {
        if (String(router.query.tab || '').toLowerCase() !== 'field' || selectedFieldRun) return null
        const pendingRunId = normalizeRunId(
          typeof router.query.runId === 'string'
            ? router.query.runId
            : typeof router.query.requestId === 'string'
              ? router.query.requestId
              : null,
        )
        if (!pendingRunId || fieldDeepLinkFailed === pendingRunId) return null
        return (
          <Box
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              background: 'var(--mantine-color-body)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <Stack align="center" gap="sm" maw={320}>
              <Loader size="md" />
              <Text fw={600}>Opening the job…</Text>
              <Text size="sm" c="dimmed" ta="center">
                Loading the job details and its steps. This can take a few seconds on a slow connection.
              </Text>
              <Button variant="subtle" size="xs" onClick={() => { if (!returnToInbox()) setFieldDeepLinkFailed(pendingRunId) }}>
                Back to inbox
              </Button>
            </Stack>
          </Box>
        )
      })()}

      {/* ── FEPT Field Run Detail Drawer (independent from requisitions) ── */}
      <Drawer
        opened={Boolean(selectedFieldRun)}
        onClose={() => {
          if (returnToInbox()) return
          setSelectedFieldRun(null)
          setFieldJobTab('details')
          if (window.history.state?.credentisSheet) return
          if (!router.query.runId && !router.query.requestId) return
          const nextQuery = { ...router.query } as Record<string, string | string[]>
          delete nextQuery.runId
          delete nextQuery.requestId
          void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true })
        }}
        position="bottom"
        size="auto"
        title={(() => {
          const heading = jobHeading(selectedFieldRun?.output?.workflowInput || selectedFieldRun?.input)
          if (!selectedFieldRun) return 'Job details'
          return (
            <Stack gap={0}>
              <Text fw={700} size="sm" lineClamp={2}>
                {heading.title}
              </Text>
              {heading.detail ? (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {heading.detail}
                </Text>
              ) : null}
            </Stack>
          )
        })()}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        {selectedFieldRun &&
          (() => {
            const run = selectedFieldRun
            const stage = String(run.output?.workflowStage || run.output?.stage || run.status || '').toUpperCase()
            const input = run.output?.workflowInput || run.input || {}
            const stageLabel = fieldJobStatusLabel(run.status, stage, run.output?.pauseReason)
            const runRef = input.poNumber || input.reference || run.id
            const isTerminal = new Set(['COMPLETED', 'CANCELLED', 'REVOKED', 'DISPUTED']).has(stage)
            const pauseReason = getFieldPauseReason(run)
            const myRole = String(getOrgRoleClaim() || '').toLowerCase()
            const isOrgAdmin = ['owner', 'admin'].includes(myRole)
            const myUserId = currentUserId()
            const assigneeId = String(run.output?.assignment?.assigneeId || input.assigneeId || '')
            // The worker does the field steps; a different person signs off and releases payment.
            const isWorker = Boolean(myUserId) && assigneeId === myUserId
            const canDoFieldSteps = isWorker || (!assigneeId && isOrgAdmin)
            const canSignOff = isOrgAdmin || (Boolean(myUserId) && String(input.receiverId || '') === myUserId)
            const canReleasePayout = isOrgAdmin || ['finance_manager', 'accountant', 'approver'].includes(myRole)
            // The people chosen under "Who does what" may do their own step from their phone.
            const isChosenFor = (stageAction: string) => {
              const actor = fieldStageActors.find((item) => item.stageAction === stageAction)?.actor
              if (!actor || !myUserId) return false
              if (actor.userId) return actor.userId === myUserId
              return Boolean(actor.role) && String(actor.role).toLowerCase() === myRole
            }
            const canReview = isOrgAdmin || canSignOff || isChosenFor('review_completion')
            const canInspect = canDoFieldSteps || isOrgAdmin || isChosenFor('inspect_site')
            const canReassign = !isTerminal && String(run.status || '').toLowerCase() === 'paused' && isOrgAdmin
            // A hold is only live while the checkpoint that raised it is still open (same rule as the audit trail).
            const allHolds = buildJobAuditTrail(run, orgMembers).holds
            const activeHold = [...allHolds].reverse().find((hold) => holdIsLive(hold.status)) || null
            const safetyHoldCount = allHolds.filter((hold) => hold.checkpoint === 'risk_assessment').length
            const canResolveHold =
              Boolean(activeHold) &&
              activeHold?.status === 'open' &&
              activeHold?.checkpoint === 'risk_assessment' &&
              (isOrgAdmin || isChosenFor('resolve_safety_hold')) &&
              !(Boolean(myUserId) && activeHold?.byUserId === myUserId && !isOrgAdmin)
            const stepsHeld = Boolean(heldRuns[String(run.id)])
            const amount = Number.isFinite(Number(input.amount))
              ? Number(input.amount)
              : Number.isFinite(Number(input.budget))
                ? Number(input.budget)
                : 0
            const currency = String(input.currency || 'USD').trim() || 'USD'
            const memberNames = Object.fromEntries(orgMembers.map((member) => [member.userId, personName(member)]))
            const actingAsOrg = getContextMode() === 'org'
            const assigneeLabel = memberNames[assigneeId] || ''
            const genericAssignee = !assigneeLabel || /^(organization owner|team member)$/i.test(assigneeLabel)
            const waitingWho =
              !actingAsOrg && isWorker ? 'You' : genericAssignee ? 'The person assigned' : assigneeLabel
            const childWait = handoffWaitingLine(run?.output?.handoffs)
            const pauseLine = (stepsHeld && childWait?.line) || fieldPauseLine(pauseReason, waitingWho)
            const knownPause = Boolean(pauseLine)
            const reassignOptions = [
              ...memberSelectData(orgMembers, 'member:'),
              ...contacts
                .filter((contact) => contact.phone)
                .map((contact) =>
                  jobContactOption({
                    name: contact.name,
                    phone: contact.phone || '',
                    contactScope: contact.contactScope,
                  }),
                ),
            ]
            return (
              <WorkflowDetailBody
                statusCard={<DetailStatusCard status={stageLabel} amount={amount} currency={currency} lines={[]} />}
                sections={[
                  {
                    title: 'WORKFLOW ACTIONS',
                    content: (
                      <>
                        {run.output?.clientBill && run.output.clientBill.kind !== 'quote' && (
                          <Button
                            mb="sm"
                            variant="light"
                            onClick={() => {
                              void openClientBilling(run)
                            }}
                          >
                            Open client billing details
                          </Button>
                        )}
                        {!isTerminal && (
                          <>
                            {knownPause && (
                              <Alert
                                color="blue"
                                variant="light"
                                style={childWait?.requestId ? { cursor: 'pointer' } : undefined}
                                onClick={
                                  childWait?.requestId
                                    ? () => {
                                        const links = handoffLinks(run.output?.handoffs)
                                        const link = links.find((item) => item.id === childWait.requestId)
                                        if (link) openRelatedWork(link, links)
                                      }
                                    : undefined
                                }
                              >
                                Waiting for: {pauseLine}
                              </Alert>
                            )}
                            {activeHold &&
                              (() => {
                                const viewer = isWorker ? 'worker' : 'org'
                                const words = safetyHoldStateWords(activeHold.status, viewer, {
                                  by: activeHold.by,
                                  resolvedBy: activeHold.resolvedBy,
                                  fixBy: activeHold.fixBy,
                                })
                                return (
                                  <Alert
                                    color={words.color}
                                    variant="light"
                                    title={
                                      activeHold.checkpoint === 'risk_assessment'
                                        ? `${SAFETY_HOLD_COPY.sectionTitle} · ${words.label}`
                                        : 'Job on hold'
                                    }
                                  >
                                    <Group align="flex-start" wrap="nowrap" gap="sm">
                                      {activeHold.photo && (
                                        <Image
                                          src={activeHold.photo}
                                          alt="What made the job unsafe"
                                          w={64}
                                          h={64}
                                          radius="sm"
                                          fit="cover"
                                        />
                                      )}
                                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                        <Text size="sm">{activeHold.reason}</Text>
                                        <Text size="xs" c="dimmed">
                                          {activeHold.by ? `Raised by ${activeHold.by}` : 'Raised'}
                                          {activeHold.at ? ` · ${dayjs(activeHold.at).format('D MMM HH:mm')}` : ''}
                                          {activeHold.checkpoint === 'risk_assessment' && safetyHoldCount > 1
                                            ? ` · ${holdCountWords(safetyHoldCount)}`
                                            : ''}
                                        </Text>
                                        {activeHold.resolutionNote && (
                                          <Text size="xs" c="dimmed">
                                            What was done: {activeHold.resolutionNote}
                                          </Text>
                                        )}
                                        <Text size="xs">{words.line}</Text>
                                      </Stack>
                                    </Group>
                                    {canResolveHold && activeHold.id && (
                                      <Stack gap="xs" mt="sm">
                                        <Text size="xs" c="dimmed">
                                          {SAFETY_HOLD_COPY.resolveHelp}
                                        </Text>
                                        <Textarea
                                          label={SAFETY_HOLD_COPY.resolveNoteLabel}
                                          size="xs"
                                          placeholder="For example: site electrician isolated the supply at 14:10"
                                          value={holdResolveNote}
                                          onChange={(e) => setHoldResolveNote(e.currentTarget.value)}
                                        />
                                        <Button
                                          size="xs"
                                          color="blue"
                                          variant="light"
                                          loading={feptActionLoading}
                                          disabled={!holdResolveNote.trim()}
                                          onClick={() =>
                                            void handleResolveSafetyHold(String(run.id), String(activeHold.id))
                                          }
                                        >
                                          {SAFETY_HOLD_COPY.resolveButton}
                                        </Button>
                                      </Stack>
                                    )}
                                  </Alert>
                                )
                              })()}
                            {String(run.status || '').toLowerCase() === 'failed' && (
                              <Alert color="red" variant="light" title="This job stopped on an error">
                                <Text size="sm">{String(run.error || 'Something went wrong on the last step.')}</Text>
                                {isOrgAdmin && (
                                  <Button
                                    size="xs"
                                    mt="sm"
                                    color="red"
                                    variant="light"
                                    loading={feptActionLoading}
                                    onClick={() => void handleRetryFieldRun(String(run.id))}
                                  >
                                    Try again from where it stopped
                                  </Button>
                                )}
                              </Alert>
                            )}
                          </>
                        )}
                        {!isTerminal && (
                          <Stack gap="xs">
                            {canDoFieldSteps &&
                              stage === 'ASSIGNED' &&
                              (!knownPause || pauseReason === 'await_worker_start') && (
                                <Button
                                  color="green"
                                  leftSection={<IconPlayerPlay size={16} />}
                                  loading={feptActionLoading}
                                  disabled={stepsHeld}
                                  onClick={() => handleStartFieldRun(run.id)}
                                >
                                  Start job
                                </Button>
                              )}
                            {/* The safety check is the worker's own call on site; the office resolves holds but never passes the check. */}
                            {FIELD_CHECKPOINT_PAUSES.has(pauseReason) &&
                              (pauseReason === 'await_completion_review'
                                ? canReview
                                : pauseReason === 'await_site_inspection'
                                  ? canInspect
                                  : pauseReason === 'await_risk_assessment'
                                    ? canDoFieldSteps
                                    : canDoFieldSteps || isOrgAdmin) &&
                              (pauseReason === 'await_risk_assessment' && holdWaitsForOrganisation(activeHold) ? (
                                <Stack gap={4}>
                                  <Button
                                    color="gray"
                                    variant="light"
                                    leftSection={<IconShieldCheck size={16} />}
                                    disabled
                                  >
                                    {SAFETY_HOLD_COPY.waitingButton}
                                  </Button>
                                  <Text size="xs" c="dimmed" ta="center">
                                    {SAFETY_HOLD_COPY.waitingHelp}
                                  </Text>
                                </Stack>
                              ) : (
                                <Button
                                  color="violet"
                                  leftSection={<IconShieldCheck size={16} />}
                                  loading={feptActionLoading}
                                  disabled={stepsHeld}
                                  onClick={() => openFieldCheckpoint(run)}
                                >
                                  {pauseReason === 'await_site_inspection'
                                    ? 'Record site inspection'
                                    : pauseReason === 'await_risk_assessment'
                                      ? activeHold?.checkpoint === 'risk_assessment'
                                        ? SAFETY_HOLD_COPY.redoButton
                                        : 'Do the safety check'
                                      : pauseReason === 'await_arrival'
                                        ? 'Confirm arrival'
                                        : 'Review the finished work'}
                                </Button>
                              ))}
                            {canDoFieldSteps &&
                              (stage === 'IN_PROGRESS' || stage === 'EVIDENCE_CAPTURED') &&
                              (['await_evidence_before', 'await_evidence_concealed', 'await_evidence_after', 'await_evidence_receipt'].includes(
                                pauseReason,
                              ) ||
                                (stage === 'IN_PROGRESS' && !knownPause)) && (
                                <Button
                                  color="orange"
                                  leftSection={<IconCamera size={16} />}
                                  loading={feptActionLoading}
                                  disabled={stepsHeld}
                                  onClick={() => handleCaptureFieldEvidence(run)}
                                >
                                  {pauseReason === 'await_evidence_receipt'
                                    ? 'Add receipts for materials'
                                    : pauseReason === 'await_evidence_concealed'
                                      ? 'Photo work before it is covered'
                                    : pauseReason === 'await_evidence_after'
                                      ? 'Work done – take after photos'
                                      : pauseReason === 'await_evidence_before'
                                        ? 'Take before photos'
                                        : inferNextEvidencePhase(run) === 'before'
                                          ? 'Take before photos'
                                          : inferNextEvidencePhase(run) === 'concealed'
                                            ? 'Photo work before it is covered'
                                          : inferNextEvidencePhase(run) === 'after'
                                            ? 'Take after photos'
                                            : 'Add receipts for materials'}
                                </Button>
                              )}
                            {canDoFieldSteps &&
                              pauseReason === 'await_evidence_receipt' &&
                              purchaseReceiptsFromHandoffs(run?.output?.handoffs).length > 0 && (
                                <Button
                                  color="teal"
                                  variant="light"
                                  loading={feptActionLoading}
                                  disabled={stepsHeld}
                                  onClick={() => handleNoMaterialsBought(run, 'purchase')}
                                >
                                  Use the purchase receipts (
                                  {purchaseReceiptsFromHandoffs(run?.output?.handoffs).length})
                                </Button>
                              )}
                            {canDoFieldSteps && pauseReason === 'await_evidence_receipt' && (
                              <Button
                                variant="light"
                                color="gray"
                                loading={feptActionLoading}
                                disabled={stepsHeld}
                                onClick={() => handleNoMaterialsBought(run)}
                              >
                                No materials bought – carry on
                              </Button>
                            )}
                            {pauseReason === 'await_acknowledgement' && canSignOff && (
                              <Button
                                color="teal"
                                leftSection={<IconWallet size={16} />}
                                loading={fieldProofCreating && fieldProofStage === 'acknowledgement'}
                                disabled={stepsHeld}
                                onClick={() => openFieldProof(run.id, 'acknowledgement')}
                              >
                                Sign off job
                              </Button>
                            )}
                            {pauseReason === 'await_payout_release' && canReleasePayout && (
                              <Button
                                color="yellow"
                                leftSection={<IconWallet size={16} />}
                                loading={fieldProofCreating && fieldProofStage === 'payout'}
                                disabled={stepsHeld}
                                onClick={() => openFieldProof(run.id, 'payout')}
                              >
                                Release worker payout
                              </Button>
                            )}
                            {!canDoFieldSteps &&
                              [
                                'await_worker_start',
                                'await_arrival',
                                'await_risk_assessment',
                                'await_evidence_before',
                                'await_evidence_concealed',
                                'await_evidence_after',
                                'await_evidence_receipt',
                              ].includes(pauseReason) && (
                                <Text size="xs" c="dimmed">
                                  The assigned worker does this step from their phone.
                                </Text>
                              )}
                            {pauseReason === 'await_acknowledgement' && !canSignOff && (
                              <Text size="xs" c="dimmed">
                                The sign-off person confirms this step from their wallet.
                              </Text>
                            )}
                            {pauseReason === 'await_payout_release' && !canReleasePayout && (
                              <Text size="xs" c="dimmed">
                                The money person releases the worker payout from their wallet.
                              </Text>
                            )}
                          </Stack>
                        )}
                        {run?.id && (
                          <JobHandoffsPanel
                            runId={String(run.id)}
                            refreshKey={`${run.status}:${pauseReason}:${String(run.updatedAt || '')}`}
                            onChanged={() => void fetchFieldRuns()}
                            onHoldChange={(held) => markRunHeld(String(run.id), held)}
                            onOpenBilling={() => void openClientBilling(run)}
                          />
                        )}
                        {isTerminal && (
                          <Alert color="gray" variant="light">
                            This job is closed. There is nothing more to do here.
                          </Alert>
                        )}
                      </>
                    ),
                  },
                  {
                    title: '',
                    content: (
                      <JobEvidenceTabs
                        run={run}
                        orgMembers={orgMembers}
                        actors={fieldStageActors as JobActorStage[]}
                        assigneeName={genericAssignee ? undefined : assigneeLabel}
                        tab={fieldJobTab}
                        onTab={setFieldJobTab}
                        onRefresh={async () => {
                          const fresh = await api.get(`/workflows/runs/${encodeURIComponent(run.id)}`)
                          setSelectedFieldRun(fresh.data)
                          await fetchFieldRuns()
                        }}
                        details={
                          <Stack gap="sm">
                            <Box>
                              <Text size="sm" c="dimmed">
                                Client
                              </Text>
                              <Text size="sm">{input.clientName || 'N/A'}</Text>
                            </Box>
                            <Box>
                              <Text size="sm" c="dimmed">
                                Location
                              </Text>
                              <Group gap={6} wrap="nowrap">
                                <IconMapPin size={16} />
                                <Text size="sm">{input.location || 'N/A'}</Text>
                              </Group>
                            </Box>
                            <Box>
                              <Text size="sm" c="dimmed">
                                What needs doing
                              </Text>
                              <Text size="sm">{input.description || 'N/A'}</Text>
                            </Box>
                            <Box>
                              <Text size="sm" c="dimmed">
                                Field worker
                              </Text>
                              <Group gap={6} wrap="nowrap">
                                <IconUser size={16} />
                                <Text size="sm">
                                  {!assigneeId ? 'Nobody yet' : genericAssignee ? 'The person assigned' : assigneeLabel}
                                </Text>
                              </Group>
                            </Box>
                            <Box>
                              <Text size="sm" c="dimmed">
                                Scheduled date
                              </Text>
                              <Group gap={6} wrap="nowrap">
                                <IconCalendar size={16} />
                                <Text size="sm">{input.scheduledDate || 'N/A'}</Text>
                              </Group>
                            </Box>
                            {runRef && runRef !== String(run.id || '') && (
                              <Box>
                                <Text size="sm" c="dimmed">
                                  Reference
                                </Text>
                                <Text size="sm">{runRef}</Text>
                              </Box>
                            )}
                            {(run.output?.ack || run.output?.payment?.status === 'triggered') && (
                              <Box>
                                <Text size="sm" fw={600}>
                                  Sign-off and payment
                                </Text>
                                {run.output?.ack && (
                                  <Text size="sm" mt={4}>
                                    Signed off{' '}
                                    {run.output.ack.acknowledgedAt ? formatTxnTime(run.output.ack.acknowledgedAt) : ''}
                                    {run.output.ack.isVerifiable ? ' · Confirmed from wallet' : ''}
                                  </Text>
                                )}
                                {run.output?.payment?.status === 'triggered' && (
                                  <Text size="sm">
                                    Worker payout released
                                    {run.output.payment.amount
                                      ? ` · ${run.output.payment.currency || ''} ${run.output.payment.amount}`
                                      : ''}
                                    {run.output.payment.isVerifiable ? ' · Confirmed from wallet' : ''}
                                  </Text>
                                )}
                              </Box>
                            )}
                            {canReassign && (
                              <Stack gap="sm">
                                <Select
                                  label="Move this job to someone else"
                                  value={fieldReassignAssigneeId}
                                  onChange={(val) => setFieldReassignAssigneeId(val || '')}
                                  data={reassignOptions}
                                  placeholder="Choose a team member"
                                  description="The job card moves to them; the current step stays where it is."
                                />
                                <Button
                                  fullWidth
                                  variant="outline"
                                  color="grape"
                                  leftSection={<IconUsers size={16} />}
                                  loading={feptActionLoading}
                                  onClick={() => handleReassignFieldTask(run.id, fieldReassignAssigneeId)}
                                >
                                  Move job
                                </Button>
                              </Stack>
                            )}
                          </Stack>
                        }
                      />
                    ),
                  },
                ]}
                auditItems={[]}
                auditEmptyText=""
                showHistory={false}
              />
            )
          })()}
      </Drawer>

      <Drawer
        opened={Boolean(chainRequest || historyItem)}
        onClose={() => {
          if (returnToInbox()) return
          setChainRequest(null)
          setHistoryItem(null)
          setChainDecisionReason('')
        }}
        position="bottom"
        size="90%"
        title={historyItem?.title || chainHistoryTitle(chainRequest)}
        radius="lg"
      >
        {(chainRequest || historyItem) && (
          <Stack gap="md">
          {chainRequest && (
            <DetailStatusCard
              status={requestStatusWords(chainRequest.status).label}
              amount={chainRequest.amount}
              currency={chainRequest.currency}
              lines={chainRequest.description ? [{ text: chainRequest.description }] : []}
            />
          )}
          {chainRequest && ['submitted', 'in_review'].includes(String(chainRequest.status || '').toLowerCase()) && (
            <Paper withBorder radius="md" p="sm">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={700}>Current step</Text>
                  <Badge color="blue" variant="light">{chainRequest.decision?.stageLabel || 'Review and decide'}</Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Assigned to {chainRequest.decision?.actorLabel || 'the configured organization actor'}.
                </Text>
                {chainRequest.decision?.canApprove && (
                  <Button
                    fullWidth
                    color="teal"
                    loading={chainDecisionLoading}
                    onClick={() => void decideChainRequest('approve')}
                  >
                    Approve request
                  </Button>
                )}
                {chainRequest.decision?.canReject && (
                  <>
                    <Textarea
                      label="Reason for declining"
                      placeholder="Explain why this request cannot proceed"
                      minRows={2}
                      autosize
                      value={chainDecisionReason}
                      onChange={(event) => setChainDecisionReason(event.currentTarget.value)}
                    />
                    <Button
                      fullWidth
                      color="red"
                      variant="light"
                      loading={chainDecisionLoading}
                      disabled={!chainDecisionReason.trim()}
                      onClick={() => void decideChainRequest('reject')}
                    >
                      Decline request
                    </Button>
                  </>
                )}
                {!chainRequest.decision?.canApprove && !chainRequest.decision?.canReject && (
                  <Alert color={chainRequest.decision?.canAct ? 'yellow' : 'blue'} variant="light" icon={<IconShieldCheck size={16} />}>
                    {chainRequest.decision?.canAct
                      ? 'You are assigned to this step, but your organization authority does not permit this decision.'
                      : `Waiting for ${chainRequest.decision?.actorLabel || 'the assigned stage actor'} to act.`}
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}
          {chainRequest && familyLinks(chainRequest.family, chainRequest.id).length > 0 && (
            <FamilyStrip
              chain={chainRequest.family?.chain || []}
              holdLine={chainRequest.family?.holdLine}
              onOpen={(member) => openRelatedWork(member, familyLinks(chainRequest.family, chainRequest.id))}
            />
          )}
          <JobAuditTrailPanel
            trail={historyItem?.trail || trailFromRequest(chainRequest, orgMembers)}
            compact
            embedded
            subject={chainRequest ? 'request' : 'job'}
          />
          </Stack>
        )}
      </Drawer>

      <Drawer
        opened={Boolean(selectedRequisitionId)}
        onClose={() => {
          if (returnToInbox()) return
          setSelectedRequisitionId(null)
          setSelectedRequisition(null)
          setRequisitionDecisionReason('')
          setRequisitionLifecycleNote('Goods/services received and confirmed.')
          setShowApprovalModal(false)
          setApprovalRequestId(null)
          setApprovalRequestUrl(null)
        }}
        position="bottom"
        size="auto"
        title={selectedRequisitionId ? `Requisition ${selectedRequisitionId}` : 'Requisition Details'}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          {!selectedRequisition ? (
            <Center py="md">
              <Loader />
            </Center>
          ) : (
            <>
              {contextSwitching && (
                <Alert color="blue" variant="light" icon={<IconRefresh size={14} />}>
                  Switching to organization context for requisition actions...
                </Alert>
              )}
              {(() => {
                const targetOrgId = selectedRequisition?.summary?.tenantId
                const currentOrgId = getActiveOrgId()
                const contextMismatch = targetOrgId && currentOrgId !== targetOrgId

                if (!contextMismatch) return null
                return (
                  <Alert
                    color="blue"
                    variant="filled"
                    title="Organization Context Required"
                    icon={<IconShieldCheck size={18} />}
                    mb="md"
                  >
                    <Stack gap="xs">
                      <Text size="sm">
                        This requisition belongs to a different organization. Switch context to approve or release
                        funds.
                      </Text>
                      <Button
                        variant="white"
                        color="blue"
                        size="xs"
                        onClick={() =>
                          void ensureOrgContextForRequisition(targetOrgId, 'requisition', [
                            selectedRequisitionId,
                            selectedRequisition?.workflowRequestId,
                          ])
                        }
                        loading={contextSwitching}
                      >
                        Switch to Organization
                      </Button>
                    </Stack>
                  </Alert>
                )
              })()}

              {(() => {
                const requisitionAuditItems: DetailTimelineItem[] = requisitionEvents.map(
                  (event: any, index: number) => ({
                    id: `${event.id || event.eventType || 'event'}-${index}`,
                    title: requisitionEventTitle(event.eventType),
                    source: event.source || 'system',
                    description: describeRequisitionEvent(event) || undefined,
                    timestamp: event.occurredAt ? dayjs(event.occurredAt).format('D MMM YYYY HH:mm') : '—',
                  }),
                )

                return (
                  <WorkflowDetailBody
                    statusCard={
                      <DetailStatusCard
                        status={requisitionStatusLabel(requisitionStatus)}
                        amount={requestedAmount.amount}
                        currency={requestedAmount.currency}
                        lines={[{ text: approvalLimitLabel }, { text: evidenceThresholdLabel }]}
                        footer={
                          approvalActionAllowed === false ? (
                            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} mt="sm">
                              Your role in this organization cannot approve requisitions while offline.
                            </Alert>
                          ) : undefined
                        }
                      />
                    }
                    sections={[
                      {
                        title: 'Progress',
                        content: (
                          <Timeline
                            active={Math.max(
                              0,
                              (selectedRequisition?.approvalSignMode === 'one'
                                ? {
                                    REQUISITION_CREATED: 1,
                                    MANAGER_APPROVED: 1,
                                    APPROVED: 2,
                                    RELEASED: 3,
                                    PAID: 3,
                                    ACKNOWLEDGED: 3,
                                    EXECUTION_ACKNOWLEDGED: 3,
                                    RECONCILED: 3,
                                  }
                                : {
                                    REQUISITION_CREATED: 1,
                                    MANAGER_APPROVED: 2,
                                    APPROVED: 3,
                                    RELEASED: 4,
                                    PAID: 4,
                                    ACKNOWLEDGED: 4,
                                    EXECUTION_ACKNOWLEDGED: 4,
                                    RECONCILED: 4,
                                  })[requisitionStatus] ?? 0,
                            )}
                            bulletSize={18}
                            lineWidth={2}
                          >
                            {(selectedRequisition?.approvalSignMode === 'one'
                              ? REQUISITION_STEPS.filter((step) => step.key !== 'finance').map((step) =>
                                  step.key === 'manager' ? { ...step, label: 'Approval' } : step,
                                )
                              : REQUISITION_STEPS
                            ).map((step) => {
                              const stageAction =
                                step.key === 'finance'
                                  ? 'finance_approve_requisition'
                                  : step.key === 'manager'
                                    ? 'approve_requisition'
                                    : step.key === 'release'
                                      ? 'release_funds'
                                      : step.key === 'ack'
                                        ? 'acknowledge_execution'
                                        : ''
                              const stageActor = requisitionStageActors.find((item) => item.stageAction === stageAction)
                              const actor = stageActor?.actor
                              const who =
                                stageActor?.actorDescription ||
                                (actor
                                  ? `${(actor.userId || actor.walletTenantId || actor.role || 'actor').slice(0, 12)} · ${actor.role || 'member'}`
                                  : 'Nobody chosen yet')
                              const credentialState = stageActor?.credential?.stale
                                ? 'their access record is out of date'
                                : stageActor?.credential?.state && stageActor.credential.state !== 'not_applicable'
                                  ? `access record ${stageActor.credential.state.replace(/_/g, ' ')}`
                                  : ''
                              return (
                                <Timeline.Item
                                  key={step.key}
                                  title={
                                    <Text size="sm" fw={600}>
                                      {step.label}
                                    </Text>
                                  }
                                >
                                  <Text size="xs" c="dimmed" mt={4}>
                                    {step.confirmedBy}
                                  </Text>
                                  {stageAction ? (
                                    <Text
                                      size="xs"
                                      c={
                                        actor?.mode === 'owner_fallback' || actor?.mode === 'unassigned'
                                          ? 'orange'
                                          : 'dimmed'
                                      }
                                      mt={4}
                                    >
                                      Who: {who}
                                      {credentialState ? ` · ${credentialState}` : ''}
                                    </Text>
                                  ) : null}
                                </Timeline.Item>
                              )
                            })}
                          </Timeline>
                        ),
                      },
                      {
                        title: 'NEXT STEP',
                        content: (() => {
                          const currentStatus = requisitionStatus
                          const nextStep = requisitionNextStep(
                            currentStatus,
                            selectedRequisition?.approvalSignMode === 'one' ? 'one' : 'both',
                          )
                          const inThisOrg = selectedRequisition?.summary?.tenantId
                            ? getActiveOrgId() === selectedRequisition.summary.tenantId
                            : true
                          const canApprove =
                            currentStatus === 'REQUISITION_CREATED' || currentStatus === 'MANAGER_APPROVED'
                          const canRelease = currentStatus === 'APPROVED' && isReleaseRole()
                          const canAck =
                            ['RELEASED', 'PAID', 'RECEIPT_ISSUED'].includes(currentStatus) && isReleaseRole()
                          const roleBlocked =
                            (nextStep.action === 'release' || nextStep.action === 'ack') && !isReleaseRole()
                          const busy = creatingApprovalRequest || creatingReleaseRequest || creatingAckRequest
                          const run = () => {
                            if (nextStep.action === 'approval' && canApprove) {
                              void handleOpenApprovalModal()
                              return
                            }
                            if (nextStep.action === 'release' && canRelease) {
                              void handleOpenReleaseModal()
                              return
                            }
                            if (nextStep.action === 'ack' && canAck) {
                              void handleOpenAckModal()
                            }
                          }

                          return (
                            <>
                              <Text size="sm" c="dimmed">
                                {nextStep.helper}
                              </Text>
                              {nextStep.action === 'ack' && (
                                <Textarea
                                  label="Delivery note"
                                  placeholder="Add a short note about what was delivered"
                                  minRows={2}
                                  autosize
                                  value={requisitionLifecycleNote}
                                  onChange={(e) => setRequisitionLifecycleNote(e.currentTarget.value)}
                                />
                              )}
                              {!inThisOrg && nextStep.action && (
                                <Alert color="yellow" variant="light">
                                  Switch to the organization this requisition belongs to before acting on it.
                                </Alert>
                              )}
                              {roleBlocked && inThisOrg && (
                                <Alert color="gray" variant="light">
                                  Only the person chosen for this step in your organization can do it.
                                </Alert>
                              )}
                              {nextStep.action && inThisOrg && !roleBlocked && (
                                <Button
                                  size="md"
                                  color={
                                    nextStep.action === 'approval'
                                      ? 'indigo'
                                      : nextStep.action === 'release'
                                        ? 'yellow'
                                        : 'teal'
                                  }
                                  loading={busy}
                                  onClick={run}
                                >
                                  {nextStep.label}
                                </Button>
                              )}
                            </>
                          )
                        })(),
                      },
                    ]}
                    auditItems={requisitionAuditItems}
                    auditEmptyText="No history yet."
                  />
                )
              })()}
            </>
          )}
        </Stack>
      </Drawer>

      {/* ── UI Helpers ── */}
      {(() => {
        const VPActionModal = ({
          opened,
          onClose,
          title,
          description,
          requestUrl,
          creatingRequest,
          onOpenInApp,
          onScanPortal,
        }: {
          opened: boolean
          onClose: () => void
          title: string
          description: string
          requestUrl: string | null
          creatingRequest: boolean
          onOpenInApp: () => void
          onScanPortal?: () => void
        }) => (
          <Modal
            opened={opened}
            onClose={() => {
              setProofMoreOpen(false)
              onClose()
            }}
            title={title}
            size="lg"
            centered
          >
            <Stack align="center" gap="md">
              <Text size="sm" ta="center">
                {description}
              </Text>
              {requestUrl ? (
                <>
                  <Button
                    color="grape"
                    size="md"
                    leftSection={<IconShieldCheck size={16} />}
                    onClick={onOpenInApp}
                    disabled={creatingRequest}
                    fullWidth
                  >
                    Review and share in this app
                  </Button>
                  <Text size="xs" c="dimmed" ta="center">
                    You will see exactly what is shared before you confirm.
                  </Text>
                  <UnstyledButton onClick={() => setProofMoreOpen((open) => !open)} aria-expanded={proofMoreOpen}>
                    <Group gap={6} justify="center">
                      <Text size="sm" c="dimmed">
                        Other ways
                      </Text>
                      <IconChevronDown
                        size={16}
                        color="gray"
                        style={{ transform: proofMoreOpen ? 'rotate(180deg)' : undefined }}
                      />
                    </Group>
                  </UnstyledButton>
                  <Collapse in={proofMoreOpen}>
                    <Stack w="100%" gap="xs">
                      {buildWalletInteropQrValue(requestUrl).length <= MAX_QR_LINK_LENGTH ? (
                        <>
                          <Text size="xs" c="dimmed" ta="center">
                            Scan with this app, or with any other wallet.
                          </Text>
                          <Paper p="md" radius="md" withBorder bg="white" style={{ alignSelf: 'center' }}>
                            <QRCode value={buildWalletInteropQrValue(requestUrl)} size={160} />
                          </Paper>
                        </>
                      ) : (
                        <Text size="xs" c="dimmed" ta="center">
                          Scanning is not available for this link.
                        </Text>
                      )}
                      {onScanPortal && (
                        <Button
                          variant="light"
                          color="violet"
                          size="sm"
                          leftSection={<IconQrcode size={16} />}
                          onClick={onScanPortal}
                          disabled={creatingRequest}
                          fullWidth
                        >
                          Scan a code from the portal
                        </Button>
                      )}
                      <Button
                        variant="subtle"
                        color="blue"
                        size="sm"
                        leftSection={<IconExternalLink size={16} />}
                        onClick={() => handleOpenExternalWallet(createExternalWalletLinks(requestUrl).openId4Vp)}
                        fullWidth
                      >
                        Open another wallet
                      </Button>
                      <Button
                        variant="subtle"
                        color="gray"
                        size="sm"
                        leftSection={<IconCopy size={16} />}
                        onClick={() => handleCopyRequestUrl(requestUrl)}
                        fullWidth
                      >
                        Copy link
                      </Button>
                    </Stack>
                  </Collapse>
                </>
              ) : creatingRequest ? (
                <Loader />
              ) : (
                <Alert color="red" variant="light">
                  We could not prepare this step. Close and try again.
                </Alert>
              )}
            </Stack>
          </Modal>
        )

        return (
          <>
            <VPActionModal
              opened={showApprovalModal}
              onClose={() => setShowApprovalModal(false)}
              title="Approve this request"
              description="Review what your wallet will share, then confirm you are the person chosen to approve."
              requestUrl={approvalRequestUrl}
              creatingRequest={creatingApprovalRequest}
              onOpenInApp={handleOpenApprovalInApp}
              onScanPortal={handleScanPortalApproval}
            />

            <VPActionModal
              opened={showReleaseModal}
              onClose={() => setShowReleaseModal(false)}
              title="Release funds"
              description="Review what your wallet will share, then confirm you are the person chosen to release the money."
              requestUrl={releaseRequestUrl}
              creatingRequest={creatingReleaseRequest}
              onOpenInApp={handleOpenReleaseInApp}
              onScanPortal={handleScanPortalRelease}
            />

            <VPActionModal
              opened={showAckModal}
              onClose={() => setShowAckModal(false)}
              title="Confirm delivery"
              description="Review what your wallet will share, then confirm you received the goods or services."
              requestUrl={ackRequestUrl}
              creatingRequest={creatingAckRequest}
              onOpenInApp={handleOpenAckInApp}
              onScanPortal={handleScanPortalAck}
            />

            <VPActionModal
              opened={Boolean(fieldProofStage)}
              onClose={() => {
                setFieldProofStage(null)
                setFieldProofRunId(null)
                setFieldProofRequest(null)
              }}
              title={fieldProofStage ? FIELD_PROOF_COPY[fieldProofStage].title : ''}
              description={fieldProofStage ? FIELD_PROOF_COPY[fieldProofStage].description : ''}
              requestUrl={fieldProofRequest?.presentationRequestUrl || null}
              creatingRequest={fieldProofCreating}
              onOpenInApp={openFieldProofInApp}
            />
          </>
        )
      })()}

      {/* ── AR Plan Detail Modal ── */}
      <Drawer
        opened={Boolean(selectedPlanId)}
        onClose={() => {
          if (returnToInbox()) return
          setSelectedPlanId(null)
          setSelectedPlanDetails(null)
        }}
        position="bottom"
        size="auto"
        title="Instalment Plan"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        {loadingPlanDetails ? (
          <Center py="lg">
            <Loader />
          </Center>
        ) : selectedPlanDetails ? (
          (() => {
            const workflowTransactions = safeArray<any>(selectedPlanDetails.workflowTransactions)
            const latestWorkflow = workflowTransactions[0] || null
            const lifecycleStage = deriveArProofStage(selectedPlanDetails, latestWorkflow)
            const collectionLinks = safeArray<any>(selectedPlanDetails.collections)
            const firstCollection = collectionLinks[0] || null
            const rawInstallments = safeArray<any>(selectedPlanDetails.instalments)
            const nextInstallment = rawInstallments.find((inst: any) =>
              ['pending', 'overdue'].includes(String(inst.status)),
            )
            const installmentItems = rawInstallments.map((inst: any, idx: number) => ({
              id: String(inst.id || `${selectedPlanId || 'plan'}-${idx}`),
              title: `Instalment #${idx + 1}`,
              source: 'ar payment plan',
              description: `${fmt(inst.amount, selectedPlanDetails.currency)} · Due ${inst.due_date ? dayjs(inst.due_date).format('D MMM YYYY') : 'Not scheduled'}`,
              note: inst.paid_at ? `Paid ${dayjs(inst.paid_at).format('D MMM YYYY HH:mm')}` : undefined,
              timestamp: inst.updated_at
                ? dayjs(inst.updated_at).format('D MMM YYYY HH:mm')
                : inst.paid_at
                  ? dayjs(inst.paid_at).format('D MMM YYYY HH:mm')
                  : '—',
              badge: {
                label: String(inst.status || 'pending').toUpperCase(),
                color: inst.status === 'paid' ? 'green' : inst.status === 'overdue' ? 'orange' : 'gray',
              },
            }))

            return (
              <WorkflowDetailBody
                statusCard={
                  <DetailStatusCard
                    status={`${String(selectedPlanDetails.status || 'active').toUpperCase()} · ${formatLedgerLabel(lifecycleStage.label)}`}
                    amount={selectedPlanDetails.amount_collected || 0}
                    currency={selectedPlanDetails.currency}
                    amountColor="green"
                    lines={[
                      { text: `Plan total: ${fmt(selectedPlanDetails.total_amount, selectedPlanDetails.currency)}` },
                      {
                        text: `Progress: ${selectedPlanDetails.installments_paid || 0} / ${selectedPlanDetails.installments_total || 0} instalments paid`,
                      },
                      {
                        text: `Trust: ${formatLedgerLabel(selectedPlanDetails.trust_status || latestWorkflow?.trust_status || 'pending')}`,
                      },
                      {
                        text: `Debtor org: ${selectedPlanDetails.debtor_org_name || selectedPlanDetails.debtor_org_id || 'Not linked yet'}`,
                      },
                    ]}
                    footer={
                      <Group gap="xs" mt="sm" wrap="wrap">
                        <Badge
                          color={trustTone(selectedPlanDetails.trust_status || latestWorkflow?.trust_status)}
                          variant="light"
                        >
                          Trust{' '}
                          {formatLedgerLabel(
                            selectedPlanDetails.trust_status || latestWorkflow?.trust_status || 'pending',
                          )}
                        </Badge>
                        <Badge
                          color={workflowTone(
                            latestWorkflow?.workflow_stage ||
                              selectedPlanDetails.workflow_stage ||
                              selectedPlanDetails.status,
                          )}
                          variant="light"
                        >
                          Stage{' '}
                          {formatLedgerLabel(
                            latestWorkflow?.workflow_stage ||
                              selectedPlanDetails.workflow_stage ||
                              selectedPlanDetails.status,
                          )}
                        </Badge>
                        <Badge color={workflowTone(lifecycleStage.key)} variant="outline">
                          Flow {lifecycleStage.label}
                        </Badge>
                        {nextInstallment && selectedPlanId && (
                          <Button
                            size="compact-xs"
                            variant="light"
                            onClick={async () => {
                              await api.post(
                                `/api/finance/ar/plans/${encodeURIComponent(selectedPlanId)}/installments/${encodeURIComponent(nextInstallment.id)}/remind`,
                                {},
                              )
                              notifications.show({
                                title: 'Reminder sent',
                                message: 'The client received the next payment link.',
                                color: 'teal',
                              })
                            }}
                          >
                            Send reminder
                          </Button>
                        )}
                      </Group>
                    }
                  />
                }
                sections={[
                  {
                    title: 'COUNTERPARTY IDENTITY',
                    content: (
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                          <Box style={{ minWidth: 0 }}>
                            <Text fw={700} size="sm">
                              {selectedPlanDetails.payer_name || 'Debtor counterparty'}
                            </Text>
                            {selectedPlanDetails.payer_phone && (
                              <Text size="xs" c="dimmed">
                                {selectedPlanDetails.payer_phone}
                              </Text>
                            )}
                            {selectedPlanDetails.payer_email && (
                              <Text size="xs" c="dimmed">
                                {selectedPlanDetails.payer_email}
                              </Text>
                            )}
                          </Box>
                          <Badge color="blue" variant="light">
                            Debtor View
                          </Badge>
                        </Group>
                        <Group gap="xs" wrap="wrap">
                          <Badge size="sm" color="indigo" variant="light">
                            Collector {selectedPlanDetails.buyer_tenant_id || 'Unknown'}
                          </Badge>
                          <Badge size="sm" color="grape" variant="light">
                            Debtor{' '}
                            {selectedPlanDetails.debtor_org_name || selectedPlanDetails.debtor_org_id || 'Pending link'}
                          </Badge>
                          {latestWorkflow?.source_payment_link_id && (
                            <Badge size="sm" color="cyan" variant="light">
                              Link {String(latestWorkflow.source_payment_link_id).slice(0, 10)}…
                            </Badge>
                          )}
                        </Group>
                      </Stack>
                    ),
                  },
                  {
                    title: 'PROOF & CONSENT STATE',
                    content: (
                      <Stack gap="xs">
                        <Text size="sm">{lifecycleStage.description}</Text>
                        <Group gap="xs" wrap="wrap">
                          <Badge color={workflowTone(lifecycleStage.key)} variant="light">
                            {lifecycleStage.label}
                          </Badge>
                          {latestWorkflow?.required_proof_type && (
                            <Badge color="orange" variant="light">
                              Proof {latestWorkflow.required_proof_type}
                            </Badge>
                          )}
                          {latestWorkflow?.required_action && (
                            <Badge color="blue" variant="outline">
                              Next {formatLedgerLabel(latestWorkflow.required_action)}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          Request:{' '}
                          {selectedPlanDetails.proof_request_id || latestWorkflow?.proof_request_id || 'Not issued'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Response:{' '}
                          {selectedPlanDetails.proof_response_id ||
                            latestWorkflow?.proof_response_id ||
                            'Not presented'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Consent:{' '}
                          {latestWorkflow?.consent_timestamp
                            ? dayjs(latestWorkflow.consent_timestamp).format('D MMM YYYY HH:mm')
                            : 'Awaiting consent proof'}
                        </Text>
                        {latestWorkflow?.required_proof_type && !latestWorkflow?.proof_response_id && (
                          <Button
                            size="sm"
                            color="indigo"
                            leftSection={<IconWallet size={16} />}
                            loading={creatingArProofRequest}
                            onClick={() =>
                              void launchArCollectionProof(String(latestWorkflow.id), {
                                planId: selectedPlanId,
                                orgTenantId: String(selectedPlanDetails.debtor_org_id || getActiveOrgId() || ''),
                              })
                            }
                          >
                            {lifecycleStage.key === 'proof_requested' ? 'Resume Wallet Proof' : 'Start Wallet Proof'}
                          </Button>
                        )}
                      </Stack>
                    ),
                  },
                  {
                    title: 'CREDENTIAL CHAIN',
                    content: (
                      <Stack gap="xs">
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Box style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600}>
                              Invoice VC
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {firstCollection?.id || 'Not attached'}
                            </Text>
                          </Box>
                          {firstCollection?.id && (
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() =>
                                openCredentialArtifact({
                                  title: 'AR Invoice Credential',
                                  credentialId: String(firstCollection.id),
                                  credentialType: 'InvoiceVC',
                                  status: 'issued',
                                  issuedAt: firstCollection.created_at || null,
                                  sourceRef: firstCollection.invoiceRef || firstCollection.id,
                                  counterpart: selectedPlanDetails.payer_name || null,
                                  amount: Number(firstCollection.amount || selectedPlanDetails.total_amount || 0),
                                  currency: firstCollection.currency || selectedPlanDetails.currency || 'USD',
                                  note: 'Instalment link and invoice evidence for this AR plan.',
                                })
                              }
                            >
                              Inspect
                            </Button>
                          )}
                        </Group>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Box style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600}>
                              Payment Proof
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {selectedPlanDetails.proof_response_id ||
                                latestWorkflow?.proof_response_id ||
                                'Awaiting wallet presentation'}
                            </Text>
                          </Box>
                          {(selectedPlanDetails.proof_response_id || latestWorkflow?.proof_response_id) && (
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() =>
                                openCredentialArtifact({
                                  title: 'Payment Proof Credential',
                                  credentialId: String(
                                    selectedPlanDetails.proof_response_id || latestWorkflow?.proof_response_id,
                                  ),
                                  credentialType: String(latestWorkflow?.required_proof_type || 'PaymentProofVC'),
                                  status: 'verified',
                                  issuedAt: latestWorkflow?.consent_timestamp || latestWorkflow?.updated_at || null,
                                  sourceRef: latestWorkflow?.id || null,
                                  counterpart:
                                    selectedPlanDetails.debtor_org_name || selectedPlanDetails.payer_name || null,
                                  amount: Number(latestWorkflow?.amount || 0),
                                  currency: latestWorkflow?.currency || selectedPlanDetails.currency || 'USD',
                                  note: 'Wallet proof that unlocks the next AR settlement step.',
                                })
                              }
                            >
                              Inspect
                            </Button>
                          )}
                        </Group>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Box style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600}>
                              Receipt VC
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {selectedPlanDetails.receipt_vc_id || 'Not issued yet'}
                            </Text>
                          </Box>
                          {selectedPlanDetails.receipt_vc_id && (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="teal"
                              onClick={() =>
                                openCredentialArtifact({
                                  title: 'Receipt Credential',
                                  credentialId: String(selectedPlanDetails.receipt_vc_id),
                                  credentialType: 'ReceiptVC',
                                  status: 'issued',
                                  issuedAt: selectedPlanDetails.receipt_issued_at || latestWorkflow?.updated_at || null,
                                  sourceRef: latestWorkflow?.source_payment_link_id || null,
                                  counterpart: selectedPlanDetails.payer_name || null,
                                  amount: Number(selectedPlanDetails.amount_collected || 0),
                                  currency: selectedPlanDetails.currency || 'USD',
                                  note: 'Settlement receipt linked to the AR trust workflow.',
                                })
                              }
                            >
                              Inspect
                            </Button>
                          )}
                        </Group>
                      </Stack>
                    ),
                  },
                  {
                    title: 'TRUST & VERIFICATION',
                    content: (
                      <Stack gap="xs">
                        <Text size="sm">Current verification posture for the debtor-side AR obligation.</Text>
                        <Group gap="xs" wrap="wrap">
                          <Badge
                            color={trustTone(selectedPlanDetails.trust_status || latestWorkflow?.trust_status)}
                            variant="light"
                          >
                            {formatLedgerLabel(
                              selectedPlanDetails.trust_status || latestWorkflow?.trust_status || 'pending',
                            )}
                          </Badge>
                          <Badge
                            color={workflowTone(latestWorkflow?.status || selectedPlanDetails.status)}
                            variant="light"
                          >
                            {formatLedgerLabel(latestWorkflow?.status || selectedPlanDetails.status || 'pending')}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          Required action: {formatLedgerLabel(latestWorkflow?.required_action || 'none', 'None')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Required actor: {formatLedgerLabel(latestWorkflow?.required_actor_role || 'payer', 'Payer')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Workflow transaction: {latestWorkflow?.id || 'Not attached yet'}
                        </Text>
                      </Stack>
                    ),
                  },
                  {
                    title: 'LEDGER TRAIL',
                    content: (
                      <DetailTimelineList
                        items={buildArWorkflowTimelineItems(workflowTransactions)}
                        emptyText="No cross-org workflow transaction is attached to this plan yet."
                      />
                    ),
                  },
                  ...(selectedPlanDetails.status === 'active'
                    ? [
                        {
                          title: 'PLAN ACTIONS',
                          content: (
                            <Stack gap="xs">
                              <Button
                                color="orange"
                                variant="light"
                                fullWidth
                                onClick={async () => {
                                  const token = getPreferredToken() || getWalletToken()
                                  if (!token) return
                                  try {
                                    await api.patch(
                                      `/api/finance/ar/plans/${selectedPlanId}/dispute`,
                                      {},
                                      {
                                        headers: { Authorization: `Bearer ${token}` },
                                      },
                                    )
                                    notifications.show({
                                      title: 'Dispute raised',
                                      message: 'Plan marked as disputed. Counterparty will be notified.',
                                      color: 'orange',
                                    })
                                    setSelectedPlanId(null)
                                    setSelectedPlanDetails(null)
                                    void fetchLinks()
                                  } catch (err: any) {
                                    notifications.show({
                                      title: 'Dispute failed',
                                      message: err.response?.data?.message ?? err.message,
                                      color: 'red',
                                    })
                                  }
                                }}
                              >
                                Raise Dispute
                              </Button>
                              <Button
                                color="red"
                                fullWidth
                                onClick={async () => {
                                  const token = getPreferredToken() || getWalletToken()
                                  if (!token) return
                                  try {
                                    await api.patch(
                                      `/api/finance/ar/plans/${selectedPlanId}/cancel`,
                                      {},
                                      {
                                        headers: { Authorization: `Bearer ${token}` },
                                      },
                                    )
                                    notifications.show({
                                      title: 'Plan cancelled',
                                      message: 'Instalment plan has been cancelled.',
                                      color: 'green',
                                    })
                                    setSelectedPlanId(null)
                                    setSelectedPlanDetails(null)
                                    void fetchLinks()
                                  } catch (err: any) {
                                    notifications.show({ title: 'Cancel failed', message: err.message, color: 'red' })
                                  }
                                }}
                              >
                                Cancel Plan
                              </Button>
                            </Stack>
                          ),
                        },
                      ]
                    : []),
                ]}
                auditItems={installmentItems}
                auditEmptyText="No instalment activity recorded yet"
              />
            )
          })()
        ) : (
          <Alert color="red">Failed to load plan</Alert>
        )}
      </Drawer>

      <Modal
        opened={Boolean(selectedCredentialArtifact)}
        onClose={() => setSelectedCredentialArtifact(null)}
        title={selectedCredentialArtifact?.title || 'Record'}
        centered
      >
        {selectedCredentialArtifact && (
          <Stack gap="sm">
            <Group gap="xs" wrap="wrap">
              <Badge color={trustTone(selectedCredentialArtifact.status)} variant="light">
                {formatLedgerLabel(selectedCredentialArtifact.status)}
              </Badge>
              <Badge color="indigo" variant="outline">
                {selectedCredentialArtifact.credentialType}
              </Badge>
            </Group>
            <Paper p="sm" radius="md" withBorder>
              <Text size="xs" c="dimmed" fw={600}>
                CREDENTIAL ID
              </Text>
              <Code block>{selectedCredentialArtifact.credentialId}</Code>
            </Paper>
            <Stack gap={4}>
              {selectedCredentialArtifact.counterpart && (
                <Text size="sm">Counterparty: {selectedCredentialArtifact.counterpart}</Text>
              )}
              {selectedCredentialArtifact.sourceRef && (
                <Text size="sm">Source Ref: {selectedCredentialArtifact.sourceRef}</Text>
              )}
              {selectedCredentialArtifact.issuedAt && (
                <Text size="sm">Issued: {dayjs(selectedCredentialArtifact.issuedAt).format('D MMM YYYY HH:mm')}</Text>
              )}
              {selectedCredentialArtifact.amount != null && (
                <Text size="sm">
                  Amount: {fmt(selectedCredentialArtifact.amount, selectedCredentialArtifact.currency || 'USD')}
                </Text>
              )}
              {selectedCredentialArtifact.note && (
                <Text size="sm" c="dimmed">
                  {selectedCredentialArtifact.note}
                </Text>
              )}
            </Stack>
          </Stack>
        )}
      </Modal>
    </AppShellMobile>
  )
}
