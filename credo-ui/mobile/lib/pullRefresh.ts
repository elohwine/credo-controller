import { useEffect } from 'react'

/** Reload the page's existing loader when the person pulls down from the top. */
export function usePullRefresh(reload: () => void) {
  useEffect(() => {
    const onRefresh = () => reload()
    window.addEventListener('credentis-pull-refresh', onRefresh)
    return () => window.removeEventListener('credentis-pull-refresh', onRefresh)
  }, [reload])
}
