import { useEffect, useId, useRef, useState, type FC, type ReactNode, type SVGProps } from 'react'
import * as FlagIcons from 'country-flag-icons/react/3x2'
import styles from './PhoneField.module.css'
import {
  PHONE_COUNTRIES,
  composePhone,
  countryByIso,
  looksLikeEmail,
  splitPhone,
} from './phoneCountries'

type FlagIcon = FC<SVGProps<SVGSVGElement>>

const FLAGS = FlagIcons as unknown as Record<string, FlagIcon>

function Flag({ iso }: { iso: string }) {
  const Icon = FLAGS[iso]
  if (typeof Icon !== 'function') return null
  return <Icon className={styles.flag} aria-hidden="true" />
}

/**
 * Phone number with a country-code dropdown. The list hangs under the code
 * button on the phone and on the website. The value sent upward is the country
 * code plus the number (a leading 0 is dropped), or the email when this field
 * also accepts one.
 *
 * Kept free of the app toolkit so both apps can import it from this shared folder.
 */
export function PhoneField({
  label = 'Phone number',
  description,
  placeholder = '77 123 4567',
  value,
  onChange,
  required,
  error,
  disabled,
  allowEmail = false,
  surface,
}: {
  label?: string
  description?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: ReactNode
  disabled?: boolean
  size?: string
  /** Sign-in fields accept an email as well as a phone number. */
  allowEmail?: boolean
  surface: 'phone' | 'portal'
}) {
  const inputId = useId()
  const parsed = splitPhone(value)
  const [iso, setIso] = useState(parsed.iso)
  const [national, setNational] = useState(parsed.national)
  const [open, setOpen] = useState(false)
  const emitted = useRef(value)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value === emitted.current) return
    const next = splitPhone(value)
    setIso(next.iso)
    setNational(next.national)
    emitted.current = value
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const emailMode = allowEmail && looksLikeEmail(national)
  const country = countryByIso(iso)

  const publish = (nextIso: string, nextNational: string) => {
    const next = allowEmail && looksLikeEmail(nextNational) ? nextNational.trim() : composePhone(nextIso, nextNational)
    emitted.current = next
    onChange(next)
  }

  const choose = (nextIso: string) => {
    setIso(nextIso)
    setOpen(false)
    if (!emailMode) publish(nextIso, national)
  }

  return (
    <div className={styles.field} ref={root} data-surface={surface}>
      <label className={styles.label} htmlFor={inputId}>
        {label}{required ? ' *' : ''}
      </label>
      <div className={styles.row}>
        {!emailMode && (
          <div className={styles.codeWrap}>
            <button
              type="button"
              className={styles.code}
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Country code, ${country.name}, +${country.dial}`}
              onClick={() => setOpen((current) => !current)}
            >
              <Flag iso={country.iso} />
              <span>+{country.dial}</span>
              <span className={styles.chevron} aria-hidden="true">▾</span>
            </button>
            {open && (
              <ul className={styles.list} role="listbox" aria-label="Country codes">
                {PHONE_COUNTRIES.map((item) => (
                  <li key={item.iso}>
                    <button
                      type="button"
                      className={styles.option}
                      role="option"
                      aria-selected={item.iso === iso}
                      data-selected={item.iso === iso}
                      onClick={() => choose(item.iso)}
                    >
                      <Flag iso={item.iso} />
                      <span className={styles.optionName}>{item.name}</span>
                      <span className={styles.optionDial}>+{item.dial}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <input
          id={inputId}
          className={styles.input}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          placeholder={emailMode ? 'name@email.com' : placeholder}
          autoComplete={allowEmail ? 'username' : 'tel'}
          inputMode={emailMode ? 'email' : 'tel'}
          value={national}
          onChange={(event) => {
            const next = event.currentTarget.value
            setNational(next)
            publish(iso, next)
          }}
        />
      </div>
      {description && <p className={styles.help}>{description}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
