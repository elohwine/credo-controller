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
    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 400 }}>Sign-in and security</h1>
    <p style={{ margin: 0 }}>Let your own Android phone sign you in with your fingerprint, face or screen lock instead of your PIN, and ask for your fingerprint before money moves. It works only on the phone where you turn it on.</p>
    <p style={{ margin: 0, fontSize: 14 }}>Keep your PIN safe: it is how you get back in if you lose the phone. iPhone is not supported yet.</p>
    {error && <p role="alert" style={{ color: 'var(--mantine-color-red-text)' }}>{error}</p>}
    {children}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500 }}>Your phones</h2><button type="button" style={button} disabled={busy} onClick={() => void refresh()}>{busy ? 'Loading…' : 'Refresh'}</button>
    </div>
    {!busy && !devices.length && <p>No phones added yet.</p>}
    {devices.map((device) => <article key={device.id} style={{ ...stack, gap: 10, padding: 16, border: '1px solid var(--mantine-color-default-border)', borderRadius: 12 }}>
      <strong>{device.label || 'Android phone'}</strong>
      <span>{device.revokedAt ? 'Removed' : device.verifiedAt ? 'Ready' : 'Turn it on again to keep using it'}</span>
      {!device.revokedAt && device.usage === 'login' && (
        <span style={{ fontSize: 14 }}>
          {device.localLoginKey === true
            ? 'Works on this phone.'
            : device.localLoginKey === false
              ? 'Not on this phone. It is another phone, or the app was reinstalled here. Turn it on again on this phone to use it.'
              : 'Works only on the phone where it was turned on. Reinstalling the app or clearing its data removes it.'}
        </span>
      )}
      <span style={{ fontSize: 14 }}>{device.usage === 'login' ? 'Signs you in · fingerprint, face or screen lock' : 'Confirms money · fingerprint or face'}</span>
      <span style={{ fontSize: 12 }}>Added {new Date(device.createdAt).toLocaleDateString()}</span>
      {!device.revokedAt && <button type="button" style={{ ...button, color: 'var(--mantine-color-red-text)' }} onClick={() => setSelected(device)}>Remove access</button>}
    </article>)}
    <dialog ref={dialog} aria-labelledby="device-remove-title" style={{ color: 'var(--mantine-color-text)', background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-default-border)', borderRadius: 28, padding: 24, width: 'min(440px, calc(100vw - 32px))' }}
      onCancel={(event) => { event.preventDefault(); if (!busy) setSelected(null) }} onKeyDown={trapDialogFocus}>
      <div style={stack}>
        <h2 id="device-remove-title" style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>Remove this phone?</h2>
        <p style={{ margin: 0 }}>It can no longer sign you in or confirm money. You are signed out everywhere, including here. Other phones you added can still sign in.</p>
        <button type="button" style={button} disabled={busy} onClick={() => setSelected(null)}>Keep it</button>
        <button type="button" style={{ ...button, color: 'var(--mantine-color-red-text)' }} disabled={busy} onClick={() => void revoke()}>{busy ? 'Removing…' : 'Remove and sign out'}</button>
      </div>
    </dialog>
  </section>
}
