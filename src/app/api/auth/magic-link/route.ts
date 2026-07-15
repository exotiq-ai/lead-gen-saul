import { NextRequest, NextResponse } from 'next/server'
import { isAllowedDashboardAdmin, resolvePublicOrigin, safeRedirectPath } from '@/lib/auth/policy'
import { createRouteAuthClient } from '@/lib/auth/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { email?: string; next?: string }
  try {
    body = (await req.json()) as { email?: string; next?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!isAllowedDashboardAdmin(email)) {
    // Do not reveal the allowlist.
    return NextResponse.json({ sent: true })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return NextResponse.json({ error: 'Auth is not configured' }, { status: 503 })

  const response = NextResponse.json({ sent: true })
  const supabase = createRouteAuthClient(req, response)
  const origin = resolvePublicOrigin({
    configuredUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.URL,
    forwardedHost: req.headers.get('x-forwarded-host') || req.headers.get('host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    requestOrigin: req.nextUrl.origin,
  })
  const callback = new URL('/auth/callback', origin)
  callback.searchParams.set('next', safeRedirectPath(body.next))
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
  })
  if (error) return NextResponse.json({ error: 'Login email could not be sent' }, { status: 502 })
  return response
}
