import { Suspense, type ReactNode } from 'react'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { DashboardClientLayout } from './layout-client'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-saul-bg-800)] flex">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>

      {/* Center column: topbar + main content */}
      <div className="flex flex-col flex-1 min-w-0 lg:ml-[240px] xl:mr-[280px]">
        <Suspense fallback={null}>
          <TopBar />
        </Suspense>
        <main className="flex-1 pt-[60px] overflow-y-auto">
          <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
            <Suspense fallback={null}>
              <DashboardClientLayout>{children}</DashboardClientLayout>
            </Suspense>
          </div>
        </main>
      </div>

      {/* Right rail: activity feed — xl+ only */}
      <aside className="hidden xl:flex flex-col fixed right-0 top-[60px] bottom-0 w-[280px]">
        <Suspense fallback={null}>
          <ActivityFeed />
        </Suspense>
      </aside>
    </div>
  )
}
