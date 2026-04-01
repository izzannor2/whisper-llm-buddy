// Agent Executor — multi-step AI agent loop with tool calling

import { sendChatMessage, ChatMessage, ChatSettings } from './chat-api';
import { getToolHandler, getToolSchemas, ToolResult } from './agent-tools';

export type AgentMode = 'chat' | 'task' | 'tool';

export interface AgentStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response';
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: ToolResult;
  timestamp: number;
}

export interface AgentExecution {
  id: string;
  mode: AgentMode;
  steps: AgentStep[];
  status: 'running' | 'completed' | 'error' | 'cancelled';
  finalResponse: string;
}

let currentExecution: AgentExecution | null = null;
let cancelFlag = false;

const MAX_ITERATIONS = 10;

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function cancelExecution(): void {
  cancelFlag = true;
}

export function getCurrentExecution(): AgentExecution | null {
  return currentExecution;
}

// Build a system prompt that includes tool descriptions
function buildAgentSystemPrompt(basePrompt: string, mode: AgentMode): string {
  if (mode === 'chat') return basePrompt;

  const tools = getToolSchemas();
  const toolDescriptions = tools
    .map(t => `- **${t.name}**: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters.properties)}`)
    .join('\n');

  return `${basePrompt}

You are an AI agent with access to tools. When you need to use a tool, respond with a JSON block like:
\`\`\`tool_call
{"name": "tool_name", "params": {"key": "value"}}
\`\`\`

Available tools:
${toolDescriptions}

After using tools, synthesize the results into a final answer. You can chain multiple tool calls across messages.
In Task Mode, break complex requests into steps and execute them one by one.`;
}

// Parse tool calls from AI response
function parseToolCalls(content: string): Array<{ name: string; params: Record<string, unknown> }> {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const regex = /```tool_call\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name) {
        calls.push({ name: parsed.name, params: parsed.params || {} });
      }
    } catch {
      // Skip malformed tool calls
    }
  }
  return calls;
}

export async function executeAgent(
  userMessage: string,
  conversationHistory: ChatMessage[],
  settings: ChatSettings,
  mode: AgentMode = 'chat',
  onStep?: (step: AgentStep) => void,
  onChunk?: (chunk: string) => void
): Promise<string> {
  cancelFlag = false;

  const execution: AgentExecution = {
    id: genId(),
    mode,
    steps: [],
    status: 'running',
    finalResponse: '',
  };
  currentExecution = execution;

  // In chat mode, just pass through directly
  if (mode === 'chat') {
    try {
      const msgs: ChatMessage[] = [
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ];
      const response = await sendChatMessage(msgs, settings, onChunk);
      execution.finalResponse = response;
      execution.status = 'completed';
      return response;
    } catch (e) {
      execution.status = 'error';
      throw e;
    }
  }

  // Task/Tool mode — agent loop
  const agentSettings: ChatSettings = {
    ...settings,
    systemPrompt: buildAgentSystemPrompt(settings.systemPrompt, mode),
  };

  const messages: ChatMessage[] = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;
  let lastResponse = '';

  while (iterations < MAX_ITERATIONS && !cancelFlag) {
    iterations++;

    // Add thinking step
    const thinkStep: AgentStep = {
      id: genId(),
      type: 'thinking',
      content: `Iteration ${iterations}/${MAX_ITERATIONS}...`,
      timestamp: Date.now(),
    };
    execution.steps.push(thinkStep);
    onStep?.(thinkStep);

    try {
      lastResponse = await sendChatMessage(messages, agentSettings, onChunk);
    } catch (e) {
      execution.status = 'error';
      execution.finalResponse = `Error: ${e instanceof Error ? e.message : String(e)}`;
      return execution.finalResponse;
    }

    // Check for tool calls
    const toolCalls = parseToolCalls(lastResponse);

    if (toolCalls.length === 0) {
      // No tool calls — this is the final response
      execution.finalResponse = lastResponse;
      execution.status = 'completed';
      const respStep: AgentStep = {
        id: genId(),
        type: 'response',
        content: lastResponse,
        timestamp: Date.now(),
      };
      execution.steps.push(respStep);
      onStep?.(respStep);
      return lastResponse;
    }

    // Execute tool calls
    messages.push({ role: 'assistant', content: lastResponse });

    const toolResults: string[] = [];
    for (const call of toolCalls) {
      if (cancelFlag) break;

      const callStep: AgentStep = {
        id: genId(),
        type: 'tool_call',
        content: `Calling ${call.name}...`,
        toolName: call.name,
        toolParams: call.params,
        timestamp: Date.now(),
      };
      execution.steps.push(callStep);
      onStep?.(callStep);

      const handler = getToolHandler(call.name);
      let result: ToolResult;
      if (handler) {
        try {
          result = await handler(call.params);
        } catch (e) {
          result = { success: false, output: `Tool error: ${e instanceof Error ? e.message : String(e)}` };
        }
      } else {
        result = { success: false, output: `Unknown tool: ${call.name}` };
      }

      const resultStep: AgentStep = {
        id: genId(),
        type: 'tool_result',
        content: result.output,
        toolName: call.name,
        toolResult: result,
        timestamp: Date.now(),
      };
      execution.steps.push(resultStep);
      onStep?.(resultStep);

      toolResults.push(`Tool "${call.name}" result: ${result.output}`);
    }

    // Feed results back
    messages.push({
      role: 'user',
      content: `Tool results:\n${toolResults.join('\n\n')}`,
    });
  }

  if (cancelFlag) {
    execution.status = 'cancelled';
    execution.finalResponse = lastResponse || 'Execution cancelled.';
  } else {
    execution.status = 'completed';
    execution.finalResponse = lastResponse;
  }

  return execution.finalResponse;
}
