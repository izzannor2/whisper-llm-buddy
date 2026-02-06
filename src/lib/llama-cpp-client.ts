// Llama.cpp Server Client for Local GGUF Model Inference

import { getIDESettings } from './ide-store';

export interface LlamaCppModel {
  id: string;
  object: string;
  owned_by: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  n_predict?: number;
  stop?: string[];
  stream?: boolean;
}

export async function getLlamaCppUrl(): Promise<string> {
  const settings = getIDESettings();
  return settings.llamaCppUrl || 'http://127.0.0.1:8081';
}

export async function isLlamaCppRunning(): Promise<boolean> {
  try {
    const url = await getLlamaCppUrl();
    const response = await fetch(`${url}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getLlamaCppServerInfo(): Promise<{
  model: string;
  ctx_size: number;
  n_threads: number;
} | null> {
  try {
    const url = await getLlamaCppUrl();
    const response = await fetch(`${url}/props`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function listLlamaCppModels(): Promise<LlamaCppModel[]> {
  try {
    const url = await getLlamaCppUrl();
    const response = await fetch(`${url}/v1/models`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function* streamChat(
  messages: ChatMessage[],
  options?: GenerateOptions
): AsyncGenerator<string, void, unknown> {
  const settings = getIDESettings();
  const url = await getLlamaCppUrl();

  // Add system prompt based on mode
  const systemPrompt = getSystemPromptForMode(settings.mode);
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  // Apply jailbreak if enabled
  if (settings.jailbreakEnabled && settings.jailbreakPrompt) {
    fullMessages[0] = {
      role: 'system',
      content: settings.jailbreakPrompt,
    };
  }

  try {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: fullMessages,
        stream: true,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p ?? 0.9,
        top_k: options?.top_k ?? 40,
        max_tokens: options?.n_predict ?? 2048,
        stop: options?.stop,
      }),
    });

    if (!response.ok) throw new Error('Failed to start chat');
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(Boolean);

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    console.error('Llama.cpp chat stream error:', error);
    throw error;
  }
}

export async function chat(
  messages: ChatMessage[],
  options?: GenerateOptions
): Promise<string> {
  let result = '';
  for await (const chunk of streamChat(messages, options)) {
    result += chunk;
  }
  return result;
}

// Simple completion endpoint (non-chat)
export async function complete(
  prompt: string,
  options?: GenerateOptions
): Promise<string> {
  const url = await getLlamaCppUrl();
  
  try {
    const response = await fetch(`${url}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p ?? 0.9,
        top_k: options?.top_k ?? 40,
        n_predict: options?.n_predict ?? 2048,
        stop: options?.stop,
        stream: false,
      }),
    });

    if (!response.ok) throw new Error('Completion failed');
    const data = await response.json();
    return data.content || '';
  } catch (error) {
    console.error('Llama.cpp completion error:', error);
    throw error;
  }
}

function getSystemPromptForMode(mode: string): string {
  switch (mode) {
    case 'app-builder':
      return `You are an expert full-stack developer assistant. You help users build web applications, dashboards, and landing pages. 
When asked to create or modify code, provide complete, working code with modern best practices.
Use React with TypeScript, Tailwind CSS, and Vite by default unless specified otherwise.
Always explain your code briefly and suggest next steps.`;
    
    case 'embedded-iot':
      return `You are an expert embedded systems developer. You help users write code for ESP32, Arduino, Raspberry Pi, and other microcontrollers.
Provide complete, working C/C++ or MicroPython code with proper pin configurations and library includes.
Consider power efficiency, memory constraints, and real-time requirements.
Always include comments explaining hardware connections and setup.`;
    
    case 'system-helper':
      return `You are a helpful system administrator assistant. You help users with computer tasks like file management, system maintenance, and automation.
IMPORTANT: Always provide commands as a preview first. Never execute dangerous commands without explicit confirmation.
Explain what each command does and any potential risks.
For destructive operations, always ask for confirmation.`;
    
    case 'ai-improvement':
      return `You are a meta-AI that can suggest improvements to this development environment.
Analyze the current capabilities and propose UI tweaks, new features, or code refactors.
Present changes as diffs or proposals that the user can accept or reject.
Focus on developer experience, performance, and usability.`;
    
    case 'learning':
      return `You are a learning assistant that adapts to the user's coding style.
Observe patterns in their code, preferred frameworks, naming conventions, and folder structures.
Suggest applying their usual patterns to new projects.
Remember and reference their preferences in future suggestions.`;
    
    case 'sandbox':
      return `You are operating in SANDBOX MODE. This is an isolated environment for experiments.
You can be more experimental and try unconventional approaches.
All actions are contained and won't affect the main system.
Feel free to explore creative solutions.`;
    
    default:
      return `You are a helpful AI coding assistant. Provide clear, concise, and working code.`;
  }
}

// Generate startup command for llama-server
export function generateLlamaServerCommand(
  modelPath: string,
  options?: {
    port?: number;
    contextSize?: number;
    threads?: number;
    gpuLayers?: number;
  }
): string {
  const port = options?.port ?? 8081;
  const ctxSize = options?.contextSize ?? 4096;
  const threads = options?.threads ?? 4;
  const gpuLayers = options?.gpuLayers ?? 0;

  return `llama-server -m "${modelPath}" --port ${port} -c ${ctxSize} -t ${threads} -ngl ${gpuLayers} --host 0.0.0.0`;
}

// Generate batch file content for starting llama-server
export function generateLlamaServerBat(
  modelPath: string,
  options?: {
    port?: number;
    contextSize?: number;
    threads?: number;
    gpuLayers?: number;
  }
): string {
  const command = generateLlamaServerCommand(modelPath, options);
  
  return `@echo off
echo Starting llama-server...
echo Model: ${modelPath}
echo.

REM Check if llama-server is in PATH
where llama-server >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: llama-server not found in PATH
    echo Please install llama.cpp and add llama-server to your PATH
    echo Download from: https://github.com/ggerganov/llama.cpp
    pause
    exit /b 1
)

echo Starting server on port ${options?.port ?? 8081}...
${command}

pause`;
}
