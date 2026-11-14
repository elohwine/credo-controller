import { useEffect, useState } from 'react'
import styles from './IdentityVerification.module.css'

export type RegistryRequestView = {
  status: 'none' | 'pending' | 'fulfilled' | 'declined'
  requestedAt?: string
}

/** The sign-up choice. The identity card is issued either way. */
export function RegistrySignupChoice({
  value,
  onChange,
}: {
  value: boolean
  onChange: (askRegistry: boolean) => void
}) {
  return (
    <fieldset className={styles.choice}>
      <legend>Date of birth</legend>
      <p className={styles.hint}>
        Your identity card is issued either way. A confirmed date of birth is added later, on a new copy of that same card.
      </p>
      <label className={styles.option}>
        <input type="radio" name="registry-signup" checked={!value} onChange={() => onChange(false)} />
        <span>Just my identity card</span>
      </label>
      <label className={styles.option}>
        <input type="radio" name="registry-signup" checked={value} onChange={() => onChange(true)} />
        <span>
          Also ask the Central Registry
          <small>The request waits until the registry is connected. You can still add your date of birth yourself in Settings.</small>
        </span>
      </label>
    </fieldset>
  )
}

/**
 * Later request, from Settings. Asking the registry records the request. Entering a date of
 * birth reissues the same identity card so a site can be shown only "18 or over".
 */
export function IdentityVerificationPanel({
  load,
  requestRegistry,
  selfAttest,
}: {
  load: () => Promise<RegistryRequestView>
  requestRegistry: () => Promise<RegistryRequestView>
  selfAttest: (dateOfBirth: string) => Promise<void>
}) {
  const [status, setStatus] = useState<RegistryRequestView>({ status: 'none' })
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [busy, setBusy] = useState<'load' | 'registry' | 'self' | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    load()
      .then((next) => {
        if (!stopped) setStatus(next)
      })
      .catch(() => {
        if (!stopped) setError('Could not load this yet.')
      })
      .finally(() => {
        if (!stopped) setBusy(null)
      })
    return () => {
      stopped = true
    }
  }, [load])

  const ask = async () => {
    setBusy('registry')
    setError(null)
    setDone(null)
    try {
      setStatus(await requestRegistry())
      setDone('Requested. It waits until the Central Registry is connected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.')
    } finally {
      setBusy(null)
    }
  }

  const attest = async () => {
    setBusy('self')
    setError(null)
    setDone(null)
    try {
      await selfAttest(dateOfBirth)
      setDone('A new identity card is in Inbox. Accept it to share “18 or over” without your other details.')
      setDateOfBirth('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the date of birth.')
    } finally {
      setBusy(null)
    }
  }

  const waiting = status.status === 'pending'
  const confirmed = status.status === 'fulfilled'

  return (
    <section className={styles.panel}>
      <p className={styles.status}>
        {confirmed
          ? 'The Central Registry confirmed your date of birth. Accept the new identity card in Inbox if you have not already.'
          : waiting
            ? 'You asked the Central Registry to confirm your date of birth. That connection is not in place yet, so the request is waiting.'
            : 'Your identity card can later carry a date of birth. A site can then be shown only that you are 18 or over. Your name, phone and date of birth are not shared.'}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {done && <p className={styles.status}>{done}</p>}
      {!waiting && !confirmed && (
        <button type="button" className={styles.button} disabled={busy === 'registry'} onClick={() => void ask()}>
          Ask the Central Registry
        </button>
      )}
      <label className={styles.field}>
        Or enter your date of birth
        <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.currentTarget.value)} />
        <small className={styles.hint}>This is your own entry, not a registry confirmation. It replaces nothing until you accept the new card.</small>
      </label>
      <button type="button" className={`${styles.button} ${styles.light}`} disabled={!dateOfBirth || busy === 'self'} onClick={() => void attest()}>
        Add it to my identity card
      </button>
    </section>
  )
}
