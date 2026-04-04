// Central Orchestrator — persistent task system with IndexedDB storage

export type OrchestratorTaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface OrchestratorStep {
  id: string;
  description: string;
  status: OrchestratorTaskStatus;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface OrchestratorTask {
  id: string;
  goal: string;
  status: OrchestratorTaskStatus;
  steps: OrchestratorStep[];
  logs: string[];
  parentId?: string;
  retryCount: number;
  maxRetries: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

const DB_NAME = 'OrchestratorDB';
const DB_VERSION = 1;
const STORE_NAME = 'tasks';

let db: IDBDatabase | null = null;
let listeners: Array<() => void> = [];
let memoryTasks: OrchestratorTask[] = [];

function notify() { listeners.forEach(fn => fn()); }

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('parentId', 'parentId');
      }
    };
  });
}

function genId(): string {
  return `orch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===== Persistence =====

async function persistTask(task: OrchestratorTask): Promise<void> {
  try {
    const database = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(task);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback: keep in memory only
  }
}

async function loadAllTasks(): Promise<OrchestratorTask[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function deleteTaskFromDB(id: string): Promise<void> {
  try {
    const database = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

// ===== Public API =====

export async function initOrchestrator(): Promise<void> {
  const stored = await loadAllTasks();
  memoryTasks = stored.sort((a, b) => b.createdAt - a.createdAt);
  // Resume any tasks that were running when app closed
  for (const task of memoryTasks) {
    if (task.status === 'running') {
      task.status = 'queued'; // Re-queue interrupted tasks
      task.logs.push(`[${new Date().toISOString()}] Task resumed after restart`);
      await persistTask(task);
    }
  }
  notify();
}

export function subscribeOrchestrator(listener: () => void): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

export function getOrchestratorTasks(): OrchestratorTask[] {
  return [...memoryTasks];
}

export function getTaskById(id: string): OrchestratorTask | undefined {
  return memoryTasks.find(t => t.id === id);
}

export function getSubtasks(parentId: string): OrchestratorTask[] {
  return memoryTasks.filter(t => t.parentId === parentId);
}

export async function createTask(
  goal: string,
  steps: string[] = [],
  parentId?: string,
  metadata?: Record<string, unknown>
): Promise<OrchestratorTask> {
  const task: OrchestratorTask = {
    id: genId(),
    goal,
    status: 'queued',
    steps: steps.map((desc, i) => ({
      id: `step-${i}`,
      description: desc,
      status: 'queued',
    })),
    logs: [`[${new Date().toISOString()}] Task created: ${goal}`],
    parentId,
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    metadata,
  };
  memoryTasks.unshift(task);
  await persistTask(task);
  notify();
  return task;
}

export async function updateTaskStatus(id: string, status: OrchestratorTaskStatus, error?: string): Promise<void> {
  const task = memoryTasks.find(t => t.id === id);
  if (!task) return;
  task.status = status;
  if (error) task.error = error;
  if (status === 'running' && !task.startedAt) task.startedAt = Date.now();
  if (status === 'completed' || status === 'failed' || status === 'cancelled') task.completedAt = Date.now();
  task.logs.push(`[${new Date().toISOString()}] Status → ${status}${error ? `: ${error}` : ''}`);
  await persistTask(task);
  notify();
}

export async function addTaskLog(id: string, message: string): Promise<void> {
  const task = memoryTasks.find(t => t.id === id);
  if (!task) return;
  task.logs.push(`[${new Date().toISOString()}] ${message}`);
  if (task.logs.length > 200) task.logs = task.logs.slice(-200);
  await persistTask(task);
  notify();
}

export async function updateStepStatus(taskId: string, stepId: string, status: OrchestratorTaskStatus, result?: string): Promise<void> {
  const task = memoryTasks.find(t => t.id === taskId);
  if (!task) return;
  const step = task.steps.find(s => s.id === stepId);
  if (!step) return;
  step.status = status;
  if (result) step.result = result;
  if (status === 'running') step.startedAt = Date.now();
  if (status === 'completed' || status === 'failed') step.completedAt = Date.now();
  if (status === 'failed') step.error = result;
  await persistTask(task);
  notify();
}

export async function pauseTask(id: string): Promise<void> {
  await updateTaskStatus(id, 'paused');
}

export async function resumeTask(id: string): Promise<void> {
  const task = memoryTasks.find(t => t.id === id);
  if (task && task.status === 'paused') {
    await updateTaskStatus(id, 'queued');
  }
}

export async function retryTask(id: string): Promise<boolean> {
  const task = memoryTasks.find(t => t.id === id);
  if (!task || task.retryCount >= task.maxRetries) return false;
  task.retryCount++;
  task.error = undefined;
  task.status = 'queued';
  task.logs.push(`[${new Date().toISOString()}] Retry ${task.retryCount}/${task.maxRetries}`);
  // Reset failed steps
  for (const step of task.steps) {
    if (step.status === 'failed') {
      step.status = 'queued';
      step.error = undefined;
    }
  }
  await persistTask(task);
  notify();
  return true;
}

export async function removeOrchestratorTask(id: string): Promise<void> {
  memoryTasks = memoryTasks.filter(t => t.id !== id);
  await deleteTaskFromDB(id);
  notify();
}

export async function clearCompletedTasks(): Promise<void> {
  const completed = memoryTasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');
  for (const t of completed) {
    await deleteTaskFromDB(t.id);
  }
  memoryTasks = memoryTasks.filter(t => t.status === 'queued' || t.status === 'running' || t.status === 'paused');
  notify();
}

// Execute a task with a handler function
export async function executeTask(
  id: string,
  handler: (task: OrchestratorTask, log: (msg: string) => void, updateStep: (stepId: string, status: OrchestratorTaskStatus, result?: string) => void) => Promise<unknown>
): Promise<void> {
  const task = memoryTasks.find(t => t.id === id);
  if (!task) return;

  await updateTaskStatus(id, 'running');

  try {
    const result = await handler(
      task,
      (msg) => addTaskLog(id, msg),
      (stepId, status, result) => updateStepStatus(id, stepId, status, result)
    );
    task.result = result;
    await updateTaskStatus(id, 'completed');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateTaskStatus(id, 'failed', errorMsg);
    
    // Auto-retry
    if (task.retryCount < task.maxRetries) {
      const delay = Math.pow(2, task.retryCount) * 1000;
      task.logs.push(`[${new Date().toISOString()}] Auto-retry in ${delay / 1000}s...`);
      await persistTask(task);
      notify();
      await new Promise(r => setTimeout(r, delay));
      const retried = await retryTask(id);
      if (retried) {
        await executeTask(id, handler);
      }
    }
  }
}

// Get stats
export function getOrchestratorStats() {
  const total = memoryTasks.length;
  const completed = memoryTasks.filter(t => t.status === 'completed').length;
  const failed = memoryTasks.filter(t => t.status === 'failed').length;
  const running = memoryTasks.filter(t => t.status === 'running').length;
  const queued = memoryTasks.filter(t => t.status === 'queued').length;
  return { total, completed, failed, running, queued, successRate: total > 0 ? (completed / total * 100).toFixed(1) : '0' };
}
