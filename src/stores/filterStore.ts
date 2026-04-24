import { create } from 'zustand'

interface FilterStore {
  search: string
  setSearch: (s: string) => void
  statusFilter: string[]
  setStatusFilter: (s: string[]) => void
  assignedToFilter: 'all' | 'gregory' | 'team'
  setAssignedToFilter: (a: 'all' | 'gregory' | 'team') => void
  sourceFilter: string[]
  setSourceFilter: (s: string[]) => void
  redFlagsOnly: boolean
  setRedFlagsOnly: (v: boolean) => void
  clearFilters: () => void
}

const DEFAULT_STATE = {
  search: '',
  statusFilter: [] as string[],
  assignedToFilter: 'all' as const,
  sourceFilter: [] as string[],
  redFlagsOnly: false,
}

export const useFilterStore = create<FilterStore>()((set) => ({
  ...DEFAULT_STATE,
  setSearch: (s) => set({ search: s }),
  setStatusFilter: (s) => set({ statusFilter: s }),
  setAssignedToFilter: (a) => set({ assignedToFilter: a }),
  setSourceFilter: (s) => set({ sourceFilter: s }),
  setRedFlagsOnly: (v) => set({ redFlagsOnly: v }),
  clearFilters: () => set(DEFAULT_STATE),
}))
