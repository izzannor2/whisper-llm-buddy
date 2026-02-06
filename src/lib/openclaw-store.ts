// OpenClaw IndexedDB store for action logs, habits, and backups

const DB_NAME = 'openclaw-db';
const DB_VERSION = 1;

export interface ActionLog {
  id: string;
  timestamp: number;
  type: 'command' | 'file-read' | 'file-write' | 'file-delete' | 'chat' | 'backup';
  action: string;
  details?: string;
  success: boolean;
  duration?: number;
}

export interface HabitPattern {
  id: string;
  pattern: string;
  frequency: number;
  lastUsed: number;
  autoComplete?: boolean;
}

export interface FileBackup {
  id: string;
  filePath: string;
  content: string;
  timestamp: number;
  reason: string;
}

let db: IDBDatabase | null = null;

export async function initOpenClawDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Action logs store
      if (!database.objectStoreNames.contains('action-logs')) {
        const logStore = database.createObjectStore('action-logs', { keyPath: 'id' });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
        logStore.createIndex('type', 'type', { unique: false });
      }

      // Habit patterns store
      if (!database.objectStoreNames.contains('habits')) {
        const habitStore = database.createObjectStore('habits', { keyPath: 'id' });
        habitStore.createIndex('pattern', 'pattern', { unique: true });
        habitStore.createIndex('frequency', 'frequency', { unique: false });
      }

      // File backups store
      if (!database.objectStoreNames.contains('backups')) {
        const backupStore = database.createObjectStore('backups', { keyPath: 'id' });
        backupStore.createIndex('filePath', 'filePath', { unique: false });
        backupStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Action Logging
export async function logAction(log: Omit<ActionLog, 'id'>): Promise<void> {
  const database = await initOpenClawDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('action-logs', 'readwrite');
    const store = tx.objectStore('action-logs');
    store.add({ ...log, id });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getActionLogs(limit = 100): Promise<ActionLog[]> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('action-logs', 'readonly');
    const store = tx.objectStore('action-logs');
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const logs: ActionLog[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && logs.length < limit) {
        logs.push(cursor.value);
        cursor.continue();
      } else {
        resolve(logs);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearActionLogs(): Promise<void> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('action-logs', 'readwrite');
    const store = tx.objectStore('action-logs');
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Habit Learning
export async function recordHabit(pattern: string): Promise<void> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    const index = store.index('pattern');
    const getRequest = index.get(pattern);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as HabitPattern | undefined;
      if (existing) {
        existing.frequency += 1;
        existing.lastUsed = Date.now();
        store.put(existing);
      } else {
        store.add({
          id: `habit-${Date.now()}`,
          pattern,
          frequency: 1,
          lastUsed: Date.now(),
          autoComplete: false,
        });
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHabitSuggestions(prefix: string, limit = 5): Promise<HabitPattern[]> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('habits', 'readonly');
    const store = tx.objectStore('habits');
    const request = store.getAll();

    request.onsuccess = () => {
      const habits = request.result as HabitPattern[];
      const filtered = habits
        .filter(h => h.pattern.toLowerCase().startsWith(prefix.toLowerCase()))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, limit);
      resolve(filtered);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getFrequentHabits(threshold = 3): Promise<HabitPattern[]> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('habits', 'readonly');
    const store = tx.objectStore('habits');
    const request = store.getAll();

    request.onsuccess = () => {
      const habits = request.result as HabitPattern[];
      const frequent = habits
        .filter(h => h.frequency >= threshold)
        .sort((a, b) => b.frequency - a.frequency);
      resolve(frequent);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function setAutoComplete(patternId: string, enabled: boolean): Promise<void> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    const getRequest = store.get(patternId);

    getRequest.onsuccess = () => {
      const habit = getRequest.result as HabitPattern;
      if (habit) {
        habit.autoComplete = enabled;
        store.put(habit);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// File Backups
export async function createBackup(filePath: string, content: string, reason: string): Promise<void> {
  const database = await initOpenClawDB();
  const id = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('backups', 'readwrite');
    const store = tx.objectStore('backups');
    store.add({
      id,
      filePath,
      content,
      timestamp: Date.now(),
      reason,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBackups(filePath?: string, limit = 50): Promise<FileBackup[]> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('backups', 'readonly');
    const store = tx.objectStore('backups');
    const request = store.getAll();

    request.onsuccess = () => {
      let backups = request.result as FileBackup[];
      if (filePath) {
        backups = backups.filter(b => b.filePath === filePath);
      }
      backups = backups
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
      resolve(backups);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function restoreBackup(backupId: string): Promise<FileBackup | null> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('backups', 'readonly');
    const store = tx.objectStore('backups');
    const request = store.get(backupId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Clean old backups (keep last 100 per file)
export async function cleanOldBackups(maxPerFile = 100): Promise<number> {
  const database = await initOpenClawDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction('backups', 'readwrite');
    const store = tx.objectStore('backups');
    const request = store.getAll();
    let deleted = 0;

    request.onsuccess = () => {
      const backups = request.result as FileBackup[];
      const byFile = new Map<string, FileBackup[]>();

      backups.forEach(b => {
        const list = byFile.get(b.filePath) || [];
        list.push(b);
        byFile.set(b.filePath, list);
      });

      byFile.forEach(list => {
        list.sort((a, b) => b.timestamp - a.timestamp);
        list.slice(maxPerFile).forEach(b => {
          store.delete(b.id);
          deleted++;
        });
      });
    };

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
  });
}
