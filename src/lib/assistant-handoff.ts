export const ASSISTANT_OPTIONS = [
  { id: 'codex', name: 'Codex', detail: 'OpenAI coding assistant', url: 'https://developers.openai.com/codex/' },
  { id: 'claude-code', name: 'Claude Code', detail: 'Anthropic coding assistant', url: 'https://code.claude.com/docs/en/overview' },
  { id: 'openclaw', name: 'OpenClaw', detail: 'Your OpenClaw workflow', url: 'https://docs.openclaw.ai/' },
  { id: 'custom', name: 'Other assistant', detail: 'Your own coding tool', url: '' },
] as const;

export type AssistantId = typeof ASSISTANT_OPTIONS[number]['id'];
export interface AssistantPreferences {
  assistant: AssistantId;
  customName: string;
  repository: string;
  task: string;
}
export const ASSISTANT_STORAGE_KEY = 'coding-assistant-preferences-v1';
export const EMPTY_ASSISTANT_PREFERENCES: AssistantPreferences = {
  assistant: 'codex', customName: '', repository: '', task: '',
};

export function normalizeGithubRepository(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a GitHub repository URL: https://github.com/owner/repository');
  }
  const match = url.pathname.match(/^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)\/?$/);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw new Error('Use the repository URL, not a file or branch link.');
  }
  return `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}`;
}

export function readAssistantPreferences(raw: string | null): AssistantPreferences {
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object') return { ...EMPTY_ASSISTANT_PREFERENCES };
    return {
      assistant: ASSISTANT_OPTIONS.some(option => option.id === value.assistant) ? value.assistant : 'codex',
      customName: typeof value.customName === 'string' ? value.customName : '',
      repository: typeof value.repository === 'string' ? value.repository : '',
      task: typeof value.task === 'string' ? value.task : '',
    };
  } catch { return { ...EMPTY_ASSISTANT_PREFERENCES }; }
}

export function buildAssistantHandoff(preferences: AssistantPreferences): string {
  const repository = normalizeGithubRepository(preferences.repository);
  if (!preferences.task.trim()) throw new Error('Add a project goal first.');
  const name = preferences.assistant === 'custom' ? preferences.customName.trim() || 'Coding assistant'
    : ASSISTANT_OPTIONS.find(option => option.id === preferences.assistant)?.name;
  return [
    `Project handoff for ${name}`, `Repository: ${repository}`, '',
    'Goal:', preferences.task.trim(), '',
    'First inspect the repository, README, license, dependencies, and existing tests.',
    'Explain the current architecture and propose focused changes before editing.',
    'Preserve existing work, respect the license, and do not expose secrets.',
    'Do not install dependencies, run untrusted scripts, or push changes without approval.',
    'Implement the agreed changes and report the tests run and any limitations.',
  ].join('\n');
}