import { NextRequest, NextResponse } from 'next/server'
import { authenticatedDashboardUser } from '@/lib/auth/server'

export async function requireOutreachMutation(req: NextRequest) {
  const cookieResponse = NextResponse.next()
  const auth = await authenticatedDashboardUser(req, cookieResponse)
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.reason }, { status: 401 }),
    }
  }
  return { ok: true as const, actor: auth.actor }
}
