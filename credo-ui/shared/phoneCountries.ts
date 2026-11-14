import metadata from 'libphonenumber-js/min/metadata'

/** Countries offered in the phone field. Zimbabwe is the default. The list is every country, A to Z. */
export interface PhoneCountry {
  iso: string
  name: string
  dial: string
}

const DEFAULT_ISO = 'ZW'
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

const dialByIso = new Map<string, string>()
const primaryIso = new Map<string, string>()
const callingCodes = metadata.country_calling_codes as Record<string, string[]>
for (const [dial, isos] of Object.entries(callingCodes)) {
  primaryIso.set(dial, isos[0])
  for (const iso of isos) dialByIso.set(iso, dial)
}

export const PHONE_COUNTRIES: PhoneCountry[] = [...dialByIso.keys()]
  .map((iso) => ({
    iso,
    name: regionNames.of(iso) || iso,
    dial: dialByIso.get(iso) || '',
  }))
  .filter((country) => country.dial)
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))

const BY_ISO = new Map(PHONE_COUNTRIES.map((country) => [country.iso, country]))

export function countryByIso(iso: string): PhoneCountry {
  return BY_ISO.get(iso) || BY_ISO.get(DEFAULT_ISO) || PHONE_COUNTRIES[0]
}

/** Longest dial code first. A shared code (such as +1) prefers its main country. */
const BY_DIAL_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => {
  if (b.dial.length !== a.dial.length) return b.dial.length - a.dial.length
  return (primaryIso.get(a.dial) === a.iso ? 0 : 1) - (primaryIso.get(b.dial) === b.iso ? 0 : 1)
})

export function looksLikeEmail(value: string): boolean {
  return /[a-zA-Z@]/.test(value)
}

/**
 * Split a stored number into a country and the digits the person types.
 * A local 07… number stays on Zimbabwe. An address with letters is left as an email.
 */
export function splitPhone(raw: string): { email: boolean; iso: string; national: string } {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { email: false, iso: DEFAULT_ISO, national: '' }
  if (looksLikeEmail(trimmed)) return { email: true, iso: DEFAULT_ISO, national: trimmed }
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return { email: false, iso: DEFAULT_ISO, national: '' }
  if (digits.startsWith('0')) return { email: false, iso: DEFAULT_ISO, national: digits.replace(/^0+/, '') }
  const match = BY_DIAL_LENGTH.find((country) => digits.startsWith(country.dial) && digits.length > country.dial.length)
  if (match) return { email: false, iso: match.iso, national: digits.slice(match.dial.length) }
  return { email: false, iso: DEFAULT_ISO, national: digits }
}

/** Country code plus the number, with a leading 0 removed. Empty when there are no digits. */
export function composePhone(iso: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return ''
  return `${countryByIso(iso).dial}${digits}`
}
