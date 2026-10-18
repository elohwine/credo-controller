import { useEffect } from 'react'
import { Button, Loader, Stack, Text } from '@mantine/core'
import { useUiStore } from '@/lib/state/ui'

/** If whatever was opening never reports back, give the screen back after this long. */
const BLOCKING_TIMEOUT_MS = 25_000

/**
 * The single full-screen wait, used only when the next screen cannot show anything until
 * it has loaded (opening a job from the inbox, switching organisation).
 */
export function BlockingOverlay() {
  const blocking = useUiStore((state) => state.blocking)
  const unblock = useUiStore((state) => state.unblock)

  useEffect(() => {
    if (!blocking) return
    const timer = window.setTimeout(() => unblock(blocking.key), BLOCKING_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [blocking, unblock])

  if (!blocking) return null
  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-label={blocking.title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(248, 250, 252, 0.94)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Stack align="center" gap="sm" maw={320}>
        <Loader size="md" />
        <Text fw={700} ta="center">
          {blocking.title}
        </Text>
        {blocking.detail ? (
          <Text size="sm" c="dimmed" ta="center">
            {blocking.detail}
          </Text>
        ) : null}
        <Button variant="subtle" size="xs" onClick={() => unblock(blocking.key)}>
          Hide
        </Button>
      </Stack>
    </div>
  )
}
