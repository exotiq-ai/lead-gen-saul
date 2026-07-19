import Link from 'next/link'

const steps = [
  {
    number: '01',
    title: 'Open Outreach',
    body: 'Start in the Approved tab. Exotiq drafts auto-approve for review, but approval does not send anything.',
  },
  {
    number: '02',
    title: 'Check the operator',
    body: 'Read the score, market, contact links, route, call prep, and personalization evidence. Use Check source before repeating a claim.',
  },
  {
    number: '03',
    title: 'Choose the right motion',
    body: 'Tier 1 and 25+ vehicle operators are Gregory call-first. Strong Tier 2 leads use email plus Instagram, then a phone task. Incomplete leads go back to research.',
  },
  {
    number: '04',
    title: 'Act and record the result',
    body: 'Copy the approved message or call script, complete the human action, then update the lead or GHL outcome. Replies, bookings, bounces, and opt-outs must stop follow-up.',
  },
]

const statusRows = [
  ['Approved', 'Reviewed and ready for a human action. Not sent.'],
  ['Sent', 'A real provider or human send was recorded. Dry runs never count.'],
  ['Research needed', 'No trustworthy personalization hook is stored yet. Verify one first.'],
  ['Call first', 'High-value operator. Gregory owns the first approach.'],
  ['Suppressed', 'No more outreach. Reply, opt-out, bounce, customer, or manual hold wins.'],
]

export default function GtmGuidePage() {
  const liveSending =
    process.env.OUTREACH_LIVE_SENDS_ENABLED === 'true' &&
    process.env.RESEND_OUTBOUND_DRY_RUN === 'false'

  return (
    <main data-theme="light" className="min-h-[calc(100vh-64px)] bg-[#f7f4ed] text-[#17372c]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="overflow-hidden rounded-[28px] border border-[#d8dfd6] bg-[#fffdf8] shadow-[0_24px_70px_rgba(26,58,47,0.09)]">
          <div className="h-2 bg-[#b8d64b]" />
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.4fr_0.6fr] md:px-10 md:py-12">
            <div>
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#6d7e55]">
                Exotiq Command Center
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[#17372c] sm:text-5xl">
                The human guide to the GTM system
              </h1>
              <p className="mt-5 max-w-2xl text-[16px] leading-7 text-[#5b695f]">
                A simple operating guide for finding the right exotic rental operators, reviewing the evidence, taking the next best action, and keeping outreach safe.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/outreach?tenant=exotiq"
                  className="rounded-full bg-[#17372c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#244f40]"
                >
                  Open Outreach
                </Link>
                <Link
                  href="/dashboard/leads?tenant=exotiq"
                  className="rounded-full border border-[#b9c6bd] bg-white px-5 py-2.5 text-sm font-semibold text-[#17372c] transition hover:border-[#17372c]"
                >
                  Browse Leads
                </Link>
                <Link
                  href="/dashboard/guide/sequence?tenant=exotiq"
                  className="rounded-full border border-[#b9c6bd] bg-white px-5 py-2.5 text-sm font-semibold text-[#17372c] transition hover:border-[#17372c]"
                >
                  Automated Sequence Guide
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d9e3d2] bg-[#eef4e6] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Current safety mode</p>
              <div className="mt-4 flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${liveSending ? 'bg-[#dc7b35]' : 'bg-[#4f7c63]'}`} />
                <p className="text-lg font-semibold text-[#17372c]">
                  {liveSending ? 'Controlled live sending' : 'Prospect sending locked'}
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#5b695f]">
                {liveSending
                  ? 'Only eligible, unsuppressed contacts inside approved campaign limits may send.'
                  : 'The system can research, draft, review, and sync. It cannot autonomously email prospects.'}
              </p>
              <div className="mt-5 border-t border-[#d4decf] pt-4 text-sm text-[#45564b]">
                <strong>Rule:</strong> Approved is not sent.
              </div>
            </div>
          </div>
        </header>

        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Daily workflow</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Four steps, in order</h2>
            </div>
            <p className="hidden max-w-sm text-right text-sm text-[#6a766e] md:block">Evidence first. Route second. Action third. CRM update last.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {steps.map((step) => (
              <article key={step.number} className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6 shadow-[0_10px_35px_rgba(26,58,47,0.05)]">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-sm font-bold text-[#86a22f]">{step.number}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#17372c]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#5b695f]">{step.body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-2xl bg-[#17372c] p-6 text-white sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c8dc7b]">Who does what</p>
            <h2 className="mt-2 text-2xl font-semibold">Two systems, one workflow</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-white/8 p-4">
                <h3 className="font-semibold text-[#e8f2c5]">LeadsBySaul</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">Source of truth for research, scoring, evidence, routing, approved copy, and agent activity.</p>
              </div>
              <div className="rounded-xl bg-white/8 p-4">
                <h3 className="font-semibold text-[#e8f2c5]">GoHighLevel</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">Source of truth for contacts, conversations, appointments, opportunities, DND, and sales outcomes.</p>
              </div>
            </div>
            <p className="mt-5 border-t border-white/15 pt-5 text-sm leading-6 text-white/75">
              If they conflict, trust LeadsBySaul for research and copy. Trust GHL or the email provider for replies, opt-outs, bounces, bookings, and opportunity state.
            </p>
          </article>

          <article className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Route guide</p>
            <h2 className="mt-2 text-2xl font-semibold">Match the motion to the lead</h2>
            <div className="mt-5 space-y-4 text-sm">
              <div className="border-l-2 border-[#17372c] pl-4"><strong>Tier 1:</strong> Gregory calls first. Email is a recap, not generic automation.</div>
              <div className="border-l-2 border-[#86a22f] pl-4"><strong>Tier 2:</strong> Personalized email plus Instagram, followed by phone.</div>
              <div className="border-l-2 border-[#c9aa63] pl-4"><strong>Incomplete:</strong> Enrich and verify before drafting or contacting.</div>
              <div className="border-l-2 border-[#b66a5c] pl-4"><strong>Low fit:</strong> Disqualify marketplaces, dealerships, limo-only services, directories, and underqualified fleets.</div>
            </div>
          </article>
        </section>

        <section className="mt-10 rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Status glossary</p>
          <h2 className="mt-2 text-2xl font-semibold">What the labels mean</h2>
          <div className="mt-5 divide-y divide-[#e4e8e1]">
            {statusRows.map(([label, meaning]) => (
              <div key={label} className="grid gap-1 py-4 sm:grid-cols-[170px_1fr] sm:gap-6">
                <strong className="text-sm text-[#17372c]">{label}</strong>
                <span className="text-sm leading-6 text-[#5b695f]">{meaning}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6">
            <h2 className="text-xl font-semibold">Before using personalization</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#5b695f]">
              <li>• Prefer recent IG, partnership, news, or first-party website evidence.</li>
              <li>• Click <strong>Check source</strong> before repeating fleet counts or business claims.</li>
              <li>• Treat legacy research notes and estimated fleet counts as context, not approved proof.</li>
              <li>• If the card says <strong>Research needed</strong>, do not improvise familiarity.</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6">
            <h2 className="text-xl font-semibold">Automatic stop conditions</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#5b695f]">
              <li>• Any real reply or call engagement</li>
              <li>• Unsubscribe, DND, complaint, or hard bounce</li>
              <li>• Meeting booked or opportunity opened</li>
              <li>• Existing customer, active pilot, wrong brand, or manual suppression</li>
            </ul>
          </article>
        </section>

        <footer className="mt-10 flex flex-col gap-3 border-t border-[#d8dfd6] py-6 text-sm text-[#6a766e] sm:flex-row sm:items-center sm:justify-between">
          <p>Exotiq GTM operating guide · US Phase 1 · 15-minute founder-call CTA</p>
          <p>When in doubt, hold the lead and verify the evidence.</p>
        </footer>
      </div>
    </main>
  )
}
