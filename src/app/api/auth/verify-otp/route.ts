import { NextRequest, NextResponse } from 'next/server'
import { isAllowedDashboardAdmin, safeRedirectPath } from '@/lib/auth/policy'
import { createRouteAuthClient } from '@/lib/auth/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { email?: string; token?: string; next?: string }
  try {
    body = (await req.json()) as { email?: string; token?: string; next?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const token = (body.token || '').replace(/\s/g, '')
  if (!isAllowedDashboardAdmin(email) || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  const response = NextResponse.json({ verified: true, next: safeRedirectPath(body.next) })
  const supabase = createRouteAuthClient(req, response)
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error || !isAllowedDashboardAdmin(data.user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  return response
}
