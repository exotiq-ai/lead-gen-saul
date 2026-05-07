'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

const DemoContext = createContext(false)

export function useDemo(): boolean {
  return useContext(DemoContext)
}

interface DemoProviderProps {
  children: ReactNode
}

export function DemoProvider({ children }: DemoProviderProps) {
  const params = useSearchParams()
  const isDemo = params.get('demo') === 'true'
  return <DemoContext.Provider value={isDemo}>{children}</DemoContext.Provider>
}
