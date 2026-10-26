/**
 * Card motion shared by the mobile app and the portal.
 *
 * The same card travels through the first-run journey: it arrives on the welcome screen,
 * flies into its Inbox row, and after it is accepted it flies into Records. Following the
 * thing the person is learning about is what makes motion useful, rather than decoration.
 *
 * Uses the Web Animations API, which every supported Android WebView has. Under reduced
 * motion ("Remove animations" on Android) every helper resolves at once and does nothing.
 */

export const CARD_TARGET_ATTR = 'data-card-target'
export const RECORDS_TARGET_ATTR = 'data-records-target'

const SPRING_LINEAR =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)'
const SMOOTH = 'cubic-bezier(.2, 0, 0, 1)'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function spring(): string {
  if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')) return SPRING_LINEAR
  return 'cubic-bezier(.34, 1.56, .64, 1)'
}

function canAnimate(): boolean {
  return typeof document !== 'undefined' && typeof document.body?.animate === 'function' && !prefersReducedMotion()
}

function visibleRect(element: Element | null): DOMRect | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width < 4 || rect.height < 4) return null
  const style = window.getComputedStyle(element)
  if (style.visibility === 'hidden' || style.display === 'none') return null
  return rect
}

function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const look = () => {
      const found = Array.from(document.querySelectorAll(selector)).find((node) => visibleRect(node))
      if (found) return resolve(found)
      if (Date.now() - started > timeoutMs) return resolve(null)
      window.setTimeout(look, 120)
    }
    look()
  })
}

function placeGhost(ghost: HTMLElement, rect: DOMRect) {
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    zIndex: '10001',
    pointerEvents: 'none',
    transformOrigin: 'center center',
    willChange: 'transform, opacity',
  })
  ghost.setAttribute('aria-hidden', 'true')
  document.body.appendChild(ghost)
}

function travel(ghost: HTMLElement, from: DOMRect, to: DOMRect, endScale: number, duration: number, start = { scale: 1, y: 0 }) {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  // A slight arc reads as "thrown into place" instead of sliding along a straight line.
  const lift = Math.min(80, Math.abs(dy) * 0.25)
  return ghost.animate(
    [
      { transform: `translate(0, ${start.y}px) scale(${start.scale})`, opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(${(1 + endScale) / 2})`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${endScale})`, opacity: 0.15, offset: 1 },
    ],
    { duration, easing: SMOOTH, fill: 'forwards' },
  ).finished
}

/** A short glow and nudge on the element a card has just landed in. */
export function pulse(element: Element | null, tone: 'blue' | 'green' = 'blue') {
  if (!element || !canAnimate()) return
  const color = tone === 'green' ? '31, 184, 126' : '33, 136, 202'
  ;(element as HTMLElement).animate(
    [
      { transform: 'scale(1)', boxShadow: `0 0 0 0 rgba(${color}, 0)` },
      { transform: 'scale(1.035)', boxShadow: `0 0 0 6px rgba(${color}, .28)`, offset: 0.35 },
      { transform: 'scale(1)', boxShadow: `0 0 0 0 rgba(${color}, 0)` },
    ],
    { duration: 700, easing: spring() },
  )
}

/**
 * Lifts `source` off the page and flies a copy of it into the first visible element that
 * matches `targetSelector`, waiting for the next screen to render it. Call this just before
 * navigating; the copy lives on <body> so it survives the route change.
 */
export async function flyCardTo(source: Element | null, targetSelector: string, options: { timeoutMs?: number; onLand?: () => void } = {}) {
  const from = visibleRect(source)
  if (!source || !from || !canAnimate()) return
  const ghost = source.cloneNode(true) as HTMLElement
  ghost.removeAttribute('id')
  // A copy would replay the source's CSS entrance animations; show it in its finished state.
  for (const node of [ghost, ...Array.from(ghost.querySelectorAll<HTMLElement | SVGElement>('*'))]) {
    node.style.animation = 'none'
  }
  placeGhost(ghost, from)
  // While the next screen loads, the card lifts and waits instead of vanishing.
  const hover = ghost.animate(
    [
      { transform: 'translateY(0) scale(1)', filter: 'drop-shadow(0 8px 16px rgba(18, 62, 89, .18))' },
      { transform: 'translateY(-10px) scale(.92)', filter: 'drop-shadow(0 18px 28px rgba(18, 62, 89, .24))' },
    ],
    { duration: 320, easing: SMOOTH, fill: 'forwards' },
  )
  try {
    const target = await waitForElement(targetSelector, options.timeoutMs ?? 4500)
    const to = visibleRect(target)
    if (!target || !to) {
      await ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished
      return
    }
    if (to.top < 0 || to.bottom > window.innerHeight) {
      target.scrollIntoView({ block: 'center' })
    }
    hover.cancel()
    const landing = visibleRect(target) || to
    await travel(ghost, from, landing, Math.max(0.12, landing.height / from.height), 620, { scale: 0.92, y: -10 })
    pulse(target)
    options.onLand?.()
  } catch {
    // Motion is a nicety; never let it break navigation.
  } finally {
    ghost.remove()
  }
}

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string) {
  const node = document.createElement(tag)
  Object.assign(node.style, style)
  if (text) node.textContent = text
  return node
}

function miniCard(title: string, detail: string): HTMLElement {
  const card = el('div', {
    borderRadius: '18px',
    padding: '18px',
    color: '#fff',
    background: 'linear-gradient(135deg, #1b6fa6 0%, #2188ca 55%, #1fb87e 130%)',
    boxShadow: '0 18px 40px rgba(18, 62, 89, .28)',
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    overflow: 'hidden',
  })
  card.appendChild(el('div', { fontSize: '11px', letterSpacing: '.12em', fontWeight: '700', opacity: '.85' }, 'CREDENTIS'))
  const text = el('div', {})
  text.appendChild(el('div', { fontSize: '18px', fontWeight: '700', lineHeight: '1.2' }, title))
  text.appendChild(el('div', { fontSize: '13px', opacity: '.85', marginTop: '2px' }, detail))
  card.appendChild(text)
  const seal = el('div', {
    position: 'absolute',
    right: '14px',
    top: '14px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: '#fff',
    color: '#1fb87e',
    display: 'grid',
    placeItems: 'center',
    fontSize: '20px',
    fontWeight: '800',
    transform: 'scale(0)',
  }, '✓')
  seal.dataset.seal = 'true'
  card.appendChild(seal)
  return card
}

/**
 * The "saved" moment for a card or record: it pops up, gets a check, and drops into the
 * Records tab, which bounces. Returns false when there is no visible Records target or motion
 * is reduced, so the caller can fall back to its usual confirmation.
 */
export async function celebrateSaved(options: { title: string; detail: string; onCheck?: () => void }): Promise<boolean> {
  if (!canAnimate()) return false
  const target = Array.from(document.querySelectorAll(`[${RECORDS_TARGET_ATTR}]`)).find((node) => visibleRect(node))
  const to = visibleRect(target || null)
  if (!target || !to) return false
  const width = Math.min(300, window.innerWidth - 48)
  const height = Math.round(width * 0.62)
  const from = new DOMRect((window.innerWidth - width) / 2, Math.max(80, window.innerHeight * 0.32 - height / 2), width, height)
  const ghost = miniCard(options.title, options.detail)
  ghost.setAttribute('role', 'presentation')
  placeGhost(ghost, from)
  const seal = ghost.querySelector<HTMLElement>('[data-seal]')
  try {
    await ghost.animate(
      [
        { transform: 'perspective(800px) rotateX(24deg) translateY(40px) scale(.7)', opacity: 0 },
        { transform: 'perspective(800px) rotateX(0) translateY(0) scale(1)', opacity: 1 },
      ],
      { duration: 520, easing: spring(), fill: 'forwards' },
    ).finished
    await seal?.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 380, easing: spring(), fill: 'forwards' }).finished
    options.onCheck?.()
    await new Promise((resolve) => window.setTimeout(resolve, 260))
    await travel(ghost, from, to, Math.max(0.1, to.width / from.width), 560)
    ;(target as HTMLElement).animate(
      [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-6px) scale(1.18)', offset: 0.35 }, { transform: 'translateY(0) scale(1)' }],
      { duration: 620, easing: spring() },
    )
  } catch {
    // Ignore: the record is already saved; the animation is only confirmation.
  } finally {
    ghost.remove()
  }
  return true
}
