'use client'

import { useDashboardStore } from '@/stores/dashboardStore'

export async function exportElementAsPng(
  element: HTMLElement,
  filename: string = 'saul-dashboard-export.png'
): Promise<void> {
  const store = useDashboardStore.getState()
  const prevTheme = store.theme

  if (prevTheme === 'dark') {
    store.setTheme('light')
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

  try {
    const html2canvas = (await import('html2canvas-pro')).default
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  } finally {
    if (prevTheme === 'dark') {
      store.setTheme(prevTheme)
    }
  }
}
