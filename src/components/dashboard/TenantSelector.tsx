'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDown, Car, Check } from '@phosphor-icons/react'
import { useDashboardStore } from '@/stores/dashboardStore'

const DEMO_TENANTS = [
  { id: 'exotiq-ai', name: 'Exotiq.ai', slug: 'exotiq' },
  { id: 'demo-tenant-2', name: 'FleetEdge', slug: 'fleetedge' },
  { id: 'demo-tenant-3', name: 'AutoPrime', slug: 'autoprime' },
]

export function TenantSelector() {
  const [open, setOpen] = useState(false)
  const { activeTenantId, setActiveTenantId } = useDashboardStore()

  const active =
    DEMO_TENANTS.find((t) => t.id === activeTenantId) ?? DEMO_TENANTS[0]

  function select(id: string) {
    setActiveTenantId(id)
    setOpen(false)
  }

  return (
    <div className="relative px-3 pb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(0,212,170,0.2)] transition-all duration-200 group"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-[4px] bg-[rgba(0,212,170,0.12)]">
          <Car size={15} weight="regular" className="text-[var(--color-saul-cyan)]" />
        </span>
        <span className="flex flex-col items-start flex-1 min-w-0">
          <span className="text-[11px] text-[var(--color-saul-text-secondary)] font-medium leading-none mb-0.5">
            Tenant
          </span>
          <span className="text-[13px] text-[var(--color-saul-text-primary)] font-semibold truncate w-full text-left leading-none">
            {active.name}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-[var(--color-saul-text-secondary)] shrink-0"
        >
          <CaretDown size={13} weight="bold" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              role="listbox"
              aria-label="Select tenant"
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute bottom-[calc(100%-4px)] left-3 right-3 z-50 rounded-[8px] bg-[var(--color-saul-bg-600)] border border-[rgba(255,255,255,0.1)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden mb-1"
            >
              <div className="px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-saul-text-secondary)] font-semibold px-2 py-1">
                  Switch tenant
                </p>
              </div>
              <div className="pb-1.5 px-1.5 flex flex-col gap-0.5">
                {DEMO_TENANTS.map((t) => {
                  const isActive = t.id === active.id
                  return (
                    <button
                      key={t.id}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => select(t.id)}
                      className={[
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[5px] text-left transition-all duration-150',
                        isActive
                          ? 'bg-[rgba(0,212,170,0.1)] text-[var(--color-saul-text-primary)]'
                          : 'text-[var(--color-saul-text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--color-saul-text-primary)]',
                      ].join(' ')}
                    >
                      <Car
                        size={14}
                        weight="regular"
                        className={isActive ? 'text-[var(--color-saul-cyan)]' : 'opacity-60'}
                      />
                      <span className="flex-1 text-[13px] font-medium">{t.name}</span>
                      {isActive && (
                        <Check size={13} weight="bold" className="text-[var(--color-saul-cyan)] shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
