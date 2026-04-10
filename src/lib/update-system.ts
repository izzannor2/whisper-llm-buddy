/**
 * Update / Patch System
 * Client-side versioning, patch application, rollback, backup,
 * and local update management via IndexedDB.
 */

export const APP_VERSION_KEY = 'localdev-app-version';
export const UPDATE_HISTORY_KEY = 'localdev-update-history';
export const BACKUP_KEY = 'localdev-update-backup';
export const DEFAULT_VERSION = '1.0.0';

const IDB_NAME = 'localdev-updates';
const IDB_STORE = 'local-updates';
const IDB_VERSION = 1;

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

export interface AppVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface UpdateManifest {
  version: string;
  description: string;
  releaseDate: string;
  patches: PatchEntry[];
}

export interface PatchEntry {
  file: string;
  action: 'update' | 'create' | 'delete';
  content?: string;
}

export interface AppliedUpdate {
  version: string;
  description: string;
  appliedAt: number;
  patchCount: number;
  source?: 'online' | 'local' | 'manual';
}

export interface UpdateBackup {
  version: string;
  settings: string;
  timestamp: number;
}

export interface LocalUpdate {
  version: string;
  changes: string[];
  timestamp: string;
  patches?: PatchEntry[];
}

/* ------------------------------------------------------------------ */
/*  Deep merge utility                                                 */
/* ------------------------------------------------------------------ */

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result as T;
}

/* ------------------------------------------------------------------ */
/*  Version helpers                                                     */
/* ------------------------------------------------------------------ */

export function parseVersion(v: string): AppVersion {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return { major: parts[0] || 1, minor: parts[1] || 0, patch: parts[2] || 0 };
}

export function formatVersion(v: AppVersion): string {
  return `v${v.major}.${v.minor}.${v.patch}`;
}

export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

/* ------------------------------------------------------------------ */
/*  Current version                                                    */
/* ------------------------------------------------------------------ */

export function getCurrentVersion(): string {
  return localStorage.getItem(APP_VERSION_KEY) || DEFAULT_VERSION;
}

export function setCurrentVersion(version: string): void {
  localStorage.setItem(APP_VERSION_KEY, version);
}

/* ------------------------------------------------------------------ */
/*  Update history                                                     */
/* ------------------------------------------------------------------ */

export function getUpdateHistory(): AppliedUpdate[] {
  try {
    return JSON.parse(localStorage.getItem(UPDATE_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function addToHistory(update: AppliedUpdate): void {
  const history = getUpdateHistory();
  history.unshift(update);
  localStorage.setItem(UPDATE_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

/* ------------------------------------------------------------------ */
/*  Backup / Rollback                                                  */
/* ------------------------------------------------------------------ */

export function createBackup(): UpdateBackup {
  const backup: UpdateBackup = {
    version: getCurrentVersion(),
    settings: localStorage.getItem('localdev-settings') || '{}',
    timestamp: Date.now(),
  };
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  return backup;
}

export function getBackup(): UpdateBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function rollback(): { success: boolean; restoredVersion: string } {
  const backup = getBackup();
  if (!backup) return { success: false, restoredVersion: '' };

  try {
    localStorage.setItem('localdev-settings', backup.settings);
  } catch { /* ignore */ }

  setCurrentVersion(backup.version);

  addToHistory({
    version: backup.version,
    description: `Rolled back to ${backup.version}`,
    appliedAt: Date.now(),
    patchCount: 0,
    source: 'manual',
  });

  return { success: true, restoredVersion: backup.version };
}

/* ------------------------------------------------------------------ */
/*  Check for updates (online)                                         */
/* ------------------------------------------------------------------ */

export async function checkForUpdates(manifestUrl: string): Promise<{
  available: boolean;
  manifest?: UpdateManifest;
  error?: string;
}> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(manifestUrl, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(tid);

    if (!res.ok) return { available: false, error: `Server returned ${res.status}` };

    let manifest: UpdateManifest;
    try {
      manifest = await res.json();
    } catch {
      return { available: false, error: 'Invalid manifest JSON' };
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      return { available: false, error: 'Manifest missing valid version field' };
    }
    if (!Array.isArray(manifest.patches)) {
      return { available: false, error: 'Manifest missing patches array' };
    }

    const current = getCurrentVersion();
    const isNewer = compareVersions(manifest.version, current) > 0;

    return { available: isNewer, manifest };
  } catch (err: any) {
    if (err.name === 'AbortError') return { available: false, error: 'Connection timed out' };
    return { available: false, error: err.message || 'Failed to check for updates' };
  }
}

/* ------------------------------------------------------------------ */
/*  Apply update                                                       */
/* ------------------------------------------------------------------ */

export function applyUpdate(manifest: UpdateManifest, source: 'online' | 'local' = 'online'): {
  success: boolean;
  appliedPatches: number;
  error?: string;
} {
  try {
    createBackup();

    let appliedPatches = 0;

    for (const patch of manifest.patches) {
      try {
        if (!patch.file || !patch.action) continue;
        if (patch.action === 'update' || patch.action === 'create') {
          if (patch.file === 'settings' && patch.content) {
            try {
              const currentSettings = JSON.parse(localStorage.getItem('localdev-settings') || '{}');
              const patchData = JSON.parse(patch.content);
              const merged = deepMerge(currentSettings, patchData);
              localStorage.setItem('localdev-settings', JSON.stringify(merged));
              appliedPatches++;
            } catch { /* skip malformed patch */ }
          } else if (patch.file.startsWith('config/') && patch.content) {
            localStorage.setItem(`localdev-patch-${patch.file}`, patch.content);
            appliedPatches++;
          }
        } else if (patch.action === 'delete') {
          localStorage.removeItem(`localdev-patch-${patch.file}`);
          appliedPatches++;
        }
      } catch {
        console.warn(`Skipping failed patch for ${patch.file}`);
      }
    }

    setCurrentVersion(manifest.version);

    addToHistory({
      version: manifest.version,
      description: manifest.description,
      appliedAt: Date.now(),
      patchCount: appliedPatches,
      source,
    });

    return { success: true, appliedPatches };
  } catch (err: any) {
    return { success: false, appliedPatches: 0, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Manual version bump                                                */
/* ------------------------------------------------------------------ */

export function bumpVersion(type: 'major' | 'minor' | 'patch'): string {
  const current = parseVersion(getCurrentVersion());
  if (type === 'major') { current.major++; current.minor = 0; current.patch = 0; }
  else if (type === 'minor') { current.minor++; current.patch = 0; }
  else { current.patch++; }

  const newVersion = formatVersion(current);
  createBackup();
  setCurrentVersion(newVersion);
  addToHistory({
    version: newVersion,
    description: `Manual ${type} bump`,
    appliedAt: Date.now(),
    patchCount: 0,
    source: 'manual',
  });
  return newVersion;
}

/* ================================================================== */
/*  LOCAL UPDATE SYSTEM (IndexedDB)                                    */
/* ================================================================== */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'version' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalUpdates(): Promise<LocalUpdate[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const updates = (req.result as LocalUpdate[]).sort(
          (a, b) => compareVersions(b.version, a.version)
        );
        resolve(updates);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('Failed to read local updates from IndexedDB:', err);
    return [];
  }
}

export async function saveLocalUpdate(update: LocalUpdate): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(update);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function removeLocalUpdate(version: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.delete(version);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Fetch bundled updates from public/updates/manifest.json */
export async function scanBundledUpdates(): Promise<LocalUpdate[]> {
  try {
    const res = await fetch('/updates/manifest.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const updates: LocalUpdate[] = Array.isArray(data.updates) ? data.updates : [];
    // Persist bundled updates into IndexedDB (won't overwrite user-imported ones with same version)
    for (const u of updates) {
      if (u.version && u.timestamp) {
        await saveLocalUpdate(u);
      }
    }
    return updates;
  } catch {
    return [];
  }
}

/** Validate and import a user-selected .json file */
export async function importLocalUpdateFile(file: File): Promise<{ success: boolean; update?: LocalUpdate; error?: string }> {
  try {
    const text = await file.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: 'Invalid JSON file' };
    }

    if (!data.version || typeof data.version !== 'string') {
      return { success: false, error: 'Missing "version" field' };
    }
    if (!data.timestamp || typeof data.timestamp !== 'string') {
      return { success: false, error: 'Missing "timestamp" field (YYYY-MM-DD)' };
    }

    const update: LocalUpdate = {
      version: data.version,
      changes: Array.isArray(data.changes) ? data.changes : [],
      timestamp: data.timestamp,
      patches: Array.isArray(data.patches) ? data.patches : undefined,
    };

    await saveLocalUpdate(update);
    return { success: true, update };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to import file' };
  }
}

/** Convert a LocalUpdate to an UpdateManifest and apply it */
export function applyLocalUpdate(update: LocalUpdate): {
  success: boolean;
  appliedPatches: number;
  error?: string;
} {
  const manifest: UpdateManifest = {
    version: update.version,
    description: update.changes.join('; ') || `Local update ${update.version}`,
    releaseDate: update.timestamp,
    patches: update.patches || [],
  };
  return applyUpdate(manifest, 'local');
}
