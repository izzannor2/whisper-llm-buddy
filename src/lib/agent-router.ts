// Multi-Agent Router — classifies intent and selects specialized agent persona

export type AgentType = 'developer' | 'research' | 'debug' | 'automation' | 'general';

export interface AgentInfo {
  type: AgentType;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
}

export const AGENTS: Record<AgentType, AgentInfo> = {
  developer: {
    type: 'developer',
    name: 'Developer Agent',
    emoji: '👨‍💻',
    description: 'Writes, refactors, and reviews code',
    systemPrompt: `You are a senior full-stack developer. You write clean, production-ready code.
Focus on: React, TypeScript, Tailwind CSS, Node.js, Python.
Always output complete, working files. Use best practices and modern patterns.
When modifying existing code, show the full file with changes highlighted.`,
  },
  research: {
    type: 'research',
    name: 'Research Agent',
    emoji: '🔍',
    description: 'Finds information and summarizes topics',
    systemPrompt: `You are a research specialist. You find accurate information and present it clearly.
Always cite sources when possible. Structure answers with headers and bullet points.
If you're unsure, say so. Provide multiple perspectives on complex topics.`,
  },
  debug: {
    type: 'debug',
    name: 'Debug Agent',
    emoji: '🐛',
    description: 'Analyzes errors and fixes bugs',
    systemPrompt: `You are an expert debugger. You systematically analyze errors and find root causes.
Steps: 1) Understand the error 2) Identify the root cause 3) Propose a fix 4) Verify the fix.
Always explain WHY the error occurred, not just how to fix it.
Check for common issues: null references, async/await, import paths, type mismatches.`,
  },
  automation: {
    type: 'automation',
    name: 'Automation Agent',
    emoji: '⚡',
    description: 'Automates tasks and workflows',
    systemPrompt: `You are an automation specialist. You create scripts, workflows, and automated solutions.
Focus on: shell scripts, CI/CD, task runners, file operations, batch processing.
Always consider error handling, idempotency, and cross-platform compatibility.`,
  },
  general: {
    type: 'general',
    name: 'Assistant',
    emoji: '🤖',
    description: 'General-purpose AI assistant',
    systemPrompt: '',
  },
};

// Intent classification keywords
const INTENT_PATTERNS: Record<AgentType, RegExp[]> = {
  developer: [
    /\b(write|create|build|implement|code|component|function|class|module|refactor|add feature)\b/i,
    /\b(react|typescript|javascript|python|html|css|api|endpoint|database|schema)\b/i,
    /\b(app|page|form|button|layout|style|design)\b/i,
  ],
  debug: [
    /\b(error|bug|fix|debug|crash|broken|not working|issue|problem|fail|exception)\b/i,
    /\b(undefined|null|TypeError|ReferenceError|SyntaxError|cannot read|stack trace)\b/i,
    /\b(why is|what's wrong|doesn't work|help me fix)\b/i,
  ],
  research: [
    /\b(what is|explain|how does|tell me about|compare|difference between|pros and cons)\b/i,
    /\b(research|find|look up|summarize|overview|guide|tutorial|documentation)\b/i,
  ],
  automation: [
    /\b(automate|script|batch|cron|schedule|deploy|ci\/cd|pipeline|workflow)\b/i,
    /\b(setup|install|configure|migrate|backup|monitor)\b/i,
  ],
  general: [],
};

export interface RouteResult {
  agent: AgentInfo;
  confidence: number;
  reasoning: string;
}

export function routeToAgent(message: string): RouteResult {
  const scores: Record<AgentType, number> = {
    developer: 0,
    debug: 0,
    research: 0,
    automation: 0,
    general: 0,
  };

  for (const [type, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        scores[type as AgentType] += 1;
      }
    }
  }

  // Find highest scoring agent
  let bestType: AgentType = 'general';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as AgentType;
    }
  }

  // Default to general if no clear winner
  if (bestScore === 0) bestType = 'general';

  const agent = AGENTS[bestType];
  return {
    agent,
    confidence: bestScore > 0 ? Math.min(bestScore / 3, 1) : 0.5,
    reasoning: bestScore > 0
      ? `Detected ${bestType} intent (${bestScore} keyword matches)`
      : 'No specific intent detected, using general assistant',
  };
}

export function getAgentSystemPrompt(agentType: AgentType, basePrompt: string): string {
  const agent = AGENTS[agentType];
  if (!agent.systemPrompt) return basePrompt;
  return `${agent.systemPrompt}\n\n${basePrompt}`;
}
