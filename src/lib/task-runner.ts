// Task Runner — queue-based task execution with progress tracking

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  name: string;
  type: string;
  status: TaskStatus;
  progress: number; // 0-100
  payload: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

type TaskHandler = (
  task: Task,
  onProgress: (pct: number) => void
) => Promise<unknown>;

const taskQueue: Task[] = [];
const taskHandlers = new Map<string, TaskHandler>();
let isProcessing = false;
let listeners: Array<() => void> = [];

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function notify() {
  listeners.forEach(fn => fn());
}

// ===== Built-in task handlers =====

taskHandlers.set('code_generation', async (task, onProgress) => {
  onProgress(10);
  // Simulate code generation (actual implementation connects to agent)
  await new Promise(r => setTimeout(r, 500));
  onProgress(50);
  await new Promise(r => setTimeout(r, 500));
  onProgress(100);
  return { generated: true, description: task.payload.description };
});

taskHandlers.set('file_processing', async (task, onProgress) => {
  const files = (task.payload.files as string[]) || [];
  for (let i = 0; i < files.length; i++) {
    onProgress(Math.round(((i + 1) / files.length) * 100));
    await new Promise(r => setTimeout(r, 200));
  }
  return { processedFiles: files.length };
});

taskHandlers.set('batch_operation', async (task, onProgress) => {
  const items = (task.payload.items as unknown[]) || [];
  const results: unknown[] = [];
  for (let i = 0; i < items.length; i++) {
    onProgress(Math.round(((i + 1) / items.length) * 100));
    results.push(items[i]);
    await new Promise(r => setTimeout(r, 100));
  }
  return { results, total: items.length };
});

// ===== Public API =====

export function addTask(name: string, type: string, payload: Record<string, unknown> = {}): Task {
  const task: Task = {
    id: genId(),
    name,
    type,
    status: 'queued',
    progress: 0,
    payload,
    createdAt: Date.now(),
  };
  taskQueue.push(task);
  notify();
  processQueue();
  return task;
}

export function cancelTask(id: string): void {
  const task = taskQueue.find(t => t.id === id);
  if (task && (task.status === 'queued' || task.status === 'running')) {
    task.status = 'cancelled';
    task.completedAt = Date.now();
    notify();
  }
}

export function removeTask(id: string): void {
  const idx = taskQueue.findIndex(t => t.id === id);
  if (idx !== -1) {
    taskQueue.splice(idx, 1);
    notify();
  }
}

export function getTasks(): Task[] {
  return [...taskQueue];
}

export function getActiveTasks(): Task[] {
  return taskQueue.filter(t => t.status === 'queued' || t.status === 'running');
}

export function clearCompleted(): void {
  const active = taskQueue.filter(t => t.status === 'queued' || t.status === 'running');
  taskQueue.length = 0;
  taskQueue.push(...active);
  notify();
}

export function registerTaskHandler(type: string, handler: TaskHandler): void {
  taskHandlers.set(type, handler);
}

export function subscribeToTasks(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

// Process queue sequentially
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (true) {
    const next = taskQueue.find(t => t.status === 'queued');
    if (!next) break;

    next.status = 'running';
    next.startedAt = Date.now();
    notify();

    const handler = taskHandlers.get(next.type);
    if (!handler) {
      next.status = 'failed';
      next.error = `No handler for task type: ${next.type}`;
      next.completedAt = Date.now();
      notify();
      continue;
    }

    try {
      const result = await handler(next, (pct) => {
        if ((next.status as TaskStatus) === 'cancelled') return;
        next.progress = pct;
        notify();
      });

      if ((next.status as TaskStatus) !== 'cancelled') {
        next.status = 'completed';
        next.progress = 100;
        next.result = result;
        next.completedAt = Date.now();
      }
    } catch (e) {
      if ((next.status as TaskStatus) !== 'cancelled') {
        next.status = 'failed';
        next.error = e instanceof Error ? e.message : String(e);
        next.completedAt = Date.now();
      }
    }
    notify();
  }

  isProcessing = false;
}
