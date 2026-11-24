import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createRequestAuthClient } from '@/lib/auth/server'
import { isAllowedDashboardAdmin, isSameOriginSalesRequest, resolveSalesIdentity } from '@/lib/auth/policy'
import { createServerClient } from '@/lib/supabase/server'
import type { SalesActor } from './types'

const TENANT = '00000000-0000-0000-0000-000000000001'

export async function activeSalesMember(email: string) {
  const db = createServerClient()
  const { data, error } = await db.from('sales_members')
    .select('id,email,display_name,team,active,tenant_id')
    .eq('tenant_id', TENANT).eq('email', email.trim().toLowerCase()).eq('active', true).maybeSingle()
  if (error) return null // Unknown membership never grants access, including absent migration.
  return data
}

export async function salesActorForUser(user: User | null): Promise<SalesActor | null> {
  if (!user?.email || !user.email_confirmed_at) return null
  const member = isAllowedDashboardAdmin(user.email) ? null : await activeSalesMember(user.email)
  return resolveSalesIdentity(user, member)
}

export async function requireSalesActor(req: NextRequest): Promise<
  { actor: SalesActor; response: NextResponse } | { error: NextResponse }
> {
  const deny = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } }) })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return deny('Authentication is not configured', 503)
  const local = ['localhost','127.0.0.1'].includes(req.nextUrl.hostname)
  const expectedOrigin = local ? req.nextUrl.origin : (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin)
  if (!isSameOriginSalesRequest(req.method, req.headers.get('origin'), expectedOrigin)) return deny('Cross-origin request rejected', 403)
  const tenant = req.nextUrl.searchParams.get('tenant')
  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  if ((tenant && tenant !== 'exotiq' && tenant !== TENANT) || (tenantId && tenantId !== TENANT)) return deny('Workspace is restricted to Exotiq', 403)
  const response = NextResponse.next({ request: req })
  response.headers.set('Cache-Control', 'no-store')
  const client = createRequestAuthClient(req, response)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return deny('Sign in to continue', 401)
  const actor = await salesActorForUser(data.user)
  if (!actor) return deny('Access has not been approved or is disabled', 403)
  return { actor, response }
}
