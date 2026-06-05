export function normalizeCallNote(value: string): string {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  if (!normalized) {
    throw new Error('Call note cannot be blank')
  }

  if (normalized.length > 5000) {
    throw new Error('Call note is too long')
  }

  return normalized
}
