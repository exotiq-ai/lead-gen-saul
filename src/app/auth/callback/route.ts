import { NextRequest, NextResponse } from 'next/server'
import { createRouteAuthClient } from '@/lib/auth/server'
import { isAllowedDashboardAdmin, resolvePublicOrigin, safeRedirectPath } from '@/lib/auth/policy'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = safeRedirectPath(req.nextUrl.searchParams.get('next'))
  const origin = resolvePublicOrigin({
    configuredUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.URL,
    forwardedHost: req.headers.get('x-forwarded-host') || req.headers.get('host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    requestOrigin: req.nextUrl.origin,
  })
  const destination = new URL(next, origin)
  const response = NextResponse.redirect(destination)

  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', origin))

  const supabase = createRouteAuthClient(req, response)
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=expired_link', origin))

  const { data } = await supabase.auth.getUser()
  if (!isAllowedDashboardAdmin(data.user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=not_authorized', origin))
  }

  return response
}
