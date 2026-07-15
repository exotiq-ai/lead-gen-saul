import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[var(--color-saul-bg-800)] px-4 py-16 text-[var(--color-saul-text-primary)]">
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] p-8 shadow-2xl">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-saul-cyan)]">Exotiq GTM</p>
          <h1 className="mt-3 text-3xl font-bold">Secure operator login</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-saul-text-secondary)]">
            Passwordless access for approved Exotiq operators. We will email a short-lived secure link.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-[var(--color-saul-text-secondary)]">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
