/**
 * The count WhatsApp puts on a chat you have not opened: a filled round badge.
 * The number is the signal. The colour is Credentis blue, on the phone and the website.
 * No Mantine import: this file sits outside both apps, and each app supplies the theme token.
 */
export function UnreadCount({ count }: { count: number }) {
  if (!Number.isFinite(count) || count <= 0) return null
  const label = count > 99 ? '99+' : String(count)
  return (
    <span
      aria-label={count === 1 ? '1 unread' : `${count} unread`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 20,
        height: 20,
        padding: label.length === 1 ? 0 : '0 6px',
        borderRadius: 999,
        background: 'var(--mantine-color-credentis-6)',
        color: 'var(--mantine-color-white)',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: '20px',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}
