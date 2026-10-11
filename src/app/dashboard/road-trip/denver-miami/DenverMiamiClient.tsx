'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { TRIP_MARKETS, googleLeg, safeWebUrl, type TripLead } from '@/lib/road-trip/denverMiami'

interface TripResponse { data: TripLead[]; excluded_count: number; generated_at: string; note: string }
const fetcher = async (url: string): Promise<TripResponse> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Trip research could not be loaded. Retry or sign in again.')
  return response.json()
}
const panel = 'rounded-2xl border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)]'
const muted = 'text-[var(--color-saul-text-primary)]/80'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-saul-border-strong)] px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-saul-cyan)]'

function dateLabel(value?: string | null) {
  if (!value) return 'Date unverified'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}
function Source({ href, children }: { href?: string | null; children: React.ReactNode }) {
  const safe = safeWebUrl(href)
  return safe ? <a href={safe} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-[var(--color-saul-cyan)] underline underline-offset-4">{children} ↗</a> : null
}
function Action({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined} className={`${button} ${primary ? 'border-transparent bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]' : 'bg-[var(--color-saul-bg-600)]'}`}>{children}</a>
}

function TripCard({ lead }: { lead: TripLead }) {
  const r = lead.research
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const callPrep = `Hi, this is Gregory, founder of Exotiq. I’m planning a trip through ${r.city} and reaching out to independent rental operators. Who handles your bookings and fleet operations? I’d like to arrange a short, 15-minute conversation. What’s the best location to meet, and do you require an appointment?`
  const addressLabels: Record<string, string> = {
    verified_business_location: 'Business address matched online', appointment_only: 'Appointment only',
    service_area_only: 'Delivery / service area only', address_conflict: 'Conflicting addresses', unknown: 'Visit location unverified', residential: 'Not a public visit location',
  }
  async function copyPrep() {
    try { await navigator.clipboard.writeText(callPrep); setCopied(true); setCopyError(false) }
    catch { setCopyError(true) }
  }
  return <article id={`lead-${lead.id}`} data-trip-lead={lead.id} className={`${panel} min-w-0 scroll-mt-24 p-4 sm:p-5 [overflow-wrap:anywhere]`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className={`text-sm ${muted}`}>{r.city}, {r.state}</p><h3 className="mt-1 text-xl font-bold leading-snug">{lead.companyName}</h3></div>
      <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${lead.qualified ? 'bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)] text-[var(--color-saul-cyan)]' : 'bg-amber-400/10 text-amber-300'}`}>{lead.qualified ? `${r.priority} fit` : 'Qualify'}</span>
    </div>
    <p className="mt-3 text-sm font-semibold">{lead.ownerLabel}{r.owner.role ? <span className={`font-normal ${muted}`}> · {r.owner.role}</span> : null}</p>
    <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm ${muted}`}>
      <span>{r.icp.fleet_min_visible != null ? `${r.icp.fleet_min_visible} advertised listings/models` : 'Fleet size unverified'}</span>
      <span>{r.google?.rating != null ? `★ ${r.google.rating} · ${r.google.review_count ?? '?'} Google reviews` : 'Google rating unverified'}</span>
    </div>
    <div className={`mt-4 rounded-xl border p-3 ${lead.visitState === 'research' ? 'border-amber-400/20 bg-amber-400/5' : 'border-[var(--color-saul-border)] bg-[var(--color-saul-bg-600)]'}`}>
      <p className="text-sm font-semibold">{lead.followUp ? 'Existing conversation. Review history first.' : lead.visitState === 'appointment' ? 'Arrange an appointment before driving' : lead.visitState === 'call-first' ? 'Call to confirm your visit' : 'Research / phone qualification first'}</p>
      <p className={`mt-1 text-sm ${muted}`}>{addressLabels[r.address.status] ?? 'Visit location unverified'}</p>
      {lead.address && <p className="mt-1 text-sm leading-relaxed">{lead.address}</p>}
      {!lead.fresh && <p className="mt-2 text-sm text-amber-300">Evidence is older than 14 days or undated. Recheck before travel.</p>}
      {lead.closed && <p className="mt-2 text-sm text-amber-300">Google reports this business closed. Do not drive here without confirmation.</p>}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {lead.phone && <Action href={`tel:${lead.phone}`} primary>Call</Action>}
      {lead.email && <Action href={`mailto:${encodeURIComponent(lead.email)}`}>Email</Action>}
      {lead.directions && <Action href={lead.directions}>Google directions</Action>}
      {lead.website && <Action href={lead.website}>Website</Action>}
      {lead.instagram && <Action href={lead.instagram}>Instagram</Action>}
      <Link href={`/dashboard/leads/${lead.id}`} className={button}>Lead & notes</Link>
    </div>
    <p className={`mt-3 text-xs leading-relaxed ${muted}`}>Checked {dateLabel(r.checked_at)} · {lead.followUp ? 'Warm follow-up' : 'Research only, no outreach sent by this trip import'}</p>
    <details className="mt-3 border-t border-[var(--color-saul-border)]">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between text-sm font-semibold">Evidence, reviews & visit prep <span aria-hidden="true">＋</span></summary>
      <div className="space-y-5 pb-1 text-sm leading-relaxed">
        <section><h4 className="font-bold">Business contacts</h4><p className={muted}>{r.phone || 'Phone not found'}<br />{r.email || 'Public business email not found'}</p>{lead.website && <Source href={lead.website}>Official website</Source>}</section>
        <section><h4 className="font-bold">Owner / leadership evidence</h4><p className={muted}>{r.owner.note || 'Confirm decision-maker role and availability when calling.'}</p><Source href={r.owner.source_url}>Name / role source</Source></section>
        <section><h4 className="font-bold">Address verification</h4><p className={muted}>{r.address.note || 'Online evidence is not an in-person verification or a walk-in appointment.'}</p>{r.address.official && <p className="mt-2">Website: {r.address.official}</p>}{r.address.google && <p>Google: {r.address.google}</p>}<Source href={lead.mapsListing}>Google business listing</Source></section>
        <section><h4 className="font-bold">Fleet / operator fit</h4><p className={muted}>{r.icp.note || 'Listed inventory is not confirmation of ownership or current availability.'}</p><Source href={r.icp.evidence_url}>Fleet / rental evidence</Source></section>
        <section><h4 className="font-bold">Google reviews</h4><p className={`mt-1 ${muted}`}>{r.google?.reviews_basis || 'No review sample verified.'}</p>
          {(r.google?.reviews ?? []).map((review, i) => <div key={review.url || i} className="mt-3 border-l-2 border-[var(--color-saul-border-strong)] pl-3"><p className="font-semibold">{review.stars ?? '?'} / 5 · {dateLabel(review.date)}</p>{review.author_name && <p className={muted}>{review.author_name} · Google</p>}<p className={`mt-1 ${muted}`}>{review.text_summary}</p><Source href={review.url}>Read review on Google</Source></div>)}
          {!r.google?.reviews?.length && <p className={`mt-2 ${muted}`}>No individual reviews available. A rating alone is not evidence of recent activity.</p>}
        </section>
        <section><h4 className="font-bold">Dated Instagram evidence</h4><p className={`mt-1 ${muted}`}>{r.instagram?.coverage || 'Latest posts not verified.'}</p>{(r.instagram?.posts ?? []).map((post, i) => <div className="mt-3" key={post.url || i}><p className="font-semibold">{dateLabel(post.date)}</p><p className={muted}>{post.summary}</p><Source href={post.url}>View post</Source></div>)}</section>
        {lead.reasons.length > 0 && <section><h4 className="font-bold">Open questions</h4><ul className={`mt-1 list-inside list-disc ${muted}`}>{lead.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></section>}
        {r.contact_conflicts && <section><h4 className="font-bold">Contact comparison</h4>{Object.entries(r.contact_conflicts).map(([field, conflict]) => <p key={field} className={`mt-2 ${muted}`}>{field}: CRM {conflict.existing}; researched {conflict.researched}. {conflict.resolution}.</p>)}</section>}
        <section><h4 className="font-bold">Visit-prep opener</h4><p className={`mt-2 ${muted}`}>{callPrep}</p><button type="button" className={`${button} mt-3`} onClick={() => void copyPrep()}>{copied ? 'Copied' : 'Copy opener'}</button>{copyError && <p role="status" className="mt-2 text-amber-300">Copy unavailable. Select the text above.</p>}</section>
        <section><h4 className="font-bold">Source trail</h4><ul>{r.source_urls.map((url, i) => <li key={`${url}-${i}`}><Source href={url}>{safeWebUrl(url) ? new URL(url).hostname.replace(/^www\./, '') : 'Source'}</Source></li>)}</ul></section>
      </div>
    </details>
  </article>
}

export function DenverMiamiClient() {
  const router = useRouter()
  const params = useSearchParams()
  const requested = params.get('city')
  const city = TRIP_MARKETS.some(m => m.slug === requested) ? requested! : 'all'
  const [query, setQuery] = useState('')
  const [visitsOnly, setVisitsOnly] = useState(false)
  const [orlando, setOrlando] = useState(false)
  const { data, error, isLoading, mutate } = useSWR<TripResponse>('/api/leads/road-trip/denver-miami', fetcher, { shouldRetryOnError: false, revalidateOnFocus: true })
  useEffect(() => {
    if (data && window.location.hash.startsWith('#lead-')) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [data])
  const leads = data?.data ?? []
  const market = TRIP_MARKETS.find(m => m.slug === city)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...(data?.data ?? [])].filter(l => (city === 'all' || l.market === city) && (!visitsOnly || l.visitState !== 'research') && (!q || [l.companyName,l.research.city,l.ownerLabel,l.research.phone,l.research.email].filter(Boolean).join(' ').toLowerCase().includes(q)))
      .sort((a,b) => TRIP_MARKETS.findIndex(m => m.slug === a.market) - TRIP_MARKETS.findIndex(m => m.slug === b.market) || b.priority-a.priority || a.companyName.localeCompare(b.companyName))
  }, [data, city, query, visitsOnly])
  const route = TRIP_MARKETS.filter(m => orlando || m.slug !== 'orlando')
  return <div className="mx-auto max-w-6xl space-y-6 pb-16 text-[var(--color-saul-text-primary)]">
    <header>
      <p className="text-sm font-semibold text-[var(--color-saul-cyan)]">Exotiq · field sales</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Denver → Miami</h1>
      <p className={`mt-3 max-w-3xl text-base leading-relaxed ${muted}`}>Operator research and locations to confirm before visiting. Jacksonville is your fixed friend stop.</p>
      <div className="mt-4 flex flex-wrap gap-2"><a href="#prospects" className={`${button} border-transparent bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]`}>View {data ? leads.length : ''} prospects ↓</a><Link href="/dashboard/leads" className={button}>All leads</Link></div>
      <Link href="/dashboard/road-trip" className="mt-2 inline-flex min-h-11 items-center text-sm text-[var(--color-saul-cyan)] underline underline-offset-4">Previous Texas → Florida trip</Link>
    </header>
    <details className={`${panel} p-4 sm:p-5`} aria-label="Trip plan">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold">Trip plan · Jacksonville fixed <span aria-hidden="true">＋</span></summary>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">The corridor</h2><p className={`mt-1 text-sm ${muted}`}>Dates and appointments are not yet set. Departure requested in 1–2 weeks on October 11.</p></div><span className="rounded-full border border-[var(--color-saul-cyan)]/40 px-3 py-2 text-sm text-[var(--color-saul-cyan)]">Jacksonville · friend stop</span></div>
      <p className="mt-4 text-sm leading-7">{route.map(m => m.name).join(' → ')}</p>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={orlando} onChange={e => setOrlando(e.target.checked)} className="h-5 w-5 accent-[var(--color-saul-cyan)]" />Include Orlando as a conditional detour</label>
      <p className={`mt-2 text-sm ${muted}`}>Approximately {orlando ? '2,135 miles / 39.3 driving hours' : '2,105 miles / 38.6 driving hours'}. Orlando adds roughly 30 miles. City-center OSRM estimates captured October 11, 2026, not live traffic, business-stop mileage, or a daily schedule.</p>
      <details className="mt-3 border-t border-[var(--color-saul-border)]"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold">Open a city-to-city leg in Google Maps</summary><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{route.slice(1).map((to,i) => <Action key={to.slug} href={googleLeg(`${route[i].name}, ${route[i].state}`,`${to.name}, ${to.state}`)}>{route[i].name} → {to.name}</Action>)}</div><p className={`mt-3 text-sm ${muted}`}>These are city centers, not confirmed visits. Use a prospect’s directions only after confirming the meeting location.</p></details>
    </details>
    {data && <section className="grid grid-cols-3 gap-2" aria-label="Research coverage">{[[leads.length,'Researched leads'],[leads.filter(l=>l.visitState!=='research').length,'Matched visit locations'],[leads.filter(l=>Boolean(l.research.owner.name)).length,'Named contacts']].map(([count,label]) => <div key={label} className={`${panel} p-3 sm:p-4`}><p className="text-2xl font-bold tabular-nums text-[var(--color-saul-cyan)]">{count}</p><p className={`mt-1 text-sm leading-snug ${muted}`}>{label}</p></div>)}</section>}
    <div id="prospects" className="scroll-mt-24"><label className="block text-sm font-semibold sm:hidden">Market<select aria-label="Choose market" value={city} onChange={e => router.push(e.target.value === 'all' ? '/dashboard/road-trip/denver-miami' : `/dashboard/road-trip/denver-miami?city=${e.target.value}`, { scroll: false })} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] px-3 text-base"><option value="all">All markets · {leads.length}</option>{TRIP_MARKETS.map(m => <option key={m.slug} value={m.slug}>{m.name} · {leads.filter(l => l.market === m.slug).length}{m.kind === 'optional' ? ' · optional' : ''}</option>)}</select></label></div>
    <nav className="hidden flex-wrap gap-2 sm:flex" aria-label="Trip markets"><Link scroll={false} href="/dashboard/road-trip/denver-miami" className={`${button} ${city==='all'?'bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]':''}`} aria-current={city==='all'?'page':undefined}>All markets</Link>{TRIP_MARKETS.map(m => <Link scroll={false} key={m.slug} href={`/dashboard/road-trip/denver-miami?city=${m.slug}`} aria-current={city===m.slug?'page':undefined} className={`${button} ${city===m.slug?'bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]':''}`}>{m.name} · {leads.filter(l=>l.market===m.slug).length}{m.kind==='optional'?' · optional':''}</Link>)}</nav>
    <section className="space-y-3"><h2 className="text-xl font-bold">{market ? `${market.name} prospects` : 'Researched prospects'}</h2>{market && <p className={`text-sm ${muted}`}>{market.note}</p>}<label className="block"><span className={`mb-2 block text-sm ${muted}`}>Search researched operators</span><input aria-label="Search researched operators" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Business, contact, phone or email…" className="min-h-12 w-full rounded-xl border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] px-4 text-base focus-visible:outline-2 focus-visible:outline-[var(--color-saul-cyan)]" /></label><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" aria-label="Show only matched visit locations" checked={visitsOnly} onChange={e=>setVisitsOnly(e.target.checked)} className="h-5 w-5 accent-[var(--color-saul-cyan)]" />Matched visit locations only, still call first</label><p className={`text-sm ${muted}`}>Sorted in corridor order, then warm conversations and trip fit. Fit and visit readiness are separate. Existing CRM scores and histories are preserved.</p></section>
    {isLoading && <p role="status" className={`${panel} p-5`}>Loading saved trip research…</p>}
    {error && <div role="alert" className={`${panel} p-5`}><p>{error.message}</p><button onClick={()=>void mutate()} className={`${button} mt-3`}>Retry</button></div>}
    {data && !filtered.length && <div className={`${panel} p-5`}><h3 className="font-bold">No matching prospects</h3><p className={`mt-2 text-sm ${muted}`}>{city==='denver'?'Denver is the starting point; this research covered the outbound corridor.':'Try another market or clear the filters. No unverified stop has been added just to fill the route.'}</p></div>}
    <div className="grid items-start gap-4 lg:grid-cols-2">{filtered.map(lead=><TripCard key={lead.id} lead={lead} />)}</div>
    <footer className={`border-t border-[var(--color-saul-border)] pt-4 text-sm leading-relaxed ${muted}`}>No appointments or outreach are created by this page. Online address matching does not prove walk-in access or owner availability. Missing owner names, emails, recent posts and review dates remain explicit gaps.{data && data.excluded_count>0 ? ` ${data.excluded_count} saved records excluded by suppression/eligibility checks.` : ''}</footer>
  </div>
}
