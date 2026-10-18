import { credentisTheme } from './credentis-theme'

describe('mobile picker overlay defaults', () => {
  it('keeps Select and MultiSelect combobox portals positioned against the viewport', () => {
    expect(credentisTheme.components.Combobox.defaultProps.floatingStrategy).toBe('fixed')
    expect(credentisTheme.components.Combobox.defaultProps.withinPortal).not.toBe(false)
  })

  it('places options above the app header and nested timeline dialogs', () => {
    expect(credentisTheme.components.Combobox.defaultProps.zIndex).toBeGreaterThan(1200)
  })

  it('does not disable modal focus, dismissal, or transitions to hide flickering', () => {
    expect(credentisTheme.components.Modal.defaultProps.trapFocus).not.toBe(false)
    expect(credentisTheme.components.Modal.defaultProps.closeOnClickOutside).not.toBe(false)
    expect(credentisTheme.components.Modal.defaultProps.transitionProps?.duration).not.toBe(0)
  })
})
