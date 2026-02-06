// OpenClaw Agent - Sandboxed AI assistant with file access and command execution

import { streamChat, ChatMessage, isOllamaRunning } from './ollama-client';
import { executeCommand, getAgentStatus, checkAgentStatus } from './local-backend-agent';
import { readFile, writeFile, listFiles, getCurrentDirectory, fileExists } from './file-system';
import { logAction, recordHabit, getHabitSuggestions, createBackup, getActionLogs } from './openclaw-store';
import { getIDESettings } from './ide-store';

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
  lastActivity: number;
  totalActions: number;
  config: OpenClawConfig;
}

// Default config
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
  lastActivity: Date.now(),
  totalActions: 0,
  config: { ...defaultConfig },
};

let listeners: ((state: OpenClawState) => void)[] = [];
let murmurInterval: ReturnType<typeof setInterval> | null = null;
let murmurCallback: ((message: string) => void) | null = null;

// State management
export function getOpenClawState(): OpenClawState {
  return { ...state };
}

export function onStateChange(listener: (state: OpenClawState) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function notifyListeners() {
  listeners.forEach(l => l({ ...state }));
}

// Initialize OpenClaw
export async function initOpenClaw(config?: Partial<OpenClawConfig>): Promise<boolean> {
  try {
    // Merge config
    state.config = { ...defaultConfig, ...config };
    
    // Check Ollama
    const ollamaReady = await isOllamaRunning();
    if (!ollamaReady) {
      console.warn('OpenClaw: Ollama not running, will use fallback responses');
    }
    
    // Check local agent
    await checkAgentStatus();
    
    // Get sandboxed path from current directory
    const currentDir = getCurrentDirectory();
    if (currentDir) {
      state.config.sandboxedPath = currentDir.name;
    }
    
    state.isActive = true;
    state.lastActivity = Date.now();
    notifyListeners();
    
    await logAction({
      timestamp: Date.now(),
      type: 'command',
      action: 'OpenClaw initialized',
      details: `Model: ${state.config.model}, Sandbox: ${state.config.sandboxedPath || 'none'}`,
      success: true,
    });
    
    // Start murmur updates if enabled
    if (state.config.murmurUpdates) {
      startMurmurUpdates();
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize OpenClaw:', error);
    return false;
  }
}

// Shutdown OpenClaw
export function shutdownOpenClaw(): void {
  state.isActive = false;
  if (murmurInterval) {
    clearInterval(murmurInterval);
    murmurInterval = null;
  }
  notifyListeners();
  
  logAction({
    timestamp: Date.now(),
    type: 'command',
    action: 'OpenClaw shutdown',
    success: true,
  });
}

// Set murmur callback
export function setMurmurCallback(callback: (message: string) => void): void {
  murmurCallback = callback;
}

// Start periodic murmur updates
function startMurmurUpdates(): void {
  if (murmurInterval) return;
  
  const murmurs = [
    "Watching for changes...",
    "All systems nominal.",
    "Ready when you are.",
    "Files synced.",
    "Standing by.",
    "Habits tracked.",
    "Monitoring active.",
  ];
  
  murmurInterval = setInterval(() => {
    if (state.isActive && murmurCallback && !state.isProcessing) {
      const msg = murmurs[Math.floor(Math.random() * murmurs.length)];
      murmurCallback(msg);
    }
  }, 60000); // Every minute
}

// Chat with OpenClaw
export async function* chatWithOpenClaw(
  message: string,
  history: ChatMessage[] = []
): AsyncGenerator<string, void, unknown> {
  if (!state.isActive) {
    yield "OpenClaw is not active. Initialize first.";
    return;
  }
  
  state.isProcessing = true;
  state.lastActivity = Date.now();
  notifyListeners();
  
  const startTime = Date.now();
  
  // Record as habit if it looks like a command
  if (state.config.learningEnabled && message.startsWith('/') || message.toLowerCase().startsWith('run ')) {
    await recordHabit(message);
  }
  
  // Build context-aware system prompt
  const systemPrompt = buildSystemPrompt();
  
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];
  
  let fullResponse = '';
  
  try {
    for await (const chunk of streamChat(messages, { model: state.config.model })) {
      fullResponse += chunk;
      yield chunk;
    }
    
    state.totalActions++;
    
    await logAction({
      timestamp: Date.now(),
      type: 'chat',
      action: `Chat: "${message.slice(0, 50)}..."`,
      details: `Response length: ${fullResponse.length}`,
      success: true,
      duration: Date.now() - startTime,
    });
    
    // Parse and execute any commands in the response
    await parseAndExecuteCommands(fullResponse);
    
  } catch (error) {
    await logAction({
      timestamp: Date.now(),
      type: 'chat',
      action: `Chat failed: "${message.slice(0, 50)}..."`,
      details: String(error),
      success: false,
      duration: Date.now() - startTime,
    });
    yield `\n\nError: ${error}`;
  } finally {
    state.isProcessing = false;
    state.lastActivity = Date.now();
    notifyListeners();
  }
}

// Build system prompt with context
function buildSystemPrompt(): string {
  const settings = getIDESettings();
  const currentDir = getCurrentDirectory();
  
  return `You are OpenClaw, a sandboxed AI assistant running locally via Ollama (${state.config.model}).

## Capabilities
- Read, edit, and create files ONLY in the mounted project folder: ${currentDir?.name || 'none'}
- Execute terminal commands (sandboxed to project folder)
- Debug code and suggest fixes
- Learn from user patterns and auto-suggest common tasks
- Auto-backup files before modifications

## Constraints
- You can ONLY access files in the mounted project folder
- You cannot access the internet or external systems
- All actions are logged for transparency
- Destructive operations require confirmation

## Response Format
- For file operations, use code blocks with the file path as the language:
  \`\`\`path/to/file.ts
  // file content
  \`\`\`
- For commands, use shell code blocks:
  \`\`\`shell
  npm install package-name
  \`\`\`
- Be concise but helpful
- Explain what you're doing and why

## Current Context
- Project: ${currentDir?.name || 'No project mounted'}
- Mode: ${settings.mode}
- Auto-backup: ${state.config.autoBackup ? 'Enabled' : 'Disabled'}
- Actions logged: ${state.totalActions}

Keep responses focused and actionable. If you need to modify files, always show the changes clearly.`;
}

// Parse response for executable commands
async function parseAndExecuteCommands(response: string): Promise<void> {
  // Match shell code blocks
  const shellBlocks = response.matchAll(/```(?:shell|bash|sh)\n([\s\S]*?)```/g);
  
  for (const match of shellBlocks) {
    const command = match[1].trim();
    if (command && !command.includes('rm -rf') && !command.includes('del /')) {
      // Log but don't auto-execute dangerous commands
      await logAction({
        timestamp: Date.now(),
        type: 'command',
        action: `Suggested command: ${command}`,
        success: true,
      });
    }
  }
  
  // Match file write blocks
  const fileBlocks = response.matchAll(/```(\S+\.(?:ts|tsx|js|jsx|json|css|html|md))\n([\s\S]*?)```/g);
  
  for (const match of fileBlocks) {
    const filePath = match[1];
    const content = match[2];
    
    await logAction({
      timestamp: Date.now(),
      type: 'file-write',
      action: `Suggested file write: ${filePath}`,
      details: `${content.length} bytes`,
      success: true,
    });
  }
}

// Execute a command with logging
export async function executeWithLogging(command: string): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  
  // Check if command is allowed
  if (!isCommandAllowed(command)) {
    await logAction({
      timestamp: Date.now(),
      type: 'command',
      action: `Blocked command: ${command}`,
      details: 'Command not allowed in sandbox',
      success: false,
    });
    return { success: false, output: 'Command not allowed in sandbox mode' };
  }
  
  // Record as habit
  if (state.config.learningEnabled) {
    await recordHabit(command);
  }
  
  const result = await executeCommand(command);
  
  state.totalActions++;
  
  await logAction({
    timestamp: Date.now(),
    type: 'command',
    action: command,
    details: result.output.slice(0, 500),
    success: result.success,
    duration: Date.now() - startTime,
  });
  
  return { success: result.success, output: result.output + (result.error || '') };
}

// Check if command is allowed
function isCommandAllowed(command: string): boolean {
  const blocked = [
    'rm -rf /',
    'rm -rf ~',
    'del /s /q c:',
    'format',
    'mkfs',
    'dd if=',
    ':(){:|:&};:',
    'chmod -R 777 /',
    'chown -R',
  ];
  
  const lowerCmd = command.toLowerCase();
  return !blocked.some(b => lowerCmd.includes(b));
}

// Read file with logging and backup
export async function readFileWithLogging(filePath: string): Promise<string> {
  const startTime = Date.now();
  
  try {
    const content = await readFile(filePath);
    
    await logAction({
      timestamp: Date.now(),
      type: 'file-read',
      action: `Read: ${filePath}`,
      details: `${content.length} bytes`,
      success: true,
      duration: Date.now() - startTime,
    });
    
    return content;
  } catch (error) {
    await logAction({
      timestamp: Date.now(),
      type: 'file-read',
      action: `Read failed: ${filePath}`,
      details: String(error),
      success: false,
      duration: Date.now() - startTime,
    });
    throw error;
  }
}

// Write file with logging and backup
export async function writeFileWithLogging(
  filePath: string,
  content: string,
  reason = 'Manual edit'
): Promise<void> {
  const startTime = Date.now();
  
  // Auto-backup if enabled
  if (state.config.autoBackup) {
    try {
      const exists = await fileExists(filePath);
      if (exists) {
        const existingContent = await readFile(filePath);
        await createBackup(filePath, existingContent, reason);
      }
    } catch {
      // File doesn't exist, no backup needed
    }
  }
  
  try {
    await writeFile(filePath, content);
    
    state.totalActions++;
    
    await logAction({
      timestamp: Date.now(),
      type: 'file-write',
      action: `Write: ${filePath}`,
      details: `${content.length} bytes - ${reason}`,
      success: true,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    await logAction({
      timestamp: Date.now(),
      type: 'file-write',
      action: `Write failed: ${filePath}`,
      details: String(error),
      success: false,
      duration: Date.now() - startTime,
    });
    throw error;
  }
}

// Get suggestions based on habits
export async function getSuggestions(prefix: string): Promise<string[]> {
  if (!state.config.learningEnabled) return [];
  
  const habits = await getHabitSuggestions(prefix);
  return habits.map(h => h.pattern);
}

// Get recent action logs
export async function getRecentLogs(limit = 50): Promise<ReturnType<typeof getActionLogs>> {
  return getActionLogs(limit);
}

// Update config
export function updateConfig(config: Partial<OpenClawConfig>): void {
  state.config = { ...state.config, ...config };
  notifyListeners();
  
  // Handle murmur toggle
  if (config.murmurUpdates !== undefined) {
    if (config.murmurUpdates && !murmurInterval) {
      startMurmurUpdates();
    } else if (!config.murmurUpdates && murmurInterval) {
      clearInterval(murmurInterval);
      murmurInterval = null;
    }
  }
}
