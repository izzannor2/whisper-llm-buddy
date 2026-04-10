/**
 * Update / Patch System
 * Client-side versioning, patch application, rollback, and backup.
 */

export const APP_VERSION_KEY = 'localdev-app-version';
export const UPDATE_HISTORY_KEY = 'localdev-update-history';
export const BACKUP_KEY = 'localdev-update-backup';
export const DEFAULT_VERSION = '1.0.0';

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
  content?: string; // base64 or raw for settings/config patches
}

export interface AppliedUpdate {
  version: string;
  description: string;
  appliedAt: number;
  patchCount: number;
}

export interface UpdateBackup {
  version: string;
  settings: string; // JSON snapshot of settings
  timestamp: number;
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
  // Keep last 50 entries
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

  // Restore settings
  try {
    localStorage.setItem('localdev-settings', backup.settings);
  } catch { /* ignore */ }

  // Restore version
  setCurrentVersion(backup.version);

  // Log rollback in history
  addToHistory({
    version: backup.version,
    description: `Rolled back to ${backup.version}`,
    appliedAt: Date.now(),
    patchCount: 0,
  });

  return { success: true, restoredVersion: backup.version };
}

/* ------------------------------------------------------------------ */
/*  Check for updates                                                  */
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

    // Validate manifest structure
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

export function applyUpdate(manifest: UpdateManifest): {
  success: boolean;
  appliedPatches: number;
  error?: string;
} {
  try {
    // Create backup first
    createBackup();

    let appliedPatches = 0;

    for (const patch of manifest.patches) {
      try {
        if (!patch.file || !patch.action) continue; // skip invalid entries
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
        // Individual patch failed — continue with remaining patches
        console.warn(`Skipping failed patch for ${patch.file}`);
      }
    }

    // Update version
    setCurrentVersion(manifest.version);

    // Log to history
    addToHistory({
      version: manifest.version,
      description: manifest.description,
      appliedAt: Date.now(),
      patchCount: appliedPatches,
    });

    return { success: true, appliedPatches };
  } catch (err: any) {
    return { success: false, appliedPatches: 0, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Manual version bump (for local dev)                                */
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
  });
  return newVersion;
}
