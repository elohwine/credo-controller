import { useEffect, useRef, useState } from 'react'
import styles from './WalletOnboarding.module.css'
import { reveal } from './reveal'

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
    setComplete(false)
    heading.current?.focus({ preventScroll: true })
  }, [step])

  return (
    <section className={styles.guide} aria-label="Try your wallet">
      <div className={styles.progressHeader}>
        <div className={styles.steps}>
          <span role="img" aria-label={`Wallet guide ${step} of 2`}>{step} / 2</span>
          <span className={styles.journeyLabel}>Your first day, made simpler</span>
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
        <div className={styles.employer} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect x="5" y="10" width="22" height="17" rx="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M11 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M5 17c6 4 16 4 22 0M16 17v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className={styles.walletBack} aria-hidden="true">
          <div /><div />
        </div>
        <article className={styles.card} aria-label={receiving ? 'Sample identity card' : 'What you can do next'}>
          <div className={styles.cardHeader}>
            <span className={styles.orgMark} aria-hidden="true">C</span>
            <div>
              <strong>Credentis</strong>
              <span>{receiving ? 'Identity card' : 'Your choice'}</span>
            </div>
            <span className={styles.sample}>DEMO</span>
          </div>
          {/* The card stays put and turns; only what is written on it changes, line by line. */}
          <div key={step} className={reveal.stagger} style={{ display: 'contents' }}>
          {receiving ? (
            <>
              <div className={styles.person}>
                <div className={styles.portrait} aria-hidden="true">
                  <svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="23" r="11" fill="currentColor" /><path d="M12 58v-6a20 20 0 0 1 40 0v6" fill="currentColor" /></svg>
                </div>
                <div><strong>Your name</strong><span>Your account</span></div>
              </div>
              <dl className={styles.cardDetails}>
                <div><dt>Issued by</dt><dd>Credentis</dd></div>
                <div><dt>For</dt><dd>Proving who you are</dd></div>
              </dl>
              <div className={styles.cardFoot}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Accepted only when you say so
              </div>
            </>
          ) : (
            <>
              <div className={styles.requestTitle}>After your card</div>
              <dl className={styles.requestDetails}>
                <div><dt>Keep</dt><dd>Cards, with no organisation</dd></div>
                <div><dt>Find</dt><dd>A business to ask for a service</dd></div>
                <div><dt>Start</dt><dd>An organisation, when you want one</dd></div>
              </dl>
              <div className={styles.cardFoot}>{complete ? 'You choose this later' : 'Nothing here is decided for you'}</div>
            </>
          )}
          </div>
        </article>
        {receiving && <div className={styles.walletPocket} aria-hidden="true">
          <span>My wallet</span>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v13H4V7Zm0 0V4h13v3M16 12h4v4h-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </div>}
        <button type="button" className={styles.tryButton} disabled={complete} onClick={() => setComplete(true)}>
          {complete && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          {receiving ? (complete ? 'Sample card accepted' : 'Try accepting the card') : (complete ? 'Choices noted' : 'See the choices')}
        </button>
      </div>
      <div key={step} className={`${styles.introduction} ${reveal.stagger}`} style={{ ['--reveal-delay' as string]: '160ms' }}>
        <h2 ref={heading} tabIndex={-1} className={styles.heading}>{receiving ? 'Your identity card' : 'Then you choose'}</h2>
        <p className={styles.description}>
          {receiving
            ? 'Credentis sends an identity card to Inbox. You read it and accept it. Nothing is saved until you do.'
            : 'Keep cards here, find a business to ask for a service, or start an organisation later. You can skip this and decide after you sign in.'}
        </p>
      </div>
      <p className={styles.explanation} role="status">
        {complete ? 'Demo only. Nothing was saved or sent.' : 'A sample only. Nothing is saved until you accept a real card.'}
      </p>
      <nav className={styles.navigation} aria-label="Wallet guide">
        <button type="button" className={styles.backButton} onClick={onBack}>{receiving ? 'Sign in' : 'Back'}</button>
        <button type="button" className={styles.nextButton} onClick={onNext}>{receiving ? 'Next' : 'Get started'}<span aria-hidden="true">&rarr;</span></button>
      </nav>
    </section>
  )
}
