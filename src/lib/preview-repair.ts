// Lovable-style preview auto-repair loop.
// After App Builder generates files, if the live preview reports runtime/Vite
// errors, send the errors + current files back to the AI and patch up to 3 times.
// Keeps last-good preview HTML so the user never loses context.

import { ProjectFile } from './ide-types';
import { sendChatMessage as sendChat, loadSettings as loadChatSettings, type ChatSettings } from './chat-api';
import { parseCodeBlocks, applyCodeBlocks } from './code-parser';

const MAX_ATTEMPTS = 3;

export interface RepairResult {
  attempts: number;
  patchedFiles?: ProjectFile[];
  filesChanged: string[];
  finalError?: string;
  responseRaw?: string;
}

function flattenForPrompt(files: ProjectFile[], out: { path: string; content: string }[] = []): { path: string; content: string }[] {
  for (const f of files) {
    if (f.isDirectory && f.children) flattenForPrompt(f.children, out);
    else if (f.content) out.push({ path: f.path, content: f.content });
  }
  return out;
}

function buildRepairPrompt(files: ProjectFile[], errors: string[]): string {
  const flat = flattenForPrompt(files).slice(0, 25); // keep prompt bounded
  const errBlock = errors.slice(-10).map((e) => `- ${e}`).join('\n');
  const fileBlock = flat
    .map((f) => `\`\`\`tsx:${f.path}\n${f.content.slice(0, 6000)}\n\`\`\``)
    .join('\n\n');
  return [
    'The live preview failed with the runtime/build errors below.',
    'Repair ONLY the offending files. Output complete files using this exact format on the opening fence:',
    '```language:/full/path/to/file.ext',
    'Do not include diffs, placeholders, or partial files.',
    '',
    '### Errors',
    errBlock || '(no error text captured)',
    '',
    '### Current files',
    fileBlock,
  ].join('\n');
}

/**
 * Run a single repair attempt. Returns patched ProjectFile[] (whole tree) or
 * null if the model produced no code blocks.
 */
export async function attemptPreviewRepair(
  files: ProjectFile[],
  errors: string[],
  settings?: ChatSettings,
): Promise<RepairResult> {
  const cs = settings || loadChatSettings();
  const prompt = buildRepairPrompt(files, errors);
  let response = '';
  try {
    response = await sendChat(
      [{ role: 'user', content: prompt }],
      { ...cs, systemPrompt: 'You are an expert React/TypeScript repair agent. Output only complete corrected files using the language:/path fenced format.' },
      undefined,
      { role: 'app-builder' },
    );
  } catch (err: any) {
    return { attempts: 1, filesChanged: [], finalError: err?.message || String(err) };
  }
  const blocks = parseCodeBlocks(response);
  if (blocks.length === 0) {
    return { attempts: 1, filesChanged: [], finalError: 'Model returned no code blocks', responseRaw: response };
  }
  const { files: patched, created, updated } = applyCodeBlocks(files, blocks);
  return {
    attempts: 1,
    patchedFiles: patched,
    filesChanged: [...created, ...updated],
    responseRaw: response,
  };
}

export const PREVIEW_REPAIR_MAX_ATTEMPTS = MAX_ATTEMPTS;
