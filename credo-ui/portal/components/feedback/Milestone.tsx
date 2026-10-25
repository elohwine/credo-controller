import { Box, Button, List, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useSyncExternalStore } from 'react'
import { MILESTONE_DURATION_MS, type MilestoneKind } from '../../../shared/lottie'
import { LottiePlayer } from './LottiePlayer'

export interface MilestoneProps {
  kind: MilestoneKind
  title: string
  detail?: string
  /** "What you can do now": up to three short lines shown after setup-type milestones. */
  next?: string[]
  action?: { label: string; onClick: () => void }
}

/**
 * Milestones are the few moments worth a short animation: a card saved, a payment made,
 * setup finished. Everything else is a toast. Call `milestone.show(...)` from any handler;
 * <MilestoneHost /> in _app renders it over the screen.
 */
let current: (MilestoneProps & { key: number }) | null = null
let counter = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export const milestone = {
  show(props: MilestoneProps) {
    current = { ...props, key: ++counter }
    emit()
  },
  close() {
    current = null
    emit()
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function MilestoneHost() {
  const active = useSyncExternalStore(subscribe, () => current, () => null)
  const waitsForUser = !!(active?.next?.length || active?.action)

  useEffect(() => {
    if (!active || waitsForUser) return
    const timer = window.setTimeout(() => milestone.close(), MILESTONE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [active, waitsForUser])

  if (!active) return null
  const { key, ...content } = active
  return (
    <Modal
      key={key}
      opened
      onClose={() => milestone.close()}
      title={active.title}
      centered
      size={360}
      radius="lg"
      padding="lg"
      zIndex={10000}
      closeOnClickOutside={!waitsForUser}
      transitionProps={{ duration: 0 }}
      closeButtonProps={{ 'aria-label': 'Close milestone' }}
    >
      <Box className="milestone-card">
        <MilestoneContent {...content} onDone={() => milestone.close()} />
      </Box>
    </Modal>
  )
}

function MilestoneContent({ kind, detail, next, action, onDone }: MilestoneProps & { onDone: () => void }) {
  const waitsForUser = !!(next?.length || action)
  return (
    <Stack align="center" gap="xs" role="status" aria-live="polite">
      <LottiePlayer kind={kind} size={132} />
      {detail ? (
        <Text size="sm" c="dimmed" ta="center">
          {detail}
        </Text>
      ) : null}
      {next?.length ? (
        <Box w="100%" mt={4}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
            What you can do now
          </Text>
          <List size="sm" spacing={4}>
            {next.slice(0, 3).map((line) => (
              <List.Item key={line}>{line}</List.Item>
            ))}
          </List>
        </Box>
      ) : null}
      {waitsForUser ? (
        <Stack w="100%" gap={6} mt="sm">
          {action ? (
            <Button
              fullWidth
              onClick={() => {
                onDone()
                action.onClick()
              }}
            >
              {action.label}
            </Button>
          ) : null}
          <Button fullWidth variant={action ? 'subtle' : 'filled'} onClick={onDone}>
            {action ? 'Not now' : 'Done'}
          </Button>
        </Stack>
      ) : null}
    </Stack>
  )
}

/** In-place milestone for calm states such as an empty inbox. */
export function InlineMilestone({ kind, title, detail, size = 112 }: { kind: MilestoneKind; title: string; detail?: string; size?: number }) {
  return (
    <Stack align="center" gap={6} py="md" role="status">
      <LottiePlayer kind={kind} size={size} />
      <Text fw={700} ta="center">
        {title}
      </Text>
      {detail ? (
        <Text size="sm" c="dimmed" ta="center">
          {detail}
        </Text>
      ) : null}
    </Stack>
  )
}
