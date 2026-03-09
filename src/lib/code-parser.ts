// Parse AI responses for code blocks with file paths and auto-apply to project

import { ProjectFile } from './ide-types';
import { generateId } from './ide-store';

export interface ParsedCodeBlock {
  filePath: string;
  content: string;
  language: string;
}

/**
 * Extract code blocks with file paths from AI markdown responses.
 * Supports formats like:
 *   ```tsx:src/App.tsx
 *   ```typescript src/App.tsx
 *   // filepath: src/App.tsx
 */
export function parseCodeBlocks(response: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];
  let match;
  
  // 1. Match ```lang:/filepath or ```lang /filepath patterns (preferred format)
  const primaryRegex = /```(\w+)(?::|\s+)(\/?\S+\.\w+)\s*\n([\s\S]*?)```/g;
  while ((match = primaryRegex.exec(response)) !== null) {
    const language = match[1];
    let filePath = match[2].trim();
    const content = match[3].trimEnd();
    if (!filePath.startsWith('/')) filePath = '/' + filePath;
    blocks.push({ filePath, content, language });
  }

  // 2. Match when the "language" IS a file path: ```src/components/Counter.tsx or ```/src/components/Counter.tsx
  if (blocks.length === 0) {
    const pathAsLangRegex = /```(\/?\S+\.(\w+))\s*\n([\s\S]*?)```/g;
    while ((match = pathAsLangRegex.exec(response)) !== null) {
      let filePath = match[1].trim();
      if (!filePath.startsWith('/')) filePath = '/' + filePath;
      const ext = match[2];
      const langMap: Record<string, string> = { tsx: 'tsx', ts: 'typescript', jsx: 'jsx', js: 'javascript', css: 'css', json: 'json', html: 'html', md: 'markdown', py: 'python' };
      blocks.push({ filePath, content: match[3].trimEnd(), language: langMap[ext] || ext });
    }
  }

  // 3. Match filepath comment inside code block (// filepath: ..., // file: ..., // path: ...)
  if (blocks.length === 0) {
    const commentRegex = /```(\w+)\s*\n\/\/\s*(?:filepath|file|path):\s*(\S+)\n([\s\S]*?)```/g;
    while ((match = commentRegex.exec(response)) !== null) {
      let filePath = match[2].trim();
      if (!filePath.startsWith('/')) filePath = '/' + filePath;
      blocks.push({ filePath, content: match[3].trimEnd(), language: match[1] });
    }
  }

  // 4. Match bare path comment at start of code block (// src/Counter.tsx)
  if (blocks.length === 0) {
    const barePathRegex = /```(\w+)\s*\n\/\/\s+((?:src\/|\/)\S+\.\w+)\s*\n([\s\S]*?)```/g;
    while ((match = barePathRegex.exec(response)) !== null) {
      let filePath = match[2].trim();
      if (!filePath.startsWith('/')) filePath = '/' + filePath;
      blocks.push({ filePath, content: match[3].trimEnd(), language: match[1] });
    }
  }

  return blocks;
}

/**
 * Apply parsed code blocks to a project file tree,
 * creating new files/directories as needed.
 */
export function applyCodeBlocks(
  existingFiles: ProjectFile[],
  blocks: ParsedCodeBlock[]
): { files: ProjectFile[]; created: string[]; updated: string[] } {
  const files = JSON.parse(JSON.stringify(existingFiles)) as ProjectFile[];
  const created: string[] = [];
  const updated: string[] = [];

  for (const block of blocks) {
    const parts = block.filePath.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    
    // Try to find and update existing file
    if (updateFileInTree(files, block.filePath, block.content)) {
      updated.push(block.filePath);
    } else {
      // Create the file (and necessary parent directories)
      ensureDirectories(files, parts.slice(0, -1));
      const parentDir = findDirectory(files, '/' + parts.slice(0, -1).join('/'));
      
      const newFile: ProjectFile = {
        id: generateId(),
        name: fileName,
        path: block.filePath,
        content: block.content,
        language: block.language,
        isDirectory: false,
        isModified: true,
      };

      if (parentDir && parentDir.children) {
        parentDir.children.push(newFile);
      } else if (parts.length === 1) {
        // Root-level file
        files.push(newFile);
      }
      created.push(block.filePath);
    }
  }

  return { files, created, updated };
}

function updateFileInTree(files: ProjectFile[], path: string, content: string): boolean {
  for (const file of files) {
    if (file.path === path && !file.isDirectory) {
      file.content = content;
      file.isModified = true;
      return true;
    }
    if (file.isDirectory && file.children) {
      if (updateFileInTree(file.children, path, content)) return true;
    }
  }
  return false;
}

function findDirectory(files: ProjectFile[], path: string): ProjectFile | null {
  if (!path || path === '/') return null;
  for (const file of files) {
    if (file.path === path && file.isDirectory) return file;
    if (file.isDirectory && file.children) {
      const found = findDirectory(file.children, path);
      if (found) return found;
    }
  }
  return null;
}

function ensureDirectories(files: ProjectFile[], parts: string[]): void {
  let currentPath = '';
  let currentLevel = files;

  for (const part of parts) {
    currentPath += '/' + part;
    const existing = currentLevel.find(f => f.path === currentPath && f.isDirectory);
    if (existing) {
      if (!existing.children) existing.children = [];
      currentLevel = existing.children;
    } else {
      const newDir: ProjectFile = {
        id: generateId(),
        name: part,
        path: currentPath,
        content: '',
        language: '',
        isDirectory: true,
        children: [],
      };
      currentLevel.push(newDir);
      currentLevel = newDir.children!;
    }
  }
}

/**
 * Detect if the user message is a "build trigger" — 
 * meaning they want to transition from planning to building.
 */
export function isBuildTrigger(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const triggers = [
    'build it', 'build that', 'build this',
    'go ahead', 'go for it', 'do it',
    'okay', 'ok build', 'ok go',
    'let\'s build', 'lets build', 'let\'s go',
    'start building', 'make it', 'create it',
    'implement it', 'implement that', 'implement this',
    'code it', 'code that', 'ship it',
    'yes', 'yep', 'yeah', 'sure', 'sounds good',
    'looks good', 'perfect', 'approved',
    'execute', 'run it', 'proceed',
  ];
  return triggers.some(t => lower === t || lower.startsWith(t + '.') || lower.startsWith(t + '!') || lower.startsWith(t + ','));
}

/** 
 * Get the App Builder system prompt for building mode.
 * Instructs the AI to output complete file contents with paths.
 */
export function getAppBuilderBuildPrompt(): string {
  return `You are an expert full-stack developer AI assistant, similar to Lovable or Bolt. When the user asks you to build something:

1. **Output complete, working code** — not pseudocode or snippets.
2. **Use this exact format for every file** you create or modify:

\`\`\`tsx:/src/App.tsx
// full file content here
\`\`\`

3. **Always include ALL files needed** for the feature to work (components, styles, utilities, etc.)
4. **Use React + TypeScript + Tailwind CSS** as the stack.
5. **Make it look polished** — use proper spacing, colors, hover states, and responsive design.
6. **Be thorough** — include imports, exports, types, and all boilerplate.

When outputting code, use the format \`\`\`language:/path/to/file.ext so the system can auto-apply your code to the project.

Important: Output complete file contents, not diffs or partial updates.`;
}

/**
 * Get the planning mode system prompt.
 */
export function getAppBuilderPlanPrompt(): string {
  return `You are an expert software architect AI. You are in PLANNING MODE.

Your job is to help the user plan their application before any code is written:
1. Ask clarifying questions about requirements
2. Propose architecture and component structure
3. List the files you'll create and their responsibilities
4. Outline the tech stack and key libraries
5. Break the work into clear implementation steps

Do NOT write any code yet. Focus purely on planning and architecture.
When the user approves the plan (says "okay", "build it", "go ahead", etc.), you'll switch to building mode.`;
}
