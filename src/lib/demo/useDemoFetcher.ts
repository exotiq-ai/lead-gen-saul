'use client'

import { useDemo } from './DemoProvider'
import { getDemoDataForPath } from './datasets'

const realFetcher = (url: string) => fetch(url).then((r) => r.json())

export function useDemoFetcher(): (url: string) => Promise<unknown> {
  const isDemo = useDemo()

  if (!isDemo) return realFetcher

  return (url: string) => {
    const demoData = getDemoDataForPath(url)
    if (demoData !== null) {
      return Promise.resolve(demoData)
    }
    return realFetcher(url)
  }
}
