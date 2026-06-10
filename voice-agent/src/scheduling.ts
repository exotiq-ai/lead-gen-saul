import type { FollowupInput } from './types.ts';

export const ASK_SAUL_CALENDAR_ID = 'tbvii3aqFCtT85hdV0Gu';
export const ASK_SAUL_TIMEZONE = 'America/Denver';
export const BOOKING_START_HOUR_MT = 9;
export const BOOKING_END_HOUR_MT = 15;
export const BOOKING_DURATION_MINUTES = 15;

type SlotPreference = {
  requestedStartIso?: string;
  preferredWindow?: string;
};

export type SlotSelection =
  | { ok: true; startTime: string; endTime: string; source: 'requested_exact_slot' | 'next_available_slot' }
  | { ok: false; error: string };

export async function selectGregorySlot(args: {
  fetchFreeSlots: (startMs: number, endMs: number) => Promise<string[]>;
  now?: Date;
  preference: SlotPreference;
}): Promise<SlotSelection> {
  const now = args.now ?? new Date();
  const searchStart = now.getTime();
  const searchEnd = searchStart + 21 * 24 * 60 * 60 * 1000;
  const slots = (await args.fetchFreeSlots(searchStart, searchEnd))
    .filter(isAllowedGregorySlot)
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  if (!slots.length) return { ok: false, error: 'No GHL free slots are available inside Gregory booking hours, Monday-Friday 9am-3pm MT.' };

  const requested = normalizeRequestedIso(args.preference.requestedStartIso);
  if (requested) {
    const exact = slots.find((slot) => Math.abs(Date.parse(slot) - Date.parse(requested)) < 60_000);
    if (exact) return buildSlot(exact, 'requested_exact_slot');

    const requestedMs = Date.parse(requested);
    const sameDayOrAfter = slots.find((slot) => {
      const slotMs = Date.parse(slot);
      return slotMs >= requestedMs && denverDateKey(slot) === denverDateKey(requested);
    });
    if (sameDayOrAfter) return buildSlot(sameDayOrAfter, 'next_available_slot');
  }

  const preferredDay = dayHint(args.preference.preferredWindow);
  if (preferredDay) {
    const hinted = slots.find((slot) => denverDateKey(slot) === preferredDay);
    if (hinted) return buildSlot(hinted, 'next_available_slot');
  }

  return buildSlot(slots[0], 'next_available_slot');
}

export function isAllowedGregorySlot(iso: string): boolean {
  const parts = denverParts(iso);
  if (!parts) return false;
  const weekday = Number(parts.weekday); // Monday=1 ... Sunday=7 with en-CA below
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (weekday < 1 || weekday > 5) return false;
  if (hour < BOOKING_START_HOUR_MT || hour >= BOOKING_END_HOUR_MT) return false;
  if (minute % BOOKING_DURATION_MINUTES !== 0) return false;
  return true;
}

export function buildAppointmentTitle(input: FollowupInput): string {
  const name = input.caller_name || [input.caller_first_name, input.caller_last_name].filter(Boolean).join(' ') || input.business_name || 'Provider prospect';
  return `Ask Saul Intro - ${name}`.slice(0, 120);
}

export function appointmentDescription(input: FollowupInput): string {
  return [
    'Ask Saul provider phone-agent intro booked by Saul.',
    input.business_name ? `Business: ${input.business_name}` : null,
    input.business_type ? `Business type: ${input.business_type}` : null,
    input.city_state ? `Market: ${input.city_state}` : null,
    input.current_call_handling ? `Current call handling: ${input.current_call_handling}` : null,
    input.pain_points ? `Pain points: ${input.pain_points}` : null,
    input.notes ? `Desired agent tasks / call summary: ${input.notes}` : null,
    input.outstanding_questions ? `Outstanding questions: ${input.outstanding_questions}` : null,
    input.custom_solution_needs ? `Custom needs: ${input.custom_solution_needs}` : null,
    `Preferred window heard by Saul: ${input.preferred_time_window}`,
  ].filter(Boolean).join('\n');
}

export function formatConfirmationText(startIso: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: ASK_SAUL_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startIso));
  return `Thanks for calling Saul. You're booked with Gregory for ${formatted}. He'll call you at the number you provided and will have the call context in front of him.`;
}

function buildSlot(startTime: string, source: SlotSelection extends infer _ ? 'requested_exact_slot' | 'next_available_slot' : never): SlotSelection {
  const end = new Date(Date.parse(startTime) + BOOKING_DURATION_MINUTES * 60_000).toISOString();
  return { ok: true, startTime, endTime: end, source };
}

function normalizeRequestedIso(value?: string): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  const iso = new Date(t).toISOString();
  return isAllowedGregorySlot(iso) ? iso : undefined;
}

function dayHint(window?: string): string | null {
  if (!window) return null;
  const lower = window.toLowerCase();
  const now = new Date();
  const addDays = (n: number) => denverDateKey(new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toISOString());
  if (lower.includes('tomorrow')) return addDays(1);
  if (lower.includes('today')) return addDays(0);
  return null;
}

function denverDateKey(iso: string): string {
  const parts = denverParts(iso);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
}

function denverParts(iso: string): Record<string, string> | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASK_SAUL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const out: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  const weekdayMap: Record<string, string> = { Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6', Sun: '7' };
  out.weekday = weekdayMap[out.weekday] ?? '0';
  return out;
}
