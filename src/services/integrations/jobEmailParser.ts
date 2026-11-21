/**
 * Read a client's job email into the fields of a job intake. Stores write in many ways, so every
 * field is optional except the description; the dispatcher checks the rest before starting the job.
 */

export interface ParsedJobEmail {
  storeNumber?: string
  poNumber?: string
  problemType?: string
  description: string
  location?: string
  clientPhone?: string
  scheduledDate?: string
  amount?: number
  currency?: string
  callOut: boolean
}

const PROBLEM_TYPES: Array<[RegExp, string]> = [
  [/\b(plumb|leak|pipe|drain|toilet|tap|geyser|water)/i, 'Plumbing'],
  [/\b(electric|wiring|socket|light|power|db board|breaker)/i, 'Electrical'],
  [/\b(paint)/i, 'Painting'],
  [/\b(hvac|air ?con|aircon|a\/c|fridge|refrigerat|chiller|cooling)/i, 'HVAC'],
]

/** Strip HTML to readable lines. */
export function emailBodyText(body: string, contentType?: string): string {
  const html = contentType ? contentType.toLowerCase() === 'html' : /<\w+[^>]*>/.test(body)
  const text = html
    ? body
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
    : body
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .trim()
}

/** The value after the first label that appears, trying the labels in order. */
function field(text: string, ...labels: string[]): string | undefined {
  for (const label of labels) {
    const match = new RegExp(
      `(?:^|\\n|\\s)(?:${label})(?![a-z])\\s*(?:no\\.?|number|#|ref(?:erence)?)?\\s*[:#\\-]?\\s*([^\\n]+)`,
      'i',
    ).exec(text)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return undefined
}

function token(value: string | undefined): string | undefined {
  const match = value ? /^[#:\s]*([A-Z0-9][A-Z0-9\-\/]{1,39})/i.exec(value) : null
  return match ? match[1].toUpperCase() : undefined
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/.exec(value)
  if (!dmy) return undefined
  const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
  const result = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return Number.isFinite(Date.parse(result)) ? result : undefined
}

export function parseJobEmail(subject: string, body: string, contentType?: string): ParsedJobEmail {
  const text = emailBodyText(body || '', contentType)
  const all = `${subject || ''}\n${text}`
  const storeNumber = token(field(all, 'store|shop|branch|site'))
  const poNumber = token(field(all, 'p\\.?\\s?o\\.?|purchase order', 'work order|wo|job|order'))
  const description =
    field(text, 'description|fault|problem|issue|work required|details|scope') ||
    text
      .split('\n')
      .find((line) => line.length > 15 && !/^(hi|hello|dear|good (morning|afternoon)|regards|thanks|kind regards)/i.test(line)) ||
    subject ||
    'Job from email'
  const location = field(text, 'address|location|site address')
  const phoneMatch = /(?:tel|phone|cell|mobile|contact)[^\n\d+]*(\+?\d[\d\s\-]{7,16}\d)/i.exec(text)
  const amountMatch = /(?:amount|value|price|total|budget)\s*[:\-]?\s*(USD|ZAR|ZWG|R|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text)
  const currencyCode = amountMatch?.[1]?.toUpperCase()
  const problemType = PROBLEM_TYPES.find(([pattern]) => pattern.test(all))?.[1]
  return {
    storeNumber,
    poNumber,
    problemType,
    description: description.slice(0, 4000),
    location: location?.slice(0, 500),
    clientPhone: phoneMatch?.[1]?.replace(/[\s\-]/g, ''),
    scheduledDate: isoDate(field(text, 'date required|required by|scheduled|due|date')),
    amount: amountMatch ? Number(amountMatch[2].replace(/,/g, '')) || undefined : undefined,
    currency: currencyCode === 'R' ? 'ZAR' : currencyCode === '$' ? 'USD' : currencyCode,
    callOut: /\b(call[\s-]?out|urgent|emergency|asap)\b/i.test(all),
  }
}
