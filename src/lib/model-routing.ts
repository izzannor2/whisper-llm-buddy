/**
 * Model Routing — per-role model selection.
 *
 * Each role (assistant chat, voice, IDE, app builder, etc.) can be wired to a
 * specific detected model. Falls back through: explicit role -> assistant
 * default -> first detected local -> null.
 */

import { getModelRegistry, getCachedRegistry, type ModelRegistrySnapshot, type DiscoveredModel } from './model-registry';

export type ModelRole =
  | 'assistant'
  | 'voice'
  | 'ide'
  | 'app-builder'
  | 'improvement'
  | 'vision'
  | 'embeddings';

export const MODEL_ROLES: { id: ModelRole; label: string; description: string }[] = [
  { id: 'assistant',   label: 'Assistant Chat',     description: 'Default chat workspace and general questions.' },
  { id: 'voice',       label: 'Voice Chat',         description: 'Voice Call mode and TTS-driven conversation.' },
  { id: 'ide',         label: 'Coding IDE',         description: 'Inline IDE chat, code completion and refactors.' },
  { id: 'app-builder', label: 'App Builder',        description: 'Auto-Build / scaffolding workflows.' },
  { id: 'improvement', label: 'AI Improvement',     description: 'Self-improvement and refactor suggestions.' },
  { id: 'vision',      label: 'Vision / Image',     description: 'Image analysis and multimodal prompts.' },
  { id: 'embeddings',  label: 'Embeddings / Memory',description: 'Semantic memory and search embeddings.' },
];

export interface RoutingEntry {
  provider: 'ollama' | 'gguf' | 'cloud' | 'auto';
  model: string; // e.g. "llama3.2:3b" or "models/gguf/Qwen-7B-Q4.gguf" or "google/gemini-2.5-flash"; "" = use default
}

export type ModelRouting = Record<ModelRole, RoutingEntry>;

const STORAGE_KEY = 'model-routing-v1';

function emptyRouting(): ModelRouting {
  const out = {} as ModelRouting;
  for (const r of MODEL_ROLES) out[r.id] = { provider: 'auto', model: '' };
  return out;
}

export function loadRouting(): ModelRouting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRouting();
    const parsed = JSON.parse(raw) as Partial<ModelRouting>;
    const merged = emptyRouting();
    for (const role of MODEL_ROLES) {
      const v = parsed[role.id];
      if (v && typeof v === 'object' && typeof v.model === 'string') {
        merged[role.id] = { provider: (v.provider as RoutingEntry['provider']) || 'auto', model: v.model };
      }
    }
    return merged;
  } catch {
    return emptyRouting();
  }
}

export function saveRouting(r: ModelRouting): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  try { window.dispatchEvent(new CustomEvent('routing-changed', { detail: r })); } catch {}
}

export function setRoleRouting(role: ModelRole, entry: RoutingEntry): void {
  const r = loadRouting();
  r[role] = entry;
  saveRouting(r);
}

export interface ResolvedModel {
  role: ModelRole;
  provider: RoutingEntry['provider'];
  model: string;
  detected: DiscoveredModel | null;   // null when fallback was needed and nothing matched
  fallbackReason?: 'unset' | 'missing' | 'ok';
}

function findInSnapshot(snap: ModelRegistrySnapshot, provider: string, modelName: string): DiscoveredModel | null {
  if (!modelName) return null;
  if (provider === 'ollama' || provider === 'auto') {
    const m = snap.ollama.find(o => o.name === modelName || o.id === modelName);
    if (m) return m;
  }
  if (provider === 'gguf' || provider === 'auto') {
    const m = snap.gguf.find(g => g.name === modelName || g.relPath === modelName || g.id === modelName);
    if (m) return m;
  }
  return null;
}

/**
 * Resolve a role to a concrete detected model. Synchronous on cached snapshot;
 * call `getModelRegistry()` first if you need fresh data.
 */
export function resolveModelSync(role: ModelRole, snap: ModelRegistrySnapshot | null): ResolvedModel {
  const routing = loadRouting();
  const entry = routing[role];
  const safeSnap = snap || getCachedRegistry();

  if (entry.model && safeSnap) {
    const found = findInSnapshot(safeSnap, entry.provider, entry.model);
    if (found) return { role, provider: entry.provider, model: entry.model, detected: found, fallbackReason: 'ok' };
  }

  // Fallback 1: assistant default if different role
  if (role !== 'assistant' && safeSnap) {
    const a = routing.assistant;
    if (a.model) {
      const found = findInSnapshot(safeSnap, a.provider, a.model);
      if (found) return { role, provider: a.provider, model: a.model, detected: found, fallbackReason: entry.model ? 'missing' : 'unset' };
    }
  }

  // Fallback 2: first detected local model
  if (safeSnap) {
    const first = safeSnap.ollama[0] || safeSnap.gguf[0];
    if (first) {
      return {
        role,
        provider: first.provider,
        model: first.name,
        detected: first,
        fallbackReason: entry.model ? 'missing' : 'unset',
      };
    }
  }

  return { role, provider: 'auto', model: '', detected: null, fallbackReason: entry.model ? 'missing' : 'unset' };
}

export async function resolveModel(role: ModelRole): Promise<ResolvedModel> {
  const snap = await getModelRegistry();
  return resolveModelSync(role, snap);
}
