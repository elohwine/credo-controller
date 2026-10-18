import { useEffect, useState } from 'react'
import { Button, Paper, Select, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'

import api from '@/lib/api'

const RECORD_LABELS: Record<string, string> = {
  JobAssignmentVC: 'Job assignment record',
  RequisitionVC: 'Requisition record',
  SiteInspectionVC: 'Site inspection',
  ReceiptVC: 'Material receipt',
  ExecutionAckVC: 'Completion',
  InvoiceVC: 'Invoice',
  PaymentReceiptVC: 'Payment receipt',
  QuoteVC: 'Quote',
  DeliveryProofVC: 'Delivery proof',
  PayslipVC: 'Payslip',
}

const CHOICES = [
  { value: 'required', label: 'Always' },
  { value: 'optional', label: 'Only when optional records are on' },
  { value: 'disabled', label: 'Off' },
]

type Template = {
  workflowType?: string
  name?: string
  steps?: Array<{ action?: string; config?: { type?: string } }>
  credentialPolicy?: { vcOfferModes?: Record<string, string>; sendOptionalOffers?: boolean }
}

function workflowName(template: Template): string {
  const type = String(template.workflowType || '').toLowerCase()
  if (type.includes('field') || type.includes('fept')) return 'Field jobs'
  return String(template.name || 'Workflow').replace(/\(.*?\)/g, '').replace(/FEPT/gi, '').trim() || 'Workflow'
}

function issuedTypes(template: Template): string[] {
  const seen = new Set<string>()
  const types: string[] = []
  for (const step of template.steps || []) {
    if (step.action !== 'credential.issue') continue
    const type = String(step.config?.type || '').trim()
    if (!type || seen.has(type)) continue
    seen.add(type)
    types.push(type)
  }
  return types
}

function matchesUse(templateType: string, inUse: string[]): boolean {
  const type = templateType.toLowerCase()
  return inUse.some((item) => {
    const candidate = item.toLowerCase()
    return candidate === type || candidate.includes(type) || type.includes(candidate)
  })
}

/** Which records a workflow in use should issue. Same choices on the portal setup page. */
export default function RecordSettingsCard({ orgTenantId, canEdit }: { orgTenantId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<Array<{ workflowType: string; name: string; types: string[]; modes: Record<string, string>; optionalOn: boolean }>>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!orgTenantId) return
    void api
      .get(`/api/organizations/${encodeURIComponent(orgTenantId)}/workflows`)
      .then((res) => {
        const templates: Template[] = Array.isArray(res.data?.templates) ? res.data.templates : []
        const inUse: string[] = Array.isArray(res.data?.workflowTypes) ? res.data.workflowTypes : []
        setRows(
          templates
            .filter((template) => matchesUse(String(template.workflowType || ''), inUse))
            .map((template) => ({
              workflowType: String(template.workflowType || ''),
              name: workflowName(template),
              types: issuedTypes(template),
              modes: { ...(template.credentialPolicy?.vcOfferModes || {}) },
              optionalOn: template.credentialPolicy?.sendOptionalOffers === true,
            }))
            .filter((row) => row.types.length > 0),
        )
      })
      .catch(() => setRows([]))
  }, [orgTenantId])

  const save = async (workflowType: string) => {
    const row = rows.find((item) => item.workflowType === workflowType)
    if (!row) return
    setSaving(workflowType)
    try {
      await api.patch(`/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/records`, {
        workflowType,
        vcOfferModes: row.modes,
        sendOptionalOffers: row.optionalOn,
      })
      notifications.show({ color: 'teal', message: 'Record settings saved. Jobs already running keep their steps.' })
    } catch {
      notifications.show({ color: 'red', message: 'Could not save record settings.' })
    } finally {
      setSaving(null)
    }
  }

  if (rows.length === 0) {
    return (
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Record settings</Title>
        <Text size="sm" c="dimmed" mt={4}>No records to set for the workflows this organisation uses.</Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Record settings</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Choose which records each workflow issues. Off means that record is not created. Jobs already running keep the steps they started with.
          </Text>
        </div>
        {rows.map((row) => (
          <Stack key={row.workflowType} gap="sm">
            <Text fw={600}>{row.name}</Text>
            <Switch
              label="Issue optional records"
              checked={row.optionalOn}
              disabled={!canEdit}
              onChange={(event) => {
                const optionalOn = event.currentTarget.checked
                setRows((current) => current.map((item) => (item.workflowType === row.workflowType ? { ...item, optionalOn } : item)))
              }}
            />
            {row.types.map((type) => (
              <Select
                key={type}
                label={RECORD_LABELS[type] || type.replace(/VC$/, '')}
                data={CHOICES}
                value={row.modes[type] || 'required'}
                disabled={!canEdit}
                allowDeselect={false}
                onChange={(value) => {
                  if (!value) return
                  setRows((current) =>
                    current.map((item) =>
                      item.workflowType === row.workflowType ? { ...item, modes: { ...item.modes, [type]: value } } : item,
                    ),
                  )
                }}
              />
            ))}
            {canEdit && (
              <Button size="sm" loading={saving === row.workflowType} onClick={() => void save(row.workflowType)}>
                Save {row.name}
              </Button>
            )}
          </Stack>
        ))}
      </Stack>
    </Paper>
  )
}
