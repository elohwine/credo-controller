/** Vector version of the existing pillar-and-network mark, without raster padding. */
export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M24 6 A18 18 0 0 1 40 18 M40 30 A18 18 0 0 1 24 42 M8 30 A18 18 0 0 1 8 18" />
        <circle cx="24" cy="24" r="12" strokeWidth="1.25" />
      </g>
      <g fill="currentColor">
        <circle cx="24" cy="6" r="3" /><circle cx="40" cy="24" r="3" /><circle cx="8" cy="24" r="3" />
        <path d="M19 16 H29 V18 H27 V30 H29 V32 H19 V30 H21 V18 H19 Z M18 15 Q24 12 30 15 V16 H18 Z" />
      </g>
      <path d="M23 19 V29 M25 19 V29" stroke="var(--mantine-color-body, white)" strokeWidth="1" opacity=".55" />
    </svg>
  )
}
