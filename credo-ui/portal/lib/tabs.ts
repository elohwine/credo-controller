import { useEffect } from 'react'

/**
 * Keeps the selected tab in view on every tab row, the way Android's scrollable TabLayout does.
 *
 * The theme gives every `Tabs.List` the `app-tabs-list` class and every `Tabs.Tab` the
 * `app-tabs-tab` class (see styles/globals.css). When a row is wider than the screen, this
 * scrolls the row — only the row, never the page — so the active tab sits in the middle.
 * Mount it once in `_app.tsx`; it watches the whole document, so new pages need nothing.
 */
export function useActiveTabInView(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return

    const reveal = (tab: Element, smooth: boolean) => {
      const list = tab.closest<HTMLElement>('.app-tabs-list')
      if (!list || list.scrollWidth <= list.clientWidth + 1) return
      const listRect = list.getBoundingClientRect()
      const tabRect = tab.getBoundingClientRect()
      const delta = tabRect.left - listRect.left - (listRect.width - tabRect.width) / 2
      if (Math.abs(delta) < 1) return
      list.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' })
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          const target = record.target as Element
          if (target.matches?.('.app-tabs-tab[data-active]')) reveal(target, true)
          continue
        }
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          const active = node.matches('.app-tabs-tab[data-active]')
            ? node
            : node.querySelector('.app-tabs-tab[data-active]')
          if (active) reveal(active, false)
        })
      }
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-active'],
      childList: true,
      subtree: true,
    })
    document.querySelectorAll('.app-tabs-tab[data-active]').forEach((tab) => reveal(tab, false))

    return () => observer.disconnect()
  }, [])
}
