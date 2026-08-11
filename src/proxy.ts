import { NextRequest, NextResponse } from 'next/server'
import { authenticatedDashboardUser } from '@/lib/auth/server'

const PROTECTED_API_PREFIXES = [
  '/api/dashboard',
  '/api/enrichment',
  '/api/exports',
  '/api/leads',
  '/api/outreach',
  '/api/pipeline',
  '/api/scoring',
  '/api/settings',
  '/api/tenants',
]

function isProtectedApi(pathname: string) {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const response = NextResponse.next({ request: req })

  // CI's Playwright server has no real Supabase credentials. Permit its
  // browser only when the server and request share a per-run random token.
  // Production has no E2E_AUTH_BYPASS_TOKEN, so this path stays disabled.
  const e2eBypassToken = process.env.E2E_AUTH_BYPASS_TOKEN
  if (
    e2eBypassToken &&
    e2eBypassToken.length >= 32 &&
    req.headers.get('x-e2e-auth-token') === e2eBypassToken
  ) {
    return response
  }

  if (
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/outreach/sequences/run'
  ) {
    return response
  }

  const auth = await authenticatedDashboardUser(req, response)

  if (auth.ok) {
    if (pathname === '/login') return NextResponse.redirect(new URL('/dashboard', req.url))
    return response
  }

  if (pathname.startsWith('/dashboard')) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(login)
  }

  if (isProtectedApi(pathname)) {
    return NextResponse.json({ error: auth.reason }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/api/:path*'],
}
