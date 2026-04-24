const NUMBER_FORMATTER = new Intl.NumberFormat('en-US')
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatNumber(n: number): string {
  return NUMBER_FORMATTER.format(n)
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(1)}B`
  }
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`
  }
  return String(n)
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`
}

export function formatCurrency(cents: number): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return DATE_FORMATTER.format(d)
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = Date.now()
  const diff = now - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  return `${years} year${years === 1 ? '' : 's'} ago`
}

export function formatScore(score: number): string {
  return Math.round(score).toString()
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500'
  if (score >= 65) return 'text-green-500'
  if (score >= 50) return 'text-yellow-500'
  if (score >= 35) return 'text-orange-500'
  return 'text-red-500'
}
