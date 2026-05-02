'use client'

import { DownloadSimple, Database, EnvelopeSimple, MagnifyingGlass, ChartLine } from '@phosphor-icons/react'
import { useTenantId } from '@/lib/hooks/useTenant'

const DATASETS = [
  {
    id: 'leads',
    title: 'Leads',
    description: 'Every lead in your tenant: contact info, company, status, score, red flags, timestamps.',
    icon: Database,
    rowsHint: 'one row per lead',
  },
  {
    id: 'outreach',
    title: 'Outreach queue',
    description: 'Every drafted, approved, sent, or rejected message — with the lead context joined.',
    icon: EnvelopeSimple,
    rowsHint: 'one row per draft / message',
  },
  {
    id: 'enrichments',
    title: 'Enrichments',
    description: 'Apollo / Google Places / saul_web enrichment runs, status, cost, error messages.',
    icon: MagnifyingGlass,
    rowsHint: 'one row per enrichment job',
  },
  {
    id: 'activities',
    title: 'Lead activities',
    description: 'Inbound + outbound events: DMs, emails, score changes, status changes.',
    icon: ChartLine,
    rowsHint: 'one row per activity',
  },
] as const

export function ExportsPageClient() {
  const tenantId = useTenantId()

  return (
    <div className="px-3 sm:px-6 py-6 max-w-5xl">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <DownloadSimple
            size={28}
            className="text-[var(--color-saul-cyan)]"
            weight="duotone"
          />
          <h1 className="text-2xl font-bold text-[var(--color-saul-text-primary)] tracking-tight">
            Exports
          </h1>
        </div>
        <p className="text-[14px] text-[var(--color-saul-text-secondary)] max-w-2xl">
          Stream tenant data as CSV. Files include a UTF-8 BOM for Excel compatibility and arrive in
          paged chunks so multi-thousand-row exports don&apos;t time out.
        </p>
      </header>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DATASETS.map((d) => {
          const Icon = d.icon
          const href = `/api/exports?tenant_id=${tenantId}&dataset=${d.id}`
          return (
            <li
              key={d.id}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-saul-bg-800)] p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <Icon size={20} weight="duotone" className="text-[var(--color-saul-cyan)]" />
                <h2 className="text-[15px] font-semibold text-[var(--color-saul-text-primary)]">
                  {d.title}
                </h2>
              </div>
              <p className="text-[13px] text-[var(--color-saul-text-secondary)] flex-1">
                {d.description}
              </p>
              <span className="text-[11px] text-[var(--color-saul-text-tertiary)] uppercase tracking-wide">
                {d.rowsHint}
              </span>
              <a
                href={href}
                download
                className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 text-[12px] font-semibold rounded-[6px] bg-[var(--color-saul-cyan)] text-[var(--color-saul-bg-900)] hover:brightness-110"
              >
                <DownloadSimple size={13} weight="bold" />
                Download CSV
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
