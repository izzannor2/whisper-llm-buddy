/**
 * Hook returning whether ANY local model is detected (Ollama or GGUF).
 * Subscribes to the model-registry change events so UI gates update live.
 */
import { useEffect, useState } from 'react';
import {
  getModelRegistry,
  getCachedRegistry,
  subscribeRegistry,
  hasAnyLocalModel,
  type ModelRegistrySnapshot,
} from '@/lib/model-registry';

export interface ModelsAvailableState {
  loading: boolean;
  hasAny: boolean;
  snapshot: ModelRegistrySnapshot | null;
  refresh: () => Promise<void>;
}

export function useModelsAvailable(autoRefreshMs = 0): ModelsAvailableState {
  const initial = getCachedRegistry();
  const [snapshot, setSnapshot] = useState<ModelRegistrySnapshot | null>(initial);
  const [loading, setLoading] = useState(initial === null);

  const refresh = async () => {
    setLoading(true);
    try {
      const snap = await getModelRegistry(true);
      setSnapshot(snap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!initial) {
      getModelRegistry().then((s) => { if (active) { setSnapshot(s); setLoading(false); } });
    }
    const unsub = subscribeRegistry((s) => { if (active) setSnapshot(s); });
    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefreshMs > 0) {
      interval = setInterval(() => { getModelRegistry(true).catch(() => {}); }, autoRefreshMs);
    }
    return () => { active = false; unsub(); if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshMs]);

  return {
    loading,
    hasAny: hasAnyLocalModel(snapshot),
    snapshot,
    refresh,
  };
}
