// OpenClaw Agent - Sandboxed AI assistant with agentic tool-calling loop

import { sendChatMessage, loadSettings, ChatMessage } from './chat-api';
import { executeCommand, checkAgentStatus } from './local-backend-agent';
import { readFile, writeFile, listFiles, getCurrentDirectory, fileExists } from './file-system';
import { logAction, recordHabit, getHabitSuggestions, createBackup, getActionLogs } from './openclaw-store';
import { getIDESettings } from './ide-store';
import { getProjectContext } from './project-context';
import { AGENT_TOOLS } from './agent-tools';

export interface OpenClawConfig {
  model: string;
  sandboxedPath: string | null;
  autoBackup: boolean;
  murmurUpdates: boolean;
  learningEnabled: boolean;
}

export interface OpenClawState {
  isActive: boolean;
  isProcessing: boolean;
  currentStep: string;
  lastActivity: number;
  totalActions: number;
  config: OpenClawConfig;
}

const defaultConfig: OpenClawConfig = {
  model: 'llama3.1:8b',
  sandboxedPath: null,
  autoBackup: true,
  murmurUpdates: true,
  learningEnabled: true,
};

let state: OpenClawState = {
  isActive: false,
  isProcessing: false,
  currentStep: '',
  lastActivity: Date.now(),
  totalActions: 0,
  config: { ...defaultConfig },
};

let listeners: ((state: OpenClawState) => void)[] = [];
let murmurInterval: ReturnType<typeof setInterval> | null = null;
let murmurCallback: ((message: string) => void) | null = null;

export function getOpenClawState(): OpenClawState {
  return { ...state };
}

export function onStateChange(listener: (state: OpenClawState) => void): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

function notifyListeners() {
  listeners.forEach(l => l({ ...state }));
}

function setStep(step: string) {
  state.currentStep = step;
  notifyListeners();
}

export async function initOpenClaw(config?: Partial<OpenClawConfig>): Promise<boolean> {
  try {
    state.config = { ...defaultConfig, ...config };
    await checkAgentStatus();
    const currentDir = getCurrentDirectory();
    if (currentDir) state.config.sandboxedPath = currentDir.name;
    state.isActive = true;
    state.lastActivity = Date.now();
    notifyListeners();
    await logAction({ timestamp: Date.now(), type: 'command', action: 'OpenClaw initialized', details: `Backend: ${loadSettings().backend}`, success: true });
    if (state.config.murmurUpdates) startMurmurUpdates();
    return true;
  } catch (error) {
    console.error('Failed to initialize OpenClaw:', error);
    state.isActive = false;
    notifyListeners();
    return false;
  }
}

export function shutdownOpenClaw(): void {
  state.isActive = false;
  if (murmurInterval) { clearInterval(murmurInterval); murmurInterval = null; }
  notifyListeners();
  logAction({ timestamp: Date.now(), type: 'command', action: 'OpenClaw shutdown', success: true });
}

export function setMurmurCallback(callback: (message: string) => void): void {
  murmurCallback = callback;
}

function startMurmurUpdates(): void {
  if (murmurInterval) return;
  const murmurs = ["Watching for changes...", "All systems nominal.", "Ready when you are.", "Files synced.", "Standing by."];
  murmurInterval = setInterval(() => {
    if (state.isActive && murmurCallback && !state.isProcessing) {
      murmurCallback(murmurs[Math.floor(Math.random() * murmurs.length)]);
    }
  }, 60000);
}

// Parse tool calls from AI response: [TOOL:tool_name param="value"]
function parseToolCalls(response: string): Array<{ tool: string; params: Record<string, string>; raw: string }> {
  const toolCalls: Array<{ tool: string; params: Record<string, string>; raw: string }> = [];
  const regex = /\[TOOL:(\w+)((?:\s+\w+="[^"]*")*)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    const tool = match[1];
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    const paramRegex = /(\w+)="([^"]*)"/g;
    let pm;
    while ((pm = paramRegex.exec(paramsStr)) !== null) {
      params[pm[1]] = pm[2];
    }
    toolCalls.push({ tool, params, raw: match[0] });
  }
  return toolCalls;
}

// Execute a single tool
async function executeTool(tool: string, params: Record<string, string>): Promise<string> {
  try {
    switch (tool) {
      case 'read_file': {
        const content = await readFile(params.path || '');
        return `File contents of ${params.path}:\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``;
      }
      case 'write_file': {
        const content = params.content || '';
        if (state.config.autoBackup) {
          try {
            const exists = await fileExists(params.path || '');
            if (exists) {
              const existing = await readFile(params.path || '');
              await createBackup(params.path || '', existing, 'OpenClaw auto-write');
            }
          } catch { /* no existing file */ }
        }
        await writeFile(params.path || '', content);
        return `✅ Written ${content.length} bytes to ${params.path}`;
      }
      case 'list_files': {
        const files = await listFiles();
        return `Files in project:\n${files.join('\n')}`;
      }
      case 'search_code': {
        const query = params.query || '';
        const files = await listFiles();
        const results: string[] = [];
        for (const file of files.slice(0, 50)) {
          try {
            const content = await readFile(file);
            if (content.toLowerCase().includes(query.toLowerCase())) {
              const lines = content.split('\n');
              const matches = lines
                .map((line, i) => ({ line: i + 1, text: line }))
                .filter(l => l.text.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 3);
              results.push(`${file}:\n${matches.map(m => `  L${m.line}: ${m.text.trim()}`).join('\n')}`);
            }
          } catch { /* skip unreadable */ }
        }
        return results.length > 0 ? `Search results for "${query}":\n${results.join('\n\n')}` : `No results found for "${query}"`;
      }
      case 'run_command': {
        const cmd = params.command || '';
        if (!isCommandAllowed(cmd)) return `❌ Command blocked: "${cmd}" (not allowed in sandbox)`;
        const result = await executeCommand(cmd);
        return `Command: ${cmd}\nOutput:\n${result.output}${result.error ? '\nError: ' + result.error : ''}`;
      }
      case 'web_search': {
        return `Web search for "${params.query}" is available via the cloud backend. Use the chat to ask questions instead.`;
      }
      default:
        return `Unknown tool: ${tool}`;
    }
  } catch (err) {
    return `Tool error (${tool}): ${err}`;
  }
}

// Main chat function with agentic loop
export async function* chatWithOpenClaw(
  message: string,
  history: ChatMessage[] = []
): AsyncGenerator<string, void, unknown> {
  state.isProcessing = true;
  state.lastActivity = Date.now();
  setStep('Thinking...');
  
  const startTime = Date.now();
  
  if (state.config.learningEnabled && (message.startsWith('/') || message.toLowerCase().startsWith('run '))) {
    await recordHabit(message);
  }
  
  const systemPrompt = buildSystemPrompt();
  let currentMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];
  
  const MAX_ITERATIONS = 10;
  
  try {
    const settings = loadSettings();
    
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Get AI response
      setStep(iteration === 0 ? 'Thinking...' : `Executing step ${iteration + 1}...`);
      
      const chunks: string[] = [];
      let done = false;
      let error: Error | null = null;
      let fullResponse = '';
      
      const promise = sendChatMessage(
        currentMessages,
        { ...settings, systemPrompt: '' },
        (chunk) => { chunks.push(chunk); }
      ).then(() => { done = true; }).catch(e => { error = e; done = true; });
      
      while (!done || chunks.length > 0) {
        if (chunks.length > 0) {
          const chunk = chunks.shift()!;
          fullResponse += chunk;
          yield chunk;
        } else {
          await new Promise(r => setTimeout(r, 16));
        }
      }
      
      if (error) throw error;
      
      // Check for tool calls
      const toolCalls = parseToolCalls(fullResponse);
      
      if (toolCalls.length === 0) {
        // No tool calls — we're done
        state.totalActions++;
        await logAction({
          timestamp: Date.now(), type: 'chat',
          action: `Chat: "${message.slice(0, 50)}..."`,
          details: `Response length: ${fullResponse.length}, iterations: ${iteration + 1}`,
          success: true, duration: Date.now() - startTime,
        });
        break;
      }
      
      // Execute tool calls
      const toolResults: string[] = [];
      for (const tc of toolCalls) {
        setStep(`Running ${tc.tool}...`);
        yield `\n\n⚙️ *Running \`${tc.tool}\`...*\n`;
        
        const result = await executeTool(tc.tool, tc.params);
        toolResults.push(`[TOOL_RESULT:${tc.tool}]\n${result}\n[/TOOL_RESULT]`);
        
        yield `\n${result.slice(0, 500)}${result.length > 500 ? '...' : ''}\n`;
        
        await logAction({
          timestamp: Date.now(), type: 'command',
          action: `Tool: ${tc.tool}`, details: JSON.stringify(tc.params),
          success: true, duration: 0,
        });
      }
      
      // Feed results back and continue
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: fullResponse },
        { role: 'user', content: `Tool execution results:\n\n${toolResults.join('\n\n')}\n\nContinue with the task. If done, provide the final answer without tool calls.` },
      ];
      
      yield '\n\n---\n*Continuing...*\n\n';
    }
    
    await parseAndExecuteCommands('');
    
  } catch (err) {
    await logAction({
      timestamp: Date.now(), type: 'chat',
      action: `Chat failed: "${message.slice(0, 50)}..."`,
      details: String(err), success: false, duration: Date.now() - startTime,
    });
    yield `\n\nError: ${err}`;
  } finally {
    state.isProcessing = false;
    state.currentStep = '';
    state.lastActivity = Date.now();
    notifyListeners();
  }
}

function buildSystemPrompt(): string {
  const ideSettings = getIDESettings();
  const chatSettings = loadSettings();
  const currentDir = getCurrentDirectory();
  const projectCtx = getProjectContext();
  return `You are OpenClaw, an expert AI coding assistant running via ${chatSettings.backend} backend.

## Capabilities
- Generate complete, working code for React + TypeScript + Tailwind CSS projects
- Debug code and suggest fixes
- Execute tools autonomously using [TOOL:name param="value"] syntax
- Learn from user patterns

## Available Tools
- [TOOL:read_file path="/src/file.tsx"] — Read a file's contents
- [TOOL:write_file path="/src/file.tsx" content="..."] — Write content to a file
- [TOOL:list_files] — List all project files
- [TOOL:search_code query="searchterm"] — Search across project files
- [TOOL:run_command command="npm test"] — Execute a shell command
- [TOOL:web_search query="how to..."] — Search the web

## Rules
- Use tools to gather context BEFORE writing code
- When modifying files, ALWAYS read them first with read_file
- After using tools, provide a clear summary of what you did
- Output complete file contents using \`\`\`language:/path/to/file.ext format
${currentDir?.name ? `- Read/write files in mounted project: ${currentDir.name}` : '- No local project mounted — output code in chat'}

## Current Context
- Mode: ${ideSettings.mode}
- Backend: ${chatSettings.backend}
- Actions logged: ${state.totalActions}

${projectCtx || '- No App Builder project loaded yet.'}

Keep responses focused and actionable. Always output complete, working code files.`;
}

async function parseAndExecuteCommands(response: string): Promise<void> {
  // Legacy — tool calls now handled in main loop
}

export async function executeWithLogging(command: string): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  if (!isCommandAllowed(command)) {
    await logAction({ timestamp: Date.now(), type: 'command', action: `Blocked: ${command}`, details: 'Not allowed', success: false });
    return { success: false, output: 'Command not allowed in sandbox mode' };
  }
  if (state.config.learningEnabled) await recordHabit(command);
  const result = await executeCommand(command);
  state.totalActions++;
  await logAction({ timestamp: Date.now(), type: 'command', action: command, details: result.output.slice(0, 500), success: result.success, duration: Date.now() - startTime });
  return { success: result.success, output: result.output + (result.error || '') };
}

function isCommandAllowed(command: string): boolean {
  const blocked = ['rm -rf /', 'rm -rf ~', 'del /s /q c:', 'format', 'mkfs', 'dd if=', ':(){:|:&};:', 'chmod -R 777 /', 'chown -R'];
  const lowerCmd = command.toLowerCase();
  return !blocked.some(b => lowerCmd.includes(b));
}

export async function readFileWithLogging(filePath: string): Promise<string> {
  const startTime = Date.now();
  try {
    const content = await readFile(filePath);
    await logAction({ timestamp: Date.now(), type: 'file-read', action: `Read: ${filePath}`, details: `${content.length} bytes`, success: true, duration: Date.now() - startTime });
    return content;
  } catch (error) {
    await logAction({ timestamp: Date.now(), type: 'file-read', action: `Read failed: ${filePath}`, details: String(error), success: false, duration: Date.now() - startTime });
    throw error;
  }
}

export async function writeFileWithLogging(filePath: string, content: string, reason = 'Manual edit'): Promise<void> {
  const startTime = Date.now();
  if (state.config.autoBackup) {
    try {
      const exists = await fileExists(filePath);
      if (exists) {
        const existingContent = await readFile(filePath);
        await createBackup(filePath, existingContent, reason);
      }
    } catch { /* no backup needed */ }
  }
  try {
    await writeFile(filePath, content);
    state.totalActions++;
    await logAction({ timestamp: Date.now(), type: 'file-write', action: `Write: ${filePath}`, details: `${content.length} bytes - ${reason}`, success: true, duration: Date.now() - startTime });
  } catch (error) {
    await logAction({ timestamp: Date.now(), type: 'file-write', action: `Write failed: ${filePath}`, details: String(error), success: false, duration: Date.now() - startTime });
    throw error;
  }
}

export async function getSuggestions(prefix: string): Promise<string[]> {
  if (!state.config.learningEnabled) return [];
  const habits = await getHabitSuggestions(prefix);
  return habits.map(h => h.pattern);
}

export async function getRecentLogs(limit = 50): Promise<ReturnType<typeof getActionLogs>> {
  return getActionLogs(limit);
}

export function updateConfig(config: Partial<OpenClawConfig>): void {
  state.config = { ...state.config, ...config };
  notifyListeners();
  if (config.murmurUpdates !== undefined) {
    if (config.murmurUpdates && !murmurInterval) startMurmurUpdates();
    else if (!config.murmurUpdates && murmurInterval) { clearInterval(murmurInterval); murmurInterval = null; }
  }
}
