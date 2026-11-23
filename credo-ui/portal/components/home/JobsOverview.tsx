import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import { Anchor, Badge, Box, Group, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import {
    OPEN_FIELD_JOB_CATEGORIES,
    fieldJobCategory,
    fieldJobInput,
    fieldJobUrgent,
    isFieldJobRun,
    type FieldJobCategory,
} from '../../../../src/config/fieldJobCategory'
import { jobStatusColor, jobStatusLabel } from '@/components/finance/financeStages'
import { jobHeading } from '@/components/finance/jobAuditTrail'
import { isRequestFlowRun } from '../../../shared/requestDecision'

interface JobRun {
    id: string
    status?: string
    workflowId?: string
    input?: any
    output?: any
    createdAt?: string
    created_at?: string
    updatedAt?: string
    updated_at?: string
}

const BOARD = '/finance/job-cards'

function touchedAt(run: JobRun): number {
    return Date.parse(String(run.updatedAt || run.updated_at || run.createdAt || run.created_at || '')) || 0
}

/** The Jobs board in one glance on the home page: where jobs stand, what is urgent, what came in. */
export default function JobsOverview({ backendUrl, token }: { backendUrl: string; token: string }) {
    const [runs, setRuns] = useState<JobRun[] | null>(null)
    const [waitingToBook, setWaitingToBook] = useState<number | null>(null)

    useEffect(() => {
        let cancelled = false
        const headers = { Authorization: `Bearer ${token}` }
        void (async () => {
            const [runRes, intakeRes] = await Promise.all([
                axios.get(`${backendUrl}/workflows/runs`, { headers, params: { limit: 200 } }).catch(() => ({ data: [] })),
                axios.get(`${backendUrl}/api/platform/job-intake`, { headers }).catch(() => ({ data: { items: [] } })),
            ])
            if (cancelled) return
            const rows: JobRun[] = (Array.isArray(runRes.data) ? runRes.data : runRes.data?.items || [])
                .filter((run: any) => !isRequestFlowRun(run) && isFieldJobRun(run))
            setRuns(rows)
            const intakes: any[] = Array.isArray(intakeRes.data?.items) ? intakeRes.data.items : []
            setWaitingToBook(intakes.filter((item) => item?.status === 'pending').length)
        })()
        return () => {
            cancelled = true
        }
    }, [backendUrl, token])

    const loading = runs === null
    const counts = (runs || []).reduce<Record<FieldJobCategory, number>>(
        (all, run) => {
            all[fieldJobCategory(run)] += 1
            return all
        },
        { pending: 0, assigned: 0, active: 0, arrived: 0, on_hold: 0, failed: 0, completed: 0, reconciled: 0, cancelled: 0 },
    )
    const open = (runs || []).filter((run) => OPEN_FIELD_JOB_CATEGORIES.has(fieldJobCategory(run)))
    const urgentOpen = open.filter((run) => fieldJobUrgent(run))
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    const doneThisMonth = (runs || []).filter((run) => ['completed', 'reconciled'].includes(fieldJobCategory(run)) && touchedAt(run) >= monthStart).length

    const tiles = [
        { label: 'Possible repeats to check', value: waitingToBook, color: 'gray', href: BOARD },
        { label: 'Urgent', value: urgentOpen.length, color: 'red', href: `${BOARD}?status=urgent` },
        { label: 'Unassigned', value: counts.pending, color: 'gray', href: `${BOARD}?status=pending` },
        { label: 'Assigned', value: counts.assigned, color: 'indigo', href: `${BOARD}?status=assigned` },
        { label: 'In progress', value: counts.active + counts.arrived, color: 'blue', href: `${BOARD}?status=active` },
        { label: 'On hold', value: counts.on_hold, color: 'orange', href: `${BOARD}?status=on_hold` },
        { label: 'Needs attention', value: counts.failed, color: 'red', href: `${BOARD}?status=failed` },
        { label: 'Done this month', value: doneThisMonth, color: 'teal', href: `${BOARD}?status=completed` },
    ]

    const latest = [...urgentOpen, ...open.filter((run) => !fieldJobUrgent(run)).sort((a, b) => touchedAt(b) - touchedAt(a))].slice(0, 6)

    return (
        <Paper withBorder radius="lg" p="lg">
            <Group justify="space-between" mb="sm">
                <Title order={3}>Jobs</Title>
                <Anchor component={Link} href={BOARD} size="sm">
                    <Group gap={4}>Open jobs board <IconArrowRight size={14} /></Group>
                </Anchor>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="md">
                {tiles.map((tile) => (
                    <Paper key={tile.label} component={Link} href={tile.href} withBorder radius="md" p="sm" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <Text size="xs" c="dimmed">{tile.label}</Text>
                        <Text size="xl" fw={700} c={tile.color}>{loading || tile.value === null ? '…' : tile.value}</Text>
                    </Paper>
                ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">Open jobs</Text>
            {loading && <Text size="sm" c="dimmed">Loading jobs…</Text>}
            {!loading && latest.length === 0 && <Text size="sm">No open jobs.</Text>}
            <Stack gap={6}>
                {latest.map((run) => {
                    const input = fieldJobInput(run)
                    const state = run.output || {}
                    return (
                        <UnstyledButton
                            key={run.id}
                            component={Link}
                            href={`${BOARD}?runId=${encodeURIComponent(run.id)}`}
                            style={{ display: 'block', borderRadius: 8, padding: '6px 8px', border: '1px solid var(--mantine-color-default-border)' }}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <Box style={{ minWidth: 0 }}>
                                    <Text fw={600} size="sm" truncate>{jobHeading(input).title}</Text>
                                    <Text size="xs" c="dimmed" truncate>
                                        {[input.clientName, input.storeNumber ? `Store ${input.storeNumber}` : '', input.reference, input.scheduledDate].filter(Boolean).join(' · ')}
                                    </Text>
                                </Box>
                                <Group gap={4} wrap="nowrap">
                                    {fieldJobUrgent(run) && <Badge color="red" variant="filled">Urgent</Badge>}
                                    <Badge color={jobStatusColor(String(run.status || ''), state.workflowStage, state)} variant="light">
                                        {jobStatusLabel(String(run.status || ''), state.workflowStage, String(state.pauseReason || '').toLowerCase(), state)}
                                    </Badge>
                                </Group>
                            </Group>
                        </UnstyledButton>
                    )
                })}
            </Stack>
        </Paper>
    )
}
