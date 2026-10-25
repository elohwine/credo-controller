import { useEffect, useRef, useState } from 'react'
import styles from './WalletOnboarding.module.css'

/** A sample journey only: no credential is issued and no information is sent. */
export function WalletOnboarding({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: 1 | 2
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const [complete, setComplete] = useState(false)
  const receiving = step === 1
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [step])

  return (
    <section className={styles.guide} aria-label="Try your wallet">
      <div className={styles.progressHeader}>
        <div className={styles.steps} role="img" aria-label={`Wallet guide ${step} of 2`}>
          <span data-active={step === 1} />
          <span data-active={step === 2} />
        </div>
        <button type="button" className={styles.skipButton} onClick={onSkip}>Skip intro</button>
      </div>
      <div className={styles.scene} data-step={step} data-complete={complete}>
        <svg className={styles.scenery} viewBox="0 0 360 320" fill="none" aria-hidden="true">
          <ellipse cx="180" cy="158" rx="150" ry="126" fill="currentColor" opacity=".05" />
          <ellipse cx="180" cy="292" rx="104" ry="10" fill="currentColor" opacity=".07" />
          <path d="M60 104C20 172 54 240 118 250M246 58C308 58 340 120 306 176" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.5" strokeDasharray="4 7" />
          <circle cx="55" cy="181" r="4" fill="currentColor" opacity=".2" />
          <path d="M293 214V224M288 219H298M93 51V61M88 56H98" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".4" />
        </svg>
        <div className={styles.merchant} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <path d="M6 14V27H26V14M4 14L7 5H25L28 14M4 14C4 19 10 19 10 14C10 19 16 19 16 14C16 19 22 19 22 14C22 19 28 19 28 14M13 27V21H20V27" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={styles.walletBack} aria-hidden="true">
          <div /><div />
        </div>
        <article className={styles.receipt} aria-label={receiving ? 'Sample shop receipt' : 'Sample sharing request'}>
          <div className={styles.receiptHeader}>
            <span className={styles.shopMark} aria-hidden="true">E</span>
            <div>
              <strong>Example Shop</strong>
              <span>{receiving ? 'Payment receipt' : 'Customer support'}</span>
            </div>
            <span className={styles.sample}>DEMO</span>
          </div>
          {receiving ? (
            <>
              <div className={styles.amount}><span>Paid in full</span><strong>USD 12<span>.00</span></strong></div>
              <div className={styles.receiptMeta}><span>Reference</span><strong>EX-012</strong></div>
              <div className={styles.receiptFoot}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                A record you can keep
              </div>
            </>
          ) : (
            <>
              <div className={styles.requestTitle}>Confirm your purchase</div>
              <dl className={styles.requestDetails}>
                <div><dt>Purpose</dt><dd>Return an item</dd></div>
                <div><dt>Requested</dt><dd>Your shop receipt</dd></div>
              </dl>
              <div className={styles.receiptFoot}>Review the whole record before sharing</div>
            </>
          )}
        </article>
        {receiving && <div className={styles.walletPocket} aria-hidden="true">
          <span>My wallet</span>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v13H4V7Zm0 0V4h13v3M16 12h4v4h-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </div>}
        <button type="button" className={styles.tryButton} disabled={complete} onClick={() => setComplete(true)}>
          {complete && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          {receiving ? (complete ? 'Saved to your sample wallet' : 'Try saving this receipt') : (complete ? 'Example approved' : 'Try approving this request')}
        </button>
      </div>
      <div className={styles.introduction}>
        <h2 ref={heading} tabIndex={-1} className={styles.heading}>{receiving ? 'Keep what matters.' : 'Have proof when you need it.'}</h2>
        <p className={styles.description}>
          {receiving
            ? 'Your receipts and identity cards, organised in one wallet.'
            : 'Reuse a saved record. You review the request and decide whether to share.'}
        </p>
      </div>
      <p className={styles.explanation} role="status">
        {complete ? 'Just a demo. Nothing was saved or sent.' : 'An interactive example. No real information is used.'}
      </p>
      <nav className={styles.navigation} aria-label="Wallet guide">
        <button type="button" className={styles.backButton} onClick={onBack}>{receiving ? 'Sign in' : 'Back'}</button>
        <button type="button" className={styles.nextButton} onClick={onNext}>{receiving ? 'Next' : 'Get started'}<span aria-hidden="true">&rarr;</span></button>
      </nav>
    </section>
  )
}
