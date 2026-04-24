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
  weights?: Record<string, number>
  scoring_tiers?: Record<
    string,
    { min: number; max: number; assigned_to: string | null; label?: string }
  >
}

/** Optional blend with tenant ICP profile weights (if present in JSON) */
export function applyIcpProfileWeights(
  baseIcp: number,
  // Reserved for per-tenant ICP JSON tuning
  criteria: IcpProfileCriteria | null,
): number {
  void criteria
  // Weights in DB criteria differ slightly from SQL; Exotiq path uses fixed blend above.
  // Hook for future per-tenant tuning.
  return baseIcp
}
