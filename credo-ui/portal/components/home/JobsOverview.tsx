import React, { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Anchor, Group, Paper, Text, Title } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { operationsApi } from '../../../shared/operations/operationsApi'
import { JobsDashboard, type JobsDashboardTarget } from '../../../shared/operations/JobsDashboard'

const BOARD = '/finance/job-cards'

export function portalJobsHref(target: JobsDashboardTarget): string {
    if (target.kind === 'job') return `${BOARD}?runId=${encodeURIComponent(target.runId)}`
    if (target.kind === 'report') return `${BOARD}?report=1`
    if (!target.filter) return BOARD
    return `${BOARD}?status=${target.filter === 'attention' ? 'failed' : target.filter}`
}

/** The jobs dashboard on the home page; every figure opens the Jobs list it counts. */
export default function JobsOverview({
  backendUrl,
  token,
  canManage,
}: {
  backendUrl: string
  token: string
  canManage: boolean
}) {
    const router = useRouter()
    const api = useMemo(() => operationsApi(backendUrl, token), [backendUrl, token])
    return (
        <Paper withBorder radius="lg" p="lg">
            <Group justify="space-between" mb="md">
                <div>
                    <Title order={3}>Jobs</Title>
          <Text size="sm" c="dimmed">
            What is open, late or stuck, and where the work is.
          </Text>
                </div>
                <Anchor component={Link} href={BOARD} size="sm">
          <Group gap={4}>
            Open jobs board <IconArrowRight size={14} />
          </Group>
                </Anchor>
            </Group>
            <JobsDashboard
                api={api}
                surface="portal"
        canManage={canManage}
                onOpen={(target) => void router.push(portalJobsHref(target))}
        fallback={
          <Text size="sm">
            Your jobs are on the{' '}
            <Anchor component={Link} href={BOARD}>
              jobs board
            </Anchor>
            .
          </Text>
        }
            />
        </Paper>
    )
}
