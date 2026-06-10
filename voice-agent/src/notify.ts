import type { FollowupInput, Env, LeadCaptureInput } from './types.ts';

export async function notifyLeadCaptured(input: LeadCaptureInput, leadId: string, env: Env): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || input.interested === false) return;
  const text = [
    '🔥 Hot Ask Saul inbound lead captured',
    `Name: ${input.caller_name ?? `${input.caller_first_name ?? ''} ${input.caller_last_name ?? ''}`.trim()}`,
    input.business_name ? `Business: ${input.business_name}` : null,
    `Phone: ${input.caller_phone}`,
    input.caller_email ? `Email: ${input.caller_email}` : null,
    input.business_type ? `Type: ${input.business_type}` : null,
    input.city_state ? `Market: ${input.city_state}` : null,
    input.current_call_handling ? `Current handling: ${input.current_call_handling}` : null,
    input.pain_points ? `Pain/task: ${input.pain_points}` : null,
    input.fit_summary ? `Fit: ${input.fit_summary}` : null,
    env.APP_BASE_URL ? `${env.APP_BASE_URL.replace(/\/$/, '')}/dashboard/leads/${leadId}` : `Lead ID: ${leadId}`,
  ].filter(Boolean).join('\n');
  await sendTelegram(text, env);
}

export async function notifyGregory(input: FollowupInput, leadId: string, env: Env): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text = [
    '📞 Saul booked a Gregory follow-up request',
    `Name: ${input.caller_name ?? `${input.caller_first_name ?? ''} ${input.caller_last_name ?? ''}`.trim()}`,
    input.business_name ? `Business: ${input.business_name}` : null,
    `Phone: ${input.caller_phone}`,
    input.caller_email ? `Email: ${input.caller_email}` : null,
    input.business_type ? `Type: ${input.business_type}` : null,
    input.city_state ? `Market: ${input.city_state}` : null,
    `Window: ${input.preferred_time_window}`,
    input.outstanding_questions ? `Questions: ${input.outstanding_questions}` : null,
    input.custom_solution_needs ? `Custom: ${input.custom_solution_needs}` : null,
    env.APP_BASE_URL ? `${env.APP_BASE_URL.replace(/\/$/, '')}/dashboard/leads/${leadId}` : `Lead ID: ${leadId}`,
  ].filter(Boolean).join('\n');
  await sendTelegram(text, env);
}

async function sendTelegram(text: string, env: Env): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      message_thread_id: env.TELEGRAM_MESSAGE_THREAD_ID ? Number(env.TELEGRAM_MESSAGE_THREAD_ID) : undefined,
      text,
      disable_web_page_preview: true,
    }),
  });
}
