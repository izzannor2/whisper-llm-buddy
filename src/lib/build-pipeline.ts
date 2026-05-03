/**
 * Multi-agent App Builder pipeline (Planner → Architect → Coder → Reviewer).
 * Each stage is a real LLM call via sendChatMessage. Files are applied to the
 * in-memory IDE project tree AND to the local filesystem (when a directory is
 * open via the File System Access API), so the GitHub export matches the IDE.
 */
import { sendChatMessage, loadSettings, ChatMessage } from './chat-api';
import { parseCodeBlocks, applyCodeBlocks, ParsedCodeBlock } from './code-parser';
import { writeFile, getCurrentDirectory } from './file-system';
import { ProjectFile } from './ide-types';

export type BuildPhase = 'planning' | 'architecting' | 'coding' | 'reviewing' | 'done' | 'error';

export interface BuildEvent {
  phase: BuildPhase;
  step: number;
  totalSteps: number;
  message: string;
  filesWritten: number;
  diskWrites: number;
  diskFailures: number;
  files?: ProjectFile[];
  newFiles?: string[];
  error?: string;
}

export interface BuildPipelineOptions {
  goal: string;
  files: ProjectFile[];
  onEvent: (e: BuildEvent) => void;
  signal?: AbortSignal;
  maxReviewLoops?: number;
}

const PLANNER_PROMPT = `You are the PLANNER agent in a multi-agent build pipeline.
Goal: take the user's idea and produce a concise specification.
Output sections:
1. Summary (one paragraph)
2. Core features (bulleted)
3. Tech stack: React 18 + TypeScript + Vite + Tailwind CSS (always)
4. Data model (if any)
5. Out-of-scope items
Do NOT write any code.`;

const ARCHITECT_PROMPT = `You are the ARCHITECT agent. Given the plan, produce a complete file tree
for a runnable Vite + React + TS + Tailwind project. You MUST always include:
package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx,
src/App.tsx, src/index.css, tailwind.config.ts, postcss.config.js,
.gitignore, README.md
Plus all feature files needed.
Output ONLY a JSON array of objects (no prose, no fences) like:
[{"path":"/src/App.tsx","purpose":"root"},{"path":"/package.json","purpose":"deps"}]`;

const CODER_PROMPT = `You are the CODER agent. Output FULL contents of the requested files.
Use this exact format for every file (no diffs, no placeholders):

\`\`\`tsx:/src/App.tsx
// complete file content here
\`\`\`

Rules:
- Always include all imports.
- Use Tailwind utility classes.
- React 18 + TypeScript + Vite.
- No commentary outside code fences.`;

const REVIEWER_PROMPT = `You are the REVIEWER agent. Inspect the provided file list and
contents. Identify:
- missing imports
- broken cross-file references
- missing required files (package.json, vite.config.ts, index.html, src/main.tsx, src/index.css, tailwind.config.ts)
- obvious runtime errors

If everything is good, output exactly: ALL_GOOD
Otherwise output corrected/missing files using the same fence format:
\`\`\`lang:/path/to/file.ext
// full file contents
\`\`\``;

function abortable(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Build aborted');
}

async function runAgent(
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  abortable(signal);
  const settings = { ...loadSettings(), systemPrompt };
  const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];
  return await sendChatMessage(messages, settings);
}

async function applyAndPersist(
  files: ProjectFile[],
  blocks: ParsedCodeBlock[],
): Promise<{ files: ProjectFile[]; diskWrites: number; diskFailures: number; newFiles: string[] }> {
  const { files: updated, created, updated: changed } = applyCodeBlocks(files, blocks);
  let diskWrites = 0;
  let diskFailures = 0;
  // Persist to local filesystem if a directory is open.
  if (getCurrentDirectory()) {
    for (const block of blocks) {
      try {
        await writeFile(block.filePath.replace(/^\//, ''), block.content);
        diskWrites++;
      } catch {
        diskFailures++;
      }
    }
  }
  return { files: updated, diskWrites, diskFailures, newFiles: [...created, ...changed] };
}

function summarizeFiles(files: ProjectFile[]): string {
  const out: string[] = [];
  const walk = (list: ProjectFile[]) => {
    for (const f of list) {
      if (f.isDirectory && f.children) walk(f.children);
      else if (!f.isDirectory) {
        const preview = (f.content || '').split('\n').slice(0, 8).join('\n');
        out.push(`### ${f.path}\n\`\`\`\n${preview}\n\`\`\``);
      }
    }
  };
  walk(files);
  return out.slice(0, 60).join('\n\n');
}

export async function runBuildPipeline(opts: BuildPipelineOptions): Promise<void> {
  const { goal, onEvent, signal } = opts;
  const maxReviewLoops = opts.maxReviewLoops ?? 2;
  let files = opts.files;
  let totalWritten = 0;
  let totalDiskWrites = 0;
  let totalDiskFailures = 0;

  const emit = (e: Partial<BuildEvent> & { phase: BuildPhase; step: number; message: string }) => {
    onEvent({
      totalSteps: 4,
      filesWritten: totalWritten,
      diskWrites: totalDiskWrites,
      diskFailures: totalDiskFailures,
      ...e,
    } as BuildEvent);
  };

  try {
    // 1. Planner
    emit({ phase: 'planning', step: 1, message: 'Planning requirements…' });
    const plan = await runAgent(PLANNER_PROMPT, `User goal:\n${goal}`, signal);
    emit({ phase: 'planning', step: 1, message: 'Plan ready' });

    // 2. Architect
    emit({ phase: 'architecting', step: 2, message: 'Designing file tree…' });
    const archRaw = await runAgent(
      ARCHITECT_PROMPT,
      `Plan:\n${plan}\n\nReturn the JSON file tree now.`,
      signal,
    );
    let tree: Array<{ path: string; purpose: string }> = [];
    try {
      const match = archRaw.match(/\[[\s\S]*\]/);
      if (match) tree = JSON.parse(match[0]);
    } catch { /* ignore */ }
    if (tree.length === 0) {
      tree = [
        { path: '/package.json', purpose: 'project manifest' },
        { path: '/index.html', purpose: 'html entry' },
        { path: '/vite.config.ts', purpose: 'vite config' },
        { path: '/tsconfig.json', purpose: 'ts config' },
        { path: '/tailwind.config.ts', purpose: 'tailwind' },
        { path: '/postcss.config.js', purpose: 'postcss' },
        { path: '/src/main.tsx', purpose: 'react entry' },
        { path: '/src/App.tsx', purpose: 'root component' },
        { path: '/src/index.css', purpose: 'global styles' },
        { path: '/README.md', purpose: 'readme' },
        { path: '/.gitignore', purpose: 'git ignore' },
      ];
    }
    emit({ phase: 'architecting', step: 2, message: `Tree: ${tree.length} files` });

    // 3. Coder — batch in groups of 6 to keep responses focused.
    const batches: typeof tree[] = [];
    const batchSize = 6;
    for (let i = 0; i < tree.length; i += batchSize) batches.push(tree.slice(i, i + batchSize));

    for (let i = 0; i < batches.length; i++) {
      abortable(signal);
      const batch = batches[i];
      emit({
        phase: 'coding', step: 3,
        message: `Generating files ${i * batchSize + 1}–${i * batchSize + batch.length} of ${tree.length}…`,
      });
      const fileList = batch.map((f) => `- ${f.path} — ${f.purpose}`).join('\n');
      const userMsg =
        `Plan:\n${plan}\n\nWrite the COMPLETE contents for these files (and only these):\n${fileList}\n\n` +
        `Use the fenced format. No commentary.`;
      const reply = await runAgent(CODER_PROMPT, userMsg, signal);
      const blocks = parseCodeBlocks(reply);
      const result = await applyAndPersist(files, blocks);
      files = result.files;
      totalWritten += result.newFiles.length;
      totalDiskWrites += result.diskWrites;
      totalDiskFailures += result.diskFailures;
      emit({
        phase: 'coding', step: 3,
        message: `Wrote ${result.newFiles.length} files (batch ${i + 1}/${batches.length})`,
        files, newFiles: result.newFiles,
      });
    }

    // 4. Reviewer — up to maxReviewLoops iterations.
    for (let loop = 0; loop < maxReviewLoops; loop++) {
      abortable(signal);
      emit({ phase: 'reviewing', step: 4, message: `Reviewing project (pass ${loop + 1}/${maxReviewLoops})…` });
      const summary = summarizeFiles(files);
      const reply = await runAgent(
        REVIEWER_PROMPT,
        `Plan:\n${plan}\n\nCurrent project files (summarized):\n${summary}`,
        signal,
      );
      if (/ALL_GOOD/.test(reply)) {
        emit({ phase: 'reviewing', step: 4, message: 'Review passed — no fixes needed' });
        break;
      }
      const blocks = parseCodeBlocks(reply);
      if (blocks.length === 0) {
        emit({ phase: 'reviewing', step: 4, message: 'Review produced no patches' });
        break;
      }
      const result = await applyAndPersist(files, blocks);
      files = result.files;
      totalWritten += result.newFiles.length;
      totalDiskWrites += result.diskWrites;
      totalDiskFailures += result.diskFailures;
      emit({
        phase: 'reviewing', step: 4,
        message: `Patched ${result.newFiles.length} files`,
        files, newFiles: result.newFiles,
      });
    }

    emit({
      phase: 'done', step: 4,
      message: `Build complete · ${totalWritten} files written` +
        (totalDiskWrites ? ` · ${totalDiskWrites} on disk` : '') +
        (totalDiskFailures ? ` · ${totalDiskFailures} disk failures` : ''),
      files,
    });
  } catch (err: any) {
    emit({
      phase: 'error', step: 4,
      message: err?.message || 'Build failed',
      error: err?.message,
    });
    throw err;
  }
}
