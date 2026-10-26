import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './Guides.module.css'
import {
  CHECKLIST_COPY,
  GUIDE_PATHS,
  TIP_COPY,
  type ChecklistStatus,
  type ChecklistStep,
  type GuideClient,
  type HolderSettings,
  type TipKey,
} from './guides'
import { CARD_TARGET_ATTR, flyCardTo, prefersReducedMotion } from './cardMotion'
import { reveal } from './reveal'

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Bulb = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** A one-time, dismissible hint at the top of a section. */
export function GuideTip({ tip, onDismiss }: { tip: TipKey; onDismiss: () => void }) {
  const copy = TIP_COPY[tip]
  return (
    <aside className={`${styles.root} ${styles.tip} ${reveal.rise}`} role="note" aria-label="Tip">
      <span className={styles.tipIcon}><Bulb /></span>
      <div className={styles.tipText}>
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
      </div>
      <button type="button" className={styles.ghost} onClick={onDismiss}>Got it</button>
    </aside>
  )
}

function Ring({ done, total }: { done: number; total: number }) {
  const radius = 20
  const length = 2 * Math.PI * radius
  return (
    <svg className={styles.ring} width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r={radius} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="5" />
      <circle
        cx="26" cy="26" r={radius} fill="none" stroke="#1b6fa6" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={length} strokeDashoffset={length * (1 - (total ? done / total : 0))}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{done}/{total}</text>
    </svg>
  )
}

export interface ChecklistAction {
  step: ChecklistStep
  onAction: () => void
}

/**
 * First steps driven by real account state, so an item ticks itself off when the person does it
 * anywhere in the app. Steps are shown in order and the first open one is highlighted.
 */
export function GettingStartedChecklist({
  status,
  steps,
  onDismiss,
  celebration,
}: {
  status: ChecklistStatus
  steps: ChecklistAction[]
  onDismiss: () => void
  celebration?: ReactNode
}) {
  const done = steps.filter((step) => status[step.step]).length
  const next = steps.find((step) => !status[step.step])
  const [showAll, setShowAll] = useState(false)
  if (!next) {
    return (
      <section className={`${styles.root} ${styles.checklist} ${reveal.rise}`} aria-label="Getting started">
        <div className={styles.allDone}>
          {celebration ? <div aria-hidden="true">{celebration}</div> : null}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 650 }}>You are all set</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Your account is ready for everyday use.</p>
          </div>
          <button type="button" className={styles.ghost} onClick={onDismiss}>Close</button>
        </div>
      </section>
    )
  }
  const nextCopy = CHECKLIST_COPY[next.step]
  return (
    <section className={`${styles.root} ${styles.checklist} ${reveal.rise}`} aria-labelledby="getting-started-title">
      <div className={styles.checkHead}>
        <Ring done={done} total={steps.length} />
        <div>
          <h2 id="getting-started-title">Get started</h2>
          <p>{done} of {steps.length} done</p>
        </div>
        <button type="button" className={styles.ghost} onClick={onDismiss} aria-label="Hide getting started">Hide</button>
      </div>
      {/* Only the next step is open, so the inbox stays in view; the rest are one tap away. */}
      <div key={next.step} className={`${styles.nextStep} ${reveal.stagger}`}>
        <strong>{nextCopy.title}</strong>
        <span>{nextCopy.detail}</span>
        <button type="button" className={styles.action} onClick={next.onAction} aria-label={`${nextCopy.action}: ${nextCopy.title}`}>
          {nextCopy.action}
        </button>
      </div>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={showAll}
        aria-controls="getting-started-steps"
        onClick={() => setShowAll((open) => !open)}
      >
        {showAll ? 'Hide steps' : `All ${steps.length} steps`}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: showAll ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showAll && (
      <ul id="getting-started-steps" className={`${styles.items} ${reveal.unfold}`}>
        {steps.map((step) => {
          const copy = CHECKLIST_COPY[step.step]
          const isDone = status[step.step]
          return (
            <li key={step.step} className={`${styles.item} ${step === next ? styles.next : ''}`} data-done={isDone}>
              <span className={styles.mark} role="img" aria-label={isDone ? 'Done' : 'To do'}><Check /></span>
              <span className={styles.itemText}>
                <strong>{copy.title}</strong>
              </span>
              {!isDone && step !== next && (
                <button type="button" className={styles.action} onClick={step.onAction} aria-label={`${copy.action}: ${copy.title}`}>
                  {copy.action}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      )}
    </section>
  )
}

const PointIcon = ({ kind }: { kind: 'inbox' | 'shield' | 'work' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'inbox' && <><path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 13h4.5l1 2h5l1-2H20" /></>}
    {kind === 'shield' && <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>}
    {kind === 'work' && <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" /></>}
  </svg>
)

/**
 * The person's identity card as a picture. The same element flies into its Inbox row
 * when the welcome screen closes, so it has inline styles only and no ids.
 */
export function IdentityCardArt({ name }: { name?: string | null }) {
  const display = name?.trim() || 'Your name'
  return (
    <div className={styles.card} style={{ borderRadius: 20, overflow: 'hidden' }}>
      <svg viewBox="0 0 300 186" width="100%" height="100%" role="img" aria-label={`Identity card for ${display}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="credentis-card-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#174f78" />
            <stop offset=".55" stopColor="#2188ca" />
            <stop offset="1.25" stopColor="#1fb87e" />
          </linearGradient>
          <linearGradient id="credentis-card-chip" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6e7b0" />
            <stop offset="1" stopColor="#d4b25c" />
          </linearGradient>
        </defs>
        <rect width="300" height="186" rx="20" fill="url(#credentis-card-bg)" />
        <circle cx="262" cy="-6" r="92" fill="#fff" opacity=".07" />
        <circle cx="300" cy="170" r="70" fill="#fff" opacity=".05" />
        <text x="22" y="34" fill="#fff" opacity=".85" fontSize="11" fontWeight="700" letterSpacing="2">CREDENTIS</text>
        <text x="22" y="52" fill="#fff" opacity=".7" fontSize="11">Identity card</text>
        <rect x="22" y="70" width="38" height="28" rx="6" fill="url(#credentis-card-chip)" />
        <path d="M22 84h38M41 70v28M31 70v8M51 90v8" stroke="#a88a3c" strokeWidth="1" opacity=".6" />
        <text x="22" y="134" fill="#fff" fontSize="19" fontWeight="700">{display.length > 22 ? `${display.slice(0, 21)}…` : display}</text>
        <text x="22" y="156" fill="#fff" opacity=".75" fontSize="11">Issued by Credentis · Zimbabwe</text>
        <g className={styles.cardSeal}>
          <circle cx="262" cy="148" r="18" fill="#fff" />
          <path d="M254 148.5l5.5 5.5 10-11" fill="none" stroke="#1fb87e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      <span className={styles.cardShine} aria-hidden="true" />
    </div>
  )
}

/** Shown once, straight after the account is created. */
export function WelcomeScreen({
  name,
  visual,
  onContinue,
  continueLabel = 'Go to Inbox',
  flyToInbox = true,
  onCardLanded,
}: {
  name?: string | null
  /** Replaces the identity card picture. */
  visual?: ReactNode
  onContinue: () => void
  continueLabel?: string
  /** Fly the card into its Inbox row on continue. Turn off when continuing elsewhere. */
  flyToInbox?: boolean
  /** Runs when the card's check appears, e.g. a light vibration on the phone. */
  onCardLanded?: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    if (!onCardLanded || prefersReducedMotion()) return
    const timer = window.setTimeout(onCardLanded, 1050)
    return () => window.clearTimeout(timer)
  }, [onCardLanded])
  const first = name?.trim().split(/\s+/)[0]
  const proceed = () => {
    if (flyToInbox) void flyCardTo(card.current?.firstElementChild || null, `[${CARD_TARGET_ATTR}="identity"]`)
    onContinue()
  }
  return (
    <div className={`${styles.root} ${styles.welcome}`} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className={styles.welcomeGlow} aria-hidden="true" />
      <div className={styles.welcomeInner}>
        <div className={styles.visual} ref={card}>{visual ?? <IdentityCardArt name={name} />}</div>
        <p className={`${styles.waiting} ${styles.stage}`} style={{ ['--i' as string]: 1 }}>
          <span aria-hidden="true" /> Waiting for you in Inbox
        </p>
        <h2 id="welcome-title" ref={heading} tabIndex={-1} className={styles.stage} style={{ ['--i' as string]: 2 }}>
          {first ? `Welcome, ${first}` : 'Welcome to Credentis'}
        </h2>
        <p className={`${styles.lead} ${styles.stage}`} style={{ ['--i' as string]: 3 }}>Your account is ready. Here is how it works.</p>
        <ul className={styles.points}>
          <li className={styles.stage} style={{ ['--i' as string]: 4 }}>
            <span><PointIcon kind="inbox" /></span>
            <span><strong>Cards arrive in Inbox</strong><span>Your identity card is already waiting. Accept it, and it is kept in Records.</span></span>
          </li>
          <li className={styles.stage} style={{ ['--i' as string]: 5 }}>
            <span><PointIcon kind="shield" /></span>
            <span><strong>You decide what to share</strong><span>Before anything is shared, you see who is asking and what they will get.</span></span>
          </li>
          <li className={styles.stage} style={{ ['--i' as string]: 6 }}>
            <span><PointIcon kind="work" /></span>
            <span><strong>Work comes to you</strong><span>Tasks and approvals from organisations you join show up in the same Inbox.</span></span>
          </li>
        </ul>
        <button type="button" className={`${styles.primary} ${styles.stage}`} style={{ ['--i' as string]: 7 }} onClick={proceed}>{continueLabel}</button>
      </div>
    </div>
  )
}

/** Loads and changes the person's card-saving choice. Off until the person turns it on. */
export function useHolderSettings(client: GuideClient) {
  const [settings, setSettings] = useState<HolderSettings | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    client
      .get<HolderSettings>(GUIDE_PATHS.holderSettings)
      .then((value) => live && setSettings({ autoSaveCards: Boolean(value?.autoSaveCards) }))
      .catch(() => live && setFailed(true))
    return () => { live = false }
  }, [client])
  const save = async (autoSaveCards: boolean) => {
    const value = await client.put<HolderSettings>(GUIDE_PATHS.holderSettings, { autoSaveCards })
    setSettings({ autoSaveCards: Boolean(value?.autoSaveCards) })
  }
  return { settings, failed, save }
}

/** The one choice about receiving cards: accept each yourself (default) or have them saved. */
export function CardSavingPanel({ client }: { client: GuideClient }) {
  const { settings, failed, save } = useHolderSettings(client)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const change = async (autoSaveCards: boolean) => {
    setBusy(true)
    setMessage('')
    try {
      await save(autoSaveCards)
      setMessage(autoSaveCards ? 'New cards will be saved for you.' : 'You will accept each new card yourself.')
    } catch {
      setMessage('Could not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${styles.root} ${styles.prefs}`} aria-label="Saving new cards">
      <div className={styles.row}>
        <div>
          <strong id="auto-save-label">Save new cards automatically</strong>
          <span id="auto-save-help">
            Off: each new card waits in Inbox for you to accept. On: cards and receipts are saved to Records the next time
            you open Inbox.
          </span>
        </div>
        <label className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            aria-labelledby="auto-save-label"
            aria-describedby="auto-save-help"
            checked={Boolean(settings?.autoSaveCards)}
            disabled={!settings || busy}
            onChange={(event) => void change(event.currentTarget.checked)}
          />
          <span className={styles.track} />
        </label>
      </div>
      <div className={styles.note}>
        <strong>Always waits for you</strong>
        <span>Tasks, bills, payment requests and requests to share. Nothing is ever shared automatically.</span>
      </div>
      <p className={styles.status} role="status">{failed ? 'Could not load your card setting. Check your connection.' : message}</p>
    </section>
  )
}

export interface SettingsRow {
  key: string
  icon: ReactNode
  title: string
  summary?: string
  onSelect: () => void
  /** Text for a button-style row, such as "Show again". Without it the row opens a page. */
  actionLabel?: string
}

export interface SettingsGroup {
  title: string
  rows: SettingsRow[]
}

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Grouped settings rows: icon, title, current value, and a chevron for rows that open a page. */
export function SettingsList({ groups }: { groups: SettingsGroup[] }) {
  return (
    <div className={`${styles.root} ${styles.settings}`}>
      {groups.filter((group) => group.rows.length).map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2 className={styles.groupTitle}>{group.title}</h2>
          <ul className={styles.group}>
            {group.rows.map((row) => (
              <li key={row.key}>
                <button type="button" className={styles.setting} onClick={row.onSelect}>
                  <span className={styles.settingIcon} aria-hidden="true">{row.icon}</span>
                  <span className={styles.settingText}>
                    <strong>{row.title}</strong>
                    {row.summary ? <span>{row.summary}</span> : null}
                  </span>
                  {row.actionLabel ? <span className={styles.settingAction}>{row.actionLabel}</span> : <span className={styles.chevron}><Chevron /></span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
