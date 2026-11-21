import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconCircleCheck } from '@tabler/icons-react'

import { ATTENTION_WORDS, readableDate, type AttentionItem, type OperationsApi } from './operationsApi'

export interface JobAttentionMember {
  userId: string
  displayName?: string
  phone?: string
}

const SHOWN = 4

/**
 * Jobs that are stopped, late, have nobody on them, are not moving, or were never booked. The server
 * checks every hour and also sends the office a message when a job first gets stuck, a daily summary
 * and a weekly one; this is the same list, so anyone can see what is stuck right now.
 */
export function JobAttention({
  api,
  surface,
  members,
  notify,
  onOpenJob,
  refreshKey,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  members: JobAttentionMember[]
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  /** Opens the job. Only called for items that are jobs (not for jobs still waiting to be booked). */
  onOpenJob?: (runId: string) => void
  refreshKey?: number
}) {
  const [items, setItems] = useState<AttentionItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const size = surface === 'phone' ? 'md' : 'sm'

  const names = useMemo(
    () =>
      Object.fromEntries(
        members.map((member) => [member.userId, member.displayName && !/^(organization owner|team member)$/i.test(member.displayName) ? member.displayName : member.phone || 'Team member']),
      ),
    [members],
  )

  const load = useCallback(async () => {
    if (!api) return
    try {
      setItems(await api.attention())
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not check for stuck jobs', 'error')
    } finally {
      setLoaded(true)
    }
  }, [api, notify])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  if (!loaded) return null

  if (items.length === 0) {
    return (
      <Group gap="sm" wrap="nowrap" align="center">
        <ThemeIcon variant="light" color="teal" radius="xl" size={32}>
          <IconCircleCheck size={18} />
        </ThemeIcon>
        <Text size="sm" c="dimmed">
          Nothing is stuck. A job that stops, runs late or is not moving shows up here, and you are sent a message.
        </Text>
      </Group>
    )
  }

  const visible = expanded ? items : items.slice(0, SHOWN)
  return (
    <Stack gap="xs">
      <Group gap="xs" align="center">
        <ThemeIcon variant="light" color="red" radius="xl" size={32}>
          <IconAlertTriangle size={18} />
        </ThemeIcon>
        <Text fw={500}>
          {items.length} {items.length === 1 ? 'job needs' : 'jobs need'} attention
        </Text>
      </Group>
      {visible.map((item) => {
        const words = ATTENTION_WORDS[item.kind]
        const who = item.assigneeId ? names[item.assigneeId] : undefined
        return (
          <Paper key={`${item.kind}-${item.runId || item.intakeId}`} withBorder radius="md" p="sm" style={{ minHeight: surface === 'phone' ? 72 : undefined }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap={6}>
                  <Badge variant="light" color={words.color}>
                    {words.label}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {item.days >= 1 ? `${item.days} day${item.days === 1 ? '' : 's'}` : 'today'} · since {readableDate(item.since)}
                  </Text>
                </Group>
                <Text fw={500}>{item.headline}</Text>
                <Text size="sm" c="dimmed">
                  {item.detail}
                </Text>
                {(item.storeNumber || who) && (
                  <Text size="xs" c="dimmed">
                    {[item.storeNumber ? `Store ${item.storeNumber}` : '', who ? `With ${who}` : ''].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </Stack>
              {item.runId && onOpenJob && (
                <Button size={size} radius="xl" variant="light" style={surface === 'phone' ? { minHeight: 48 } : undefined} onClick={() => onOpenJob(item.runId!)}>
                  Open job
                </Button>
              )}
            </Group>
          </Paper>
        )
      })}
      {items.length > SHOWN && (
        <Group justify="center">
          <Button
            size={size}
            variant="subtle"
            style={surface === 'phone' ? { minHeight: 48 } : undefined}
            rightSection={expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show fewer' : `Show all ${items.length}`}
          </Button>
        </Group>
      )}
    </Stack>
  )
}
