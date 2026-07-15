import { NextRequest, NextResponse } from 'next/server'
import { createRouteAuthClient } from '@/lib/auth/server'
import { resolvePublicOrigin } from '@/lib/auth/policy'

export async function GET(req: NextRequest) {
  const origin = resolvePublicOrigin({
    configuredUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.URL,
    forwardedHost: req.headers.get('x-forwarded-host') || req.headers.get('host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    requestOrigin: req.nextUrl.origin,
  })
  const response = NextResponse.redirect(new URL('/login', origin))
  const supabase = createRouteAuthClient(req, response)
  await supabase.auth.signOut()
  return response
}
