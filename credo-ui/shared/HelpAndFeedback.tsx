import { useId, useState } from 'react'
import { feedbackChannels, helpTopics, type HelpTopic } from './orgHelp'
import { ORG_SETTINGS_GROUPS, type OrgSettingsItemId } from './orgSettings'
import styles from './OrgSetupOverview.module.css'
import { PRODUCT_NAME } from '../../src/config/productEdition'

const settingLabel = (id: OrgSettingsItemId) =>
  ORG_SETTINGS_GROUPS.flatMap((group) => group.items).find((item) => item.id === id)?.label ?? 'Settings'

/** Help & Feedback screen: common questions first, then a way to tell us what is missing. */
export function HelpAndFeedback({
  context,
  canOpenSetting,
  onOpenSetting,
  onOpenSetup,
  onShowGuides,
}: {
  /** Where the person came from, added to the feedback message. */
  context: string
  canOpenSetting: (id: OrgSettingsItemId) => boolean
  onOpenSetting: (id: OrgSettingsItemId) => void
  onOpenSetup?: () => void
  onShowGuides?: () => void
}) {
  const topicsId = useId()
  const feedbackId = useId()
  const channels = feedbackChannels(context)
  const [copied, setCopied] = useState(false)

  const action = (topic: HelpTopic) => {
    if (topic.setting && canOpenSetting(topic.setting)) {
      const id = topic.setting
      return (
        <button type="button" className={styles.secondary} onClick={() => onOpenSetting(id)}>
          Open {settingLabel(id)}
        </button>
      )
    }
    if (topic.opensSetup && onOpenSetup) {
      return (
        <button type="button" className={styles.secondary} onClick={onOpenSetup}>
          Open Setup
        </button>
      )
    }
    return null
  }

  const copyNote = async () => {
    try {
      await navigator.clipboard.writeText(
        `${PRODUCT_NAME} feedback\nWhere: ${context}\n\nWhat happened or what would help?\n`,
      )
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={styles.overview}>
      <section aria-labelledby={topicsId}>
        <h3 id={topicsId} className={styles.title}>
          Common questions
        </h3>
        <ul className={styles.list}>
          {helpTopics().map((topic) => (
            <li key={topic.id}>
              <details className={styles.details}>
                <summary>{topic.question}</summary>
                <p className={styles.muted}>{topic.answer}</p>
                {action(topic)}
              </details>
            </li>
          ))}
        </ul>
        {onShowGuides && (
          <button type="button" className={styles.secondary} onClick={onShowGuides}>
            Show the getting-started guide again
          </button>
        )}
      </section>
      <section aria-labelledby={feedbackId}>
        <h3 id={feedbackId} className={styles.title}>
          Send feedback
        </h3>
        <p className={styles.muted}>Something unclear or missing? Tell us what you were trying to do.</p>
        {channels.length > 0 ? (
          channels.map((channel) => (
            <a key={channel.id} className={styles.secondary} href={channel.href} target="_blank" rel="noreferrer">
              {channel.label}
            </a>
          ))
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={() => void copyNote()}>
              Copy a feedback note
            </button>
            <p className={styles.muted} role="status">
              {copied
                ? `Copied. Paste it into a message to your ${PRODUCT_NAME} contact.`
                : `Paste it into a message to your ${PRODUCT_NAME} contact.`}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
