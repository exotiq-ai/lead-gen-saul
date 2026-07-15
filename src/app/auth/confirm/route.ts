import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createRouteAuthClient } from '@/lib/auth/server'
import { isAllowedDashboardAdmin, safeRedirectPath } from '@/lib/auth/policy'

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash')
  const rawType = req.nextUrl.searchParams.get('type')
  const next = safeRedirectPath(req.nextUrl.searchParams.get('next'))
  const response = NextResponse.redirect(new URL(next, req.url))

  if (!tokenHash || rawType !== 'email') {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url))
  }

  const supabase = createRouteAuthClient(req, response)
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: rawType as EmailOtpType,
  })
  if (error || !isAllowedDashboardAdmin(data.user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=expired_link', req.url))
  }

  return response
}
