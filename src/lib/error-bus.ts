/**
 * Central error bus.
 * Anything that breaks (preview, agent, model call, update apply, launcher
 * check) calls emitError(...). Subscribers fan-out to: sonner toast, an
 * in-memory ring buffer (last 200) and window.__errorBus for diagnostics.
 *
 * No fake data. We only buffer real events.
 */
import { toast } from 'sonner';

export type ErrorSource =
  | 'agent'
  | 'preview'
  | 'model'
  | 'update'
  | 'launcher'
  | 'registry'
  | 'voice'
  | 'unknown';

export interface BusEvent {
  id: string;
  source: ErrorSource;
  message: string;
  detail?: unknown;
  level: 'info' | 'warn' | 'error';
  timestamp: number;
}

const MAX = 200;
const buffer: BusEvent[] = [];
const subs = new Set<(e: BusEvent) => void>();

function nextId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emitError(opts: {
  source: ErrorSource;
  message: string;
  detail?: unknown;
  level?: BusEvent['level'];
  silent?: boolean; // skip toast
}): BusEvent {
  const ev: BusEvent = {
    id: nextId(),
    source: opts.source,
    message: opts.message,
    detail: opts.detail,
    level: opts.level || 'error',
    timestamp: Date.now(),
  };
  buffer.push(ev);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);

  if (!opts.silent) {
    const fn = ev.level === 'error' ? toast.error : ev.level === 'warn' ? toast.warning : toast.info;
    fn(`[${ev.source}] ${ev.message}`, { duration: ev.level === 'error' ? 6000 : 4000 });
  }

  subs.forEach(s => { try { s(ev); } catch { /* ignore */ } });
  if (typeof window !== 'undefined') {
    (window as any).__errorBus = { buffer: getBuffer, emit: emitError };
  }
  return ev;
}

export function getBuffer(): BusEvent[] {
  return buffer.slice();
}

export function clearBuffer(): void {
  buffer.length = 0;
}

export function subscribe(cb: (e: BusEvent) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
