/**
 * Error mapping — convert raw "Failed to fetch" / cryptic errors into
 * actionable, user-facing remediation messages.
 */

export type ErrorContext =
  | 'agent'
  | 'ollama'
  | 'gguf'
  | 'preview'
  | 'openscad'
  | 'model'
  | 'chat'
  | 'unknown';

export interface ExplainedError {
  title: string;
  hint: string;
  raw: string;
  action?: string;
}

function rawMsg(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export function explainError(e: unknown, ctx: ErrorContext = 'unknown'): ExplainedError {
  const raw = rawMsg(e);
  const lc = raw.toLowerCase();
  const isFetchFail = lc.includes('failed to fetch') || lc.includes('networkerror') || lc.includes('load failed') || lc.includes('econnrefused');

  if (ctx === 'agent' && isFetchFail) {
    return {
      title: 'Local agent offline',
      hint: 'The local agent on port 3847 is not responding. Start it with RUN-ALL.bat to enable filesystem, terminal, and preview features.',
      raw,
      action: 'Start RUN-ALL.bat',
    };
  }
  if (ctx === 'ollama' && isFetchFail) {
    return {
      title: 'Ollama offline',
      hint: 'Ollama (localhost:11434) is not responding. Start it via RUN-ALL.bat, or switch to GGUF / llama.cpp in Settings → Model Routing.',
      raw,
      action: 'Start RUN-ALL.bat or choose GGUF',
    };
  }
  if (ctx === 'gguf' && isFetchFail) {
    return {
      title: 'GGUF / llama.cpp offline',
      hint: 'The local llama.cpp server (localhost:8081) is not responding. Start START-GGUF-SERVER.bat or switch to Ollama in Settings → Model Routing.',
      raw,
      action: 'Start llama.cpp or choose Ollama',
    };
  }
  if (ctx === 'model' || lc.includes('no model') || lc.includes('no ollama model')) {
    return {
      title: 'No model selected',
      hint: 'No model is wired for this role. Open Settings → Model Routing and pick a detected local model.',
      raw,
      action: 'Open Model Routing',
    };
  }
  if (ctx === 'openscad') {
    // try to surface line number / stderr
    const lineMatch = raw.match(/line\s*(\d+)/i);
    return {
      title: 'OpenSCAD parser error',
      hint: lineMatch
        ? `OpenSCAD failed at line ${lineMatch[1]}. Check the SCAD editor for the highlighted error.`
        : 'OpenSCAD failed to compile the model. Check the SCAD source for syntax errors.',
      raw,
    };
  }
  if (ctx === 'preview') {
    return {
      title: 'Preview build error',
      hint: 'The live preview failed to build. Vite/runtime error shown below — fix the file or ask the AI to repair it.',
      raw,
    };
  }
  if (ctx === 'chat' && isFetchFail) {
    return {
      title: 'Chat backend unreachable',
      hint: 'The selected chat backend did not respond. Check that Ollama/llama.cpp is running, or pick a different model in Settings → Model Routing.',
      raw,
      action: 'Open Model Routing',
    };
  }
  if (isFetchFail) {
    return {
      title: 'Connection failed',
      hint: 'A network call failed. If this is a local service, make sure RUN-ALL.bat is running.',
      raw,
    };
  }
  return { title: 'Error', hint: raw || 'Unknown error.', raw };
}

export function explainAndFormat(e: unknown, ctx: ErrorContext = 'unknown'): string {
  const x = explainError(e, ctx);
  return `${x.title} — ${x.hint}${x.action ? `\n→ ${x.action}` : ''}`;
}
