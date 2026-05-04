// Mode-aware model recommendations based on hardware capability score (0-100).
import { IDEMode } from '@/lib/ide-types';

export type Backend = 'ollama' | 'llama-cpp' | 'cloud';

export interface Recommendation {
  backend: Backend;
  model: string;
  reason: string;
}

function getCapabilityScore(): number {
  try {
    const raw = localStorage.getItem('localdev-capability-score');
    if (raw) return Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
  } catch {}
  return 50;
}

const CLOUD_DEFAULT: Record<IDEMode, string> = {
  'app-builder': 'google/gemini-2.5-pro',
  'ide-coding': 'google/gemini-3-flash-preview',
  'ai-improvement': 'google/gemini-2.5-pro',
  'embedded-iot': 'google/gemini-2.5-flash',
  '3d-printing': 'google/gemini-2.5-flash',
  'system-helper': 'google/gemini-2.5-flash-lite',
  'sandbox': 'google/gemini-3-flash-preview',
  'plugin': 'google/gemini-2.5-flash',
  'jailbreak': 'google/gemini-2.5-pro',
  'learning': 'google/gemini-2.5-flash',
};

export function recommendModel(mode: IDEMode): Recommendation {
  const score = getCapabilityScore();
  if (score >= 70) {
    return { backend: 'ollama', model: 'qwen2.5-coder:14b', reason: 'High-capability hardware: run a strong local coder model.' };
  }
  if (score >= 40) {
    return { backend: 'ollama', model: 'qwen2.5-coder:7b', reason: 'Mid-range hardware: balanced local model.' };
  }
  return { backend: 'cloud', model: CLOUD_DEFAULT[mode], reason: 'Low-capability hardware: use cloud for best speed.' };
}
