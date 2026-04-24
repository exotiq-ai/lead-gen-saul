'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  SquaresFour,
  Funnel,
  Users,
  ChartBar,
  MagnifyingGlass,
  Robot,
  CurrencyDollar,
  Gear,
} from '@phosphor-icons/react'
import { TenantSelector } from './TenantSelector'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: SquaresFour },
  { label: 'Pipeline', href: '/dashboard/pipeline', icon: Funnel },
  { label: 'Leads', href: '/dashboard/leads', icon: Users },
  { label: 'Scoring', href: '/dashboard/scoring', icon: ChartBar },
  { label: 'Enrichment', href: '/dashboard/enrichment', icon: MagnifyingGlass },
  { label: 'Agents', href: '/dashboard/agents', icon: Robot },
  { label: 'Economics', href: '/dashboard/economics', icon: CurrencyDollar },
  { label: 'Settings', href: '/dashboard/settings', icon: Gear },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex flex-col w-[240px] bg-[var(--color-saul-bg-900)] border-r border-[rgba(255,255,255,0.05)]">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[22px] font-bold tracking-[-0.02em] text-[var(--color-saul-cyan)] leading-none">
            SAUL
          </span>
          <span className="text-[11px] text-[var(--color-saul-text-secondary)] font-medium tracking-[0.06em] uppercase">
            LeadGen
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-[rgba(255,255,255,0.05)] mb-3" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 flex flex-col gap-0.5" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon

          return (
            <motion.div
              key={item.href}
              layout
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <Link
                href={item.href}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13.5px] font-medium transition-all duration-200 relative group',
                  active
                    ? 'bg-[var(--color-saul-bg-700)] text-[var(--color-saul-text-primary)]'
                    : 'text-[var(--color-saul-text-secondary)] hover:bg-[var(--color-saul-bg-600)] hover:text-[var(--color-saul-text-primary)]',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {/* Active left border indicator */}
                {active && (
                  <motion.span
                    layoutId="sidebar-active-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[var(--color-saul-cyan)]"
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    aria-hidden="true"
                  />
                )}
                <Icon
                  size={18}
                  weight="regular"
                  className={[
                    'shrink-0 transition-colors duration-200',
                    active
                      ? 'text-[var(--color-saul-cyan)]'
                      : 'group-hover:text-[var(--color-saul-text-primary)]',
                  ].join(' ')}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="mx-5 h-px bg-[rgba(255,255,255,0.05)] mt-3" />

      {/* Tenant Selector pinned at bottom */}
      <div className="pt-3">
        <TenantSelector />
      </div>
    </aside>
  )
}
