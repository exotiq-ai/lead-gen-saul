import Link from 'next/link'
import {
  ArrowLeft,
  ArrowSquareOut,
  Buildings,
  CheckCircle,
  Info,
  MapPin,
  NavigationArrow,
  Phone,
  RoadHorizon,
  WarningCircle,
} from '@phosphor-icons/react/dist/ssr'

import {
  ORLANDO_ROUTE_A_URL,
  ORLANDO_ROUTE_B_URL,
  ORLANDO_ROUTE_ORIGIN,
  ORLANDO_ROUTE_REVIEW_NOTES,
  ORLANDO_VISIT_STOPS,
  routeLegUrl,
} from '@/lib/road-trip/orlandoVisitRoute'

function ExternalButton({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold transition-colors',
        primary
          ? 'bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)] hover:brightness-110'
          : 'border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-primary)] hover:border-[var(--color-saul-cyan)]/50',
      ].join(' ')}
    >
      {children}
    </a>
  )
}

export default function OrlandoVisitRoutePage() {
  return (
    <div className="mx-auto w-full max-w-[1180px] pb-24 text-[var(--color-saul-text-primary)]">
      <header className="pb-5 pt-4 sm:px-2 lg:px-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/dashboard/road-trip?city=orlando" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] px-3 text-[11px] font-bold text-[var(--color-saul-text-secondary)]">
            <ArrowLeft size={14} weight="bold" /> City roadmap
          </Link>
          <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-saul-cyan)]/30 bg-[var(--color-saul-cyan)]/10 px-3 text-[11px] font-bold text-[var(--color-saul-cyan)]">
            <NavigationArrow size={14} weight="fill" /> Orlando visit route
          </span>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-saul-cyan)]">
              <RoadHorizon size={16} weight="fill" /> Today&apos;s field plan
            </div>
            <h1 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-[-0.04em] sm:text-4xl">Orlando visit route</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[var(--color-saul-text-secondary)]">
              Six physically verifiable Orlando rental stops, ordered from your current location to reduce backtracking. Unverified service-area listings are kept off the drive route.
            </p>
          </div>
          <Link href="/dashboard/road-trip?city=orlando" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] px-4 text-[13px] font-semibold">
            All Orlando leads <ArrowSquareOut size={15} weight="bold" />
          </Link>
        </div>
      </header>

      <section className="mb-5 overflow-hidden rounded-[22px] border border-[var(--color-saul-cyan)]/25 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-saul-cyan)_9%,var(--color-saul-bg-700)),var(--color-saul-bg-800))] shadow-[0_24px_80px_var(--color-saul-shadow-soft)]">
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)]"><MapPin size={21} weight="fill" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-saul-cyan)]">Starting point</p>
              <p className="mt-1 text-base font-black">{ORLANDO_ROUTE_ORIGIN}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]">Estimated drive-only plan: about 39 miles and 74 minutes before traffic and visit time. The order was optimized against Orlando road travel times.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ExternalButton href={ORLANDO_ROUTE_A_URL} primary><NavigationArrow size={17} weight="fill" /> Route A · Stops 1–3</ExternalButton>
            <ExternalButton href={ORLANDO_ROUTE_B_URL}><NavigationArrow size={17} weight="fill" /> Route B · Stops 4–6</ExternalButton>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-saul-text-tertiary)]">The route is split into two Google Maps links because mobile Maps reliably preserves fewer waypoints than desktop. Every stop also has its own next-leg link.</p>
        </div>
      </section>

      <section aria-labelledby="route-stops-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-saul-cyan)]">Call before driving</p>
            <h2 id="route-stops-heading" className="mt-1 text-2xl font-black tracking-[-0.03em]">Stops in route order</h2>
          </div>
          <span className="font-mono text-[11px] text-[var(--color-saul-text-secondary)]">6 stops</span>
        </div>

        <div className="space-y-4">
          {ORLANDO_VISIT_STOPS.map((stop, index) => (
            <article key={stop.leadId} className="overflow-hidden rounded-[18px] border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] shadow-[0_16px_48px_var(--color-saul-shadow-soft)]">
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)] font-mono text-sm font-black text-[var(--color-saul-cyan)]">{stop.order}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[17px] font-black leading-tight">{stop.companyName}</h3>
                    <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]"><MapPin size={14} weight="fill" className="mt-0.5 shrink-0" /> {stop.address}</p>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-saul-cyan)_10%,transparent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-saul-cyan)]"><CheckCircle size={13} weight="fill" /> {stop.verification}</span>
                  </div>
                </div>
                <p className="mt-3 rounded-xl border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-600)] p-3 text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]">{stop.visitNote}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ExternalButton href={`tel:${stop.phone.replace(/\D/g, '')}`} primary><Phone size={17} weight="fill" /> Call first</ExternalButton>
                  <ExternalButton href={routeLegUrl(index)} primary><NavigationArrow size={17} weight="fill" /> Next leg</ExternalButton>
                  <ExternalButton href={stop.mapsPlaceUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.companyName} ${stop.address}`)}`}><MapPin size={17} weight="fill" /> Google Maps</ExternalButton>
                  <Link href={`/dashboard/leads/${stop.leadId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-600)] px-3 text-[12px] font-bold"><Buildings size={17} weight="bold" /> Lead</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-[18px] border border-[var(--color-saul-warning)]/25 bg-[color-mix(in_srgb,var(--color-saul-warning)_5%,var(--color-saul-bg-700))] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <WarningCircle size={19} weight="fill" className="text-[var(--color-saul-warning)]" />
          <h2 className="text-base font-black">Why the other Orlando leads are not on today&apos;s route</h2>
        </div>
        <ul className="mt-3 space-y-2">
          {ORLANDO_ROUTE_REVIEW_NOTES.map((note) => <li key={note} className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]"><Info size={14} weight="fill" className="mt-0.5 shrink-0" /> {note}</li>)}
        </ul>
      </section>
    </div>
  )
}
