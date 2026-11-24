export function allowedDashboardEmails(raw = process.env.DASHBOARD_ADMIN_EMAILS || 'gregory@exotiq.ai') {
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedDashboardAdmin(email: string | null | undefined, allowlist = allowedDashboardEmails()) {
  return Boolean(email && allowlist.includes(email.trim().toLowerCase()))
}

export function safeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/dashboard'
  try {
    const parsed = new URL(value, 'https://local.invalid')
    const rawPath = value.split(/[?#]/)[0]
    if (parsed.pathname !== rawPath) return '/dashboard'
    if (parsed.pathname === '/sales' || parsed.pathname === '/dashboard' || parsed.pathname.startsWith('/dashboard/')) return value
  } catch { /* invalid path stays local */ }
  return '/dashboard'
}

export function isSalesWorkspacePath(pathname: string) {
  return pathname === '/sales' || pathname === '/api/sales' || pathname.startsWith('/api/sales/')
}

export function isSameOriginSalesRequest(method: string, origin: string | null, expectedOrigin: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true
  if (!origin) return false
  try { return new URL(origin).origin === new URL(expectedOrigin).origin } catch { return false }
}

type SalesIdentity = { id: string; email?: string; email_confirmed_at?: string | null }
type SalesMembership = { id: string; email: string; display_name: string; team: string; active: boolean; tenant_id: string }

export function resolveSalesIdentity(user: SalesIdentity | null, member: SalesMembership | null, admins = allowedDashboardEmails()) {
  const tenantId = '00000000-0000-0000-0000-000000000001'
  if (!user?.email || !user.email_confirmed_at) return null
  const email = user.email.trim().toLowerCase()
  if (isAllowedDashboardAdmin(email, admins)) {
    return { userId: user.id, email, displayName: email, isAdmin: true, memberId: null, team: null, tenantId }
  }
  if (!member?.active || member.tenant_id !== tenantId || member.email.toLowerCase() !== email) return null
  return { userId: user.id, email, displayName: member.display_name, isAdmin: false, memberId: member.id, team: member.team, tenantId }
}

export function resolvePublicOrigin(input: {
  configuredUrl?: string | null
  forwardedHost?: string | null
  forwardedProto?: string | null
  requestOrigin: string
}) {
  const forwardedIsLocal = Boolean(input.forwardedHost && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(input.forwardedHost))
  if (forwardedIsLocal) return `${input.forwardedProto || 'http'}://${input.forwardedHost}`
  if (input.configuredUrl) return new URL(input.configuredUrl).origin
  if (input.forwardedHost) return `${input.forwardedProto || 'https'}://${input.forwardedHost}`
  return new URL(input.requestOrigin).origin
}
