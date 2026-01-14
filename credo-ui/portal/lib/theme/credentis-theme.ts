/**
 * Credentis Mantine Theme
 * 
 * This is the single source of truth for all design tokens.
 * All colors, spacing, and typography come from here.
 * 
 * Rules:
 * - Glass layers consume these colors, never define new ones
 * - No gradients unless derived from primary
 * - Structural UI: radius 8px
 * - Glass surfaces: radius 12-16px
 */

import { createTheme, MantineColorsTuple } from '@mantine/core';

// Credentis Brand Palette
// Derived from the logo: Curious Blue, Link Water, Viking, Cornflower
const credentis: MantineColorsTuple = [
  '#e8f4fa',  // 0: Lightest (backgrounds)
  '#d0e6f3',  // 1: Link Water (light backgrounds)
  '#b8d8ec',  // 2
  '#a0cae5',  // 3
  '#88c4e3',  // 4: Cornflower (tertiary)
  '#6fb4dc',  // 5: Viking (secondary)
  '#2188ca',  // 6: Curious Blue (primary) ← primaryShade
  '#1b6fa6',  // 7: Darker
  '#155782',  // 8
  '#0f3f5e',  // 9: Darkest
];

// Supporting palette for semantic colors
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
];

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
];

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
];

export const credentisTheme = createTheme({
  // Color configuration
  colors: {
    credentis,
    brand: credentis, // Alias for easier usage
    blue: credentis,  // Override default blue with Credentis colors
    success,
    warning,
    danger,
  },
  primaryColor: 'credentis',
  primaryShade: 6, // Curious Blue #2188CA

  // Auto-contrast for accessibility
  autoContrast: true,
  luminanceThreshold: 0.3,

  // Typography
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, Fira Code, monospace',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
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

  // Spacing scale (consistent throughout)
  spacing: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
  },

  // Border radius
  radius: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px - structural default
    md: '0.75rem',  // 12px - glass surfaces
    lg: '1rem',     // 16px - glass cards
    xl: '1.5rem',   // 24px - hero elements
  },
  defaultRadius: 'sm', // 8px for structural UI

  // Shadows (no glow, subtle and professional)
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
  },

  // Cursor type
  cursorType: 'pointer',

  // Focus ring
  focusRing: 'auto',

  // Respect user motion preferences
  respectReducedMotion: true,

  // Component defaults
  components: {
    Button: {
      defaultProps: {
        radius: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Select: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
        shadow: 'sm',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'sm',
        shadow: 'xs',
      },
    },
    Modal: {
      defaultProps: {
        radius: 'md',
        centered: true,
      },
    },
    Notification: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Table: {
      defaultProps: {
        striped: true,
        highlightOnHover: true,
      },
    },
  },

  // Custom properties for glass effects
  other: {
    // Glass effect configurations (use in custom components)
    glass: {
      surface: {
        blur: '16px',
        saturation: '180%',
        opacity: 0.1,
        borderRadius: '12px',
      },
      card: {
        blur: '12px',
        saturation: '150%',
        opacity: 0.75,
        borderRadius: '16px',
      },
      credential: {
        blur: '20px',
        saturation: '200%',
        opacity: 0.9,
        borderRadius: '16px',
      },
    },
    // Animation durations
    animation: {
      fast: '150ms',
      normal: '300ms',
      slow: '500ms',
    },
  },
});

// Export individual color values for use outside Mantine
export const credentisColors = {
  curious: '#2188CA',    // Primary
  linkWater: '#D0E6F3',  // Light background
  viking: '#6FB4DC',     // Secondary
  cornflower: '#88C4E3', // Tertiary
} as const;

export default credentisTheme;
