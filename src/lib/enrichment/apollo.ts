import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnrichmentProvider, EnrichmentResult, LeadRow } from './provider'

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

/** Apollo charges vary; we log a conservative per-call cost for accounting */
const DEFAULT_COST_CENTS = 12

async function apolloRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const key = process.env.APOLLO_API_KEY
  if (!key) {
    return { ok: false, status: 0, data: { error: 'APOLLO_API_KEY not set' } }
  }

  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': key,
    },
    body: body && method === 'POST' ? JSON.stringify(body) : undefined,
  })

  const data = (await res.json().catch(() => ({}))) as unknown
  return { ok: res.ok, status: res.status, data }
}

/**
 * `people/match` + optional `organizations/match` by domain
 */
export async function runApolloForLead(
  supabase: SupabaseClient,
  lead: LeadRow,
  enrichmentId: string,
): Promise<EnrichmentResult> {
  await supabase
    .from('enrichments')
    .update({ status: 'processing' })
    .eq('id', enrichmentId)
    .eq('tenant_id', lead.tenant_id)

  if (!process.env.APOLLO_API_KEY) {
    const result: EnrichmentResult = {
      success: true,
      provider: 'apollo',
      request_data: { lead_id: lead.id, reason: 'no_key' },
      response_data: { message: 'APOLLO_API_KEY not configured — dry run' },
      cost_cents: 0,
    }
    await supabase
      .from('enrichments')
      .update({
        status: 'completed',
        request_data: result.request_data,
        response_data: result.response_data,
        cost_cents: 0,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', enrichmentId)
    return result
  }

  const request_data: Record<string, unknown> = {
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    company_name: lead.company_name,
    company_domain: lead.company_domain,
    linkedin_url: lead.linkedin_url,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = { people: null, organization: null }

  const peopleBody: Record<string, unknown> = {}
  if (lead.email) peopleBody.email = lead.email
  if (lead.first_name) peopleBody.first_name = lead.first_name
  if (lead.last_name) peopleBody.last_name = lead.last_name
  if (lead.company_name) peopleBody.organization_name = lead.company_name
  if (lead.phone) peopleBody.sanitized_phone = lead.phone

  const pRes = await apolloRequest('/people/match', 'POST', peopleBody)
  if (pRes.ok) {
    out.people = pRes.data
  } else {
    out.people_error = pRes.data
  }

  const domain =
    (lead.company_domain as string | null) ||
    (() => {
      if (!lead.email?.includes('@')) return null
      return lead.email.split('@')[1] ?? null
    })()

  if (domain) {
    const oRes = await apolloRequest('/organizations/match', 'POST', { domain })
    if (oRes.ok) {
      out.organization = oRes.data
    } else {
      out.org_error = oRes.data
    }
  }

  const success = !!pRes.ok
  const cost = success ? DEFAULT_COST_CENTS : 0

  await supabase
    .from('enrichments')
    .update({
      status: success ? 'completed' : 'failed',
      request_data: request_data,
      response_data: out,
      cost_cents: cost,
      completed_at: new Date().toISOString(),
      error_message: success
        ? null
        : typeof out.people_error === 'object' && out.people_error
          ? JSON.stringify(out.people_error).slice(0, 2000)
          : 'people/match failed',
    })
    .eq('id', enrichmentId)
    .eq('tenant_id', lead.tenant_id)

  return {
    success,
    provider: 'apollo',
    request_data,
    response_data: out,
    cost_cents: cost,
    error: success ? undefined : 'Apollo request failed',
  }
}

export const apolloProvider: EnrichmentProvider = {
  name: 'apollo',
  enrich: runApolloForLead,
  estimateCost: () => DEFAULT_COST_CENTS,
}
