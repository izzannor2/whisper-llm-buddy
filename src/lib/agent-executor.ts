// Agent Executor — multi-step AI agent loop with tool calling, retries, fallbacks, and validation

import { sendChatMessage, ChatMessage, ChatSettings } from './chat-api';
import { getToolHandler, getToolSchemas, ToolResult } from './agent-tools';
import { recordToolUse, getToolReliability, getToolLearningHints } from './tool-learning';
import { checkPermission, logAuditEntry } from './permissions';
import { getRelevantMemories } from './memory-store';

export type AgentMode = 'chat' | 'task' | 'tool';

export interface AgentStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'validation' | 'recovery';
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
const MAX_TOOL_RETRIES = 2;

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function cancelExecution(): void {
  cancelFlag = true;
}

export function getCurrentExecution(): AgentExecution | null {
  return currentExecution;
}

// Build a system prompt that includes tool descriptions + reliability hints + memory
function buildAgentSystemPrompt(basePrompt: string, mode: AgentMode, userMessage: string): string {
  if (mode === 'chat') return basePrompt;

  const tools = getToolSchemas();
  const toolDescriptions = tools
    .map(t => {
      const reliability = getToolReliability(t.name);
      const reliabilityTag = reliability < 0.5 ? ' ⚠️ LOW RELIABILITY' : reliability < 0.8 ? ' ⚡ MODERATE' : '';
      return `- **${t.name}**${reliabilityTag}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters.properties)}`;
    })
    .join('\n');

  const toolHints = getToolLearningHints();

  return `${basePrompt}

You are an AI agent with access to tools. When you need to use a tool, respond with a JSON block like:
\`\`\`tool_call
{"name": "tool_name", "params": {"key": "value"}}
\`\`\`

Available tools:
${toolDescriptions}
${toolHints}

After using tools, synthesize the results into a final answer. You can chain multiple tool calls across messages.
In Task Mode, break complex requests into steps and execute them one by one.
If a tool fails, try an alternative tool or approach instead of repeating the same call.
After completing all steps, validate your results are correct before giving the final answer.`;
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

// Check if a tool call requires user confirmation
function isRiskyTool(toolName: string): boolean {
  return ['write_file', 'delete_file', 'command_exec'].includes(toolName);
}

// Execute a single tool with retries and fallback
async function executeToolWithRetry(
  call: { name: string; params: Record<string, unknown> },
  onStep?: (step: AgentStep) => void,
  execution?: AgentExecution,
): Promise<ToolResult> {
  // Permission check for risky tools
  if (isRiskyTool(call.name)) {
    const permType = call.name === 'write_file' ? 'file_write' as const
      : call.name === 'delete_file' ? 'file_delete' as const
      : 'command_exec' as const;

    const perm = checkPermission(permType);
    if (perm === 'blocked') {
      logAuditEntry(`Agent tool: ${call.name}`, permType, false, 'Blocked by Safe Mode');
      return { success: false, output: `Action blocked by Safe Mode: ${call.name}. Disable Safe Mode or use a non-destructive alternative.` };
    }
    logAuditEntry(`Agent tool: ${call.name}`, permType, true, `Params: ${JSON.stringify(call.params).slice(0, 200)}`);
  }

  const handler = getToolHandler(call.name);
  if (!handler) {
    return { success: false, output: `Unknown tool: ${call.name}. Available tools: ${getToolSchemas().map(t => t.name).join(', ')}` };
  }

  let lastError = '';
  for (let attempt = 0; attempt <= MAX_TOOL_RETRIES; attempt++) {
    const startTime = Date.now();
    try {
      const result = await handler(call.params);
      recordToolUse(call.name, result.success, Date.now() - startTime, result.success ? undefined : result.output);

      if (result.success || attempt === MAX_TOOL_RETRIES) {
        return result;
      }

      // Failed but retries remain
      lastError = result.output;
      const recoveryStep: AgentStep = {
        id: genId(),
        type: 'recovery',
        content: `Tool "${call.name}" failed (attempt ${attempt + 1}/${MAX_TOOL_RETRIES + 1}): ${lastError}. Retrying...`,
        toolName: call.name,
        timestamp: Date.now(),
      };
      execution?.steps.push(recoveryStep);
      onStep?.(recoveryStep);

      // Brief backoff
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      recordToolUse(call.name, false, Date.now() - startTime, lastError);

      if (attempt === MAX_TOOL_RETRIES) {
        return { success: false, output: `Tool "${call.name}" failed after ${MAX_TOOL_RETRIES + 1} attempts: ${lastError}` };
      }

      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }

  return { success: false, output: `Tool "${call.name}" failed: ${lastError}` };
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

  // Task/Tool mode — agent loop with full context injection
  let memoryContext = '';
  try { memoryContext = await getRelevantMemories(userMessage); } catch { /* ignore */ }

  const agentSettings: ChatSettings = {
    ...settings,
    systemPrompt: buildAgentSystemPrompt(settings.systemPrompt, mode, userMessage),
  };

  const messages: ChatMessage[] = [
    ...conversationHistory,
    { role: 'user', content: userMessage + (memoryContext ? `\n\n${memoryContext}` : '') },
  ];

  let iterations = 0;
  let lastResponse = '';
  let consecutiveFailures = 0;

  while (iterations < MAX_ITERATIONS && !cancelFlag) {
    iterations++;

    const thinkStep: AgentStep = {
      id: genId(),
      type: 'thinking',
      content: `Iteration ${iterations}/${MAX_ITERATIONS}...`,
      timestamp: Date.now(),
    };
    execution.steps.push(thinkStep);
    onStep?.(thinkStep);

    // Execute with retry at the LLM level
    let llmSuccess = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        lastResponse = await sendChatMessage(messages, agentSettings, onChunk);
        llmSuccess = true;
        break;
      } catch (e) {
        if (attempt === 1) {
          execution.status = 'error';
          execution.finalResponse = `Error: ${e instanceof Error ? e.message : String(e)}`;
          return execution.finalResponse;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!llmSuccess) break;

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
    let anyToolFailed = false;

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

      const result = await executeToolWithRetry(call, onStep, execution);

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

      if (!result.success) anyToolFailed = true;
      toolResults.push(`Tool "${call.name}" ${result.success ? '✅' : '❌'}: ${result.output}`);
    }

    // Track consecutive failures for early exit
    if (anyToolFailed) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    // If stuck in failure loop, ask AI to change approach
    const feedbackPrefix = consecutiveFailures >= 2
      ? `⚠️ Multiple tool failures detected. Change your approach — try different tools or parameters.\n\n`
      : '';

    messages.push({
      role: 'user',
      content: `${feedbackPrefix}Tool results:\n${toolResults.join('\n\n')}`,
    });

    // Bail if stuck in a loop (3+ consecutive all-fail rounds)
    if (consecutiveFailures >= 3) {
      const bailStep: AgentStep = {
        id: genId(),
        type: 'recovery',
        content: 'Too many consecutive failures. Providing best available answer.',
        timestamp: Date.now(),
      };
      execution.steps.push(bailStep);
      onStep?.(bailStep);
      break;
    }
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
