import type { Env, FollowupInput } from './types.ts';
import { normalizePhone } from './leadUtils.ts';

export async function sendAppointmentConfirmation(input: FollowupInput, confirmationText: string | undefined, env: Env): Promise<{ ok: boolean; skipped?: boolean; error?: string; messageHandle?: string }> {
  if (!confirmationText) return { ok: true, skipped: true };
  if (!env.SENDBLUE_API_KEY_ID || !env.SENDBLUE_API_SECRET_KEY || !env.SENDBLUE_FROM_NUMBER) {
    return { ok: true, skipped: true };
  }
  const number = normalizePhone(input.caller_phone);
  if (!number) return { ok: true, skipped: true };

  try {
    const resp = await fetch('https://api.sendblue.com/api/send-message', {
      method: 'POST',
      headers: {
        'sb-api-key-id': env.SENDBLUE_API_KEY_ID,
        'sb-api-secret-key': env.SENDBLUE_API_SECRET_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        number,
        from_number: env.SENDBLUE_FROM_NUMBER,
        content: confirmationText,
      }),
    });
    const raw = await resp.json().catch(() => ({})) as Record<string, unknown>;
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${String(raw.message ?? raw.error ?? 'Sendblue send failed')}` };
    return { ok: true, messageHandle: typeof raw.message_handle === 'string' ? raw.message_handle : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
