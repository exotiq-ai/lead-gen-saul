import { NextRequest, NextResponse } from 'next/server'
import { authenticatedDashboardUser } from '@/lib/auth/server'
import { requireSalesActor } from '@/lib/sales/auth'
import { isSalesWorkspacePath } from '@/lib/auth/policy'

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
  '/api/sales',
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

  // Partner handlers re-authorize independently; legacy APIs stay admin-only.
  if (isSalesWorkspacePath(pathname)) {
    const sales = await requireSalesActor(req)
    if ('error' in sales) {
      if (pathname === '/sales') return NextResponse.redirect(new URL('/login?next=/sales', req.url))
      return sales.error
    }
    return sales.response
  }

  if (auth.ok) {
    if (pathname === '/login') return NextResponse.redirect(new URL('/dashboard', req.url))
    return response
  }

  if (pathname.startsWith('/dashboard')) {
    const sales = await requireSalesActor(req)
    if (!('error' in sales)) return NextResponse.redirect(new URL('/sales', req.url))
    const login = new URL('/login', req.url)
    login.searchParams.set('next', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(login)
  }

  if (isProtectedApi(pathname)) {
    return NextResponse.json({ error: auth.reason }, { status: 401 })
  }

  if (pathname === '/login') {
    const sales = await requireSalesActor(req)
    if (!('error' in sales)) return NextResponse.redirect(new URL('/sales', req.url))
  }
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/sales/:path*', '/login', '/api/:path*'],
}
