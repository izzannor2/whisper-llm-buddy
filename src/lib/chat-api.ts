// Chat API abstraction supporting cloud, local, and custom API providers

// Retry helper with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  timeoutMs = 15000
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      // Don't retry on 4xx client errors (except 429)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }
      // Retry on 429 and 5xx
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status === 429 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      return response; // Return last response for proper error handling downstream
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (lastError.name === 'AbortError') {
        lastError = new Error('Request timed out');
      }
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastError || new Error('Request failed after retries');
}

export interface APIKeys {
  openai: string;
  anthropic: string;
  google: string;
  huggingface: string;
  blackbox: string;
}

export interface ChatSettings {
  backend: 'cloud' | 'local' | 'ollama' | 'openai' | 'anthropic' | 'google' | 'huggingface' | 'blackbox';
  localUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
  model: string;
  huggingfaceModel: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
  autoPlayTTS: boolean;
  ttsVoice: string;
  ttsRate: number;
  voiceConversation: boolean;
  apiKeys: APIKeys;
  // Hardware settings
  useWebGPU: boolean;
  offlineMode: boolean;
  // OpenClaw settings
  openClawEnabled: boolean;
  openClawModel: string;
  openClawAutoBackup: boolean;
  openClawLearning: boolean;
  openClawMurmur: boolean;
}

export type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MultimodalContentPart[];
}

/** Extract plain text from a ChatMessage content (string or multimodal array) */
export function getTextContent(content: string | MultimodalContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
}

export const DEFAULT_API_KEYS: APIKeys = {
  openai: '',
  anthropic: '',
  google: '',
  huggingface: '',
  blackbox: '',
};

export const DEFAULT_SETTINGS: ChatSettings = {
  backend: 'cloud', // Default to cloud since it's always available
  localUrl: 'http://127.0.0.1:8081',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: '', // Empty - will be populated when Ollama is scanned
  model: 'gemini-flash', // Default cloud model
  huggingfaceModel: '', // Empty - user must enter their own
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  systemPrompt: 'You are LocalDev AI, a helpful, harmless, and honest AI assistant. Be concise and clear in your responses.',
  autoPlayTTS: false,
  ttsVoice: '',
  ttsRate: 1.0,
  voiceConversation: false,
  apiKeys: DEFAULT_API_KEYS,
  useWebGPU: false,
  offlineMode: false,
  // OpenClaw defaults
  openClawEnabled: true,
  openClawModel: '', // Empty - will use first detected Ollama model
  openClawAutoBackup: true,
  openClawLearning: true,
  openClawMurmur: true,
};

// Only cloud models are always available - other backends show dynamically detected models
export const CLOUD_MODELS = [
  { id: 'gemini-flash', name: 'Gemini 2.5 Flash', backend: 'cloud' },
  { id: 'gemini-pro', name: 'Gemini 2.5 Pro', backend: 'cloud' },
];

// Last verified: April 2026
export const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', backend: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', backend: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', backend: 'openai' },
];

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', backend: 'anthropic' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', backend: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', backend: 'anthropic' },
];

export const GOOGLE_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', backend: 'google' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', backend: 'google' },
];

export const BLACKBOX_MODELS = [
  { id: 'blackbox-ai', name: 'Blackbox AI', backend: 'blackbox' },
  { id: 'blackbox-ai-pro', name: 'Blackbox AI Pro', backend: 'blackbox' },
];

/** Fetch available models from Blackbox API dynamically. Falls back to BLACKBOX_MODELS on failure. */
export async function fetchBlackboxModels(apiKey: string): Promise<Array<{ id: string; name: string; backend: string }>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.blackbox.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const models = data.data?.map((m: any) => ({ id: m.id, name: m.id, backend: 'blackbox' })) || [];
      return models.length > 0 ? models : BLACKBOX_MODELS;
    }
    return BLACKBOX_MODELS;
  } catch {
    return BLACKBOX_MODELS;
  }
}

// Legacy export for backwards compatibility - will be removed
export const AVAILABLE_MODELS = [...CLOUD_MODELS];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface ChatResult {
  response: string;
  usedFallback: boolean;
  fallbackReason?: string;
}

/**
 * Append the user's "Advanced Prompt Override" custom system prompt to a
 * base system prompt. Reads from IDE settings (legacy keys preserved).
 * Does NOT bypass model/provider safety rules.
 */
export function applyPromptOverride(basePrompt: string): { prompt: string; applied: boolean } {
  try {
    const raw = localStorage.getItem('ide-settings');
    if (!raw) return { prompt: basePrompt, applied: false };
    const ide = JSON.parse(raw);
    if (!ide?.jailbreakEnabled || !ide?.jailbreakPrompt) return { prompt: basePrompt, applied: false };
    const extra = String(ide.jailbreakPrompt).trim();
    if (!extra) return { prompt: basePrompt, applied: false };
    return {
      prompt: basePrompt
        ? `${basePrompt}\n\n--- User Custom Override ---\n${extra}`
        : extra,
      applied: true,
    };
  } catch {
    return { prompt: basePrompt, applied: false };
  }
}

export interface ChatCallMeta {
  /** Logical role / surface making the call (e.g. 'assistant', 'ide', 'app-builder', 'voice', 'improvement'). */
  role?: string;
}

export interface ModelCallRecord {
  timestamp: number;
  role: string;
  backend: string;
  model: string;
  responseMs: number;
  ok: boolean;
  fallback: boolean;
  fallbackReason?: string;
  overrideApplied: boolean;
  error?: string;
}

const MODEL_CALL_BUFFER: ModelCallRecord[] = [];
const MODEL_CALL_BUFFER_MAX = 50;

export function getModelCallLog(): ModelCallRecord[] {
  return MODEL_CALL_BUFFER.slice();
}
export function clearModelCallLog(): void {
  MODEL_CALL_BUFFER.length = 0;
}
function pushModelCall(rec: ModelCallRecord) {
  MODEL_CALL_BUFFER.push(rec);
  if (MODEL_CALL_BUFFER.length > MODEL_CALL_BUFFER_MAX) MODEL_CALL_BUFFER.shift();
  try { window.dispatchEvent(new CustomEvent('model-call-logged', { detail: rec })); } catch {}
}

function backendModelLabel(s: ChatSettings): string {
  switch (s.backend) {
    case 'ollama': return s.ollamaModel || '(no model)';
    case 'local': return 'llama.cpp';
    case 'huggingface': return s.huggingfaceModel || '(no model)';
    default: return s.model || '(no model)';
  }
}

export async function sendChatMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void,
  meta?: ChatCallMeta,
): Promise<string> {
  // If offline mode is enabled, only allow local backends
  if (settings.offlineMode && !['local', 'ollama'].includes(settings.backend)) {
    throw new Error('Offline mode is enabled. Only local (Llama.cpp) and Ollama backends are available.');
  }

  // Apply Advanced Prompt Override consistently across every surface.
  const { prompt: effectivePrompt, applied: overrideApplied } = applyPromptOverride(settings.systemPrompt || '');
  const allMessages = effectivePrompt
    ? [{ role: 'system' as const, content: effectivePrompt }, ...messages]
    : messages;

  const role = meta?.role || 'unknown';
  const startedAt = Date.now();
  let fallback = false;
  let fallbackReason: string | undefined;
  let usedBackend = settings.backend;
  let usedModel = backendModelLabel(settings);

  try {
    const response = await dispatchToBackend(allMessages, settings, onChunk);
    pushModelCall({
      timestamp: startedAt, role, backend: usedBackend, model: usedModel,
      responseMs: Date.now() - startedAt, ok: true, fallback: false, overrideApplied,
    });
    return response;
  } catch (err) {
    // Model fallback: if primary fails and it's not cloud, retry with cloud
    if (settings.backend !== 'cloud' && SUPABASE_URL && SUPABASE_KEY) {
      console.warn(`[Fallback] ${settings.backend} failed, switching to cloud:`, err);
      try {
        const { toast } = await import('sonner');
        toast.warning('Primary model failed, switching to cloud backup');
      } catch {}
      const fallbackSettings = { ...settings, backend: 'cloud' as const, model: 'gemini-flash' };
      fallback = true;
      fallbackReason = err instanceof Error ? err.message : String(err);
      usedBackend = 'cloud';
      usedModel = 'gemini-flash';
      try {
        const out = await sendCloudMessage(allMessages, fallbackSettings, onChunk);
        pushModelCall({
          timestamp: startedAt, role, backend: usedBackend, model: usedModel,
          responseMs: Date.now() - startedAt, ok: true, fallback, fallbackReason, overrideApplied,
        });
        return out;
      } catch (e2) {
        pushModelCall({
          timestamp: startedAt, role, backend: usedBackend, model: usedModel,
          responseMs: Date.now() - startedAt, ok: false, fallback, fallbackReason, overrideApplied,
          error: e2 instanceof Error ? e2.message : String(e2),
        });
        throw e2;
      }
    }
    pushModelCall({
      timestamp: startedAt, role, backend: usedBackend, model: usedModel,
      responseMs: Date.now() - startedAt, ok: false, fallback: false, overrideApplied,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function dispatchToBackend(
  allMessages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  switch (settings.backend) {
    case 'local':
      return sendLocalMessage(allMessages, settings, onChunk);
    case 'ollama':
      return sendOllamaMessage(allMessages, settings, onChunk);
    case 'openai':
      return sendOpenAIMessage(allMessages, settings, onChunk);
    case 'anthropic':
      return sendAnthropicMessage(allMessages, settings, onChunk);
    case 'google':
      return sendGoogleMessage(allMessages, settings, onChunk);
    case 'huggingface':
      return sendHuggingFaceMessage(allMessages, settings, onChunk);
    case 'blackbox':
      return sendBlackboxMessage(allMessages, settings, onChunk);
    case 'cloud':
    default:
      return sendCloudMessage(allMessages, settings, onChunk);
  }
}

async function sendLocalMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const response = await fetchWithRetry(`${settings.localUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    throw new Error(`Local API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return streamResponse(response, onChunk);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Ollama API
async function sendOllamaMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  if (!settings.ollamaModel) {
    throw new Error('No Ollama model selected. Open Settings → Model Routing and pick a detected model.');
  }
  const response = await fetchWithRetry(`${settings.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.ollamaModel,
      messages,
      options: {
        temperature: settings.temperature,
        top_p: settings.topP,
        num_predict: settings.maxTokens,
      },
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return streamOllamaResponse(response, onChunk);
  }

  const data = await response.json();
  return data.message?.content || '';
}

async function streamOllamaResponse(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const content = parsed.message?.content;
        if (content) {
          fullContent += content;
          onChunk(content);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return fullContent;
}

async function sendCloudMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Cloud backend not configured. Please enable Lovable Cloud.');
  }

  const response = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      messages,
      model: settings.model,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Cloud API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  if (onChunk && response.body) {
    return streamResponse(response, onChunk);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// OpenAI API (direct client-side call with user's key)
async function sendOpenAIMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = settings.apiKeys.openai;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Add your key in Settings → API Keys.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return streamResponse(response, onChunk);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Anthropic API with streaming support
async function sendAnthropicMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = settings.apiKeys.anthropic;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Add your key in Settings → API Keys.');
  }

  const systemMessage = messages.find(m => m.role === 'system')?.content;
  const chatMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: settings.maxTokens,
      stream: !!onChunk,
      system: systemMessage,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Anthropic API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return streamAnthropicResponse(response, onChunk);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function streamAnthropicResponse(response: Response, onChunk: (chunk: string) => void): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullContent += parsed.delta.text;
            onChunk(parsed.delta.text);
          }
        } catch {
          console.warn('[Anthropic SSE] Malformed line:', line);
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch {}
  }
  return fullContent;
}

// Google AI API with streaming support
async function sendGoogleMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = settings.apiKeys.google;
  if (!apiKey) {
    throw new Error('Google AI API key not configured. Add your key in Settings → API Keys.');
  }

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : getTextContent(m.content) }],
    }));

  const systemInstruction = messages.find(m => m.role === 'system')?.content;

  const endpoint = onChunk ? 'streamGenerateContent' : 'generateContent';
  const streamParam = onChunk ? '&alt=sse' : '';
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:${endpoint}?key=${apiKey}${streamParam}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: typeof systemInstruction === 'string' ? systemInstruction : '' }] } : undefined,
        generationConfig: {
          temperature: settings.temperature,
          topP: settings.topP,
          maxOutputTokens: settings.maxTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Google AI API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) { fullContent += text; onChunk(text); }
          } catch { /* partial JSON */ }
        }
      }
    } finally {
      try { reader.cancel(); } catch {}
    }
    return fullContent;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Hugging Face API (direct client-side call with user's key)
async function sendHuggingFaceMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = settings.apiKeys.huggingface;
  if (!apiKey) {
    throw new Error('Hugging Face API key not configured. Add your key in Settings → API Keys.');
  }

  const model = settings.huggingfaceModel || 'mistralai/Mistral-7B-Instruct-v0.2';

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Hugging Face API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return streamResponse(response, onChunk);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Blackbox AI API (OpenAI-compatible)
async function sendBlackboxMessage(
  messages: ChatMessage[],
  settings: ChatSettings,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = settings.apiKeys.blackbox;
  if (!apiKey) {
    throw new Error('Blackbox API key not configured. Add your key in Settings → API Keys.');
  }

  const response = await fetch('https://api.blackbox.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || 'blackbox-ai',
      messages,
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Blackbox API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return streamResponse(response, onChunk);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function streamResponse(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }

  return fullContent;
}

/** Validate and clamp settings to safe values */
export function validateSettings(settings: Partial<ChatSettings>): ChatSettings {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  
  // Clamp numeric values
  merged.temperature = Math.max(0, Math.min(2, Number(merged.temperature) || DEFAULT_SETTINGS.temperature));
  merged.topP = Math.max(0, Math.min(1, Number(merged.topP) || DEFAULT_SETTINGS.topP));
  merged.maxTokens = Math.max(1, Math.min(32000, Math.floor(Number(merged.maxTokens) || DEFAULT_SETTINGS.maxTokens)));
  merged.ttsRate = Math.max(0.5, Math.min(2, Number(merged.ttsRate) || DEFAULT_SETTINGS.ttsRate));
  
  // Ensure correct types
  if (typeof merged.backend !== 'string') merged.backend = DEFAULT_SETTINGS.backend;
  if (typeof merged.systemPrompt !== 'string') merged.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
  if (typeof merged.apiKeys !== 'object' || !merged.apiKeys) merged.apiKeys = DEFAULT_API_KEYS;
  
  return merged;
}

export function loadSettings(): ChatSettings {
  try {
    // Try new key first, fall back to legacy key
    const saved = localStorage.getItem('localdev-settings') || localStorage.getItem('arachat-settings');
    if (saved) {
      return validateSettings(JSON.parse(saved));
    }
  } catch {
    // Ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: ChatSettings): void {
  localStorage.setItem('localdev-settings', JSON.stringify(settings));
}
