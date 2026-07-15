'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('gregory@exotiq.ai')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setStatus('sending')
    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next: params.get('next') || '/dashboard' }),
    })
    setStatus(response.ok ? 'sent' : 'error')
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-[var(--color-saul-text-secondary)]">
        Admin email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-lg border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-900)] px-4 py-3 text-[var(--color-saul-text-primary)] outline-none focus:border-[var(--color-saul-cyan)]"
        />
      </label>
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-lg bg-[var(--color-saul-cyan)] px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
      >
        {status === 'sending' ? 'Sending secure link…' : 'Email me a secure login link'}
      </button>
      {status === 'sent' && <p className="text-sm text-emerald-300">Check your inbox. The secure link expires automatically.</p>}
      {status === 'error' && <p className="text-sm text-rose-300">Login email could not be sent. Try again or contact Avi.</p>}
    </form>
  )
}
