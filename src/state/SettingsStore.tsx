/**
 * Canonical Settings Store — façade unifying:
 *   - chat-api settings (loadSettings/saveSettings)
 *   - ide-store settings (getIDESettings/saveIDESettings)
 *   - config-store (providers/runtime/tools/assistants)
 *
 * New UI consumes only this store. Legacy helpers remain as backing storage
 * for the 19+ existing consumers — migration is incremental, not destructive.
 */
import React, { createContext, useContext, useSyncExternalStore } from 'react';
import {
  loadSettings as legacyLoadChat,
  saveSettings as legacySaveChat,
  type ChatSettings,
} from '@/lib/chat-api';
import {
  getIDESettings as legacyLoadIde,
  saveIDESettings as legacySaveIde,
} from '@/lib/ide-store';
import { IDESettings } from '@/lib/ide-types';
import {
  getConfig as legacyGetConfig,
  setConfig as legacySetConfig,
  type AppConfig,
} from '@/lib/config-store';

const EVENT = 'localdev-unified-settings-changed';

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  window.addEventListener('localdev-config-changed', cb);
  window.addEventListener('ide-settings-changed', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
    window.removeEventListener('localdev-config-changed', cb);
    window.removeEventListener('ide-settings-changed', cb);
  };
}

// ---------- Stable snapshot caches (required for useSyncExternalStore) ----------
let chatSnap: ChatSettings | null = null;
let ideSnap: IDESettings | null = null;
let cfgSnap: AppConfig | null = null;

function getChatSnapshot(): ChatSettings {
  const fresh = legacyLoadChat();
  if (!chatSnap || JSON.stringify(chatSnap) !== JSON.stringify(fresh)) {
    chatSnap = fresh;
  }
  return chatSnap;
}
function getIdeSnapshot(): IDESettings {
  const fresh = legacyLoadIde();
  if (!ideSnap || JSON.stringify(ideSnap) !== JSON.stringify(fresh)) {
    ideSnap = fresh;
  }
  return ideSnap;
}
function getCfgSnapshot(): AppConfig {
  const fresh = legacyGetConfig();
  if (!cfgSnap || JSON.stringify(cfgSnap) !== JSON.stringify(fresh)) {
    cfgSnap = fresh;
  }
  return cfgSnap;
}

// ---------- Public hooks ----------
export function useChatSettings(): ChatSettings {
  return useSyncExternalStore(subscribe, getChatSnapshot, getChatSnapshot);
}
export function useIdeSettings(): IDESettings {
  return useSyncExternalStore(subscribe, getIdeSnapshot, getIdeSnapshot);
}
export function useAppConfig(): AppConfig {
  return useSyncExternalStore(subscribe, getCfgSnapshot, getCfgSnapshot);
}

// ---------- Public mutators ----------
export function updateChat(patch: Partial<ChatSettings>) {
  const next = { ...legacyLoadChat(), ...patch };
  legacySaveChat(next);
  chatSnap = next;
  emit();
}
export function updateIde(patch: Partial<IDESettings>) {
  legacySaveIde(patch);
  ideSnap = legacyLoadIde();
  emit();
}
export function updateConfig(updater: Partial<AppConfig> | ((c: AppConfig) => AppConfig)) {
  legacySetConfig(updater as any);
  cfgSnap = legacyGetConfig();
  emit();
}

export function getSettingsSnapshot() {
  return {
    chat: getChatSnapshot(),
    ide: getIdeSnapshot(),
    config: getCfgSnapshot(),
  };
}

// ---------- Provider (no-op context, used as a marker for app-wide availability) ----------
const SettingsCtx = createContext<true>(true);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // One-time migration shim — preserves user data by ensuring legacy keys are read.
  // No destructive writes; just touches the snapshot caches.
  React.useEffect(() => {
    getChatSnapshot();
    getIdeSnapshot();
    getCfgSnapshot();
  }, []);
  return <SettingsCtx.Provider value={true}>{children}</SettingsCtx.Provider>;
}

export function useSettingsAvailable() {
  return useContext(SettingsCtx);
}
