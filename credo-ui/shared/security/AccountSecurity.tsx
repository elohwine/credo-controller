import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Paper, PasswordInput, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconAlertCircle, IconCircleCheck, IconCircleDashed, IconShieldCheck, IconShieldLock } from '@tabler/icons-react'
import { PRODUCT_NAME } from '../../../src/config/productEdition'

/** What the server says the person still has to do to secure their account. */
export interface SecurityStatus {
  mustChangePin: boolean
  hasPin: boolean
  phoneSignIn: boolean
  moneyConfirm?: boolean
  handlesMoney?: boolean
}

export type SecurityStep = 'pin' | 'phoneSignIn' | 'moneyConfirm'

/** The protections this person should have, in order. Fingerprint for money only for people who handle money. */
export function securityChecklist(status: SecurityStatus): Array<{ step: SecurityStep; done: boolean }> {
  const rows: Array<{ step: SecurityStep; done: boolean }> = [
    { step: 'pin', done: status.hasPin && !status.mustChangePin },
    { step: 'phoneSignIn', done: status.phoneSignIn },
  ]
  if (status.handlesMoney) rows.push({ step: 'moneyConfirm', done: Boolean(status.moneyConfirm) })
  return rows
}

const SNOOZE_KEY = 'ldkSecurityReminderSnoozedUntil'
const SNOOZE_DAYS = 7

function snoozeKey(accountKey?: string | null) {
  return accountKey ? `${SNOOZE_KEY}:${accountKey}` : SNOOZE_KEY
}

const REMINDER_COPY: Record<SecurityStep, { done: string; open: string; phone: string; web: string; action: string }> = {
  pin: {
    done: 'Your own PIN',
    open: 'Choose your own PIN',
    phone: 'Only you should know it. Change it in Security.',
    web: 'Only you should know it. Change it in Security.',
    action: 'Change PIN',
  },
  phoneSignIn: {
    done: 'Sign-in with fingerprint',
    open: 'Sign in with your fingerprint',
    phone: 'Use fingerprint, face or screen lock instead of typing your PIN. It only works on this phone.',
    web: `Turn it on in the ${PRODUCT_NAME} Android app under Settings, Security. Then scan the code here to sign in without your PIN.`,
    action: 'Turn on',
  },
  moneyConfirm: {
    done: 'Fingerprint for money',
    open: 'Confirm money with your fingerprint',
    phone: 'Someone who only knows your PIN cannot release, pay out or record money.',
    web: `Someone who only knows your PIN cannot release, pay out or record money. Turn it on in the ${PRODUCT_NAME} Android app.`,
    action: 'Turn on',
  },
}

/**
 * A short card on Home while the person has not set their own PIN or turned on fingerprint sign-in
 * (and fingerprint for money, when they handle money). Hidden once everything is on; "Not now"
 * hides it for a week on this device.
 */
export function SecurityReminder({
  load,
  surface,
  onOpen,
  accountKey,
}: {
  load: () => Promise<SecurityStatus>
  /** `phone` when this device can turn the steps on itself; `web` sends people to the Android app. */
  surface: 'phone' | 'web'
  onOpen: (step: SecurityStep) => void
  /** Keeps "Not now" separate for each account signed in on this device. */
  accountKey?: string | null
}) {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [snoozed, setSnoozed] = useState(true)

  useEffect(() => {
    let live = true
    setSnoozed(Number(localStorage.getItem(snoozeKey(accountKey)) || 0) > Date.now())
    load()
      .then((value) => {
        if (live && value && typeof value === 'object') setStatus(value)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [load, accountKey])

  if (!status || snoozed || status.mustChangePin) return null
  const rows = securityChecklist(status)
  const open = rows.filter((row) => !row.done)
  if (!open.length) return null
  const next = open[0].step
  const webOnly = surface === 'web' && next !== 'pin'

  const snooze = () => {
    localStorage.setItem(snoozeKey(accountKey), String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000))
    setSnoozed(true)
  }

  return (
    <Paper withBorder radius="md" p="md" aria-label="Secure your account">
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size={36} radius="md" variant="light" color="gray">
            <IconShieldLock size={20} />
          </ThemeIcon>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text fw={600}>Secure your account</Text>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {rows.length - open.length} of {rows.length} on
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {REMINDER_COPY[next][surface]}
            </Text>
          </Stack>
        </Group>
        <Stack gap={6}>
          {rows.map((row) => (
            <Group key={row.step} gap={8} wrap="nowrap">
              {row.done ? (
                <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" role="img" aria-label="On" />
              ) : (
                <IconCircleDashed size={18} color="var(--mantine-color-dimmed)" role="img" aria-label="Not on yet" />
              )}
              <Text size="sm" c={row.done ? 'dimmed' : undefined} fw={row.step === next ? 600 : undefined}>
                {row.done ? REMINDER_COPY[row.step].done : REMINDER_COPY[row.step].open}
              </Text>
            </Group>
          ))}
        </Stack>
        <Group gap="xs" justify="flex-end">
          <Button variant="subtle" color="gray" size="xs" onClick={snooze}>
            Not now
          </Button>
          <Button size="xs" variant={webOnly ? 'light' : 'filled'} onClick={() => onOpen(next)}>
            {webOnly ? 'How it works' : REMINDER_COPY[next].action}
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}

/** Set while a temporary PIN from an organisation has not been replaced. Both apps read it. */
export const PIN_CHANGE_FLAG = 'credoPinChangeRequired'

/** The same rule the server applies to a newly chosen PIN, so people see it before sending. */
export function pinProblem(pin: string): string | undefined {
  if (!/^\d{4,6}$/.test(pin)) return 'Use 4 to 6 digits'
  const digits = pin.split('').map(Number)
  const same = digits.every((digit) => digit === digits[0])
  const up = digits.every((digit, index) => index === 0 || digit === (digits[index - 1] + 1) % 10)
  const down = digits.every((digit, index) => index === 0 || digit === (digits[index - 1] + 9) % 10)
  return same || up || down ? 'Too easy to guess. Avoid repeated or running digits' : undefined
}

/**
 * Current PIN, new PIN, repeat. `submit` sends it to `/api/wallet/auth/pin/change` and returns the
 * fresh session; the caller stores it. With `temporary` the first field asks for the PIN the
 * organisation gave.
 */
export function ChangePinForm({
  temporary = false,
  submit,
  onChanged,
  submitLabel = 'Save new PIN',
}: {
  temporary?: boolean
  submit: (body: { currentPin: string; newPin: string }) => Promise<void>
  onChanged?: () => void
  submitLabel?: string
}) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [repeatPin, setRepeatPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const sending = useRef(false)

  const newError = newPin
    ? (pinProblem(newPin) ?? (newPin === currentPin ? 'Choose a different PIN' : undefined))
    : undefined
  const repeatError = repeatPin && repeatPin !== newPin ? 'PINs do not match' : undefined
  const ready = /^\d{4,6}$/.test(currentPin) && Boolean(newPin) && !newError && repeatPin === newPin

  const save = async () => {
    if (!ready || sending.current) return
    sending.current = true
    setSaving(true)
    setError(null)
    try {
      await submit({ currentPin, newPin })
      setDone(true)
      setCurrentPin('')
      setNewPin('')
      setRepeatPin('')
      onChanged?.()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Could not change your PIN')
    } finally {
      sending.current = false
      setSaving(false)
    }
  }

  return (
    <Stack gap="sm">
      <PasswordInput
        label={temporary ? 'Temporary PIN' : 'Current PIN'}
        description={temporary ? 'The PIN your organisation gave you' : undefined}
        inputMode="numeric"
        autoComplete="current-password"
        maxLength={6}
        value={currentPin}
        onChange={(event) => {
          setCurrentPin(event.currentTarget.value.replace(/\D/g, ''))
          setDone(false)
        }}
      />
      <PasswordInput
        label="New PIN"
        description="4 to 6 digits only you know"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={newPin}
        error={newError}
        onChange={(event) => setNewPin(event.currentTarget.value.replace(/\D/g, ''))}
      />
      <PasswordInput
        label="Repeat new PIN"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={repeatPin}
        error={repeatError}
        onChange={(event) => setRepeatPin(event.currentTarget.value.replace(/\D/g, ''))}
      />
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}
      {done && !temporary && (
        <Alert color="teal" variant="light" icon={<IconShieldCheck size={16} />}>
          PIN changed. Other devices signed in with the old PIN have been signed out.
        </Alert>
      )}
      <Button onClick={() => void save()} loading={saving} disabled={!ready}>
        {submitLabel}
      </Button>
    </Stack>
  )
}
