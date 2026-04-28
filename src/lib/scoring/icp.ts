/** Fleet raw count → 0–100 points (matches `calculate_exotiq_score` in SQL) */
export function fleetSizeToPoints(fleetRaw: number): number {
  if (fleetRaw >= 20) return 100
  if (fleetRaw >= 10) return 80
  if (fleetRaw >= 5) return 60
  if (fleetRaw >= 2) return 40
  if (fleetRaw === 1) return 20
  return 0
}

function clamp100(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

/**
 * ICP fit 0–100 from `score_breakdown` components.
 * Weights: fleet 35%, vehicle_quality 20%, market_tier 15%, operational 20%, online 10%
 * (same as Exotiq SQL scorer)
 */
export function calculateIcpFitFromBreakdown(breakdown: Record<string, unknown> | null | undefined): {
  icp_fit: number
  components: {
    fleet_pts: number
    fleet_raw: number
    vehicle_quality: number
    market_tier: number
    operational_signals: number
    online_presence: number
  }
} {
  const b = breakdown ?? {}
  const fleetRaw = Number(b.fleet_size ?? 0) || 0
  const fleetPts = fleetSizeToPoints(fleetRaw)
  const vehicle_quality = clamp100(Number(b.vehicle_quality ?? 0) || 0)
  const market_tier = clamp100(Number(b.market_tier ?? 0) || 0)
  const operational_signals = clamp100(Number(b.operational_signals ?? 0) || 0)
  const online_presence = clamp100(Number(b.online_presence ?? 0) || 0)

  const icp_fit = Math.round(
    fleetPts * 0.35 +
      vehicle_quality * 0.2 +
      market_tier * 0.15 +
      operational_signals * 0.2 +
      online_presence * 0.1,
  )

  return {
    icp_fit: clamp100(icp_fit),
    components: {
      fleet_pts: fleetPts,
      fleet_raw: fleetRaw,
      vehicle_quality,
      market_tier,
      operational_signals,
      online_presence,
    },
  }
}

export type IcpProfileCriteria = {
  weights?: {
    online_booking_absent?: number   // MedSpa: reward if no online booking (opportunity)
    template_website?: number        // MedSpa: reward if site looks template-built
    low_google_reviews?: number      // MedSpa: reward signal (room to grow)
    franchise_penalty?: number       // MedSpa: penalize franchise chains
    fleet_size?: number              // Exotiq: fleet size weight override
    vehicle_quality?: number         // Exotiq: vehicle quality weight override
    market_tier?: number             // Exotiq: market tier weight override
    operational_signals?: number     // Exotiq: ops signals weight override
    online_presence?: number         // Exotiq: online presence weight override
  }
  scoring_tiers?: Record<
    string,
    { min: number; max: number; assigned_to: string | null; label?: string }
  >
  tenant_type?: 'automotive' | 'medspa'
}

/**
 * Apply per-tenant ICP profile weights to the base ICP score.
 * For MedSpa tenants, bonus/penalty signals from metadata override the raw score.
 */
export function applyIcpProfileWeights(
  baseIcp: number,
  criteria: IcpProfileCriteria | null,
): number {
  if (!criteria?.weights) return baseIcp

  const w = criteria.weights
  let adjusted = baseIcp

  // MedSpa opportunity signals: these come in pre-baked as breakdown fields
  // The breakdown carries medspa-specific signals set during enrichment
  if (criteria.tenant_type === 'medspa') {
    // Franchise penalty (reduces score)
    if (typeof w.franchise_penalty === 'number') {
      adjusted = Math.max(0, adjusted - w.franchise_penalty)
    }
  }

  return Math.min(100, Math.max(0, Math.round(adjusted)))
}

/**
 * MedSpa-specific ICP fit calculation.
 * Weights: online_presence 35%, operational_signals 30%, market_tier 20%, vehicle_quality 15%
 * (fleet_size not relevant for med spas)
 */
export function calculateMedSpaIcpFit(breakdown: Record<string, unknown> | null | undefined): {
  icp_fit: number
  components: {
    online_presence: number
    operational_signals: number
    market_tier: number
    vehicle_quality: number  // repurposed as "service quality" signal
    fleet_pts: number
    fleet_raw: number
  }
} {
  const b = breakdown ?? {}

  // Standard signals repurposed for MedSpa context
  const online_presence = Math.min(100, Math.max(0, Math.round(Number(b.online_presence ?? 50) || 50)))
  const operational_signals = Math.min(100, Math.max(0, Math.round(Number(b.operational_signals ?? 50) || 50)))
  const market_tier = Math.min(100, Math.max(0, Math.round(Number(b.market_tier ?? 50) || 50)))
  const service_quality = Math.min(100, Math.max(0, Math.round(Number(b.vehicle_quality ?? 50) || 50)))

  // MedSpa opportunity bonus signals
  const no_online_booking = Boolean(b.no_online_booking)  // set by Google Maps enrichment
  const low_reviews = Boolean(b.low_google_reviews)       // set by Google Maps enrichment
  const template_site = Boolean(b.template_website)       // set by enrichment

  let icp_fit = Math.round(
    online_presence * 0.35 +
    operational_signals * 0.30 +
    market_tier * 0.20 +
    service_quality * 0.15,
  )

  // Opportunity bonuses: these signals mean there's room to add value
  if (no_online_booking) icp_fit = Math.min(100, icp_fit + 10)
  if (low_reviews) icp_fit = Math.min(100, icp_fit + 5)
  if (template_site) icp_fit = Math.min(100, icp_fit + 8)

  return {
    icp_fit: Math.min(100, Math.max(0, icp_fit)),
    components: {
      online_presence,
      operational_signals,
      market_tier,
      vehicle_quality: service_quality,
      fleet_pts: 0,
      fleet_raw: 0,
    },
  }
}
