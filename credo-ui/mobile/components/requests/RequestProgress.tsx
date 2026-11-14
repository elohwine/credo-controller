import React from 'react'
import { Loader, Paper, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'

import api from '@/lib/api'
import { requestExperienceForRow, requestStageNames } from '../../../shared/requestExperience'

/**
 * A request card in the personal inbox, shaped like a job step card: what is asked, who asked and
 * which step is yours. The steps, Details and History open in the organisation after the switch,
 * like a job. Loaded with the person's own wallet; the buttons (`children`) show even if it fails.
 */
export function RequestStepSummary({ requestId, token, orgName, children }: {
  requestId: string
  token: string
  orgName?: string
  children?: React.ReactNode
}) {
  const detail = useQuery({
    queryKey: ['request-for-me', requestId],
    queryFn: async () => {
      const response = await api.get(`/api/platform/requests/for-me/${encodeURIComponent(requestId)}`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      return response.data as {
        id: string
        description?: string
        request_type?: string
        status?: string
        org_name?: string
        events?: unknown[]
        people?: Array<{ userId: string; displayName?: string }>
        parties?: { requesterName?: string; reviewName?: string; fulfilmentName?: string }
      }
    },
  })

  const data = detail.data
  const progress = data ? requestExperienceForRow(data as Parameters<typeof requestExperienceForRow>[0]) : null
  const who = data ? requestStageNames(data as Parameters<typeof requestStageNames>[0], data.people || [], data.parties) : {}
  const stages = progress?.stages.filter((stage) => stage.status !== 'skipped') || []
  const index = stages.findIndex((stage) => stage.status === 'active')
  const current = index >= 0 ? stages[index] : undefined
  const forOrg = orgName || data?.org_name

  return (
    <Stack gap="sm">
      <Paper withBorder radius="md" p="sm">
        {detail.isPending ? (
          <Loader size="sm" />
        ) : (
          <Stack gap={4}>
            {current && (
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                This step · {index + 1} of {stages.length}
              </Text>
            )}
            {current && <Text fw={500}>{current.label}</Text>}
            {current && who[current.key] && <Text size="sm">Who: {who[current.key]}</Text>}
            {data?.parties?.requesterName && <Text size="sm">Asked by {data.parties.requesterName}</Text>}
            {data?.description && <Text size="sm" c="dimmed" lineClamp={3}>{data.description}</Text>}
            {forOrg && <Text size="xs" c="dimmed">You act for {forOrg} on this request.</Text>}
            <Text size="xs" c="dimmed">
              {current
                ? 'Open the request to see every step, what is done and who each step waits on.'
                : 'Open the request to see every step and its history.'}
            </Text>
          </Stack>
        )}
      </Paper>
      {children}
    </Stack>
  )
}
