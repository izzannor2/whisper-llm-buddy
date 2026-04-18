import { useNavigate } from 'react-router-dom';
import { 
  MessageSquare, Layers, Cpu, Terminal, Sparkles, 
  GraduationCap, FlaskConical, AlertTriangle, Plug, Volume2, Shield, ArrowRight, Crown,
  Brain, BookOpen, Code, Wrench, Eye, Puzzle, Skull, Zap
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
  'all-in-one': Crown,
};

const MODE_CONTENT: Record<string, {
  title: string;
  description: string;
  suggestions: string[];
  banner?: { text: string; type: 'warning' | 'info' | 'success' | 'danger' };
}> = {
  chat: {
    title: "Chat",
    description: "General-purpose AI conversation. Ask anything — code, ideas, questions, or just chat.",
    suggestions: ["Explain how async/await works in JavaScript", "Help me brainstorm project ideas", "What are the best practices for REST APIs?"],
  },
  'app-builder': {
    title: "App Builder",
    description: "Full-stack web app development with live preview, file tree, and code editor.",
    suggestions: ["Create a React dashboard with user analytics", "Build a landing page for a SaaS product", "Add authentication to this app"],
  },
  'embedded-iot': {
    title: "IoT / Embedded",
    description: "Write code for ESP32, Arduino, Raspberry Pi, and other microcontrollers.",
    suggestions: ["Create an ESP32 web server with sensor readings", "Build an Arduino LED controller with PWM", "Write MicroPython code for Raspberry Pi Pico"],
    banner: { text: 'Hardware-focused mode — specify your target board', type: 'info' },
  },
  'system-helper': {
    title: "System Helper",
    description: "Computer tasks, file management, and system automation.",
    suggestions: ["Clean up temporary files from my system", "Find large files taking up disk space", "Create a backup script for my documents"],
    banner: { text: 'Commands will be shown for review before execution', type: 'info' },
  },
  'ai-improvement': {
    title: "AI Improvement",
    description: "Analyze this development environment and suggest improvements.",
    suggestions: ["Analyze the current codebase for improvements", "Suggest new features for the IDE", "Propose UI/UX enhancements"],
  },
  learning: {
    title: "Learning Mode",
    description: "I'll observe your coding patterns, preferred libraries, and naming conventions.",
    suggestions: ["Show me what patterns you've learned", "Apply my usual folder structure to a new project", "Suggest libraries based on my preferences"],
    banner: { text: 'Actively learning your style preferences', type: 'success' },
  },
  sandbox: {
    title: "Sandbox",
    description: "Safe, isolated environment for experimentation.",
    suggestions: ["Let's experiment with a new framework", "Try an unconventional architecture pattern", "Test a risky code refactor safely"],
    banner: { text: 'Experimental — nothing here affects your real projects', type: 'info' },
  },
  jailbreak: {
    title: "Override Mode",
    description: "Advanced mode with custom system prompts. Your custom persona from Settings is active.",
    suggestions: ["Configure custom system prompts", "Override default AI behavior", "Set up specialized assistant persona"],
    banner: { text: '⚠ Custom system prompt active — use responsibly', type: 'danger' },
  },
  plugin: {
    title: "Plugin Mode",
    description: "Manage and create custom plugins and integrations.",
    suggestions: ["Browse available plugins", "Create a custom plugin", "Configure plugin settings"],
  },
  'all-in-one': {
    title: "All-in-One AI",
    description: "Unlimited capabilities. Build apps, manage systems, write IoT code, search the web — all at once.",
    suggestions: ["Build me a full-stack app and deploy it", "Scan my system and optimize it", "Create an IoT dashboard with real sensor data"],
    banner: { text: 'All capabilities unlocked — Kill Switch available', type: 'warning' },
  },
};

export function EmptyState({ mode = 'app-builder', modeKey }: EmptyStateProps) {
  const navigate = useNavigate();
  const key = modeKey || (mode === 'app-builder' ? 'chat' : mode);
  const content = MODE_CONTENT[key] || MODE_CONTENT.chat;
  const theme = getModeTheme(key);
  const Icon = MODE_ICONS[key] || MessageSquare;

  const WORKSPACE_ROUTES: Record<string, { route: string; label: string }> = {
    'app-builder': { route: '/ide', label: 'Open App Builder' },
    'embedded-iot': { route: '/iot', label: 'Open IoT Workspace' },
    'sandbox': { route: '/sandbox', label: 'Open Sandbox' },
    'ai-improvement': { route: '/improve', label: 'Open Improvement Workspace' },
  };

  const workspace = WORKSPACE_ROUTES[key];

  // System Helper: terminal-style
  if (key === 'system-helper') {
    return (
      <div className="flex flex-col h-full p-6 font-mono">
        <div className="rounded-xl p-5 mb-4 border border-amber-500/20 bg-amber-950/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-2 text-xs text-amber-400/60">system-helper — bash</span>
          </div>
          <div className="text-amber-300/90 text-sm space-y-1">
            <p><span className="text-amber-500">$</span> localdev --mode system-helper</p>
            <p className="text-amber-400/60">System Helper ready. Commands require approval.</p>
            <p><span className="text-amber-500">$</span> <span className="animate-pulse">_</span></p>
          </div>
        </div>
        <p className="text-sm text-amber-200/60 mb-4">{content.description}</p>
        <div className="space-y-2">
          {content.suggestions.map((s, i) => (
            <p key={i} className="text-sm text-amber-400/70 pl-4 border-l-2 border-amber-500/30 font-mono">
              <span className="text-amber-500 mr-2">$</span>{s}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // Learning Mode: dashboard-style
  if (key === 'learning') {
    return (
      <div className="flex flex-col h-full p-6">
        {content.banner && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4 text-sm font-medium border bg-green-500/10 border-green-500/20 text-green-400">
            <Brain className="w-4 h-4 shrink-0" />
            {content.banner.text}
          </div>
        )}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${theme.accent} / 0.25), hsl(${theme.accent} / 0.1))` }}>
            <GraduationCap className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">{content.title}</h2>
            <p className="text-xs text-muted-foreground">Adaptive learning active</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { icon: Code, label: 'Code Style', value: 'Analyzing...', color: 'text-green-400' },
            { icon: BookOpen, label: 'Libraries', value: '0 learned', color: 'text-emerald-400' },
            { icon: Eye, label: 'Patterns', value: 'Observing', color: 'text-teal-400' },
            { icon: Wrench, label: 'Conventions', value: 'Waiting', color: 'text-lime-400' },
          ].map((card, i) => (
            <div key={i} className="rounded-lg p-3 border border-green-500/15 bg-green-950/20">
              <card.icon className={cn("w-4 h-4 mb-1", card.color)} />
              <p className="text-xs font-medium text-green-200">{card.label}</p>
              <p className="text-[10px] text-green-400/60">{card.value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mb-3">Start coding and I'll learn your style:</p>
        <div className="space-y-2">
          {content.suggestions.map((s, i) => (
            <p key={i} className="text-sm text-green-400 italic pl-4 border-l-2 border-green-500/30">"{s}"</p>
          ))}
        </div>
      </div>
    );
  }

  // Jailbreak: danger zone
  if (key === 'jailbreak') {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4 text-sm font-medium border bg-red-500/10 border-red-500/30 text-red-400 animate-pulse">
          <Skull className="w-4 h-4 shrink-0" />
          ⚠ Custom system prompt active — use responsibly
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-red-500/30 bg-red-950/30">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-red-200">{content.title}</h2>
            <p className="text-xs text-red-400/60">Override Mode</p>
          </div>
        </div>
        <div className="rounded-xl p-4 mb-4 border border-dashed border-red-500/30 bg-red-950/10">
          <p className="text-sm text-red-200/70 mb-2">Your custom persona from Settings is active.</p>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
          >
            Edit Custom Prompt
          </Button>
        </div>
        <div className="space-y-2">
          {content.suggestions.map((s, i) => (
            <p key={i} className="text-sm text-red-400/70 italic pl-4 border-l-2 border-red-500/30">"{s}"</p>
          ))}
        </div>
      </div>
    );
  }

  // Plugin: marketplace grid
  if (key === 'plugin') {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${theme.accent} / 0.25), hsl(${theme.accent} / 0.1))` }}>
            <Plug className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">{content.title}</h2>
            <p className="text-xs text-muted-foreground">Extend LocalDev AI</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { icon: Puzzle, name: 'Code Formatter', desc: 'Auto-format code on save', installed: true },
            { icon: Zap, name: 'Quick Actions', desc: 'Keyboard shortcuts', installed: true },
            { icon: Brain, name: 'Smart Autocomplete', desc: 'AI-powered suggestions', installed: false },
            { icon: Shield, name: 'Security Scanner', desc: 'Find vulnerabilities', installed: false },
          ].map((p, i) => (
            <div key={i} className={cn("rounded-lg p-3 border", p.installed ? "border-blue-500/20 bg-blue-950/20" : "border-border bg-card/30")}>
              <p.icon className={cn("w-4 h-4 mb-1.5", p.installed ? "text-blue-400" : "text-muted-foreground")} />
              <p className="text-xs font-medium">{p.name}</p>
              <p className="text-[10px] text-muted-foreground">{p.desc}</p>
              <span className={cn("text-[9px] mt-1 inline-block", p.installed ? "text-blue-400" : "text-muted-foreground")}>
                {p.installed ? '✓ Installed' : 'Available'}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {content.suggestions.map((s, i) => (
            <p key={i} className="text-sm text-blue-400 italic pl-4 border-l-2 border-blue-500/30">"{s}"</p>
          ))}
        </div>
      </div>
    );
  }

  // All-in-One: power mode
  if (key === 'all-in-one') {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4 text-sm font-medium border bg-amber-500/10 border-amber-500/20 text-amber-400">
          <Crown className="w-4 h-4 shrink-0" />
          All capabilities unlocked — Kill Switch available
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(38,92%,50%,0.3), hsl(340,82%,52%,0.2), hsl(262,83%,58%,0.2))' }}>
            <Crown className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="font-bold text-xl bg-gradient-to-r from-amber-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">All-in-One AI</h2>
            <p className="text-xs text-muted-foreground">Every mode. Every tool. No limits.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: Layers, label: 'Build', color: 'text-purple-400' },
            { icon: Cpu, label: 'IoT', color: 'text-orange-400' },
            { icon: Terminal, label: 'System', color: 'text-amber-400' },
            { icon: Sparkles, label: 'Improve', color: 'text-pink-400' },
            { icon: FlaskConical, label: 'Sandbox', color: 'text-cyan-400' },
            { icon: GraduationCap, label: 'Learn', color: 'text-green-400' },
          ].map((cap, i) => (
            <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-card/30 border border-border/50">
              <cap.icon className={cn("w-3.5 h-3.5", cap.color)} />
              <span className="text-[10px] font-medium text-foreground/80">{cap.label}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {content.suggestions.map((s, i) => (
            <p key={i} className="text-sm italic pl-4 border-l-2" style={{ color: `hsl(${theme.accent})`, borderColor: `hsl(${theme.accent} / 0.3)` }}>"{s}"</p>
          ))}
        </div>
      </div>
    );
  }

  // Default layout for remaining modes (chat, app-builder, embedded-iot, sandbox, ai-improvement)
  return (
    <div className="flex flex-col h-full p-6">
      {content.banner && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-lg mb-4 text-sm font-medium border",
          content.banner.type === 'warning' && "bg-amber-500/10 border-amber-500/20 text-amber-400",
          content.banner.type === 'info' && "bg-accent/10 border-accent/20 text-accent",
          content.banner.type === 'success' && "bg-green-500/10 border-green-500/20 text-green-400",
          content.banner.type === 'danger' && "bg-red-500/10 border-red-500/20 text-red-400",
        )}>
          <Shield className="w-4 h-4 shrink-0" />
          {content.banner.text}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${theme.accent} / 0.25), hsl(${theme.accent} / 0.1))` }}>
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">{content.title}</h2>
          <p className="text-xs text-muted-foreground">{key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Mode</p>
        </div>
      </div>

      <div className="rounded-xl p-5 mb-6 border" style={{
        background: `linear-gradient(135deg, hsl(${theme.accent} / 0.06), hsl(${theme.accent} / 0.02))`,
        borderColor: `hsl(${theme.accent} / 0.12)`,
      }}>
        <p className="text-sm text-foreground mb-4">{content.description}</p>
        
        {workspace && (
          <Button
            onClick={() => navigate(workspace.route)}
            className="w-full mb-4 gap-2"
            style={{ background: `linear-gradient(135deg, hsl(${theme.accent}), hsl(${theme.accent} / 0.8))`, color: 'white' }}
          >
            <Icon className="w-4 h-4" />
            {workspace.label}
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
        )}
        
        <p className="text-sm text-muted-foreground mb-3">Try saying:</p>
        <div className="space-y-2">
          {content.suggestions.map((s, i) => (
            <p key={i} className="text-sm text-accent italic pl-4 border-l-2" style={{ borderColor: `hsl(${theme.accent} / 0.3)` }}>"{s}"</p>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <Volume2 className="w-4 h-4" />
        <span className="text-xs">Voice enabled</span>
      </div>
    </div>
  );
}
