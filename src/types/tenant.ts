export interface TenantBranding {
  logo_url?: string
  primary_color?: string
  company_name?: string
  dashboard_title?: string
  favicon_url?: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  settings: Record<string, unknown>
  branding: TenantBranding
  ghl_location_id: string | null
  ghl_api_key: string | null
  created_at: string
  updated_at: string
}
