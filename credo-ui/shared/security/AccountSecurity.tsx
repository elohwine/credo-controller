import { useRef, useState } from 'react'
import { Alert, Button, PasswordInput, Stack } from '@mantine/core'
import { IconAlertCircle, IconShieldCheck } from '@tabler/icons-react'

/** What the server says the person still has to do to secure their account. */
export interface SecurityStatus {
  mustChangePin: boolean
  hasPin: boolean
  phoneSignIn: boolean
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
