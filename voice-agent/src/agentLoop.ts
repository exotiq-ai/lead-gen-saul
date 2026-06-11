import type Anthropic from '@anthropic-ai/sdk';
import { runClaudeTurn, textFromMessage, toolUsesFromMessage, type ClaudeTurnInput } from './claude.ts';
import { buildSystemPrompt } from './prompts.ts';
import { executeTool, toolsForMode, type ToolExecutionResult } from './tools.ts';
import { debriefOpeningLine, demoOpeningLine } from './modes.ts';
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
  if (/\b(is this (the )?ai|are you (an? )?(ai|robot|real person)|pricing|price|cost|gregory|saul|sawl)\b/.test(lower)) return 'caller_exited';
  if (/\b(confused|what do i say|i don't know what to say|silent)\b/.test(lower)) return 'derailed';
  return null;
}
