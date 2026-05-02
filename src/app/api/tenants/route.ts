import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/tenants
//
// Returns the catalog of tenants known to this Supabase project.
// The icon comes from `branding.icon` JSON if set, otherwise we map
// known slugs to a default emoji. New tenants ship with no icon and
// the UI falls back to a generic glyph until branding is configured.
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug, branding')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const tenants = (data ?? []).map((t) => {
    const branding = (t.branding ?? {}) as Record<string, unknown>
    const icon = (typeof branding.icon === 'string' && branding.icon) || iconForSlug(t.slug as string)
    return {
      id: t.id as string,
      name: t.name as string,
      slug: t.slug as string,
      icon,
    }
  })

  return NextResponse.json({ tenants })
}

function iconForSlug(slug: string): string {
  const map: Record<string, string> = {
    exotiq: '🏎️',
    'medspa-boulder': '💆',
  }
  return map[slug] ?? '🏢'
}
