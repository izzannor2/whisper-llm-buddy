import { Sparkles, Volume2 } from 'lucide-react';
import { IDEMode } from '@/lib/ide-types';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  mode?: IDEMode;
}

const MODE_CONTENT: Record<IDEMode, {
  title: string;
  description: string;
  suggestions: string[];
}> = {
  'app-builder': {
    title: "LocalDev AI",
    description: "I'm your AI development assistant. Describe what you'd like to build, and I'll generate the code for you.",
    suggestions: [
      "Create a React dashboard with user analytics",
      "Build a landing page for a SaaS product",
      "Add authentication to this app",
    ],
  },
  'embedded-iot': {
    title: "IoT / Embedded Mode",
    description: "I'll help you write code for ESP32, Arduino, Raspberry Pi, and other microcontrollers.",
    suggestions: [
      "Create an ESP32 web server with sensor readings",
      "Build an Arduino LED controller with PWM",
      "Write MicroPython code for Raspberry Pi Pico",
    ],
  },
  'system-helper': {
    title: "System Helper",
    description: "I can help with computer tasks, file management, and system automation. All commands require your approval first.",
    suggestions: [
      "Clean up temporary files from my system",
      "Find large files taking up disk space",
      "Create a backup script for my documents",
    ],
  },
  'ai-improvement': {
    title: "AI Improvement Mode",
    description: "I can analyze this development environment and suggest improvements, new features, or optimizations.",
    suggestions: [
      "Analyze the current codebase for improvements",
      "Suggest new features for the IDE",
      "Propose UI/UX enhancements",
    ],
  },
  'learning': {
    title: "Learning Mode",
    description: "I'll observe your coding patterns, preferred libraries, and naming conventions to better assist you over time.",
    suggestions: [
      "Show me what patterns you've learned",
      "Apply my usual folder structure to a new project",
      "Suggest libraries based on my preferences",
    ],
  },
  'sandbox': {
    title: "Sandbox Mode",
    description: "This is a safe, isolated environment for experimentation. Try unconventional approaches without affecting your main projects.",
    suggestions: [
      "Let's experiment with a new framework",
      "Try an unconventional architecture pattern",
      "Test a risky code refactor safely",
    ],
  },
  'jailbreak': {
    title: "Override Mode",
    description: "Advanced mode for custom system prompts. Use with caution.",
    suggestions: [
      "Configure custom system prompts",
      "Override default AI behavior",
      "Set up specialized assistant persona",
    ],
  },
  'plugin': {
    title: "Plugin Mode",
    description: "Manage and use custom plugins and integrations to extend functionality.",
    suggestions: [
      "Browse available plugins",
      "Create a custom plugin",
      "Configure plugin settings",
    ],
  },
};

export function EmptyState({ mode = 'app-builder' }: EmptyStateProps) {
  const content = MODE_CONTENT[mode];

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header with mode indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="font-semibold">{content.title} Assistant</h2>
          <p className="text-xs text-muted-foreground">{mode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Mode</p>
        </div>
      </div>

      {/* Welcome message */}
      <div className="bg-muted/30 rounded-lg p-4 mb-6">
        <p className="text-sm text-foreground mb-4">
          Welcome to <span className="text-accent font-medium">{content.title}</span>! {content.description}
        </p>
        
        <p className="text-sm text-muted-foreground mb-3">Try saying something like:</p>
        
        <div className="space-y-2">
          {content.suggestions.map((suggestion, index) => (
            <p key={index} className="text-sm text-accent italic pl-4">
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
