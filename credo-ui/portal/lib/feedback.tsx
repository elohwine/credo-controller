import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'
import { friendlyRequestError, isRetryableRequestError } from '../../shared/requestError'

/**
 * Everyday feedback: one short toast, optionally with one action (Retry, Undo, Open).
 * Milestones use <Milestone>; form problems stay inline on the field; risky actions keep their dialogs.
 */
export type FeedbackTone = 'success' | 'info' | 'warn' | 'error'

export interface FeedbackAction {
  label: string
  onClick: () => void
}

export interface FeedbackOptions {
  title?: string
  action?: FeedbackAction
  /** Reuse an id to replace an earlier toast instead of stacking a new one. */
  id?: string
  autoClose?: number | false
}

const COLOR: Record<FeedbackTone, string> = { success: 'teal', info: 'blue', warn: 'yellow', error: 'red' }
const AUTO_CLOSE: Record<FeedbackTone, number> = { success: 3000, info: 3500, warn: 5000, error: 6000 }
const ACTION_AUTO_CLOSE = 7000

let sequence = 0

function body(id: string, message: ReactNode, action?: FeedbackAction): ReactNode {
  if (!action) return message
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Text size="sm" style={{ flex: 1 }}>
        {message}
      </Text>
      <Button
        size="compact-sm"
        variant="light"
        onClick={() => {
          notifications.hide(id)
          action.onClick()
        }}
      >
        {action.label}
      </Button>
    </Group>
  )
}

function show(tone: FeedbackTone, message: ReactNode, options: FeedbackOptions = {}): string {
  const id = options.id || `feedback-${Date.now()}-${++sequence}`
  const autoClose = options.autoClose ?? (options.action ? ACTION_AUTO_CLOSE : AUTO_CLOSE[tone])
  const payload = {
    id,
    title: options.title,
    message: body(id, message, options.action),
    color: COLOR[tone],
    autoClose,
    withCloseButton: true,
  }
  if (options.id) {
    notifications.hide(options.id)
  }
  notifications.show(payload)
  return id
}

export const feedback = {
  success: (message: ReactNode, options?: FeedbackOptions) => show('success', message, options),
  info: (message: ReactNode, options?: FeedbackOptions) => show('info', message, options),
  warn: (message: ReactNode, options?: FeedbackOptions) => show('warn', message, options),
  error: (message: ReactNode, options?: FeedbackOptions) => show('error', message, options),
  /**
   * Show a failed request in plain words. Retry is offered only when the network or server failed,
   * since resending a request the server rejected would fail the same way.
   */
  fromError: (err: unknown, options: FeedbackOptions & { fallback?: string; retry?: () => void } = {}) => {
    const { fallback, retry, ...rest } = options
    const action = rest.action || (retry && isRetryableRequestError(err) ? { label: 'Retry', onClick: retry } : undefined)
    return show('error', friendlyRequestError(err, fallback), { ...rest, action })
  },
  hide: (id: string) => notifications.hide(id),
}
