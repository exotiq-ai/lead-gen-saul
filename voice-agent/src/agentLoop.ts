import type Anthropic from '@anthropic-ai/sdk';
import { runClaudeTurn, textFromMessage, toolUsesFromMessage, type ClaudeTurnInput } from './claude.ts';
import { buildSystemPrompt } from './prompts.ts';
import { executeTool, toolsForMode, type ToolExecutionResult } from './tools.ts';
import { debriefOpeningLine, demoOpeningLine, writeCallState } from './modes.ts';
import type { CallState } from './modes.ts';
import type { Env } from './types.ts';

const MAX_TOOL_TURNS = 6;

export type TurnRunner = (input: ClaudeTurnInput) => Promise<Anthropic.Message>;
export type ToolExecutor = (name: string, input: Record<string, unknown>, env: Env, opts: { callId?: string; state?: CallState }) => Promise<ToolExecutionResult>;

export interface AgentLoopArgs {
  env: Env;
  state: CallState;
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  model: string;
  callId?: string;
  callerPhone?: string;
  agentName?: string;
  onText?: (delta: string) => void;
  turnRunner?: TurnRunner;
  toolExecutor?: ToolExecutor;
}

export interface AgentLoopResult {
  text: string;
  state: CallState;
}

export async function runAgentLoop(args: AgentLoopArgs): Promise<AgentLoopResult> {
  const agentName = args.agentName ?? 'Saul';
  const turn: TurnRunner = args.turnRunner ?? runClaudeTurn;
  const exec: ToolExecutor = args.toolExecutor ?? executeTool;
  let state = args.state;
  let messages = [...args.messages];
  const spoken: string[] = [];
  let emittedAny = false;

  const deterministicExit = demoExitOutcome(lastUserText(messages));
  if (state.mode === 'demo' && deterministicExit) {
    const result = await exec('end_demo_roleplay', { demo_outcome: deterministicExit }, args.env, { callId: args.callId, state });
    if (result.state) state = result.state;
    const line = debriefOpeningLine();
    if (args.onText) args.onText(line);
    return { text: line, state };
  }

  if (state.mode === 'discovery' && shouldStartDemoNow(messages)) {
    const facts = inferDemoStartInput(messages);
    const result = await exec('start_demo_roleplay', facts, args.env, { callId: args.callId, state });
    if (result.state) state = result.state;
    const line = demoOpeningLine(result.state?.facts ?? facts);
    if (args.onText) args.onText(line);
    return { text: line, state };
  }

  const deterministicSave = shouldDeterministicallySave(messages, state, args.callerPhone);
  if (deterministicSave) {
    const result = await exec(deterministicSave.tool, deterministicSave.input, args.env, { callId: args.callId, state });
    state = markSaved(state, deterministicSave.tool);
    await writeCallState(args.env, args.callId, state);
    const line = deterministicSaveResponse(result.content, deterministicSave.tool);
    if (args.onText) args.onText(line);
    return { text: line, state };
  }

  for (let turnIdx = 0; turnIdx < MAX_TOOL_TURNS; turnIdx++) {
    const tools = toolsForMode(state.mode);
    let firstDeltaOfTurn = true;
    const resp = await turn({
      apiKey: args.env.ANTHROPIC_API_KEY,
      model: args.model,
      systemPrompt: buildSystemPrompt(agentName, state),
      messages,
      tools,
      maxTokens: args.maxTokens,
      onText: args.onText
        ? (delta) => {
            if (!delta) return;
            // Separate spoken segments across turns so filler + post-tool text
            // don't run together in the TTS stream.
            if (firstDeltaOfTurn && emittedAny) args.onText?.(' ');
            firstDeltaOfTurn = false;
            emittedAny = true;
            args.onText?.(delta);
          }
        : undefined,
    });
    const text = textFromMessage(resp);
    if (text) spoken.push(text);
    const toolUses = toolUsesFromMessage(resp);
    if (!toolUses.length) {
      const fallbackSave = shouldRepairClaimedSave(text, messages, state, args.callerPhone);
      if (fallbackSave) {
        const result = await exec(fallbackSave.tool, fallbackSave.input, args.env, { callId: args.callId, state });
        state = markSaved(state, fallbackSave.tool);
        await writeCallState(args.env, args.callId, state);
        const line = deterministicSaveResponse(result.content, fallbackSave.tool);
        if (args.onText && !emittedAny) args.onText(line);
        return { text: line, state };
      }
      return { text: spoken.join(' ').trim() || 'One moment.', state };
    }
    const allowed = new Set(tools.map((t) => t.name));
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      // Defense in depth: even if the model hallucinates a tool outside the
      // current mode's set, it never executes.
      const result = allowed.has(tu.name)
        ? await exec(tu.name, tu.input as Record<string, unknown>, args.env, { callId: args.callId, state })
        : { content: 'That tool is not available right now. Continue the conversation naturally.' };
      if (result.state) state = result.state;
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: result.content });
    }
    messages = [
      ...messages,
      { role: 'assistant', content: resp.content },
      { role: 'user', content: results },
    ];
  }
  // Loop exhausted after a tool turn: the caller must still hear a complete
  // wrap-up, not a dangling filler ("one second...") followed by silence.
  const wrapUp = 'I want to make sure this is handled cleanly. Let me get Gregory your details for follow-up.';
  if (args.onText) {
    if (emittedAny) args.onText(' ');
    args.onText(wrapUp);
  }
  return { text: [...spoken, wrapUp].join(' ').trim(), state };
}

function markSaved(state: CallState, tool: 'qualify_and_log_lead' | 'book_gregory_followup'): CallState {
  if (tool === 'book_gregory_followup') return { ...state, leadLogged: true, followupLogged: true };
  return { ...state, leadLogged: true };
}

function shouldRepairClaimedSave(text: string, messages: Anthropic.MessageParam[], state: CallState, callerPhone?: string): DeterministicSave | null {
  if (!/\b(all set|booked|saved|logged|calendar confirmation|gregory will call)\b/i.test(text)) return null;
  return shouldDeterministicallySave(messages, state, callerPhone, true);
}

interface DeterministicSave {
  tool: 'qualify_and_log_lead' | 'book_gregory_followup';
  input: Record<string, unknown>;
}

function shouldDeterministicallySave(messages: Anthropic.MessageParam[], state: CallState, callerPhone?: string, repairingClaim = false): DeterministicSave | null {
  if (state.followupLogged) return null;
  const transcript = transcriptText(messages);
  const lastUser = lastUserText(messages).toLowerCase();
  const phone = extractPhone(transcript) ?? normalizePhone(callerPhone);
  if (!phone) return null;
  const lead = inferLeadInput(transcript, phone, state);
  const hasConsent = /\b(yes please|yeah call|yes call|call me|sure|sounds good|okay|go ahead)\b/i.test(transcript);
  const hasWindow = /\b(whenever|next available|tomorrow|morning|afternoon|between 9 and 3|9 and 3|monday|tuesday|wednesday|thursday|friday)\b/i.test(transcript);
  const isClosing = /\b(bye|goodbye|talk soon|thanks|thank you|that's it|that is it|we should already have it saved|already have it saved)\b/i.test(lastUser);

  if ((repairingClaim || state.mode === 'debrief') && hasConsent && (hasWindow || isClosing)) {
    return {
      tool: 'book_gregory_followup',
      input: {
        ...lead,
        consent_confirmed: true,
        preferred_time_window: inferPreferredWindow(transcript),
        outstanding_questions: inferOutstandingQuestions(transcript),
        custom_solution_needs: inferCustomNeeds(transcript),
      },
    };
  }

  if (!state.leadLogged && (isClosing || repairingClaim) && hasBusinessSignal(transcript)) {
    return { tool: 'qualify_and_log_lead', input: lead };
  }

  return null;
}

function deterministicSaveResponse(toolResult: string, tool: DeterministicSave['tool']): string {
  if (tool === 'book_gregory_followup') {
    if (/GHL appointment booked/i.test(toolResult)) return 'You are all set. I have the details saved for Gregory, and he will call you at the scheduled time. Thanks again, goodbye.';
    return 'You are all set. I have the details and preferred callback window saved for Gregory. Thanks again, goodbye.';
  }
  return 'You are all set. I have the details saved for Gregory. Thanks again, goodbye.';
}

function transcriptText(messages: Anthropic.MessageParam[]): string {
  return messages.map((m) => typeof m.content === 'string' ? m.content : '').join('\n');
}

function inferLeadInput(transcript: string, phone: string, state: CallState): Record<string, unknown> {
  const caller_name = lastMatch(transcript, /\b(?:my name is|name's|this is|call me)\s+([A-Z][A-Za-z' -]{1,40})/gi)
    ?? state.facts?.caller_first_name;
  const business_type = inferBusinessType(transcript) ?? state.facts?.business_type ?? 'local service';
  const city_state = /\bdenver\b/i.test(transcript) ? 'Denver, CO' : state.facts?.city_state;
  const business_name = state.facts?.business_name
    ?? lastMatch(transcript, /\b(?:run|own|operate)\s+([A-Z][A-Za-z0-9'&. -]{2,60}?)(?:\s+(?:in|and|with)|[.,\n])/gi)
    ?? `${business_type} business`;
  const email = inferEmail(transcript);
  const notes = [
    'Caller completed or discussed a live phone-agent demo.',
    /multiple locations/i.test(transcript) ? 'Multiple locations.' : '',
    /after[- ]hours|miss/i.test(transcript) ? 'Pain point: after-hours or missed calls.' : '',
    /price|cost/i.test(transcript) ? 'Asked about pricing; Gregory should review exact structure.' : '',
  ].filter(Boolean).join(' ');
  return {
    caller_name,
    caller_first_name: caller_name?.split(/\s+/)[0],
    caller_phone: phone,
    caller_email: email,
    business_name,
    business_type,
    city_state,
    current_call_handling: /voicemail/i.test(transcript) ? 'Some calls route to voicemail or are handled by individual locations.' : undefined,
    pain_points: /after[- ]hours|miss/i.test(transcript) ? 'After-hours calls, repeated questions, and missed-call follow-up.' : undefined,
    interested: true,
    interest_level: /price|cost|book|follow-up|call me|yes please/i.test(transcript) ? 'hot' : 'warm',
    fit_summary: `Interested ${business_type} operator exploring an AI phone agent.`,
    notes,
  };
}

function inferPreferredWindow(transcript: string): string {
  if (/\b(whenever|next available)\b/i.test(transcript)) return 'next available';
  const specific = lastMatch(transcript, /\b((?:monday|tuesday|wednesday|thursday|friday)[^\n.]{0,40})/gi);
  return specific ?? 'next available';
}

function inferOutstandingQuestions(transcript: string): string | undefined {
  return /price|cost/i.test(transcript) ? 'Pricing and setup structure.' : undefined;
}

function inferCustomNeeds(transcript: string): string | undefined {
  const needs: string[] = [];
  if (/multiple locations/i.test(transcript)) needs.push('multi-location routing');
  if (/existing phone number|change my phone number/i.test(transcript)) needs.push('keep existing phone numbers');
  if (/GHL|CRM/i.test(transcript)) needs.push('CRM/GHL handoff');
  return needs.length ? needs.join(', ') : undefined;
}

function hasBusinessSignal(transcript: string): boolean {
  return /\b(business|company|shop|dispensary|plumbing|hvac|garage|calls?|customers?|locations?)\b/i.test(transcript);
}

function inferBusinessType(transcript: string): string | undefined {
  const lower = transcript.toLowerCase();
  if (lower.includes('dispensary')) return 'dispensary';
  if (lower.includes('plumb')) return 'plumbing';
  if (lower.includes('hvac')) return 'HVAC';
  if (lower.includes('garage door')) return 'garage door';
  if (lower.includes('pav') || lower.includes('driveway')) return 'paving';
  return undefined;
}

function extractPhone(text: string): string | undefined {
  const matches = [...text.matchAll(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g)].map((m) => normalizePhone(m[0])).filter(Boolean) as string[];
  return matches.at(-1);
}

function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}

function inferEmail(text: string): string | undefined {
  const direct = lastMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (direct) return direct.toLowerCase();
  const spoken = lastMatch(text, /([A-Z0-9._%+-]+)\s*(?:at|@)\s*([A-Z0-9.-]+)\s*(?:dot|\.)\s*([A-Z]{2,})/gi);
  return spoken?.toLowerCase();
}

function lastMatch(text: string, regex: RegExp): string | undefined {
  let found: string | undefined;
  for (const match of text.matchAll(regex)) found = match[1]?.trim();
  return found?.replace(/\s+/g, ' ');
}

function lastUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const content = messages[i].content;
    if (typeof content === 'string') return content;
    return JSON.stringify(content);
  }
  return '';
}

function shouldStartDemoNow(messages: Anthropic.MessageParam[]): boolean {
  const lastUser = lastUserText(messages).toLowerCase();
  if (!lastUser.trim()) return false;
  if (/\b(no|not now|don't|do not|skip|pricing only|price only)\b/.test(lastUser)) return false;
  const lastAssistant = lastAssistantText(messages).toLowerCase();
  return lastAssistant.includes('put yourself in the shoes of one of your customers') && /\bready\??/.test(lastAssistant);
}

function inferDemoStartInput(messages: Anthropic.MessageParam[]): Record<string, unknown> {
  const transcript = messages.map((m) => typeof m.content === 'string' ? m.content : '').join('\n');
  const userTranscript = messages.filter((m) => m.role === 'user').map((m) => typeof m.content === 'string' ? m.content : '').join('\n');
  const lower = transcript.toLowerCase();
  const business_name = firstMatch(userTranscript, /\bfrom\s+([A-Z][A-Za-z0-9'&. -]{2,60}?)(?:[.,\n]|\s+(?:here|in|and|with))/)
    ?? firstMatch(userTranscript, /\bwith\s+([A-Z][A-Za-z0-9'&. -]{2,60}?)(?:[.,\n]|\s+(?:here|in|and|we|thanks))/)
    ?? firstMatch(userTranscript, /(?:own|run)\s+([A-Z][A-Za-z0-9'&. -]{2,60}?)(?:\s+(?:here|in|and|with)|[.,\n])/)
    ?? firstMatch(userTranscript, /(?:business|company)(?: name)?(?: is|'s| called)?\s+([A-Z][A-Za-z0-9'&. -]{2,60}?)(?:[.,\n]|\s+(?:here|in|and|we))/)
    ?? firstMatch(userTranscript, /(?:It's|It is|called)\s+([A-Z][A-Za-z0-9'&. -]{2,60}?)(?:[.,\n]|\s+(?:here|in|and|we))/);
  const business_type = lower.includes('hvac') ? 'HVAC'
    : lower.includes('garage door') ? 'garage door'
    : lower.includes('pav') || lower.includes('driveway') ? 'paving'
    : 'local service';
  const city_state = lower.includes('denver') ? 'Denver, CO'
    : lower.includes('austin') ? 'Austin, TX'
    : lower.includes('phoenix') ? 'Phoenix, AZ'
    : undefined;
  const pain_points = lower.includes('miss') || lower.includes('voicemail')
    ? 'missed calls and voicemail follow-up delays'
    : undefined;
  const customer_scenario = lastUserText(messages);
  return { business_name, business_type, city_state, pain_points, customer_scenario };
}

function lastAssistantText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    const content = messages[i].content;
    if (typeof content === 'string') return content;
    return JSON.stringify(content);
  }
  return '';
}

function firstMatch(text: string, regex: RegExp): string | undefined {
  const match = text.match(regex)?.[1]?.trim();
  return match ? match.replace(/\s+/g, ' ') : undefined;
}

function demoExitOutcome(text: string): 'caller_exited' | 'derailed' | null {
  const lower = text.toLowerCase();
  if (!lower.trim()) return null;
  if (/\b(stop|that's enough|that is enough|okay saul|okay sawl)\b/.test(lower)) return 'caller_exited';
  if (/\b(the conversation was good|that was good|that was great|captured my problem|you captured|you set an appointment|very responsive|that was responsive|that worked|pretty good|nice demo|good demo)\b/.test(lower)) return 'caller_exited';
  if (/\b(is this (the )?ai|are you (an? )?(ai|robot|real person)|pricing|price|cost|gregory|saul|sawl)\b/.test(lower)) return 'caller_exited';
  if (/\b(confused|what do i say|i don't know what to say|silent)\b/.test(lower)) return 'derailed';
  return null;
}
