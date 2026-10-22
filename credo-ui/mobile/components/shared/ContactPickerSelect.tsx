import { Select } from '@mantine/core'
import { IconAddressBook } from '@tabler/icons-react'

/** A saved contact or team member someone can be billed, messaged or assigned from. */
export interface PickerContact {
  id: string
  name: string
  phone?: string
  email?: string
  contactScope?: 'internal' | 'external'
}

/**
 * Pick the client from saved contacts (or the team) instead of typing the name and mobile
 * again. Picking fills the fields; they stay editable for a one-off number.
 */
export function ContactPickerSelect({
  contacts,
  value,
  onPick,
  label = 'Pick from contacts',
  description,
  placeholder = 'Search name or number',
  disabled,
  requirePhone = true,
}: {
  contacts: PickerContact[]
  value?: string | null
  onPick: (contact: PickerContact | null) => void
  label?: string
  description?: string
  placeholder?: string
  disabled?: boolean
  /** Only offer contacts that have a mobile number (for anything sent by text or WhatsApp). */
  requirePhone?: boolean
}) {
  const usable = contacts.filter((contact) => contact.id && (!requirePhone || contact.phone))
  if (usable.length === 0) return null
  const option = (contact: PickerContact) => ({
    value: contact.id,
    label: `${contact.name}${contact.phone ? ` · ${contact.phone}` : ''}`,
  })
  const external = usable.filter((contact) => contact.contactScope !== 'internal').map(option)
  const internal = usable.filter((contact) => contact.contactScope === 'internal').map(option)
  const data = [
    ...(external.length ? [{ group: 'Clients and contacts', items: external }] : []),
    ...(internal.length ? [{ group: 'Team', items: internal }] : []),
  ]
  return (
    <Select
      label={label}
      description={description}
      placeholder={placeholder}
      data={data}
      value={value ?? null}
      leftSection={<IconAddressBook size={16} />}
      searchable
      clearable
      disabled={disabled}
      nothingFoundMessage="No contact with that name or number"
      onChange={(next) => onPick(usable.find((contact) => contact.id === next) || null)}
    />
  )
}
