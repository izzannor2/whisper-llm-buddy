// System commands for System Helper mode
// Commands are previewed and require confirmation before execution

import { generateId } from './ide-store';

export interface SystemCommand {
  id: string;
  command: string;
  description: string;
  category: 'file' | 'system' | 'network' | 'process' | 'cleanup';
  dangerous: boolean;
  platform: 'windows' | 'linux' | 'macos' | 'all';
  approved: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  createdAt: number;
}

// Common system commands by category
export const SYSTEM_COMMAND_TEMPLATES: Omit<SystemCommand, 'id' | 'approved' | 'status' | 'output' | 'error' | 'createdAt'>[] = [
  // Cleanup commands
  {
    command: 'del /q/f/s %TEMP%\\*',
    description: 'Clean temporary files (Windows)',
    category: 'cleanup',
    dangerous: false,
    platform: 'windows',
  },
  {
    command: 'rm -rf /tmp/*',
    description: 'Clean temporary files (Linux/macOS)',
    category: 'cleanup',
    dangerous: false,
    platform: 'linux',
  },
  {
    command: 'npm cache clean --force',
    description: 'Clear npm cache',
    category: 'cleanup',
    dangerous: false,
    platform: 'all',
  },
  // System info
  {
    command: 'systeminfo',
    description: 'Display system information (Windows)',
    category: 'system',
    dangerous: false,
    platform: 'windows',
  },
  {
    command: 'uname -a && df -h && free -h',
    description: 'Display system information (Linux)',
    category: 'system',
    dangerous: false,
    platform: 'linux',
  },
  // Process management
  {
    command: 'tasklist',
    description: 'List running processes (Windows)',
    category: 'process',
    dangerous: false,
    platform: 'windows',
  },
  {
    command: 'ps aux',
    description: 'List running processes (Linux/macOS)',
    category: 'process',
    dangerous: false,
    platform: 'linux',
  },
  // Network
  {
    command: 'netstat -an',
    description: 'Show network connections',
    category: 'network',
    dangerous: false,
    platform: 'all',
  },
  {
    command: 'ipconfig /all',
    description: 'Show network configuration (Windows)',
    category: 'network',
    dangerous: false,
    platform: 'windows',
  },
  {
    command: 'ifconfig',
    description: 'Show network configuration (Linux/macOS)',
    category: 'network',
    dangerous: false,
    platform: 'linux',
  },
  // File operations (dangerous)
  {
    command: 'rm -rf',
    description: 'Delete files/folders recursively',
    category: 'file',
    dangerous: true,
    platform: 'linux',
  },
  {
    command: 'del /s /q',
    description: 'Delete files/folders recursively (Windows)',
    category: 'file',
    dangerous: true,
    platform: 'windows',
  },
];

export function createSystemCommand(
  command: string,
  description: string,
  category: SystemCommand['category'] = 'system',
  dangerous: boolean = false
): SystemCommand {
  return {
    id: generateId(),
    command,
    description,
    category,
    dangerous,
    platform: 'all',
    approved: false,
    status: 'pending',
    createdAt: Date.now(),
  };
}

export function parseCommandFromAIResponse(response: string): SystemCommand[] {
  const commands: SystemCommand[] = [];
  
  // Look for code blocks with shell/bash/cmd
  const codeBlockRegex = /```(?:bash|shell|cmd|powershell|sh)?\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const commandBlock = match[1].trim();
    const lines = commandBlock.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    for (const line of lines) {
      const cmd = line.trim();
      if (cmd) {
        const dangerous = isDangerousCommand(cmd);
        commands.push(createSystemCommand(
          cmd,
          `Command from AI: ${cmd.substring(0, 50)}...`,
          categorizeCommand(cmd),
          dangerous
        ));
      }
    }
  }
  
  return commands;
}

function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /rm\s+-rf/i,
    /del\s+\/s/i,
    /format\s+/i,
    /mkfs/i,
    /dd\s+if=/i,
    />\s*\/dev\//i,
    /chmod\s+777/i,
    /shutdown/i,
    /reboot/i,
    /kill\s+-9/i,
    /taskkill\s+\/f/i,
    /reg\s+delete/i,
    /netsh\s+/i,
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(command));
}

function categorizeCommand(command: string): SystemCommand['category'] {
  const cmd = command.toLowerCase();
  
  if (/^(rm|del|cp|mv|mkdir|touch|cat|ls|dir|find|grep)/.test(cmd)) return 'file';
  if (/^(ps|top|kill|tasklist|taskkill)/.test(cmd)) return 'process';
  if (/^(ping|curl|wget|netstat|ifconfig|ipconfig|ssh|scp)/.test(cmd)) return 'network';
  if (/^(apt|brew|yum|npm|pip|choco)/.test(cmd)) return 'system';
  if (/clean|cache|temp|tmp/.test(cmd)) return 'cleanup';
  
  return 'system';
}

// Execute via the real local agent (port 3847). If unavailable, return an
// honest "PREVIEW ONLY — NOT EXECUTED" failed status. Never mark as completed
// if nothing actually ran.
import { executeCommand as agentExec, getAgentStatus, checkAgentStatus } from './local-backend-agent';

export async function executeCommand(command: SystemCommand): Promise<SystemCommand> {
  let status = getAgentStatus();
  if (!status.connected) {
    // One quick check in case the agent came online since the last poll
    status = await checkAgentStatus();
  }

  if (!status.connected) {
    return {
      ...command,
      status: 'failed',
      output: 'PREVIEW ONLY — NOT EXECUTED. Local agent not connected (port 3847).',
      error: 'Local agent not connected',
    };
  }

  const result = await agentExec(command.command);
  return {
    ...command,
    status: result.success ? 'completed' : 'failed',
    output: result.output,
    error: result.error,
  };
}
