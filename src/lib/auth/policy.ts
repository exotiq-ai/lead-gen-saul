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
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  if (!value.startsWith('/dashboard')) return '/dashboard'
  return value
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
