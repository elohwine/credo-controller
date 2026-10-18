/**
 * Whether a saved contact can already receive something in the app.
 * Keep this file identical to `credo-ui/mobile/lib/contactAvailability.ts`.
 */

export type ContactAppStatus = 'in_app' | 'invite' | 'no_phone'

export function contactAppStatus(status?: string): ContactAppStatus {
  if (status === 'in_app' || status === 'no_phone') return status
  return 'invite'
}

export function contactAppLabel(status?: string): string {
  const value = contactAppStatus(status)
  if (value === 'in_app') return 'In the app'
  if (value === 'no_phone') return 'Add a phone number'
  return 'Invite'
}

export function contactInviteMessage(name: string): string {
  return `Hi ${name}, you are saved as a contact, but you are not in the app yet. Sign up with this phone number so work can reach you.`
}

export function contactInviteUrl(phone: string, name: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(contactInviteMessage(name))}`
}
