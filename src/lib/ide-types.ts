// IDE Types and Interfaces

export type IDEMode = 
  | 'app-builder'
  | 'embedded-iot'
  | 'system-helper'
  | 'ai-improvement'
  | 'learning'
  | 'jailbreak'
  | 'plugin'
  | 'sandbox';

export type ConnectionMode = 'offline' | 'online-research' | 'updating';

export type LLMBackend = 'ollama' | 'llama-cpp';

export interface IDESettings {
  mode: IDEMode;
  connectionMode: ConnectionMode;
  theme: 'dark' | 'light';
  accentColor: string;
  fontSize: number;
  // LLM Backend selection
  llmBackend: LLMBackend;
  // Ollama settings
  ollamaUrl: string;
  selectedModel: string;
  // Llama.cpp settings
  llamaCppUrl: string;
  llamaCppModel: string;
  llamaCppContextSize: number;
  llamaCppThreads: number;
  llamaCppGpuLayers: number;
  autoSave: boolean;
  voiceEnabled: boolean;
  pushToTalkKey: string;
  // Embedded/IoT settings
  boardType: string;
  serialPort: string;
  buildCommand: string;
  flashCommand: string;
  // Learning mode
  preferredFramework: string;
  namingConvention: 'camelCase' | 'snake_case' | 'kebab-case';
  folderStructure: 'flat' | 'feature-based' | 'domain-driven';
  // Jailbreak
  jailbreakPrompt: string;
  jailbreakEnabled: boolean;
  // Auto-open Debug tab on preview errors
  autoOpenDebugOnError: boolean;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirectory: boolean;
  children?: ProjectFile[];
  isOpen?: boolean;
  isModified?: boolean;
}

export interface Project {
  id: string;
  name: string;
  framework: 'react' | 'vue' | 'svelte' | 'astro' | 'nextjs' | 'vite' | 'arduino' | 'esp32' | 'raspberrypi';
  files: ProjectFile[];
  createdAt: number;
  updatedAt: number;
  settings?: Partial<IDESettings>;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  commands: PluginCommand[];
  configSchema?: Record<string, any>;
  config?: Record<string, any>;
}

export interface PluginCommand {
  name: string;
  description: string;
  endpoint?: string;
  script?: string;
  parameters?: Record<string, string>;
}

export interface DevServer {
  isRunning: boolean;
  port: number;
  url: string;
  logs: string[];
  errors: string[];
}

export interface SystemCommand {
  id: string;
  command: string;
  description: string;
  dangerous: boolean;
  approved: boolean;
  output?: string;
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed';
}

export const DEFAULT_SETTINGS: IDESettings = {
  mode: 'app-builder',
  connectionMode: 'offline',
  theme: 'dark',
  accentColor: 'purple',
  fontSize: 14,
  llmBackend: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  selectedModel: 'llama3.2',
  llamaCppUrl: 'http://127.0.0.1:8081',
  llamaCppModel: '',
  llamaCppContextSize: 4096,
  llamaCppThreads: 4,
  llamaCppGpuLayers: 0,
  autoSave: true,
  voiceEnabled: true,
  pushToTalkKey: 'Space',
  boardType: 'esp32',
  serialPort: 'COM3',
  buildCommand: 'platformio run',
  flashCommand: 'platformio run --target upload',
  preferredFramework: 'react',
  namingConvention: 'camelCase',
  folderStructure: 'feature-based',
  jailbreakPrompt: '',
  jailbreakEnabled: false,
  autoOpenDebugOnError: true,
};

export const FRAMEWORKS = [
  { id: 'react', name: 'React + Vite', icon: '⚛️', language: 'typescript' },
  { id: 'vue', name: 'Vue 3', icon: '💚', language: 'typescript' },
  { id: 'svelte', name: 'Svelte', icon: '🔥', language: 'typescript' },
  { id: 'astro', name: 'Astro', icon: '🚀', language: 'typescript' },
  { id: 'nextjs', name: 'Next.js', icon: '▲', language: 'typescript' },
  { id: 'vite', name: 'Vanilla + Vite', icon: '⚡', language: 'javascript' },
  { id: 'arduino', name: 'Arduino', icon: '🔌', language: 'cpp' },
  { id: 'esp32', name: 'ESP32', icon: '📡', language: 'cpp' },
  { id: 'raspberrypi', name: 'Raspberry Pi', icon: '🍓', language: 'python' },
] as const;

export const BOARD_TYPES = [
  { id: 'esp32', name: 'ESP32', description: 'WiFi + Bluetooth MCU' },
  { id: 'esp32-s3', name: 'ESP32-S3', description: 'AI + Camera support' },
  { id: 'esp8266', name: 'ESP8266', description: 'WiFi MCU' },
  { id: 'arduino-uno', name: 'Arduino Uno', description: 'ATmega328P' },
  { id: 'arduino-nano', name: 'Arduino Nano', description: 'Compact ATmega328P' },
  { id: 'arduino-mega', name: 'Arduino Mega', description: 'ATmega2560' },
  { id: 'rpi-pico', name: 'Raspberry Pi Pico', description: 'RP2040' },
  { id: 'rpi-zero', name: 'Raspberry Pi Zero', description: 'Linux SBC' },
  { id: 'rpi-4', name: 'Raspberry Pi 4', description: 'Full Linux SBC' },
] as const;

export const MODE_INFO: Record<IDEMode, { name: string; icon: string; description: string }> = {
  'app-builder': {
    name: 'App Builder',
    icon: '🏗️',
    description: 'Build full-stack web apps, dashboards, and landing pages',
  },
  'embedded-iot': {
    name: 'Embedded / IoT',
    icon: '📡',
    description: 'Generate code for ESP32, Arduino, and Raspberry Pi',
  },
  'system-helper': {
    name: 'System Helper',
    icon: '🖥️',
    description: 'Run system tasks with confirmation before execution',
  },
  'ai-improvement': {
    name: 'AI Improvement',
    icon: '🧠',
    description: 'Propose upgrades to this environment itself',
  },
  'learning': {
    name: 'Learning Mode',
    icon: '📚',
    description: 'Learn your coding style and preferences over time',
  },
  'jailbreak': {
    name: 'Override / Jailbreak',
    icon: '⚠️',
    description: 'Apply custom system prompts (advanced/unsafe)',
  },
  'plugin': {
    name: 'Plugin Mode',
    icon: '🔌',
    description: 'Manage and use custom plugins and integrations',
  },
  'sandbox': {
    name: 'Sandbox Mode',
    icon: '🧪',
    description: 'Safe isolated environment for experiments',
  },
};
