import type { RedFlagCode } from '@/types/lead'

type LeadForFlags = {
  company_industry: string | null
  company_name: string | null
  email: string | null
  last_activity_at: string | null
  red_flags: unknown
  score_breakdown: unknown
}

function daysSince(iso: string | null): number {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

function getFleetSize(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return 0
  const b = breakdown as Record<string, unknown>
  return Number(b.fleet_size ?? 0) || 0
}

/**
 * Returns additional / normalized red flag codes (merges with existing on lead)
 */
export function detectRedFlags(lead: LeadForFlags): RedFlagCode[] {
  const codes = new Set<RedFlagCode>()

  if (Array.isArray(lead.red_flags)) {
    for (const rf of lead.red_flags) {
      if (rf && typeof rf === 'object' && 'code' in rf) {
        codes.add((rf as { code: RedFlagCode }).code)
      }
    }
  }

  const industry = (lead.company_industry ?? '').toLowerCase()
  if (industry.includes('dealership') || industry.includes('dealer')) {
    codes.add('is_dealership')
  }

  if (daysSince(lead.last_activity_at) > 90) {
    codes.add('stale_90d')
  }

  const fleet = getFleetSize(lead.score_breakdown)
  if (fleet > 0 && fleet < 5) {
    codes.add('below_fleet_minimum')
  }

  if (lead.email && (lead.email.includes('mailinator') || lead.email.includes('invalid'))) {
    codes.add('bad_data')
  }

  return [...codes]
}
