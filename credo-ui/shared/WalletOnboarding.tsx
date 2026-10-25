import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './WalletOnboarding.module.css'

/** A sample journey only: no credential is issued and no information is sent. */
export function WalletOnboarding({
  step,
  onNext,
  onBack,
  illustration,
}: {
  step: 1 | 2
  onNext: () => void
  onBack: () => void
  illustration: ReactNode
}) {
  const [reviewed, setReviewed] = useState(false)
  const [includeReference, setIncludeReference] = useState(false)
  const [shared, setShared] = useState(false)
  const receiving = step === 1
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [step])

  return (
    <section className={styles.guide} aria-label="Try your wallet">
      <div>
        <p className={styles.caption}>Your wallet, in practice · Step {step} of 3</p>
        <progress className={styles.progress} value={step} max={3} aria-label={`Step ${step} of 3`} />
      </div>
      <div className={styles.illustration}>
        {illustration}
        <span className={styles.badge}>Interactive example · No real data</span>
      </div>
      <h3 ref={heading} tabIndex={-1} className={styles.heading}>{receiving ? 'A receipt you can keep' : 'See exactly what you share'}</h3>
      <p className={styles.description}>
        {receiving
          ? 'Imagine you have paid a shop. Its signed receipt arrives in Inbox. Open it, check the sender and details, then decide whether to keep it.'
          : 'Imagine the shop asks for proof of payment. Review who is asking and the requested details before approving.'}
      </p>
      <div className={styles.card}>
          <div className={styles.cardHeader}>
            <strong>{receiving ? 'Payment receipt' : 'Proof of payment request'}</strong>
            <span className={styles.sample}>Sample</span>
          </div>
          <p className={styles.caption}>{receiving ? 'From' : 'Requested by'}: Example Shop</p>
          <p>Payment amount: USD 12.00</p>
          {receiving ? (
            <>
              {reviewed && (
                <p className={styles.notice}>
                  This is only a sample. For a real card, review the issuer and the verification result in Inbox.
                </p>
              )}
              <button type="button" className={styles.tryButton} onClick={() => setReviewed(!reviewed)} aria-expanded={reviewed}>
                {reviewed ? 'Hide sample details' : 'Review sample receipt'}
              </button>
            </>
          ) : (
            <>
              <label className={styles.choice}>
                <input type="checkbox" checked disabled />Payment amount (required in this example)
              </label>
              <label className={styles.choice}>
                <input type="checkbox" checked={includeReference} disabled={shared}
                  onChange={(event) => setIncludeReference(event.currentTarget.checked)} />
                Payment reference (optional in this example)
              </label>
              <p className={styles.caption}>Your phone number and account PIN are not requested.</p>
              <button type="button" className={styles.tryButton} disabled={shared} onClick={() => setShared(true)}>
                {shared ? 'Example complete — nothing was sent' : 'Try approving this example'}
              </button>
              {shared && <p role="status">You chose {includeReference ? 'amount and reference' : 'amount only'}. In a real request, check which fields are required before approving.</p>}
            </>
          )}
      </div>
      <p className={styles.caption}>
        {receiving
          ? 'Credentis currently hosts your wallet securely on the service. An enrolled phone can protect access with its device key.'
          : 'A request still needs your approval. Only approve a requester and purpose you recognise.'}
      </p>
      <button type="button" className={styles.nextButton} onClick={onNext}>{receiving ? 'Next: try sharing' : 'Continue to create account'}</button>
      <button type="button" className={styles.backButton} onClick={onBack}>{receiving ? 'Back to sign in' : 'Back'}</button>
    </section>
  )
}
