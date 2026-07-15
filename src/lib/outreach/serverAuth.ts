import { NextRequest, NextResponse } from 'next/server'
import { authorizeOutreachMutation } from './safety'

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return req.headers.get('x-outreach-admin-token')
}

export function requireOutreachMutation(req: NextRequest) {
  const auth = authorizeOutreachMutation(bearerToken(req), {
    enabled: process.env.OUTREACH_MUTATIONS_ENABLED === 'true',
    token: process.env.OUTREACH_ADMIN_TOKEN || '',
    actor: process.env.OUTREACH_ADMIN_ACTOR || 'gregory',
  })

  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.reason }, { status: auth.status }),
    }
  }

  return { ok: true as const, actor: auth.actor }
}
