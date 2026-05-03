'use client'

import { useEffect } from 'react'
import { useDashboardStore } from '@/stores/dashboardStore'

/**
 * ThemeProvider
 *
 * Reads the persisted `theme` value from `useDashboardStore` and mirrors it onto
 * `<html data-theme="...">`, which globals.css uses to swap CSS-var palettes.
 *
 * - Renders nothing of its own; mount it once near the top of the dashboard tree.
 * - Listens to store changes so the toggle (wired in TopBar) takes effect immediately.
 * - On first paint we proactively read the persisted store snapshot to minimise FOUC.
 */
export function ThemeProvider() {
  const theme = useDashboardStore((s) => s.theme)

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  return null
}
