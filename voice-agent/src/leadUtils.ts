import type { LeadCaptureInput } from './types.ts';

export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`;
  return raw.trim();
}

export function splitName(input?: LeadCaptureInput): { first?: string; last?: string } {
  const first = clean(input?.caller_first_name);
  const last = clean(input?.caller_last_name);
  if (first || last) return { first, last };
  const full = clean(input?.caller_name);
  if (!full) return {};
  const parts = full.split(/\s+/).filter(Boolean);
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
