import { useNavigate } from 'react-router-dom';
import { 
  MessageSquare, Layers, Cpu, Terminal, Sparkles, 
  GraduationCap, FlaskConical, AlertTriangle, Plug, Volume2, Shield, ArrowRight 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IDEMode } from '@/lib/ide-types';
import { getModeTheme } from '@/lib/mode-themes';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  mode?: IDEMode;
  modeKey?: string;
}

const MODE_ICONS: Record<string, any> = {
  chat: MessageSquare,
  'app-builder': Layers,
  'embedded-iot': Cpu,
  'system-helper': Terminal,
  'ai-improvement': Sparkles,
  learning: GraduationCap,
  sandbox: FlaskConical,
  jailbreak: AlertTriangle,
  plugin: Plug,
};

const MODE_CONTENT: Record<string, {
  title: string;
  description: string;
  suggestions: string[];
  banner?: { text: string; type: 'warning' | 'info' | 'success' };
}> = {
  chat: {
    title: "Chat",
    description: "General-purpose AI conversation. Ask anything — code, ideas, questions, or just chat.",
    suggestions: [
      "Explain how async/await works in JavaScript",
      "Help me brainstorm project ideas",
      "What are the best practices for REST APIs?",
    ],
  },
  'app-builder': {
    title: "App Builder",
    description: "Full-stack web app development with live preview, file tree, and code editor.",
    suggestions: [
      "Create a React dashboard with user analytics",
      "Build a landing page for a SaaS product",
      "Add authentication to this app",
    ],
  },
  'embedded-iot': {
    title: "IoT / Embedded",
    description: "Write code for ESP32, Arduino, Raspberry Pi, and other microcontrollers.",
    suggestions: [
      "Create an ESP32 web server with sensor readings",
      "Build an Arduino LED controller with PWM",
      "Write MicroPython code for Raspberry Pi Pico",
    ],
    banner: { text: 'Hardware-focused mode — specify your target board', type: 'info' },
  },
  'system-helper': {
    title: "System Helper",
    description: "Computer tasks, file management, and system automation. All commands require your approval.",
    suggestions: [
      "Clean up temporary files from my system",
      "Find large files taking up disk space",
      "Create a backup script for my documents",
    ],
    banner: { text: 'Commands will be shown for review before execution', type: 'info' },
  },
  'ai-improvement': {
    title: "AI Improvement",
    description: "Analyze this development environment and suggest improvements, new features, or optimizations.",
    suggestions: [
      "Analyze the current codebase for improvements",
      "Suggest new features for the IDE",
      "Propose UI/UX enhancements",
    ],
  },
  learning: {
    title: "Learning Mode",
    description: "I'll observe your coding patterns, preferred libraries, and naming conventions to better assist you.",
    suggestions: [
      "Show me what patterns you've learned",
      "Apply my usual folder structure to a new project",
      "Suggest libraries based on my preferences",
    ],
    banner: { text: 'Actively learning your style preferences', type: 'success' },
  },
  sandbox: {
    title: "Sandbox",
    description: "Safe, isolated environment for experimentation. Try anything without affecting your main projects.",
    suggestions: [
      "Let's experiment with a new framework",
      "Try an unconventional architecture pattern",
      "Test a risky code refactor safely",
    ],
    banner: { text: 'Experimental — nothing here affects your real projects', type: 'info' },
  },
  jailbreak: {
    title: "Override Mode",
    description: "Advanced mode with custom system prompts. Your custom persona from Settings is active.",
    suggestions: [
      "Configure custom system prompts",
      "Override default AI behavior",
      "Set up specialized assistant persona",
    ],
    banner: { text: 'Custom system prompt active — use responsibly', type: 'warning' },
  },
  plugin: {
    title: "Plugin Mode",
    description: "Manage and create custom plugins and integrations to extend LocalDev AI.",
    suggestions: [
      "Browse available plugins",
      "Create a custom plugin",
      "Configure plugin settings",
    ],
  },
};

export function EmptyState({ mode = 'app-builder', modeKey }: EmptyStateProps) {
  const navigate = useNavigate();
  const key = modeKey || (mode === 'app-builder' ? 'chat' : mode);
  const content = MODE_CONTENT[key] || MODE_CONTENT.chat;
  const theme = getModeTheme(key);
  const Icon = MODE_ICONS[key] || MessageSquare;

  // Modes that navigate to dedicated workspaces
  const WORKSPACE_ROUTES: Record<string, { route: string; label: string }> = {
    'app-builder': { route: '/ide', label: 'Open App Builder' },
    'embedded-iot': { route: '/iot', label: 'Open IoT Workspace' },
    'sandbox': { route: '/sandbox', label: 'Open Sandbox' },
    'ai-improvement': { route: '/improve', label: 'Open Improvement Workspace' },
  };

  const workspace = WORKSPACE_ROUTES[key];

  return (
    <div className="flex flex-col h-full p-6">
      {/* Banner */}
      {content.banner && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4 text-sm font-medium border",
          content.banner.type === 'warning' && "bg-red-500/10 border-red-500/20 text-red-400",
          content.banner.type === 'info' && "bg-accent/10 border-accent/20 text-accent",
          content.banner.type === 'success' && "bg-green-500/10 border-green-500/20 text-green-400",
        )}>
          <Shield className="w-4 h-4 shrink-0" />
          {content.banner.text}
        </div>
      )}

      {/* Header with mode icon */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, hsl(${theme.accent} / 0.25), hsl(${theme.accent} / 0.1))` }}
        >
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">{content.title}</h2>
          <p className="text-xs text-muted-foreground">{key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Mode</p>
        </div>
      </div>

      {/* Welcome message */}
      <div
        className="rounded-xl p-5 mb-6 border"
        style={{
          background: `linear-gradient(135deg, hsl(${theme.accent} / 0.06), hsl(${theme.accent} / 0.02))`,
          borderColor: `hsl(${theme.accent} / 0.12)`,
        }}
      >
        <p className="text-sm text-foreground mb-4">
          {content.description}
        </p>
        
        {/* Workspace launch button */}
        {workspace && (
          <Button
            onClick={() => navigate(workspace.route)}
            className="w-full mb-4 gap-2"
            style={{
              background: `linear-gradient(135deg, hsl(${theme.accent}), hsl(${theme.accent} / 0.8))`,
              color: 'white',
            }}
          >
            <Icon className="w-4 h-4" />
            {workspace.label}
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
        )}
        
        <p className="text-sm text-muted-foreground mb-3">Try saying:</p>
        
        <div className="space-y-2">
          {content.suggestions.map((suggestion, index) => (
            <p key={index} className="text-sm text-accent italic pl-4 border-l-2" style={{ borderColor: `hsl(${theme.accent} / 0.3)` }}>
              "{suggestion}"
            </p>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* TTS indicator */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Volume2 className="w-4 h-4" />
        <span className="text-xs">Voice enabled</span>
      </div>
    </div>
  );
}
