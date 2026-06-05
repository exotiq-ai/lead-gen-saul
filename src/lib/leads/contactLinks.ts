export interface ContactLinkInput {
  email?: string | null
  phone?: string | null
  company_domain?: string | null
  score_breakdown?: Record<string, unknown> | null
}

export interface ContactLink {
  label: string
  href: string
  value: string
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function normalizeInstagramUrl(raw: unknown): string | null {
  const value = firstString(raw)
  if (!value) return null
  const urlMatch = value.match(/https?:\/\/(?:www\.)?instagram\.com\/([^\s/?#]+)/i)
  const handleMatch = value.match(/@([A-Za-z0-9._]+)/) ?? value.match(/^([A-Za-z0-9._]+)$/)
  const handle = (urlMatch?.[1] ?? handleMatch?.[1])?.replace(/\/$/, '')
  return handle ? `https://www.instagram.com/${handle}/` : null
}

export function displayInstagramHandle(raw: unknown): string | null {
  const value = firstString(raw)
  if (!value) return null
  const urlMatch = value.match(/instagram\.com\/([^\s/?#]+)/i)
  const handleMatch = value.match(/@([A-Za-z0-9._]+)/) ?? value.match(/^([A-Za-z0-9._]+)$/)
  const handle = (urlMatch?.[1] ?? handleMatch?.[1])?.replace(/\/$/, '')
  return handle ? `@${handle}` : null
}

export function normalizeWebsiteUrl(raw?: string | null): string | null {
  const value = raw?.trim().replace(/[),.]+$/, '')
  if (!value || value.includes('@')) return null
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function normalizePhoneHref(raw?: string | null): string | null {
  const digits = raw?.replace(/\D/g, '') ?? ''
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  return null
}

export function buildContactLinks(input: ContactLinkInput): {
  instagram: ContactLink | null
  email: ContactLink | null
  phone: ContactLink | null
  website: ContactLink | null
} {
  const sb = input.score_breakdown ?? {}
  const igRaw = firstString(
    sb.company_ig_handle,
    sb.instagram_handle,
    sb.ig_handle,
    sb.instagram_url,
    sb.instagram_profile_url,
  )
  const igHref = normalizeInstagramUrl(igRaw)
  const igLabel = displayInstagramHandle(igRaw)
  const email = input.email?.trim() || null
  const phoneHref = normalizePhoneHref(input.phone)
  const websiteHref = normalizeWebsiteUrl(input.company_domain)

  return {
    instagram: igHref && igLabel ? { label: 'IG', href: igHref, value: igLabel } : null,
    email: email ? { label: 'Email', href: `mailto:${email}`, value: email } : null,
    phone: phoneHref && input.phone ? { label: 'Phone', href: phoneHref, value: input.phone } : null,
    website: websiteHref ? { label: 'Website', href: websiteHref, value: input.company_domain ?? websiteHref } : null,
  }
}
