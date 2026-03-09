// OpenClaw Bridge - Event system connecting OpenClaw agent to IDE/Chat

export interface OpenClawEvent {
  type: 'send-to-ide' | 'send-to-chat' | 'apply-code' | 'navigate' | 'edit-file' | 'run-command' | 'fix-errors';
  payload: Record<string, any>;
}

// Pending events queue for IDE — survives navigation/remounts
let pendingIDEEvents: OpenClawEvent[] = [];
let ideListenerActive = false;

// Dispatch an event from OpenClaw to the rest of the app
export function dispatchOpenClawEvent(event: OpenClawEvent): void {
  // Queue apply-code, send-to-ide, and edit-file events if IDE isn't listening
  if (!ideListenerActive && ['apply-code', 'send-to-ide', 'edit-file'].includes(event.type)) {
    console.log('[OpenClaw Bridge] Queuing event (IDE not ready):', event.type, event.payload.filePath || '');
    pendingIDEEvents.push(event);
  }
  window.dispatchEvent(new CustomEvent('openclaw-event', { detail: event }));
}

// Listen for OpenClaw events (general)
export function onOpenClawEvent(handler: (event: OpenClawEvent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenClawEvent>).detail);
  window.addEventListener('openclaw-event', listener);
  return () => window.removeEventListener('openclaw-event', listener);
}

// IDE-specific listener that drains the pending queue on subscribe
export function onOpenClawEventForIDE(handler: (event: OpenClawEvent) => void): () => void {
  ideListenerActive = true;
  
  // Drain any queued events
  const queued = [...pendingIDEEvents];
  pendingIDEEvents = [];
  if (queued.length > 0) {
    console.log('[OpenClaw Bridge] Draining', queued.length, 'queued events to IDE');
    // Use setTimeout to let the IDE finish its render cycle
    setTimeout(() => queued.forEach(handler), 100);
  }
  
  const listener = (e: Event) => handler((e as CustomEvent<OpenClawEvent>).detail);
  window.addEventListener('openclaw-event', listener);
  
  return () => {
    ideListenerActive = false;
    window.removeEventListener('openclaw-event', listener);
  };
}

// Send a message to the IDE chat panel
export function sendToIDE(message: string): void {
  dispatchOpenClawEvent({ type: 'send-to-ide', payload: { message } });
}

// Send a message to the main chat page
export function sendToChat(message: string): void {
  dispatchOpenClawEvent({ type: 'send-to-chat', payload: { message } });
}

// Apply code blocks to the IDE project
export function applyCodeToIDE(code: string, filePath: string): void {
  dispatchOpenClawEvent({ type: 'apply-code', payload: { code, filePath } });
}

// Navigate to a route
export function navigateTo(route: string): void {
  dispatchOpenClawEvent({ type: 'navigate', payload: { route } });
}

// Edit a specific file in the IDE
export function editFileInIDE(filePath: string, content: string): void {
  dispatchOpenClawEvent({ type: 'edit-file', payload: { filePath, content } });
}

// Ask OpenClaw to fix errors from the preview/terminal
export function requestFixErrors(errors: string[]): void {
  dispatchOpenClawEvent({ type: 'fix-errors', payload: { errors } });
}
