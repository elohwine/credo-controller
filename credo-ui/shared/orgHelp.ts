import { PRODUCT_NAME, editionHasPresetSetup } from '../../src/config/productEdition'
import type { OrgSettingsItemId } from './orgSettings'

export type HelpTopic = {
  id: string
  question: string
  answer: string
  /** Setting the answer points to, opened from the help screen. */
  setting?: OrgSettingsItemId
  /** Opens the organisation setup overview instead of a setting. */
  opensSetup?: boolean
}

/** Most-asked setup questions first (Android help pattern: common topics at the top). */
const ALL_HELP_TOPICS: HelpTopic[] = [
  {
    id: 'finish-now',
    question: 'Do I have to finish setup before I can work?',
    answer:
      'No. You can explore requests straight away. If a request needs something that is not set up yet, it asks you the first time you use it.',
    opensSetup: true,
  },
  {
    id: 'progress',
    question: 'What happens to my answers if I stop halfway?',
    answer:
      'Your answers are kept on this device until you confirm them. Open Setup and choose Resume setup to continue where you left off. Nothing changes for your organisation until you confirm the review.',
    opensSetup: true,
  },
  {
    id: 'money',
    question: 'Who confirms requests and releases money?',
    answer:
      'The person you chose for money. You can change it at any time, without affecting requests already finished.',
    setting: 'actors',
  },
  {
    id: 'simulated',
    question: 'What is Simulated pay?',
    answer: 'A practice payment method. No real money moves. Switch to EcoCash or Click n Pay when you are ready.',
    setting: 'payments',
  },
  {
    id: 'invite',
    question: 'How do I add my team?',
    answer: 'Invite people from Team. They get a link to join and only see the work you give them.',
    setting: 'team',
  },
  {
    id: 'hidden',
    question: 'Why can I not see some settings?',
    answer: 'Payments, roles, records and connected systems are only shown to organisation owners and admins.',
  },
]

/** A preset edition has no setup answers to keep, so the "stop halfway" topic is left out. */
export function helpTopics(): HelpTopic[] {
  return editionHasPresetSetup() ? ALL_HELP_TOPICS.filter((topic) => topic.id !== 'progress') : ALL_HELP_TOPICS
}

export type FeedbackChannel = { id: 'email' | 'whatsapp'; label: string; href: string }

/** Feedback destinations come from deployment settings, so no contact details are hard-coded. */
export function feedbackChannels(context: string): FeedbackChannel[] {
  const email = (process.env.NEXT_PUBLIC_FEEDBACK_EMAIL || '').trim()
  const whatsapp = (process.env.NEXT_PUBLIC_FEEDBACK_WHATSAPP || '').replace(/\D/g, '')
  const body = `What happened or what would help?\n\n\n---\nWhere: ${context}`
  const channels: FeedbackChannel[] = []
  if (email) {
    channels.push({
      id: 'email',
      label: 'Email feedback',
      href: `mailto:${email}?subject=${encodeURIComponent(`${PRODUCT_NAME} feedback`)}&body=${encodeURIComponent(body)}`,
    })
  }
  if (whatsapp) {
    channels.push({
      id: 'whatsapp',
      label: 'WhatsApp feedback',
      href: `https://wa.me/${whatsapp}?text=${encodeURIComponent(body)}`,
    })
  }
  return channels
}
