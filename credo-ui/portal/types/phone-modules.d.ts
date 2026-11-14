// tsconfig `paths` points these imports at their runtime .js files for bundling; borrow the packages' own typings.
declare module 'country-flag-icons/react/3x2' {
  export * from 'country-flag-icons/react/3x2/index'
}

declare module 'libphonenumber-js/min/metadata' {
  import type { MetadataJson } from 'libphonenumber-js'
  const metadata: MetadataJson
  export default metadata
}
