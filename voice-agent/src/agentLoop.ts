import type Anthropic from '@anthropic-ai/sdk';
import { runClaudeTurn, textFromMessage, toolUsesFromMessage, type ClaudeTurnInput } from './claude.ts';
import { buildSystemPrompt } from './prompts.ts';
import { executeTool, toolsForMode, type ToolExecutionResult } from './tools.ts';
import type { CallState } from './modes.ts';
import type { Env } from './types.ts';

const MAX_TOOL_TURNS = 6;

export type TurnRunner = (input: ClaudeTurnInput) => Promise<Anthropic.Message>;
export type ToolExecutor = (name: string, input: Record<string, unknown>, env: Env, opts: { callId?: string }) => Promise<ToolExecutionResult>;

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
        ? await exec(tu.name, tu.input as Record<string, unknown>, args.env, { callId: args.callId })
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
  return { text: spoken.join(' ').trim() || 'I want to make sure this is handled cleanly. Let me get Gregory your details for follow-up.', state };
}
