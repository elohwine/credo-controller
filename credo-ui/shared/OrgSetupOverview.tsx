import { useId } from 'react'
import type { SetupStep } from './orgProfile'
import styles from './OrgSetupOverview.module.css'

const STEP_HINTS: Record<SetupStep['id'], string> = {
  kinds: 'Tell us what you do so we can suggest the right work areas.',
  people: 'Keep the work areas you need. You can change them later.',
  money: 'Choose who confirms requests and releases money.',
  payments: 'Choose a payment method, or leave it for later.',
  brand: 'Personalise your documents when you are ready. This does not stop you exploring.',
  team: 'Working on your own? You can invite people when you need them.',
}

export function OrgSetupOverview({
  steps,
  canEdit,
  onOpen,
  onExplore,
  resume,
}: {
  steps: SetupStep[]
  canEdit: boolean
  onOpen: (step: SetupStep) => void
  onExplore: () => void
  /** Unconfirmed answers saved on this device. */
  resume?: { question: number; total: number; onResume: () => void; onDiscard: () => void } | null
}) {
  const headingId = useId()
  const next = steps.find((step) => !step.done)
  const done = steps.filter((step) => step.done).length

  return (
    <section className={styles.overview} aria-labelledby={headingId}>
      <div>
        <h3 id={headingId} className={styles.title}>
          {next ? 'One step at a time' : 'Setup checklist complete'}
        </h3>
        <p className={styles.muted}>
          {done} of {steps.length} setup steps done
        </p>
        <progress className={styles.progress} value={done} max={steps.length || 1} aria-label="Setup progress" />
      </div>
      {canEdit && resume && (
        <div className={styles.resume}>
          <p className={styles.eyebrow}>Pick up where you left off</p>
          <h4 className={styles.title}>
            Question {resume.question} of {resume.total}
          </h4>
          <p className={styles.muted}>
            Your answers are kept on this device. Nothing changes for your organisation until you confirm the review.
          </p>
          <button type="button" className={styles.primary} onClick={resume.onResume}>
            Resume setup
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={resume.onDiscard}
            style={{ marginLeft: '0.5rem' }}
          >
            Discard answers
          </button>
        </div>
      )}
      {next && !(canEdit && resume) && (
        <div className={styles.next}>
          <p className={styles.eyebrow}>Suggested next step</p>
          <h4 className={styles.title}>{next.label}</h4>
          <p className={styles.muted}>{next.note || STEP_HINTS[next.id]}</p>
          {canEdit ? (
            <button type="button" className={styles.primary} onClick={() => onOpen(next)}>
              Continue setup
            </button>
          ) : (
            <p className={styles.muted}>An owner or admin can update organisation setup.</p>
          )}
        </div>
      )}
      <button type="button" className={next ? styles.secondary : styles.primary} onClick={onExplore}>
        {next ? 'Explore requests' : 'Go to requests'}
      </button>
      <p className={styles.muted}>
        You do not need to configure every setting now. Request availability is shown below.
      </p>
      <details className={styles.details}>
        <summary>View all setup steps</summary>
        <ul className={styles.list}>
          {steps.map((step) => (
            <li key={step.id} className={styles.row}>
              <div>
                <span className={styles.status}>{step.done ? 'Done' : 'To do'}</span>
                <span>{step.label}</span>
                {step.note && <p className={styles.muted}>{step.note}</p>}
              </div>
              {canEdit && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onOpen(step)}
                  aria-label={`${step.done ? 'Change' : 'Open'}: ${step.label}`}
                >
                  {step.done ? 'Change' : 'Open'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
