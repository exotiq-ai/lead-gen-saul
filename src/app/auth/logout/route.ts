import { NextRequest, NextResponse } from 'next/server'
import { createRouteAuthClient } from '@/lib/auth/server'

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', req.url))
  const supabase = createRouteAuthClient(req, response)
  await supabase.auth.signOut()
  return response
}
