'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  ArrowSquareOut,
  Buildings,
  ChatText,
  Check,
  ClipboardText,
  EnvelopeSimple,
  Funnel,
  Globe,
  InstagramLogo,
  MapPin,
  MagnifyingGlass,
  NavigationArrow,
  PaperPlaneTilt,
  Phone,
  RoadHorizon,
  X,
} from '@phosphor-icons/react'

import {
  ROAD_TRIP_CITIES,
  buildRoadTripLead,
  filterRoadTripLeads,
  summarizeRoadTripCity,
  type RoadTripCitySlug,
  type RoadTripLead,
  type RoadTripLeadInput,
} from '@/lib/road-trip/model'

interface RoadTripResponse {
  data: RoadTripLeadInput[]
  generated_at: string
  location_note?: string
}

const fetcher = async (url: string): Promise<RoadTripResponse> => {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Could not load road-trip leads')
  return payload
}

function ActionLink({ href, label, icon, primary = false }: {
  href: string
  label: string
  icon: React.ReactNode
  primary?: boolean
}) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={[
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors',
        primary
          ? 'bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)] hover:brightness-110'
          : 'border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-primary)] hover:border-[var(--color-saul-cyan)]/40',
      ].join(' ')}
    >
      {icon}
      {label}
    </a>
  )
}

function RouteMap({ selected, counts, cityHref }: {
  selected: RoadTripCitySlug
  counts: Record<RoadTripCitySlug, number>
  cityHref: (city: RoadTripCitySlug) => string
}) {
  const path = ROAD_TRIP_CITIES.map((city) => `${city.map.x},${city.map.y}`).join(' ')
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[var(--color-saul-border)] bg-[linear-gradient(150deg,var(--color-saul-bg-700),var(--color-saul-bg-900))] shadow-[0_24px_80px_var(--color-saul-shadow-soft)]">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-saul-cyan)]">Texas → Florida</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--color-saul-text-primary)]">Interactive sales route</h2>
        </div>
        <span className="rounded-full border border-[var(--color-saul-border)] px-2.5 py-1 text-[10px] text-[var(--color-saul-text-secondary)]">City-level map</span>
      </div>
      <div className="relative h-[330px] w-full sm:h-[360px]">
        <div className="absolute left-[8%] top-[15%] text-[72px] font-black tracking-[-0.08em] text-white/[0.025] sm:text-[96px]">TX</div>
        <div className="absolute right-[10%] top-[25%] text-[72px] font-black tracking-[-0.08em] text-white/[0.025] sm:text-[96px]">FL</div>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="road-trip-line" x1="0" x2="1">
              <stop offset="0" stopColor="#00D4AA" stopOpacity="0.85" />
              <stop offset="0.5" stopColor="#3B82F6" stopOpacity="0.55" />
              <stop offset="1" stopColor="#00D4AA" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <polyline points={path} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <polyline points={path} fill="none" stroke="url(#road-trip-line)" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {ROAD_TRIP_CITIES.map((city, index) => {
          const active = city.slug === selected
          const count = counts[city.slug]
          return (
            <a
              key={city.slug}
              href={cityHref(city.slug)}
              aria-label={`${city.name}, ${count} ${count === 1 ? 'lead' : 'leads'}`}
              className="group absolute -translate-x-1/2 -translate-y-1/2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)]"
              style={{ left: `${city.map.x}%`, top: `${city.map.y}%` }}
            >
              <span className={[
                'flex h-11 w-11 items-center justify-center rounded-full border-2 text-[12px] font-black shadow-xl transition-all',
                active
                  ? 'scale-110 border-[var(--color-saul-cyan)] bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)] shadow-[0_0_0_8px_color-mix(in_srgb,var(--color-saul-cyan)_14%,transparent)]'
                  : 'border-[var(--color-saul-border-stronger)] bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-primary)] group-hover:border-[var(--color-saul-cyan)]/60',
              ].join(' ')}>
                {index + 1}
              </span>
              <span className={[
                'absolute whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold shadow-lg',
                index < 3 ? 'left-1/2 top-[48px] -translate-x-1/2' : 'right-[48px] top-1/2 -translate-y-1/2',
                active
                  ? 'border-[var(--color-saul-cyan)]/30 bg-[var(--color-saul-bg-900)] text-[var(--color-saul-cyan)]'
                  : 'border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] text-[var(--color-saul-text-secondary)]',
              ].join(' ')}>
                {city.name} · {count}
              </span>
            </a>
          )
        })}
      </div>
      <p className="border-t border-[var(--color-saul-border-soft)] px-4 py-3 text-[11px] leading-relaxed text-[var(--color-saul-text-secondary)] sm:px-5">
        Route markers select a market, not a storefront. Use each operator’s <strong className="text-[var(--color-saul-text-primary)]">Directions</strong> button to resolve the live business destination in your maps app.
      </p>
    </section>
  )
}

function LeadCard({ lead, rank }: { lead: RoadTripLead; rank: number }) {
  const [copied, setCopied] = useState(false)
  const precisionLabel = lead.locationPrecision === 'address' ? 'Address on file' : lead.locationPrecision === 'city' ? 'City-level location' : 'Location needs research'

  async function copyOpener() {
    await navigator.clipboard.writeText(lead.callOpener)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <article className="overflow-hidden rounded-[18px] border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] shadow-[0_16px_48px_var(--color-saul-shadow-soft)]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)] font-mono text-sm font-black text-[var(--color-saul-cyan)]">{rank}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 flex-1 text-[17px] font-bold leading-tight text-[var(--color-saul-text-primary)]">{lead.companyName}</h3>
              <span className="rounded-lg border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-600)] px-2 py-1 font-mono text-[11px] font-bold text-[var(--color-saul-cyan)]">{lead.score}</span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--color-saul-text-secondary)]">
              <MapPin size={13} weight="fill" />
              <span className="truncate">{lead.location ?? 'No location recorded'}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-[var(--color-saul-bg-600)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-saul-text-secondary)]">{precisionLabel}</span>
              {lead.assignedTo === 'gregory' && <span className="rounded-md bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-saul-cyan)]">Gregory</span>}
              {lead.fleetSize && <span className="rounded-md bg-[var(--color-saul-bg-600)] px-2 py-1 text-[10px] text-[var(--color-saul-text-secondary)]">{lead.fleetSize}</span>}
              {lead.phoneConfidence && <span className="rounded-md bg-[var(--color-saul-bg-600)] px-2 py-1 text-[10px] text-[var(--color-saul-text-secondary)]">Phone {lead.phoneConfidence}</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--color-saul-cyan)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-saul-cyan)_5%,transparent)] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-saul-cyan)]">Next best action</p>
          <p className="mt-1 text-sm font-bold text-[var(--color-saul-text-primary)]">{lead.nextAction.label}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]">{lead.nextAction.reason}</p>
        </div>

        <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]">{lead.proofPoint}</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {lead.actions.phone && <ActionLink href={lead.actions.phone.href} label="Call" icon={<Phone size={17} weight="fill" />} primary />}
          {lead.actions.sms && <ActionLink href={lead.actions.sms.href} label="Text" icon={<ChatText size={17} weight="fill" />} />}
          {lead.actions.email && <ActionLink href={lead.actions.email.href} label="Email" icon={<EnvelopeSimple size={17} weight="fill" />} />}
          <ActionLink href={lead.actions.googleMaps.href} label="Directions" icon={<NavigationArrow size={17} weight="fill" />} primary={!lead.actions.phone} />
          {lead.actions.instagram && <ActionLink href={lead.actions.instagram.href} label="Instagram" icon={<InstagramLogo size={17} weight="fill" />} />}
          {lead.actions.website && <ActionLink href={lead.actions.website.href} label="Website" icon={<Globe size={17} weight="bold" />} />}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <ActionLink href={lead.actions.lead.href} label="Full lead" icon={<Buildings size={16} weight="bold" />} />
          <ActionLink href={lead.actions.outreach.href} label="Outreach" icon={<PaperPlaneTilt size={16} weight="bold" />} />
        </div>

        <details className="mt-3 rounded-xl border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-600)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[12px] font-semibold text-[var(--color-saul-text-primary)]">
            Call opener
            <ClipboardText size={16} className="text-[var(--color-saul-text-secondary)]" />
          </summary>
          <div className="border-t border-[var(--color-saul-border)] p-3">
            <p className="text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]">{lead.callOpener}</p>
            <button type="button" onClick={() => void copyOpener()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-saul-border-strong)] px-3 text-[12px] font-semibold text-[var(--color-saul-cyan)]">
              {copied ? <Check size={15} weight="bold" /> : <ClipboardText size={15} weight="bold" />}
              {copied ? 'Copied' : 'Copy opener'}
            </button>
          </div>
        </details>

        <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
          <a href={lead.actions.appleMaps.href} target="_blank" rel="noreferrer" className="text-[var(--color-saul-text-secondary)] underline decoration-[var(--color-saul-border-stronger)] underline-offset-4 hover:text-[var(--color-saul-cyan)]">Open in Apple Maps</a>
          <span className="uppercase tracking-wide text-[var(--color-saul-text-tertiary)]">{lead.status}</span>
        </div>
      </div>
    </article>
  )
}

export function RoadTripPageClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestedCity = searchParams.get('city') as RoadTripCitySlug | null
  const selectedCity = ROAD_TRIP_CITIES.some((city) => city.slug === requestedCity) ? requestedCity! : 'dallas'
  const [query, setQuery] = useState('')
  const [priorityOnly, setPriorityOnly] = useState(false)
  const [callableOnly, setCallableOnly] = useState(false)
  const [instagramOnly, setInstagramOnly] = useState(false)
  const { data, error, isLoading } = useSWR<RoadTripResponse>('/api/leads/road-trip', fetcher, { revalidateOnFocus: false })

  const allLeads = useMemo(() => (data?.data ?? []).map(buildRoadTripLead).filter((lead) => lead.city !== null), [data])
  const counts = useMemo(() => Object.fromEntries(ROAD_TRIP_CITIES.map((city) => [city.slug, allLeads.filter((lead) => lead.city === city.slug).length])) as Record<RoadTripCitySlug, number>, [allLeads])
  const cityLeads = useMemo(() => allLeads.filter((lead) => lead.city === selectedCity).sort((a, b) => b.priority - a.priority), [allLeads, selectedCity])
  const filteredLeads = useMemo(() => filterRoadTripLeads(cityLeads, { query, priorityOnly, callableOnly, instagramOnly }), [cityLeads, query, priorityOnly, callableOnly, instagramOnly])
  const summary = useMemo(() => summarizeRoadTripCity(cityLeads), [cityLeads])
  const selectedCityInfo = ROAD_TRIP_CITIES.find((city) => city.slug === selectedCity)!
  const activeFilterCount = [priorityOnly, callableOnly, instagramOnly].filter(Boolean).length

  function cityHref(city: RoadTripCitySlug) {
    return `${pathname}?city=${city}`
  }

  function resetFilters() {
    setQuery('')
    setPriorityOnly(false)
    setCallableOnly(false)
    setInstagramOnly(false)
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-24 text-[var(--color-saul-text-primary)]">
      <header className="px-0 pb-5 pt-4 sm:px-2 lg:px-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-saul-cyan)]">
              <RoadHorizon size={16} weight="fill" />
              Exotiq field operations
            </div>
            <h1 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-[-0.04em] sm:text-4xl">Road Trip Command Center</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--color-saul-text-secondary)]">One-tap calls, operator research and directions from Dallas to Miami. This is a separate field companion; your normal leads dashboard remains unchanged.</p>
          </div>
          <Link href="/dashboard/leads" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] px-4 text-[13px] font-semibold text-[var(--color-saul-text-primary)]">
            Normal leads dashboard
            <ArrowSquareOut size={15} weight="bold" />
          </Link>
        </div>
      </header>

      <nav className="sticky top-[60px] z-10 -mx-4 mb-4 border-y border-[var(--color-saul-border-soft)] bg-[color-mix(in_srgb,var(--color-saul-bg-800)_92%,transparent)] px-4 py-2 backdrop-blur-xl md:-mx-6 md:px-6" aria-label="Road-trip cities">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {ROAD_TRIP_CITIES.map((city, index) => (
            <a
              key={city.slug}
              href={cityHref(city.slug)}
              aria-current={city.slug === selectedCity ? 'page' : undefined}
              className={[
                'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-[12px] font-bold',
                city.slug === selectedCity
                  ? 'border-[var(--color-saul-cyan)] bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]'
                  : 'border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] text-[var(--color-saul-text-secondary)]',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] opacity-70">0{index + 1}</span>
              {city.name}
              <span className="rounded-full bg-black/15 px-1.5 py-0.5 font-mono text-[10px]">{counts[city.slug] ?? 0}</span>
            </a>
          ))}
        </div>
      </nav>

      {error ? (
        <div className="rounded-2xl border border-[var(--color-saul-danger)]/30 bg-[var(--color-saul-danger)]/10 p-5 text-sm text-[var(--color-saul-danger)]">{error.message}</div>
      ) : isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="h-[430px] animate-pulse rounded-[22px] bg-[var(--color-saul-bg-700)]" />
          <div className="h-[430px] animate-pulse rounded-[22px] bg-[var(--color-saul-bg-700)]" />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
          <div className="space-y-4 lg:sticky lg:top-[128px]">
            <RouteMap selected={selectedCity} counts={counts} cityHref={cityHref} />
            <section className="grid grid-cols-3 gap-2 rounded-[18px] border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] p-3 sm:grid-cols-6">
              {[
                ['Leads', summary.total], ['Priority', summary.priority], ['Callable', summary.callable],
                ['Instagram', summary.instagram], ['Research', summary.needsResearch], ['Follow-ups', summary.followUps],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--color-saul-bg-600)] p-2.5 text-center">
                  <div className="font-mono text-lg font-black text-[var(--color-saul-text-primary)]">{value}</div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-saul-text-tertiary)]">{label}</div>
                </div>
              ))}
            </section>
          </div>

          <section aria-labelledby="hit-list-heading" className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-saul-cyan)]">Stop {ROAD_TRIP_CITIES.findIndex((city) => city.slug === selectedCity) + 1} of 7</p>
                <h2 id="hit-list-heading" className="mt-1 text-2xl font-black tracking-[-0.03em]">{selectedCityInfo.name} hit list</h2>
              </div>
              <span className="text-[11px] text-[var(--color-saul-text-secondary)]">{filteredLeads.length} shown</span>
            </div>

            {cityLeads[0] && (
              <div className="mb-3 flex items-center gap-3 rounded-[16px] border border-[var(--color-saul-cyan)]/20 bg-[color-mix(in_srgb,var(--color-saul-cyan)_6%,var(--color-saul-bg-700))] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]"><NavigationArrow size={19} weight="fill" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-saul-cyan)]">Start here</p>
                  <p className="truncate text-sm font-bold">{cityLeads[0].companyName}</p>
                  <p className="truncate text-[11px] text-[var(--color-saul-text-secondary)]">{cityLeads[0].nextAction.reason}</p>
                </div>
                {cityLeads[0].nextAction.href && <a href={cityLeads[0].nextAction.href} target={cityLeads[0].nextAction.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-[var(--color-saul-cyan)] px-3 text-[11px] font-black text-[var(--color-saul-text-on-accent)]">Go</a>}
              </div>
            )}

            <div className="mb-4 rounded-[16px] border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] p-3">
              <div className="relative">
                <MagnifyingGlass size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-saul-text-tertiary)]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${selectedCityInfo.name} operators`} className="h-12 w-full rounded-xl border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-600)] pl-10 pr-10 text-base text-[var(--color-saul-text-primary)] outline-none focus:border-[var(--color-saul-cyan)]/50" />
                {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-[var(--color-saul-text-secondary)]"><X size={16} /></button>}
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-saul-text-tertiary)]"><Funnel size={14} /> Filters {activeFilterCount ? `(${activeFilterCount})` : ''}</span>
                {[
                  ['Priority', priorityOnly, setPriorityOnly], ['Has phone', callableOnly, setCallableOnly], ['Instagram', instagramOnly, setInstagramOnly],
                ].map(([label, active, setter]) => (
                  <button key={label as string} type="button" onClick={() => (setter as (value: boolean) => void)(!(active as boolean))} className={[
                    'min-h-10 shrink-0 rounded-full border px-3 text-[11px] font-bold',
                    active ? 'border-[var(--color-saul-cyan)]/40 bg-[var(--color-saul-cyan)]/10 text-[var(--color-saul-cyan)]' : 'border-[var(--color-saul-border)] bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-secondary)]',
                  ].join(' ')}>{label as string}</button>
                ))}
                {(activeFilterCount > 0 || query) && <button type="button" onClick={resetFilters} className="min-h-10 shrink-0 px-2 text-[11px] font-semibold text-[var(--color-saul-danger)]">Reset</button>}
              </div>
            </div>

            <div className="space-y-4">
              {filteredLeads.map((lead, index) => <LeadCard key={lead.id} lead={lead} rank={index + 1} />)}
              {filteredLeads.length === 0 && (
                <div className="rounded-[18px] border border-dashed border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] p-8 text-center">
                  <MapPin size={28} className="mx-auto text-[var(--color-saul-text-tertiary)]" />
                  <h3 className="mt-3 text-base font-bold">No matching operators</h3>
                  <p className="mt-1 text-[12px] text-[var(--color-saul-text-secondary)]">Try another city or reset the active filters.</p>
                  <button type="button" onClick={resetFilters} className="mt-4 min-h-11 rounded-xl bg-[var(--color-saul-cyan)] px-4 text-[12px] font-bold text-[var(--color-saul-text-on-accent)]">Reset filters</button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
