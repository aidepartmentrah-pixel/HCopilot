import { useState } from 'react'

export type ChartView = 'bar' | 'line' | 'donut' | 'table'

function readStored(storageKey: string | undefined, allowedViews: ChartView[], defaultView: ChartView): ChartView {
  if (!storageKey) return defaultView
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored && allowedViews.includes(stored as ChartView)) return stored as ChartView
  } catch {
    // private-browsing / blocked storage — fall through to the default
  }
  return defaultView
}

/**
 * Per-chart visualization preference (§11), opt-in via `storageKey` like
 * ResizablePanel's width persistence. A stored value outside the current
 * `allowedViews` (e.g. a stale "donut" after switching Arrivals to Hour of
 * Day, where donut is invalid) is discarded in favor of `defaultView`
 * rather than rendering an invalid chart.
 */
export function useChartViewPreference(storageKey: string | undefined, defaultView: ChartView, allowedViews: ChartView[]) {
  const [view, setViewState] = useState<ChartView>(() => readStored(storageKey, allowedViews, defaultView))

  function setView(next: ChartView) {
    setViewState(next)
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // private-browsing / blocked storage — the in-memory state still updates
      }
    }
  }

  return [view, setView] as const
}
