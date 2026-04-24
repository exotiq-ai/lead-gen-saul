import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TimeRange = '7d' | '30d' | '90d' | 'all'

interface DashboardStore {
  activeTenantId: string | null
  setActiveTenantId: (id: string) => void
  selectedStageId: string | null
  setSelectedStageId: (id: string | null) => void
  scoreRange: [number, number] | null
  setScoreRange: (range: [number, number] | null) => void
  freshnessFilter: string | null
  setFreshnessFilter: (f: string | null) => void
  timeRange: TimeRange
  setTimeRange: (r: TimeRange) => void
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      activeTenantId: null,
      setActiveTenantId: (id) => set({ activeTenantId: id }),
      selectedStageId: null,
      setSelectedStageId: (id) => set({ selectedStageId: id }),
      scoreRange: null,
      setScoreRange: (range) => set({ scoreRange: range }),
      freshnessFilter: null,
      setFreshnessFilter: (f) => set({ freshnessFilter: f }),
      timeRange: '30d',
      setTimeRange: (r) => set({ timeRange: r }),
    }),
    {
      name: 'saul-dashboard',
      partialize: (state) => ({
        activeTenantId: state.activeTenantId,
        timeRange: state.timeRange,
      }),
    },
  ),
)
