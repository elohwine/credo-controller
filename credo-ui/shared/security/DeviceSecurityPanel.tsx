import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface AccountDevice {
  id: string
  label?: string | null
  createdAt: string
  revokedAt?: string
  verifiedAt?: string
  usage?: string
  localLoginKey?: boolean
}

export function DeviceSecurityPanel({ load, remove, children }: {
  load: () => Promise<AccountDevice[]>
  remove: (id: string) => Promise<void>
  children?: React.ReactNode
}) {
  const [devices, setDevices] = useState<AccountDevice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<AccountDevice | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (selected) {
      element?.showModal()
      element?.querySelector<HTMLButtonElement>('button')?.focus()
    }
    return () => { element?.close() }
  }, [selected])
  const trapDialogFocus = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const element = dialog.current
    if (!element) return
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try { setDevices(await load()) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not load your enrolled devices.') }
    finally { setBusy(false) }
  }, [load])
  useEffect(() => { void refresh() }, [refresh])
  const revoke = async () => {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    try {
      await remove(selected.id)
      setSelected(null)
      setDevices((current) => current.map((item) => item.id === selected.id ? { ...item, revokedAt: new Date().toISOString() } : item))
    } catch (error) {
      setSelected(null)
      setError(error instanceof Error ? error.message : 'The device could not be removed.')
    } finally { setBusy(false) }
  }
  const button: React.CSSProperties = { minHeight: 48, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
    background: 'var(--mantine-color-default)', color: 'inherit', border: '1px solid var(--mantine-color-default-border)', font: 'inherit' }
  const stack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20, lineHeight: 1.5 }
  return <section style={stack}>
    <h1 style={{ margin: 0, fontSize: 26 }}>Account security</h1>
    <p style={{ margin: 0 }}>Enroll your own Android phone to sign in without your account PIN. Strong biometrics or the phone screen lock authorizes a hardware-protected key; your identity card and its holder wallet remain hosted by Credentis.</p>
    <p style={{ margin: 0, fontSize: 14 }}>Keep your account PIN safe. Losing the phone does not make a copied card or someone else&apos;s biometrics a recovery method. iOS device enrollment is not supported yet.</p>
    {error && <p role="alert" style={{ color: 'var(--mantine-color-red-text)' }}>{error}</p>}
    {children}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ fontSize: 20 }}>Your enrolled devices</h2><button type="button" style={button} disabled={busy} onClick={() => void refresh()}>{busy ? 'Loading…' : 'Refresh'}</button>
    </div>
    {!busy && !devices.length && <p>No devices enrolled yet.</p>}
    {devices.map((device) => <article key={device.id} style={{ ...stack, gap: 10, padding: 16, border: '1px solid var(--mantine-color-default-border)', borderRadius: 12 }}>
      <strong>{device.label || 'Android device'}</strong>
      <span>{device.revokedAt ? 'Removed' : device.verifiedAt ? 'Server registration verified' : 'Legacy — enroll again'}</span>
      {!device.revokedAt && device.usage === 'login' && (
        <span style={{ fontSize: 14 }}>
          {device.localLoginKey === true
            ? 'Sign-in key is present in this installation.'
            : device.localLoginKey === false
              ? 'No matching sign-in key in this installation. This may be another device or a registration from before reinstalling. Use your account PIN to enroll this installation; the server record alone cannot sign you in.'
              : 'Usable only on the Android installation that holds its private key. Reinstalling or clearing storage can remove that key.'}
        </span>
      )}
      <span style={{ fontSize: 14 }}>{device.usage === 'login' ? 'Account and website sign-in · screen lock or strong biometrics' : 'Money steps · strong biometrics only'}</span>
      <span style={{ fontSize: 12 }}>Enrolled {new Date(device.createdAt).toLocaleDateString()}</span>
      {!device.revokedAt && <button type="button" style={{ ...button, color: 'var(--mantine-color-red-text)' }} onClick={() => setSelected(device)}>Remove access</button>}
    </article>)}
    <dialog ref={dialog} aria-labelledby="device-remove-title" style={{ color: 'var(--mantine-color-text)', background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-default-border)', borderRadius: 12, padding: 24, width: 'min(440px, calc(100vw - 32px))' }}
      onCancel={(event) => { event.preventDefault(); if (!busy) setSelected(null) }} onKeyDown={trapDialogFocus}>
      <div style={stack}>
        <h2 id="device-remove-title" style={{ margin: 0, fontSize: 22 }}>Remove this device?</h2>
        <p style={{ margin: 0 }}>This revokes the selected key and cancels its pending sign-ins. All current account and organisation sessions will be signed out, including this browser. Other enrolled devices can sign in again.</p>
        <button type="button" style={button} disabled={busy} onClick={() => setSelected(null)}>Keep device</button>
        <button type="button" style={{ ...button, color: 'var(--mantine-color-red-text)' }} disabled={busy} onClick={() => void revoke()}>{busy ? 'Removing…' : 'Remove and sign out'}</button>
      </div>
    </dialog>
  </section>
}
