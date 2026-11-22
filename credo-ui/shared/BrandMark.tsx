/** LDK iFacilities mark: a facility block in a rounded tile. Same drawing as `portal/public/favicon.svg`. */
export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="42" height="42" rx="11" fill="currentColor" />
      <path d="M13 37 V19 L24 12 L35 19 V37 Z" fill="var(--mantine-color-body, white)" />
      <g fill="currentColor">
        <rect x="17" y="21" width="4" height="4" rx="1" /><rect x="27" y="21" width="4" height="4" rx="1" />
        <rect x="17" y="28" width="4" height="4" rx="1" /><rect x="27" y="28" width="4" height="4" rx="1" />
        <rect x="22" y="30" width="4" height="7" rx="1" />
      </g>
    </svg>
  )
}
