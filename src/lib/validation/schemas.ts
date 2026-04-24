import { z } from 'zod'

export const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001' as const

const emptyToUndef = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : v)

const uuidString = z.string().uuid()

/** If missing/empty, use demo tenant */
function tenantWithDefault() {
  return z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? DEMO_TENANT_ID : v),
    uuidString,
  )
}

export const requiredTenantIdQuerySchema = z.object({
  tenant_id: z.string().uuid('tenant_id must be a valid UUID'),
})

const timeRangeT = z.enum(['7d', '30d', '90d', 'all'])
const sortOptions = z.enum(['score_desc', 'score_asc', 'created_desc', 'activity_desc'])

export const volumeQuerySchema = z.object({
  tenant_id: z.string().uuid('tenant_id must be a valid UUID'),
  range: timeRangeT.default('30d'),
})

export const agingQuerySchema = z.object({
  tenant_id: z.string().uuid('tenant_id must be a valid UUID'),
})

export const leadsListQuerySchema = z.object({
  tenant_id: tenantWithDefault(),

  page: z
    .preprocess((v) => (v === undefined || v === null || v === '' ? 1 : v), z.coerce.number().int().min(1))
    .default(1),

  limit: z
    .preprocess((v) => (v === undefined || v === null || v === '' ? 50 : v), z.coerce.number().int().min(1).max(200))
    .default(50),

  search: z
    .preprocess(emptyToUndef, z.string().max(200).optional())
    .transform((s) => (typeof s === 'string' ? s.trim() : s))
    .optional(),

  status: z.preprocess(emptyToUndef, z.string().max(200).optional()),

  source: z.preprocess(emptyToUndef, z.string().max(200).optional()),

  assigned_to: z
    .preprocess(emptyToUndef, z.enum(['all', 'gregory', 'team']).optional()),

  red_flags_only: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .default(false),

  stage_id: z.preprocess(emptyToUndef, z.string().uuid('stage_id must be a valid UUID').optional()),

  score_min: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).max(100).optional()),

  score_max: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).max(100).optional()),

  sort: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 'score_desc' : v),
    sortOptions,
  ),
})

export const leadDetailQuerySchema = z.object({
  tenant_id: tenantWithDefault(),
})

export const leadIdParamSchema = z.string().uuid('id must be a valid UUID')

// Dashboard routes: several require explicit tenant, several default to demo
export const defaultTenantQuerySchema = z.object({
  tenant_id: tenantWithDefault(),
})

export const enrichmentDetailQuerySchema = defaultTenantQuerySchema
export const pipelineDetailQuerySchema = defaultTenantQuerySchema
export const scoringDetailQuerySchema = defaultTenantQuerySchema
export const redFlagsQuerySchema = defaultTenantQuerySchema
export const activityQuerySchema = defaultTenantQuerySchema
export const economicsQuerySchema = defaultTenantQuerySchema

// POST / PATCH bodies
export const enrichmentTriggerBodySchema = z.object({
  lead_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  process: z.boolean().optional(),
})

export const enrichmentStatusQuerySchema = z.object({
  tenant_id: tenantWithDefault(),
})

export const scoringCalculateBodySchema = z.object({
  lead_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
})

export const scoringHistoryQuerySchema = z.object({
  lead_id: z.string().uuid('lead_id must be a valid UUID'),
  tenant_id: tenantWithDefault(),
})

const outreachStatus = z.enum(['pending', 'approved', 'sent', 'rejected', 'all'])

export const outreachQueueQuerySchema = z.object({
  tenant_id: tenantWithDefault(),
  status: z
    .preprocess((v) => (v === undefined || v === null || v === '' ? 'pending' : v), outreachStatus)
    .default('pending'),
  limit: z
    .preprocess((v) => (v === undefined || v === null || v === '' ? 100 : v), z.coerce.number().int().min(1).max(500))
    .default(100),
})

export const outreachQueuePatchBodySchema = z
  .object({
    tenant_id: z.string().uuid(),
    action: z.enum(['approve', 'reject', 'edit', 'mark_sent']),
    message_draft: z.string().max(20000).optional(),
    reviewed_by: z.string().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'edit' && (data.message_draft === undefined || data.message_draft.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'message_draft is required for edit' })
    }
  })

const agentsTimeRange = z.enum(['1h', '24h', '7d', '30d', 'all'])

export const agentsDashboardQuerySchema = z.object({
  tenant_id: tenantWithDefault(),
  range: z
    .preprocess((v) => (v === undefined || v === null || v === '' ? '7d' : v), agentsTimeRange)
    .default('7d'),
})

// GHL Webhook payload validation
export const ghlWebhookPayloadSchema = z.object({
  type: z.string().optional(),
  event: z.string().optional(),
  'Event-Name': z.string().optional(),
  contactId: z.string().optional(),
  email: z.string().email().optional(),
  contact: z
    .object({
      id: z.string().optional(),
      email: z.string().email().optional(),
      firstName: z.string().optional(),
      first_name: z.string().optional(),
      lastName: z.string().optional(),
      last_name: z.string().optional(),
      companyName: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
}).passthrough()
