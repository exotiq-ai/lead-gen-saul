'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { LeadActivity } from '@/types'

interface UseRealtimeOptions {
  onActivity: (activity: LeadActivity) => void
  enabled?: boolean
}

export function useRealtime({ onActivity, enabled = true }: UseRealtimeOptions): void {
  const activeTenantId = useDashboardStore((s) => s.activeTenantId)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const callbackRef = useRef(onActivity)

  useEffect(() => {
    callbackRef.current = onActivity
  }, [onActivity])

  useEffect(() => {
    if (!enabled || !activeTenantId) return

    const channel = supabase
      .channel(`lead_activities:${activeTenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_activities',
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        (payload) => {
          const activity = payload.new as LeadActivity
          callbackRef.current(activity)
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [activeTenantId, enabled])
}
