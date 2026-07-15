'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('gregory@exotiq.ai')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle')
  const next = params.get('next') || '/dashboard'

  async function requestLogin(event: FormEvent) {
    event.preventDefault()
    setStatus('sending')
    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next }),
    })
    setStatus(response.ok ? 'sent' : 'error')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setStatus('verifying')
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, next }),
    })
    if (!response.ok) {
      setStatus('error')
      return
    }
    const result = (await response.json()) as { next?: string }
    window.location.assign(result.next || '/dashboard')
  }

  return (
    <div className="space-y-5">
      <form onSubmit={requestLogin} className="space-y-4">
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
          disabled={status === 'sending' || status === 'verifying'}
          className="w-full rounded-lg bg-[var(--color-saul-cyan)] px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
        >
          {status === 'sending' ? 'Sending secure login…' : 'Send secure login email'}
        </button>
      </form>

      {(status === 'sent' || token) && (
        <form onSubmit={verifyCode} className="space-y-4 border-t border-[var(--color-saul-border-strong)] pt-5">
          <label className="block text-sm text-[var(--color-saul-text-secondary)]">
            Enter the 6-digit code
            <input
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-2 w-full rounded-lg border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-900)] px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-[var(--color-saul-text-primary)] outline-none focus:border-[var(--color-saul-cyan)]"
            />
          </label>
          <button
            type="submit"
            disabled={token.length !== 6 || status === 'verifying'}
            className="w-full rounded-lg border border-[var(--color-saul-cyan)] px-4 py-3 font-semibold text-[var(--color-saul-cyan)] disabled:opacity-50"
          >
            {status === 'verifying' ? 'Verifying…' : 'Verify code and sign in'}
          </button>
          <p className="text-xs leading-relaxed text-[var(--color-saul-text-tertiary)]">
            You can also use the secure button in the email when it was requested from this browser.
          </p>
        </form>
      )}

      {status === 'sent' && <p className="text-sm text-emerald-300">Email delivered. Use the secure button or enter the six-digit code.</p>}
      {status === 'error' && <p className="text-sm text-rose-300">The request failed or the code expired. Request a fresh login email and try again.</p>}
    </div>
  )
}
