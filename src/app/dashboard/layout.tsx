import type { ReactNode } from 'react'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-saul-bg-800)] flex">
      <Sidebar />

      {/* Center column: topbar + main content */}
      <div className="flex flex-col flex-1 min-w-0 ml-[240px] xl:mr-[280px]">
        <TopBar />
        <main className="flex-1 pt-[60px] overflow-y-auto">
          <div className="p-6 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>

      {/* Right rail: activity feed — xl+ only */}
      <aside className="hidden xl:flex flex-col fixed right-0 top-[60px] bottom-0 w-[280px]">
        <ActivityFeed />
      </aside>
    </div>
  )
}
