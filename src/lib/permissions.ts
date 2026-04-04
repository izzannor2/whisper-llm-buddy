// Permissions & Safety System — audit log, safe mode, action confirmation

const AUDIT_KEY = 'localdev-audit-log';
const PERMISSIONS_KEY = 'localdev-permissions';

export type PermissionType = 'file_write' | 'file_delete' | 'command_exec' | 'system_access' | 'network_request';

export interface AuditEntry {
  id: string;
  action: string;
  permission: PermissionType;
  allowed: boolean;
  timestamp: number;
  details?: string;
  userConfirmed?: boolean;
}

export interface PermissionSettings {
  safeMode: boolean;
  autoConfirm: Record<PermissionType, boolean>;
}

const DEFAULT_PERMISSIONS: PermissionSettings = {
  safeMode: false,
  autoConfirm: {
    file_write: false,
    file_delete: false,
    command_exec: false,
    system_access: false,
    network_request: true,
  },
};

export function getPermissions(): PermissionSettings {
  try {
    const stored = localStorage.getItem(PERMISSIONS_KEY);
    return stored ? { ...DEFAULT_PERMISSIONS, ...JSON.parse(stored) } : DEFAULT_PERMISSIONS;
  } catch { return DEFAULT_PERMISSIONS; }
}

export function savePermissions(settings: PermissionSettings): void {
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(settings));
}

export function isSafeMode(): boolean {
  return getPermissions().safeMode;
}

export function toggleSafeMode(): boolean {
  const perms = getPermissions();
  perms.safeMode = !perms.safeMode;
  savePermissions(perms);
  return perms.safeMode;
}

export function checkPermission(permission: PermissionType): 'allowed' | 'blocked' | 'needs_confirmation' {
  const perms = getPermissions();
  if (perms.safeMode && (permission === 'file_write' || permission === 'file_delete' || permission === 'command_exec' || permission === 'system_access')) {
    return 'blocked';
  }
  if (perms.autoConfirm[permission]) return 'allowed';
  return 'needs_confirmation';
}

// Audit log
export function getAuditLog(limit = 100): AuditEntry[] {
  try {
    const entries: AuditEntry[] = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    return entries.slice(-limit);
  } catch { return []; }
}

export function logAuditEntry(action: string, permission: PermissionType, allowed: boolean, details?: string, userConfirmed?: boolean): void {
  try {
    const entries = getAuditLog(500);
    entries.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      permission,
      allowed,
      timestamp: Date.now(),
      details,
      userConfirmed,
    });
    // Keep last 500 entries
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(-500)));
  } catch { /* ignore storage errors */ }
}

export function clearAuditLog(): void {
  localStorage.removeItem(AUDIT_KEY);
}

export function getAuditStats() {
  const log = getAuditLog(1000);
  const total = log.length;
  const allowed = log.filter(e => e.allowed).length;
  const blocked = total - allowed;
  const byType: Record<string, number> = {};
  for (const entry of log) {
    byType[entry.permission] = (byType[entry.permission] || 0) + 1;
  }
  return { total, allowed, blocked, byType };
}
