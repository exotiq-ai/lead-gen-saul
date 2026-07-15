import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isAllowedDashboardAdmin } from './policy'

function authEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  }
}

export function createRequestAuthClient(req: NextRequest, response: NextResponse) {
  const env = authEnv()
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        for (const cookie of cookies) {
          req.cookies.set(cookie.name, cookie.value)
          response.cookies.set(cookie.name, cookie.value, cookie.options)
        }
      },
    },
  })
}

export function createRouteAuthClient(req: NextRequest, response: NextResponse) {
  return createRequestAuthClient(req, response)
}

export async function authenticatedDashboardUser(req: NextRequest, response: NextResponse) {
  const env = authEnv()
  if (!env.url || !env.key) return { ok: false as const, reason: 'auth_not_configured' }
  const supabase = createRequestAuthClient(req, response)
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false as const, reason: 'not_authenticated' }
  if (!isAllowedDashboardAdmin(data.user.email)) return { ok: false as const, reason: 'not_authorized' }
  return { ok: true as const, user: data.user, actor: data.user.email || 'dashboard-admin' }
}
