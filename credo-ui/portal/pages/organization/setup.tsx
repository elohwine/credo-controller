import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import Layout from '@/components/Layout'
import {
  getOrgScopedToken,
  readActiveOrganization,
} from '@/utils/organizationContext'
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconChecklist,
  IconCircleCheck,
  IconCircleDashed,
  IconInfoCircle,
  IconPlugConnected,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react'

type ReadinessRequirement = 'mandatory' | 'conditional' | 'recommended'
type ReadinessStatus = 'ready' | 'needs_attention' | 'optional'
type ReadinessDomain = 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations'

type ReadinessItem = {
  key: string
  title: string
  domain: ReadinessDomain
  requirement: ReadinessRequirement
  status: ReadinessStatus
  reason?: string
  requiredFor?: string[]
}

type DomainProgress = {
  domain: ReadinessDomain
  ready: number
  total: number
  percent: number
}

type ReadinessResponse = {
  orgTenantId: string
  orgName: string
  organizationId: string
  readinessPercent: number
  readinessState: 'ready' | 'in_progress' | 'blocked'
  items: ReadinessItem[]
  domains: DomainProgress[]
  nextActions: string[]
}

type ConfigureWorkflowBody = {
  sector?: 'ecommerce' | 'education' | 'cash' | 'field_execution' | 'custom'
  additionalWorkflowTypes?: string[]
  name?: string
}

const DOMAIN_LABELS: Record<ReadinessDomain, string> = {
  core: 'Core',
  people: 'People',
  authority: 'Authority',
  operations: 'Operations',
  trust: 'Trust',
  integrations: 'Integrations',
}

const READINESS_ACTION_LINKS: Record<string, { href: string; label: string }> = {
  active_members:        { href: '/organization/people', label: 'Invite members' },
  primary_admin:         { href: '/organization/people', label: 'Manage team' },
  roles:                 { href: '/organization/people', label: 'Create roles' },
  workflow_configuration:{ href: '/organization/setup#configure', label: 'Configure workflows' },
  authorities:           { href: '/organization/people', label: 'Grant authority' },
  departments:           { href: '/organization/people', label: 'Add departments' },
  trusted_issuers:       { href: '/organization/setup#configure', label: 'Configure trust' },
  payment_provider:      { href: '/organization/setup#configure', label: 'Connect payment' },
}

const STATE_BADGE: Record<ReadinessResponse['readinessState'], { color: string; label: string }> = {
  ready: { color: 'teal', label: 'Ready' },
  in_progress: { color: 'yellow', label: 'In progress' },
  blocked: { color: 'red', label: 'Blocked' },
}

export default function OrganizationSetupPage() {
  const [orgTenantId, setOrgTenantId] = useState('')
  const [activeOrgName, setActiveOrgName] = useState('')
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [sector, setSector] = useState<ConfigureWorkflowBody['sector']>('ecommerce')
  const [workflowTypes, setWorkflowTypes] = useState('')
  const [configuring, setConfiguring] = useState(false)

  const groupedItems = useMemo(() => {
    if (!readiness) return [] as Array<{ domain: ReadinessDomain; items: ReadinessItem[]; percent: number }>
    return readiness.domains.map((domainProgress) => ({
      domain: domainProgress.domain,
      percent: domainProgress.percent,
      items: readiness.items.filter((item) => item.domain === domainProgress.domain),
    }))
  }, [readiness])

  const backendUrl = process.env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setActiveOrgName(activeOrg.name)
    }
  }, [])

  useEffect(() => {
    if (!orgTenantId) return
    void loadReadiness()
  }, [orgTenantId])

  const loadReadiness = async () => {
    setError(null)
    const activeOrg = readActiveOrganization()
    const selectedOrgId = (orgTenantId || activeOrg?.orgTenantId || '').trim()
    if (!selectedOrgId) {
      setError('Use the account picker in the header to select an organization first.')
      return
    }

    setOrgTenantId(selectedOrgId)

    const token = getOrgScopedToken()
    if (!token) {
      setError('No tenant token found in local storage. Login and switch to organization context first.')
      return
    }

    setLoading(true)
    try {
      const res = await axios.get<ReadinessResponse>(
        `${backendUrl}/api/organizations/${encodeURIComponent(selectedOrgId)}/setup/readiness`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setReadiness(res.data)
    } catch (err: any) {
      setReadiness(null)
      setError(err?.response?.data?.message || err?.message || 'Failed to load readiness')
    } finally {
      setLoading(false)
    }
  }

  const configureWorkflows = async () => {
    setError(null)
    const activeOrg = readActiveOrganization()
    const selectedOrgId = (orgTenantId || activeOrg?.orgTenantId || '').trim()
    if (!selectedOrgId) {
      setError('Use the account picker in the header to select an organization first.')
      return
    }

    setOrgTenantId(selectedOrgId)

    const token = getOrgScopedToken()
    if (!token) {
      setError('No tenant token found in local storage. Login and switch to organization context first.')
      return
    }

    const additionalWorkflowTypes = workflowTypes
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    const body: ConfigureWorkflowBody = {
      sector,
      additionalWorkflowTypes,
    }

    setConfiguring(true)
    try {
      await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(selectedOrgId)}/workflows/configure`,
        body,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      await loadReadiness()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to configure workflows')
    } finally {
      setConfiguring(false)
    }
  }

  return (
    <Layout title="Organization Setup Center">
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <Paper withBorder radius="md" p="lg">
            <Group justify="space-between" align="start" wrap="wrap">
              <Box>
                <Group gap="xs" mb={6}>
                  <IconChecklist size={20} />
                  <Title order={2}>Organization Setup Center</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  Capability-driven onboarding: configure people, authority, workflows, trust, and integrations as needed.
                </Text>
              </Box>
              {readiness && (
                <Badge size="lg" color={STATE_BADGE[readiness.readinessState].color}>
                  {STATE_BADGE[readiness.readinessState].label}
                </Badge>
              )}
            </Group>

            <Divider my="md" />

            <Group align="center" justify="space-between" wrap="wrap">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Active organization
                </Text>
                <Text size="sm" fw={600}>
                  {activeOrgName || 'No organization selected'}
                </Text>
                <Text size="xs" c="dimmed">
                  {orgTenantId || 'Use the header account picker to switch context.'}
                </Text>
              </Box>
              <Button leftSection={<IconRefresh size={16} />} onClick={loadReadiness} loading={loading}>
                Load Readiness
              </Button>
            </Group>
          </Paper>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Setup error">
              {error}
            </Alert>
          )}

          {readiness && (
            <>
              <Card withBorder radius="md" p="lg">
                <Group justify="space-between" align="center" mb="xs">
                  <Box>
                    <Title order={3}>{readiness.orgName}</Title>
                    <Text c="dimmed" size="sm">
                      Org Tenant: {readiness.orgTenantId}
                    </Text>
                  </Box>
                  <Text fw={700} size="xl">
                    {readiness.readinessPercent}%
                  </Text>
                </Group>
                <Progress value={readiness.readinessPercent} size="lg" radius="xl" />
              </Card>

              <Card withBorder radius="md" p="lg">
                <Group gap="xs" mb="sm">
                  <IconSettings size={18} />
                  <Title order={4}>Configure Workflow Capabilities</Title>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                  Reuses the existing organization workflow template configuration path.
                </Text>

                <Group align="end" wrap="wrap">
                  <Select
                    label="Sector"
                    value={sector}
                      onChange={(value: string | null) => setSector((value as ConfigureWorkflowBody['sector']) || 'ecommerce')}
                    data={[
                      { value: 'ecommerce', label: 'E-Commerce' },
                      { value: 'education', label: 'Education' },
                      { value: 'cash', label: 'Cash Counter' },
                      { value: 'field_execution', label: 'Field Execution' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                    style={{ minWidth: 220 }}
                  />

                  <TextInput
                    label="Additional Workflow Types"
                    placeholder="accounts_receivable, internal_requisitions"
                    value={workflowTypes}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setWorkflowTypes(event.currentTarget.value)}
                    style={{ minWidth: 380 }}
                  />

                  <Button
                    leftSection={<IconPlugConnected size={16} />}
                    onClick={configureWorkflows}
                    loading={configuring}
                  >
                    Configure
                  </Button>
                </Group>
              </Card>

              <Card withBorder radius="md" p="lg">
                <Title order={4} mb="sm">Next Actions</Title>
                {readiness.nextActions.length === 0 ? (
                  <Group gap="xs">
                    <IconCircleCheck size={16} color="#12b886" />
                    <Text size="sm">No blockers detected. Organization is operational.</Text>
                  </Group>
                ) : (
                  <Stack gap={6}>
                    {readiness.nextActions.map((action) => (
                      <Group key={action} gap="xs">
                        <IconCircleDashed size={16} />
                        <Text size="sm">{action}</Text>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Card>

              {groupedItems.map((group) => (
                <Card key={group.domain} withBorder radius="md" p="lg">
                  <Group justify="space-between" mb="sm">
                    <Title order={4}>{DOMAIN_LABELS[group.domain]}</Title>
                    <Badge variant="light">{group.percent}%</Badge>
                  </Group>

                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Setup Item</Table.Th>
                        <Table.Th>Requirement</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Action</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {group.items.map((item) => {
                        const actionLink = item.status === 'needs_attention' ? READINESS_ACTION_LINKS[item.key] : undefined
                        return (
                        <Table.Tr key={item.key}>
                          <Table.Td>
                            <Text fw={600} size="sm">{item.title}</Text>
                            {item.requiredFor && item.requiredFor.length > 0 && (
                              <Text size="xs" c="dimmed" mt={2}>
                                Required for: {item.requiredFor.join(', ')}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              color={
                                item.requirement === 'mandatory'
                                  ? 'red'
                                  : item.requirement === 'conditional'
                                    ? 'yellow'
                                    : 'gray'
                              }
                              variant="light"
                            >
                              {item.requirement}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              color={
                                item.status === 'ready'
                                  ? 'teal'
                                  : item.status === 'needs_attention'
                                    ? 'orange'
                                    : 'gray'
                              }
                            >
                              {item.status}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {actionLink ? (
                              <Anchor component={Link} href={actionLink.href} size="xs" fw={500}>
                                {actionLink.label} →
                              </Anchor>
                            ) : item.reason ? (
                              <Text size="xs" c="dimmed">{item.reason}</Text>
                            ) : (
                              <Text size="xs" c="dimmed">-</Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                        )
                      })}
                    </Table.Tbody>
                  </Table>
                </Card>
              ))}
            </>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
