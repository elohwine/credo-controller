/**
 * Credentis Mantine Theme — shared between portal and mobile
 */
import { createTheme, MantineColorsTuple } from '@mantine/core'

const credentis: MantineColorsTuple = [
  '#e8f4fa',
  '#d0e6f3',
  '#b8d8ec',
  '#a0cae5',
  '#88c4e3',
  '#6fb4dc',
  '#2188ca',
  '#1b6fa6',
  '#155782',
  '#0f3f5e',
]

const success: MantineColorsTuple = [
  '#e6fbf4',
  '#c3f5e3',
  '#9cedd0',
  '#75e5bc',
  '#4edda9',
  '#27d595',
  '#1fb87e',
  '#199a69',
  '#137c54',
  '#0d5e3f',
]

const warning: MantineColorsTuple = [
  '#fff8e6',
  '#ffecb8',
  '#ffe08a',
  '#ffd45c',
  '#ffc82e',
  '#ffbc00',
  '#d9a000',
  '#b38400',
  '#8c6800',
  '#664c00',
]

const danger: MantineColorsTuple = [
  '#ffeaea',
  '#ffcaca',
  '#ffaaaa',
  '#ff8a8a',
  '#ff6a6a',
  '#ff4a4a',
  '#e03030',
  '#c01818',
  '#a00000',
  '#800000',
]

export const credentisTheme = createTheme({
  colors: { credentis, brand: credentis, blue: credentis, success, warning, danger },
  fontSizes: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '22px',
  },
  primaryColor: 'credentis',
  primaryShade: 6,
  autoContrast: true,
  luminanceThreshold: 0.3,
  fontFamily: 'system-ui, Roboto, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, Fira Code, monospace',
  headings: {
    fontFamily: 'system-ui, Roboto, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '2.25rem', lineHeight: '1.2' },
      h2: { fontSize: '1.875rem', lineHeight: '1.25' },
      h3: { fontSize: '1.5rem', lineHeight: '1.3' },
      h4: { fontSize: '1.25rem', lineHeight: '1.4' },
      h5: { fontSize: '1.125rem', lineHeight: '1.4' },
      h6: { fontSize: '1rem', lineHeight: '1.5' },
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  radius: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    // Material 3 extra-large shape (28dp): dialogs, and the pill shape on buttons.
    xl: '1.75rem',
  },
  defaultRadius: 'sm',
  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.05)',
    sm: '0 1px 3px rgba(0,0,0,0.1)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
    xl: '0 20px 25px rgba(0,0,0,0.1)',
  },
  cursorType: 'pointer',
  focusRing: 'auto',
  respectReducedMotion: true,
  components: {
    Button: { defaultProps: { radius: 'xl' } },
    TextInput: { defaultProps: { radius: 'sm' } },
    PasswordInput: { defaultProps: { radius: 'sm' } },
    Select: { defaultProps: { radius: 'sm' } },
    // Keep portalled pickers out of the scroll-locked body's layout and above nested dialogs.
    Combobox: { defaultProps: { floatingStrategy: 'fixed', zIndex: 2600 } },
    Menu: { defaultProps: { zIndex: 2600 } },
    Popover: { defaultProps: { zIndex: 2600 } },
    Card: { defaultProps: { radius: 'md', shadow: 'sm' } },
    // Material 3 shape scale: cards and list containers 12dp, dialogs 28dp.
    Paper: { defaultProps: { radius: 'md', shadow: 'xs' } },
    Modal: { defaultProps: { radius: 'xl', centered: true, zIndex: 2200 } },
    Drawer: { defaultProps: { zIndex: 2000 } },
    Notification: { defaultProps: { radius: 'sm' } },
    // Android TabLayout "auto" mode: tabs fill the bar when they fit and scroll sideways when
    // they do not (see .app-tabs-list in styles/globals.css and useActiveTabInView in lib/tabs.ts).
    Tabs: { classNames: { list: 'app-tabs-list', tab: 'app-tabs-tab' } },
  },
  other: {
    glass: {
      surface: { blur: '16px', saturation: '180%', opacity: 0.1, borderRadius: '12px' },
      card: { blur: '12px', saturation: '150%', opacity: 0.75, borderRadius: '16px' },
    },
    animation: { fast: '150ms', normal: '300ms', slow: '500ms' },
  },
})

export const credentisColors = {
  curious: '#2188CA',
  linkWater: '#D0E6F3',
  viking: '#6FB4DC',
  cornflower: '#88C4E3',
} as const

export default credentisTheme
