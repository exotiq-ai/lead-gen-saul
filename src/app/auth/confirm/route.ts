import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createRouteAuthClient } from '@/lib/auth/server'
import { isAllowedDashboardAdmin, resolvePublicOrigin, safeRedirectPath } from '@/lib/auth/policy'

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash')
  const rawType = req.nextUrl.searchParams.get('type')
  const next = safeRedirectPath(req.nextUrl.searchParams.get('next'))
  const origin = resolvePublicOrigin({
    configuredUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.URL,
    forwardedHost: req.headers.get('x-forwarded-host') || req.headers.get('host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    requestOrigin: req.nextUrl.origin,
  })
  const response = NextResponse.redirect(new URL(next, origin))

  if (!tokenHash || rawType !== 'email') {
    return NextResponse.redirect(new URL('/login?error=invalid_link', origin))
  }

  const supabase = createRouteAuthClient(req, response)
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: rawType as EmailOtpType,
  })
  if (error || !isAllowedDashboardAdmin(data.user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=expired_link', origin))
  }

  return response
}
