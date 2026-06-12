import type { Env, FollowupInput, LeadCaptureInput } from './types.ts';
import type { AppointmentResult, GhlCfg, GhlResult } from './ghl.ts';
import { addContactNote, addContactTags, getContactNotes, sendGhlEmailMessage } from './ghl.ts';

const SENDBLUE_DISPLAY_NUMBER = '(720) 292-7554';
const DEFAULT_FROM_EMAIL = 'saul3000bot@gmail.com';
const DEFAULT_FROM_NAME = 'Saul from AskSaul.ai';

type EmailFollowupResult = GhlResult & {
  messageId?: string;
  subject?: string;
  skippedReason?: string;
};

export async function sendInboundLeadEmailFollowup(args: {
  input: LeadCaptureInput | FollowupInput;
  contactId?: string;
  cfg: GhlCfg;
  env: Env;
  appointment?: AppointmentResult;
  reason: 'lead_logged' | 'followup_booked';
  existingTags?: string[];
}): Promise<EmailFollowupResult> {
  const { input, contactId, cfg, env, appointment, reason } = args;
  if (!cfg.apiKey || !cfg.locationId || !contactId) return { ok: true, skipped: true, skippedReason: 'GHL contact not available' };
  if (!input.caller_email) return { ok: true, contactId, skipped: true, skippedReason: 'lead has no email' };
  if (input.interested === false) return { ok: true, contactId, skipped: true, skippedReason: 'lead not marked interested' };

  const existing = new Set((args.existingTags ?? []).map((tag) => tag.toLowerCase()));
  const targetTag = emailSentTag(reason);
  if (existing.has(targetTag) || existing.has('ask-saul-booked-email-sent')) {
    return { ok: true, contactId, skipped: true, skippedReason: `email already sent: ${targetTag}` };
  }

  const previousNotes = await getContactNotes(contactId, cfg);
  const previousEmailNote = previousNotes.find((note) => /Ask Saul inbound email follow-up sent\./i.test(`${note.body ?? ''}\n${note.bodyText ?? ''}`));
  if (previousEmailNote) {
    return { ok: true, contactId, skipped: true, skippedReason: 'GHL notes show an inbound follow-up email was already sent' };
  }

  // Keep the follow-up live by default for the provider phone agent, because Gregory explicitly approved it.
  // Set GHL_INBOUND_EMAIL_FOLLOWUP_ENABLED=false to pause without changing code.
  if (env.GHL_INBOUND_EMAIL_FOLLOWUP_ENABLED === 'false' || env.GHL_INBOUND_EMAIL_FOLLOWUP_ENABLED === '0') {
    return { ok: true, contactId, skipped: true, skippedReason: 'GHL_INBOUND_EMAIL_FOLLOWUP_ENABLED is disabled' };
  }

  const copy = appointment?.ok && appointment.startTime
    ? bookedCallEmail(input, appointment)
    : noBookedCallEmail(input, reason);

  const fromEmail = env.GHL_INBOUND_EMAIL_FROM || DEFAULT_FROM_EMAIL;
  const fromName = env.GHL_INBOUND_EMAIL_FROM_NAME || DEFAULT_FROM_NAME;

  const send = await sendGhlEmailMessage({
    cfg,
    contactId,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
    fromEmail,
    fromName,
    toEmail: input.caller_email,
  });

  const noteLines = [
    send.ok ? 'Ask Saul inbound email follow-up sent.' : 'Ask Saul inbound email follow-up failed.',
    `Reason: ${reason}`,
    `Subject: ${copy.subject}`,
    `To: ${input.caller_email}`,
    `From: ${fromName} <${fromEmail}>`,
    send.ok ? `Message ID: ${send.messageId ?? 'unknown'}` : `Error: ${send.error}`,
  ];
  await addContactNote(noteLines.join('\n'), contactId, cfg);
  if (send.ok) {
    await addContactTags(contactId, [emailSentTag(reason), 'ask-saul-email-followup-sent'], cfg);
  }

  if (!send.ok) return { ok: false, contactId, error: send.error, subject: copy.subject };
  return { ok: true, contactId, messageId: send.messageId, subject: copy.subject };
}

function emailSentTag(reason: 'lead_logged' | 'followup_booked'): string {
  return reason === 'followup_booked' ? 'ask-saul-booked-email-sent' : 'ask-saul-email-1-sent';
}

function noBookedCallEmail(input: LeadCaptureInput | FollowupInput, reason: 'lead_logged' | 'followup_booked') {
  const firstName = firstNameFrom(input) || 'there';
  const business = input.business_name ? input.business_name.trim() : 'your business';
  const usefulContext = contextBullets(input);
  const subject = reason === 'followup_booked'
    ? 'Saul passed your context to Gregory'
    : 'Good talking with Saul';

  const text = [
    `Hey ${firstName},`,
    '',
    `Thanks for taking a minute with Saul. I wanted to send this while the conversation is fresh, because the exact situation you described for ${business} is what AskSaul.ai is built around.`,
    '',
    usefulContext.length
      ? `What Saul captured:\n${usefulContext.map((line) => `- ${line}`).join('\n')}`
      : 'What Saul captured: you are exploring whether a phone agent could help with real calls, missed opportunities, and faster follow-up.',
    '',
    'The goal is not to bolt on a generic bot. The goal is to build a phone agent that understands your business, answers consistently, captures the details that matter, and gets the right next step to the right person before the lead goes cold.',
    '',
    `If texting is easier, text us at ${SENDBLUE_DISPLAY_NUMBER}. A quick text like "call me" or "send details" is enough and we will help from there.`,
    '',
    'If Saul already grabbed a preferred callback window from you, you are good. Gregory will have the context before he reaches out.',
    '',
    'Always here to help,',
    'Saul',
    'AskSaul.ai',
  ].join('\n');

  return { subject, text, html: htmlEmail(text) };
}

function bookedCallEmail(input: LeadCaptureInput | FollowupInput, appointment: AppointmentResult) {
  const firstName = firstNameFrom(input) || 'there';
  const usefulContext = contextBullets(input);
  const subject = 'You are set, Gregory has the context from Saul';
  const when = appointment.confirmationText || appointment.startTime || 'the scheduled time';

  const text = [
    `Hey ${firstName},`,
    '',
    `You are set. Saul passed the context over to Gregory and the follow-up is scheduled for ${when}.`,
    '',
    usefulContext.length
      ? `What Gregory will already have in front of him:\n${usefulContext.map((line) => `- ${line}`).join('\n')}`
      : 'Gregory will already have the call context in front of him, so you do not have to repeat everything from scratch.',
    '',
    'That is the bigger idea behind AskSaul.ai: the agent should not just answer the phone. It should capture intent, qualify the moment, preserve context, and make the next human handoff feel seamless.',
    '',
    `If anything changes before the call, text us at ${SENDBLUE_DISPLAY_NUMBER}. A quick text is fine. We are always here to help.`,
    '',
    'Talk soon,',
    'Saul',
    'AskSaul.ai',
  ].join('\n');

  return { subject, text, html: htmlEmail(text) };
}

function contextBullets(input: LeadCaptureInput | FollowupInput): string[] {
  const items: string[] = [];
  if (input.business_name) items.push(`Business: ${input.business_name}`);
  if (input.business_type) items.push(`Service type: ${input.business_type}`);
  if (input.city_state) items.push(`Market: ${input.city_state}`);
  if (input.current_call_handling) items.push(`Current call handling: ${input.current_call_handling}`);
  if (input.pain_points) items.push(`Pain point: ${input.pain_points}`);
  if (input.fit_summary) items.push(`Fit summary: ${input.fit_summary}`);
  if ('preferred_time_window' in input && input.preferred_time_window) items.push(`Preferred callback window: ${input.preferred_time_window}`);
  if ('outstanding_questions' in input && input.outstanding_questions) items.push(`Open question: ${input.outstanding_questions}`);
  if ('custom_solution_needs' in input && input.custom_solution_needs) items.push(`Custom need: ${input.custom_solution_needs}`);
  return items.slice(0, 6);
}

function firstNameFrom(input: LeadCaptureInput | FollowupInput): string | null {
  const raw = input.caller_first_name || input.caller_name;
  if (!raw) return null;
  const first = raw.trim().split(/\s+/)[0];
  return first || null;
}

function htmlEmail(text: string): string {
  const escaped = escapeHtml(text)
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 15px; line-height: 1.55; color: #111827;">${escaped}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
