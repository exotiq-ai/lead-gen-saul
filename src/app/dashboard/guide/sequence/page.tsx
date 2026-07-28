import Link from 'next/link'
import { SequenceOperationsPanel } from '@/components/outreach/SequenceOperationsPanel'

const timeline = [
  ['Day 0', 'Email 1', 'Personalized first touch from Gregory through Resend.'],
  ['Day 2', 'Call task', 'GHL creates a call task for Gregory. The system never auto-dials.'],
  ['Day 3', 'Instagram task', 'GHL creates a profile-review and manual-DM task. The system never auto-sends an IG DM.'],
  ['Day 5', 'Email 2', 'A different operator pain angle, only if no exit condition exists.'],
  ['Day 10', 'Email 3', 'Short final value note, only if the lead remains eligible.'],
  ['Day 14', 'Close loop', 'Respectful close or nurture handoff.'],
]

const stops = ['Any real reply or completed call engagement', 'Unsubscribe, DND, complaint, or hard bounce', 'Meeting booked or opportunity opened', 'Existing customer, active pilot, or manual suppression']

export default function SequenceGuidePage() {
  const customerEnrollment = process.env.EXOTIQ_CUSTOMER_SEQUENCE_ENROLLMENT_ENABLED === 'true'
  const customerSending = process.env.OUTREACH_LIVE_SENDS_ENABLED === 'true' && process.env.RESEND_OUTBOUND_DRY_RUN === 'false'
  const demoSending = process.env.EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED === 'true'

  return (
    <main data-theme="light" className="min-h-[calc(100vh-64px)] bg-[#f7f4ed] text-[#17372c]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="overflow-hidden rounded-[28px] border border-[#d8dfd6] bg-[#fffdf8] shadow-[0_24px_70px_rgba(26,58,47,0.09)]">
          <div className="h-2 bg-[#b8d64b]" />
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.3fr_0.7fr] md:px-10 md:py-12">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#6d7e55]">Exotiq founder outreach</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">How the automated sequence works</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#5b695f]">LeadsBySaul decides who is eligible and stores the approved copy. The API scheduler controls timing. Resend delivers email. GoHighLevel holds the contact, tasks, notes, tags, and sales outcome.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/dashboard/outreach?tenant=exotiq" className="rounded-full bg-[#17372c] px-5 py-2.5 text-sm font-semibold text-white">Open Outreach</Link>
                <Link href="/dashboard/guide?tenant=exotiq" className="rounded-full border border-[#b9c6bd] bg-white px-5 py-2.5 text-sm font-semibold">Back to GTM Guide</Link>
              </div>
            </div>
            <div className="rounded-2xl border border-[#d9e3d2] bg-[#eef4e6] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Launch gates</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt>Demo sending</dt><dd className="font-semibold">{demoSending ? 'Enabled' : 'Locked'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Customer enrollment</dt><dd className="font-semibold">{customerEnrollment ? 'Enabled' : 'Locked'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Customer email sending</dt><dd className="font-semibold">{customerSending ? 'Enabled' : 'Locked'}</dd></div>
              </dl>
              <p className="mt-5 border-t border-[#d4decf] pt-4 text-sm leading-6 text-[#45564b]">The first 25 cannot enroll or send until Gregory approves and both independent customer gates are enabled.</p>
            </div>
          </div>
        </header>

        <SequenceOperationsPanel />

        <section className="mt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Tier 2 sequence</p>
          <h2 className="mt-2 text-2xl font-semibold">Email, call, Instagram, then follow-up</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {timeline.map(([day, title, body], index) => (
              <article key={day + title} className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-5">
                <div className="flex items-center justify-between"><span className="font-mono text-sm font-bold text-[#86a22f]">{String(index + 1).padStart(2, '0')}</span><span className="rounded-full bg-[#eef4e6] px-3 py-1 text-xs font-semibold">{day}</span></div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5b695f]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl bg-[#17372c] p-6 text-white sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c8dc7b]">Automatic exits</p>
            <h2 className="mt-2 text-2xl font-semibold">Human engagement always wins</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-white/75">{stops.map((stop) => <li key={stop}>• {stop}</li>)}</ul>
            <p className="mt-5 border-t border-white/15 pt-5 text-sm text-white/70">Email opens and link clicks do not control the sequence. Replies, calls, meetings, suppressions, and sales outcomes do.</p>
          </article>
          <article className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Tier 1 exception</p>
            <h2 className="mt-2 text-2xl font-semibold">Elite operators remain call-first</h2>
            <p className="mt-4 text-sm leading-6 text-[#5b695f]">Score 5, 25+ vehicle, elite, and multi-market operators are excluded from the automatic cold sequence. Gregory calls first, then uses Instagram and email as selective support.</p>
          </article>
        </section>

        <section className="mt-10 rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">First 25 checklist</p>
          <h2 className="mt-2 text-2xl font-semibold">What Gregory reviews before launch</h2>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {['25 US Tier 2 operators only', 'Recipient email and MX verified', 'Personalization source checked', 'Email 1 copy approved', 'Call number verified or flagged missing', 'Instagram profile verified or task held', 'No customer, active opportunity, DND, or suppression', 'Duplicate-enrollment check passes', 'Sender authentication and seed delivery pass', 'Global pause and exit tests pass'].map((item) => <div key={item} className="rounded-xl bg-[#f3f5ef] px-4 py-3">□ {item}</div>)}
          </div>
        </section>

        <footer className="mt-10 border-t border-[#d8dfd6] py-6 text-sm text-[#6a766e]">Exotiq API-first sequence v1 · Customer enrollment remains locked until Gregory approves the first 25.</footer>
      </div>
    </main>
  )
}
