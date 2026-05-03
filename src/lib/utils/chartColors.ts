'use client'

import { useSyncExternalStore } from 'react'
import { useDashboardStore, type Theme } from '@/stores/dashboardStore'

/**
 * Theme-aware color palettes for Recharts and other contexts where CSS
 * variables can't be used directly (recharts requires literal color strings
 * for stroke/fill props in JSX).
 *
 * Keep these values in sync with `[data-theme="light"]` in `globals.css` —
 * they're effectively a JS mirror of those tokens for chart consumption.
 */
export interface ChartPalette {
  /* brand / semantic */
  primary: string
  success: string
  warning: string
  danger: string
  info: string
  violet: string
  orange: string
  teal: string
  /* generic series */
  series: [string, string, string, string, string, string, string, string]
  /* contrast neutrals */
  neutral: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  /* chart chrome */
  gridStroke: string
  axisFill: string
  cursorFill: string
  cursorStroke: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  /* surfaces — used by activeDot.stroke etc. */
  surface: string
  divider: string
}

const DARK_PALETTE: ChartPalette = {
  primary: '#00D4AA',
  success: '#00D4AA',
  warning: '#FFAE42',
  danger: '#FF4757',
  info: '#3B82F6',
  violet: '#A855F7',
  orange: '#F97316',
  teal: '#06B6D4',
  series: [
    '#00D4AA',
    '#3B82F6',
    '#FFAE42',
    '#A855F7',
    '#FF4757',
    '#06B6D4',
    '#F97316',
    '#EC4899',
  ],
  neutral: '#8B95A8',
  textPrimary: '#F0F2F5',
  textSecondary: '#8B95A8',
  textTertiary: '#4A5568',
  gridStroke: 'rgba(255,255,255,0.04)',
  axisFill: '#8B95A8',
  cursorFill: 'rgba(255,255,255,0.03)',
  cursorStroke: 'rgba(0,212,170,0.2)',
  tooltipBg: '#151B2E',
  tooltipBorder: 'rgba(255,255,255,0.10)',
  tooltipText: '#F0F2F5',
  surface: '#151B2E',
  divider: 'rgba(255,255,255,0.06)',
}

const LIGHT_PALETTE: ChartPalette = {
  primary: '#00B894',
  success: '#00B894',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#2563EB',
  violet: '#7C3AED',
  orange: '#EA580C',
  teal: '#0891B2',
  series: [
    '#00B894',
    '#2563EB',
    '#D97706',
    '#7C3AED',
    '#DC2626',
    '#0891B2',
    '#EA580C',
    '#DB2777',
  ],
  neutral: '#4a5468',
  textPrimary: '#0a0a0a',
  textSecondary: '#4a5468',
  textTertiary: '#707a8b',
  gridStroke: 'rgba(0,0,0,0.06)',
  axisFill: '#4a5468',
  cursorFill: 'rgba(0,0,0,0.04)',
  cursorStroke: 'rgba(0,184,148,0.25)',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(0,0,0,0.08)',
  tooltipText: '#0a0a0a',
  surface: '#ffffff',
  divider: 'rgba(0,0,0,0.08)',
}

/**
 * Pure (non-hook) accessor — useful for one-shot reads inside event handlers
 * or non-component code. Falls back to the DOM `data-theme` attribute.
 */
export function getChartPalette(theme?: Theme): ChartPalette {
  const resolved =
    theme ??
    (typeof document !== 'undefined'
      ? ((document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'dark')
      : 'dark')
  return resolved === 'light' ? LIGHT_PALETTE : DARK_PALETTE
}

/**
 * Reactive theme hook. SSR-safe: returns `'dark'` on the server and during the
 * first client render, then re-renders with the actual persisted value once
 * zustand has hydrated. Uses useSyncExternalStore -- React-19-blessed pattern
 * for the "render server fallback then real value" hydration shape, avoids
 * the set-state-in-effect lint error.
 */
export function useTheme(): Theme {
  const storeTheme = useDashboardStore((s) => s.theme)
  const hasMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
  return hasMounted ? storeTheme : 'dark'
}

/** Convenience hook returning the live palette for the current theme. */
export function useChartPalette(): ChartPalette {
  const theme = useTheme()
  return getChartPalette(theme)
}
