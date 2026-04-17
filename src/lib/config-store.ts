// Central typed config store. localStorage-persisted with window event bus.
import { useSyncExternalStore } from 'react';

export type PreviewMode = 'auto' | 'local-only' | 'runtime-only';

export interface ProviderConfig {
  localAgent: { enabled: boolean; url: string; model: string };
  llama: { enabled: boolean; url: string; model: string };
  ollama: { enabled: boolean; url: string; model: string };
  remote: { enabled: boolean; baseUrl: string; apiKey: string; model: string };
  active: 'localAgent' | 'llama' | 'ollama' | 'remote';
}

export interface RuntimeConfig {
  enablePreviewRuntime: boolean;
  useLocalDevAgent: boolean;
  useDevServer: boolean;
  forceLocalPreview: boolean;
  previewMode: PreviewMode;
}

export interface ToolConfig {
  fileEditor: boolean;
  terminal: boolean;
  previewControl: boolean;
  apiCaller: boolean;
  voiceInput: boolean;
  camera: boolean;
}

export interface AssistantPermissions {
  editFiles: boolean;
  runPreview: boolean;
  callAgent: boolean;
  useTools: boolean;
  accessApis: boolean;
}

export interface AssistantConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  permissions: AssistantPermissions;
}

export interface AppConfig {
  providers: ProviderConfig;
  runtime: RuntimeConfig;
  tools: ToolConfig;
  assistants: AssistantConfig[];
  activeAssistantId: string | null;
}

const STORAGE_KEY = 'localdev-app-config-v1';
const EVENT = 'localdev-config-changed';

const DEFAULTS: AppConfig = {
  providers: {
    localAgent: { enabled: false, url: 'http://localhost:3847', model: '' },
    llama: { enabled: false, url: 'http://127.0.0.1:8081', model: '' },
    ollama: { enabled: true, url: 'http://localhost:11434', model: '' },
    remote: { enabled: false, baseUrl: '', apiKey: '', model: '' },
    active: 'ollama',
  },
  runtime: {
    enablePreviewRuntime: true,
    useLocalDevAgent: false,
    useDevServer: false,
    forceLocalPreview: true,
    previewMode: 'auto',
  },
  tools: {
    fileEditor: true,
    terminal: true,
    previewControl: true,
    apiCaller: false,
    voiceInput: false,
    camera: false,
  },
  assistants: [
    {
      id: 'default',
      name: 'Default Assistant',
      description: 'General coding assistant',
      systemPrompt: 'You are a helpful coding assistant.',
      model: '',
      permissions: { editFiles: true, runPreview: true, callAgent: false, useTools: true, accessApis: false },
    },
  ],
  activeAssistantId: 'default',
};

let cache: AppConfig | null = null;

function load(): AppConfig {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cache = { ...DEFAULTS, ...parsed,
        providers: { ...DEFAULTS.providers, ...(parsed.providers || {}) },
        runtime: { ...DEFAULTS.runtime, ...(parsed.runtime || {}) },
        tools: { ...DEFAULTS.tools, ...(parsed.tools || {}) },
      };
      return cache!;
    }
  } catch {}
  cache = DEFAULTS;
  return cache;
}

export function getConfig(): AppConfig {
  return load();
}

export function setConfig(updater: Partial<AppConfig> | ((c: AppConfig) => AppConfig)): void {
  const current = load();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  cache = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function updateProviders(patch: Partial<ProviderConfig>) {
  setConfig(c => ({ ...c, providers: { ...c.providers, ...patch } }));
}
export function updateRuntime(patch: Partial<RuntimeConfig>) {
  setConfig(c => ({ ...c, runtime: { ...c.runtime, ...patch } }));
}
export function updateTools(patch: Partial<ToolConfig>) {
  setConfig(c => ({ ...c, tools: { ...c.tools, ...patch } }));
}
export function upsertAssistant(a: AssistantConfig) {
  setConfig(c => {
    const idx = c.assistants.findIndex(x => x.id === a.id);
    const next = [...c.assistants];
    if (idx >= 0) next[idx] = a; else next.push(a);
    return { ...c, assistants: next };
  });
}
export function deleteAssistant(id: string) {
  setConfig(c => ({
    ...c,
    assistants: c.assistants.filter(a => a.id !== id),
    activeAssistantId: c.activeAssistantId === id ? null : c.activeAssistantId,
  }));
}
export function setActiveAssistant(id: string | null) {
  setConfig(c => ({ ...c, activeAssistantId: id }));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useConfig(): AppConfig {
  return useSyncExternalStore(subscribe, getConfig, getConfig);
}
