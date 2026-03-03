// Mode themes and system prompts for all 9 modes

export interface ModeTheme {
  key: string;
  accent: string;       // HSL values for --accent
  primary: string;      // HSL values for --primary
  ring: string;         // HSL values for --ring
  sidebarPrimary: string;
  sidebarRing: string;
  gradientPrimary: string; // CSS gradient
  shadowGlow: string;
  iconColorClass: string;  // Tailwind class for icon color in sidebar
  badgeClass: string;      // Extra classes for mode badge
  systemPrompt: string;
}

export const MODE_THEMES: Record<string, ModeTheme> = {
  chat: {
    key: 'chat',
    accent: '175 80% 45%',
    primary: '175 80% 45%',
    ring: '175 80% 45%',
    sidebarPrimary: '175 80% 45%',
    sidebarRing: '175 80% 45%',
    gradientPrimary: 'linear-gradient(135deg, hsl(175, 80%, 45%) 0%, hsl(190, 70%, 50%) 100%)',
    shadowGlow: '0 0 40px hsl(175, 80%, 45%, 0.15)',
    iconColorClass: 'text-teal-400',
    badgeClass: '',
    systemPrompt: '',
  },
  'app-builder': {
    key: 'app-builder',
    accent: '262 83% 58%',
    primary: '262 83% 58%',
    ring: '262 83% 58%',
    sidebarPrimary: '262 83% 58%',
    sidebarRing: '262 83% 58%',
    gradientPrimary: 'linear-gradient(135deg, hsl(262, 83%, 58%) 0%, hsl(280, 80%, 50%) 50%, hsl(320, 70%, 55%) 100%)',
    shadowGlow: '0 0 40px hsl(262, 83%, 58%, 0.15)',
    iconColorClass: 'text-purple-400',
    badgeClass: '',
    systemPrompt: 'You are an expert full-stack web developer. You help users build complete web applications using React, TypeScript, Tailwind CSS, and modern best practices. Generate clean, production-ready code with proper file structure. Always explain your architectural decisions.',
  },
  'embedded-iot': {
    key: 'embedded-iot',
    accent: '25 95% 53%',
    primary: '25 95% 53%',
    ring: '25 95% 53%',
    sidebarPrimary: '25 95% 53%',
    sidebarRing: '25 95% 53%',
    gradientPrimary: 'linear-gradient(135deg, hsl(25, 95%, 53%) 0%, hsl(35, 90%, 50%) 100%)',
    shadowGlow: '0 0 40px hsl(25, 95%, 53%, 0.15)',
    iconColorClass: 'text-orange-400',
    badgeClass: '',
    systemPrompt: 'You are an embedded systems and IoT expert specializing in ESP32, Arduino, Raspberry Pi, STM32, and other microcontrollers. You write efficient C/C++, MicroPython, and CircuitPython code. You understand hardware protocols (I2C, SPI, UART, GPIO), sensor integration, power management, and real-time constraints. Always specify the target board and include pin definitions.',
  },
  'system-helper': {
    key: 'system-helper',
    accent: '45 93% 47%',
    primary: '45 93% 47%',
    ring: '45 93% 47%',
    sidebarPrimary: '45 93% 47%',
    sidebarRing: '45 93% 47%',
    gradientPrimary: 'linear-gradient(135deg, hsl(45, 93%, 47%) 0%, hsl(38, 90%, 50%) 100%)',
    shadowGlow: '0 0 40px hsl(45, 93%, 47%, 0.15)',
    iconColorClass: 'text-amber-400',
    badgeClass: '',
    systemPrompt: 'You are a system administration and automation expert. You help users with file management, system configuration, shell scripting, and computer tasks. Always present commands in code blocks with the appropriate shell language. Explain what each command does before suggesting it. Warn about destructive operations. Prefer cross-platform solutions when possible.',
  },
  'ai-improvement': {
    key: 'ai-improvement',
    accent: '330 80% 60%',
    primary: '330 80% 60%',
    ring: '330 80% 60%',
    sidebarPrimary: '330 80% 60%',
    sidebarRing: '330 80% 60%',
    gradientPrimary: 'linear-gradient(135deg, hsl(330, 80%, 60%) 0%, hsl(300, 70%, 55%) 100%)',
    shadowGlow: '0 0 40px hsl(330, 80%, 60%, 0.15)',
    iconColorClass: 'text-pink-400',
    badgeClass: '',
    systemPrompt: 'You are a self-improvement AI that analyzes the LocalDev AI codebase. You can suggest improvements to the UI, performance, features, and architecture. You understand React, TypeScript, Tailwind CSS, Vite, and the full project structure. When suggesting changes, provide specific file paths and code diffs. Focus on practical, impactful improvements.',
  },
  learning: {
    key: 'learning',
    accent: '142 70% 45%',
    primary: '142 70% 45%',
    ring: '142 70% 45%',
    sidebarPrimary: '142 70% 45%',
    sidebarRing: '142 70% 45%',
    gradientPrimary: 'linear-gradient(135deg, hsl(142, 70%, 45%) 0%, hsl(160, 60%, 40%) 100%)',
    shadowGlow: '0 0 40px hsl(142, 70%, 45%, 0.15)',
    iconColorClass: 'text-green-400',
    badgeClass: '',
    systemPrompt: 'You are in Learning Mode. Your goal is to observe and learn the user\'s coding patterns, preferred libraries, naming conventions, folder structure preferences, and coding style. Ask clarifying questions about their preferences. When you notice patterns, acknowledge them. Over time, adapt your suggestions to match their established style. Summarize what you\'ve learned when asked.',
  },
  sandbox: {
    key: 'sandbox',
    accent: '190 80% 50%',
    primary: '190 80% 50%',
    ring: '190 80% 50%',
    sidebarPrimary: '190 80% 50%',
    sidebarRing: '190 80% 50%',
    gradientPrimary: 'linear-gradient(135deg, hsl(190, 80%, 50%) 0%, hsl(210, 70%, 55%) 100%)',
    shadowGlow: '0 0 40px hsl(190, 80%, 50%, 0.15)',
    iconColorClass: 'text-cyan-400',
    badgeClass: '',
    systemPrompt: 'You are in Sandbox Mode — a safe, isolated environment for experimentation. The user wants to try unconventional approaches, test risky refactors, or explore new frameworks without consequences. Encourage creative solutions. Don\'t worry about production readiness — focus on exploration and learning. Clearly mark experimental code as such.',
  },
  jailbreak: {
    key: 'jailbreak',
    accent: '0 72% 51%',
    primary: '0 72% 51%',
    ring: '0 72% 51%',
    sidebarPrimary: '0 72% 51%',
    sidebarRing: '0 72% 51%',
    gradientPrimary: 'linear-gradient(135deg, hsl(0, 72%, 51%) 0%, hsl(350, 70%, 45%) 100%)',
    shadowGlow: '0 0 40px hsl(0, 72%, 51%, 0.15)',
    iconColorClass: 'text-red-400',
    badgeClass: '',
    systemPrompt: '', // Uses user's custom jailbreak prompt from settings
  },
  plugin: {
    key: 'plugin',
    accent: '220 80% 55%',
    primary: '220 80% 55%',
    ring: '220 80% 55%',
    sidebarPrimary: '220 80% 55%',
    sidebarRing: '220 80% 55%',
    gradientPrimary: 'linear-gradient(135deg, hsl(220, 80%, 55%) 0%, hsl(240, 70%, 60%) 100%)',
    shadowGlow: '0 0 40px hsl(220, 80%, 55%, 0.15)',
    iconColorClass: 'text-blue-400',
    badgeClass: '',
    systemPrompt: 'You are in Plugin Mode. You help users create, manage, and configure custom plugins and integrations for LocalDev AI. You understand the plugin API, hook system, and how to extend the IDE\'s functionality. Guide users through creating new plugins with proper structure, lifecycle hooks, and UI components.',
  },
};

export function getModeTheme(modeKey: string): ModeTheme {
  return MODE_THEMES[modeKey] || MODE_THEMES.chat;
}

export function getModeSystemPrompt(modeKey: string, userJailbreakPrompt?: string): string {
  if (modeKey === 'jailbreak' && userJailbreakPrompt) {
    return userJailbreakPrompt;
  }
  return MODE_THEMES[modeKey]?.systemPrompt || '';
}

export function applyModeTheme(modeKey: string): void {
  const theme = getModeTheme(modeKey);
  const root = document.documentElement;
  
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--ring', theme.ring);
  root.style.setProperty('--sidebar-primary', theme.sidebarPrimary);
  root.style.setProperty('--sidebar-ring', theme.sidebarRing);
  root.style.setProperty('--gradient-primary', theme.gradientPrimary);
  root.style.setProperty('--shadow-glow', theme.shadowGlow);
}
