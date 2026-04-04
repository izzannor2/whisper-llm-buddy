// Export / Import System — export all app data as JSON, import and merge

import { getAllConversations, saveConversation, Conversation } from './db';
import { loadSettings, saveSettings, ChatSettings } from './chat-api';
import { getToolStats, clearToolStats } from './tool-learning';
import { getAuditLog, clearAuditLog } from './permissions';

interface ExportData {
  version: 2;
  exportedAt: string;
  app: 'LocalDevAI';
  conversations: Conversation[];
  settings: ChatSettings;
  toolStats: ReturnType<typeof getToolStats>;
  auditLog: ReturnType<typeof getAuditLog>;
  memories: unknown[];
  feedback: unknown[];
}

export async function exportAllData(): Promise<string> {
  const conversations = await getAllConversations();
  const settings = loadSettings();
  const toolStats = getToolStats();
  const auditLog = getAuditLog(1000);

  // Get local memories
  let memories: unknown[] = [];
  try {
    memories = JSON.parse(localStorage.getItem('localdev-memories') || '[]');
  } catch { /* ignore */ }

  // Get feedback
  let feedback: unknown[] = [];
  try {
    feedback = JSON.parse(localStorage.getItem('localdev-feedback') || '[]');
  } catch { /* ignore */ }

  const data: ExportData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'LocalDevAI',
    conversations,
    settings,
    toolStats,
    auditLog,
    memories,
    feedback,
  };

  return JSON.stringify(data, null, 2);
}

export function downloadExport(jsonData: string, filename?: string): void {
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `localdev-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(jsonString: string, merge = true): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  try {
    const data = JSON.parse(jsonString) as ExportData;

    if (data.app !== 'LocalDevAI') {
      throw new Error('Invalid export file — not a LocalDev AI export');
    }

    // Import conversations
    if (data.conversations?.length) {
      for (const conv of data.conversations) {
        try {
          await saveConversation(conv);
          imported++;
        } catch (err) {
          errors.push(`Failed to import conversation "${conv.title}": ${err}`);
        }
      }
    }

    // Import settings (overwrite)
    if (data.settings && !merge) {
      saveSettings(data.settings);
    }

    // Import memories
    if (data.memories?.length) {
      try {
        const existing = JSON.parse(localStorage.getItem('localdev-memories') || '[]');
        const merged = merge ? [...data.memories, ...existing] : data.memories;
        // Deduplicate by id
        const seen = new Set();
        const deduped = merged.filter((m: any) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        localStorage.setItem('localdev-memories', JSON.stringify(deduped.slice(0, 500)));
      } catch (err) {
        errors.push(`Failed to import memories: ${err}`);
      }
    }

    // Import feedback
    if (data.feedback?.length) {
      try {
        const existing = JSON.parse(localStorage.getItem('localdev-feedback') || '[]');
        const merged = merge ? [...data.feedback, ...existing] : data.feedback;
        localStorage.setItem('localdev-feedback', JSON.stringify(merged.slice(0, 1000)));
      } catch (err) {
        errors.push(`Failed to import feedback: ${err}`);
      }
    }

  } catch (err) {
    errors.push(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { imported, errors };
}

export async function handleExport(): Promise<void> {
  const data = await exportAllData();
  downloadExport(data);
}

export async function handleImportFromFile(): Promise<{ imported: number; errors: string[] }> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve({ imported: 0, errors: ['No file selected'] }); return; }
      try {
        const text = await file.text();
        const result = await importData(text, true);
        resolve(result);
      } catch (err) {
        resolve({ imported: 0, errors: [String(err)] });
      }
    };
    input.click();
  });
}
