// Agent Tool Definitions — schemas and handlers for AI tool calling

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

// Tool definitions exposed to the AI
export const AGENT_TOOLS: ToolSchema[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a pattern across project files',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query or regex pattern' },
        filePattern: { type: 'string', description: 'Glob pattern to filter files (e.g. *.tsx)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_files',
    description: 'List files and directories in a given path',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
      },
      required: ['path'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_plan',
    description: 'Create a structured execution plan for a complex task',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        steps: { type: 'string', description: 'JSON array of step objects with title and description' },
      },
      required: ['task', 'steps'],
    },
  },
  {
    name: 'analyze_code',
    description: 'Analyze code for bugs, performance issues, or improvements',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to analyze' },
        language: { type: 'string', description: 'Programming language' },
        focus: { type: 'string', description: 'What to focus on', enum: ['bugs', 'performance', 'security', 'style', 'all'] },
      },
      required: ['code'],
    },
  },
  {
    name: 'generate_code',
    description: 'Generate code based on a description',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What to generate' },
        language: { type: 'string', description: 'Target language (e.g. typescript, python)' },
        framework: { type: 'string', description: 'Framework if applicable (e.g. react, express)' },
      },
      required: ['description'],
    },
  },
];

// Browser-side tool handlers (File System Access API + IndexedDB)
const toolHandlers: Record<string, ToolHandler> = {
  async read_file({ path }) {
    try {
      // Try File System Access API if available
      if ('showDirectoryPicker' in window && (window as any).__projectDirHandle) {
        const handle = await resolveFileHandle(
          (window as any).__projectDirHandle,
          String(path)
        );
        const file = await handle.getFile();
        const content = await file.text();
        return { success: true, output: content };
      }
      return { success: false, output: `File system not available. Cannot read: ${path}` };
    } catch (e) {
      return { success: false, output: `Error reading ${path}: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async write_file({ path, content }) {
    try {
      if ('showDirectoryPicker' in window && (window as any).__projectDirHandle) {
        const handle = await resolveFileHandle(
          (window as any).__projectDirHandle,
          String(path),
          true
        );
        const writable = await (handle as any).createWritable();
        await writable.write(String(content));
        await writable.close();
        return { success: true, output: `Written to ${path}` };
      }
      return { success: false, output: 'File system not available for writing' };
    } catch (e) {
      return { success: false, output: `Error writing ${path}: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async search_code({ query }) {
    return { success: true, output: `Search for "${query}" — use the project file tree to locate results.` };
  },

  async list_files({ path }) {
    try {
      if ('showDirectoryPicker' in window && (window as any).__projectDirHandle) {
        const dirHandle = await resolveDirHandle(
          (window as any).__projectDirHandle,
          String(path || '.')
        );
        const entries: string[] = [];
        for await (const [name, handle] of (dirHandle as any).entries()) {
          entries.push(handle.kind === 'directory' ? `${name}/` : name);
        }
        return { success: true, output: entries.join('\n'), data: entries };
      }
      return { success: false, output: 'File system not available' };
    } catch (e) {
      return { success: false, output: `Error listing ${path}: ${e instanceof Error ? e.message : String(e)}` };
    }
  },

  async web_search({ query }) {
    return { success: true, output: `Web search for "${query}" is available through the web-search edge function.` };
  },

  async create_plan({ task, steps }) {
    try {
      const parsed = JSON.parse(String(steps));
      return { success: true, output: `Plan created for: ${task}\n${parsed.map((s: any, i: number) => `${i + 1}. ${s.title}`).join('\n')}`, data: parsed };
    } catch {
      return { success: true, output: `Plan created for: ${task}\n${steps}` };
    }
  },

  async analyze_code({ code, focus }) {
    return { success: true, output: `Code analysis requested (focus: ${focus || 'all'}). The AI will analyze the provided code.`, data: { code, focus } };
  },

  async generate_code({ description, language, framework }) {
    return { success: true, output: `Code generation requested: ${description} (${language || 'auto'}${framework ? `, ${framework}` : ''})` };
  },
};

// Helper to resolve file handle from path
async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false
): Promise<FileSystemFileHandle> {
  const parts = String(path).replace(/^\//, '').split('/');
  let current: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create });
  }
  return current.getFileHandle(parts[parts.length - 1], { create });
}

async function resolveDirHandle(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  if (path === '.' || path === '' || path === '/') return root;
  const parts = path.replace(/^\//, '').split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers[name];
}

export function getToolSchemas(): ToolSchema[] {
  return AGENT_TOOLS;
}
