// Hook for using OpenClaw agent in components

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  OpenClawState,
  OpenClawConfig,
  getOpenClawState,
  onStateChange,
  initOpenClaw,
  shutdownOpenClaw,
  chatWithOpenClaw,
  executeWithLogging,
  readFileWithLogging,
  writeFileWithLogging,
  getSuggestions,
  getRecentLogs,
  updateConfig,
  setMurmurCallback,
} from '@/lib/openclaw-agent';
import { ActionLog } from '@/lib/openclaw-store';
import { ChatMessage } from '@/lib/ollama-client';

export interface UseOpenClawReturn {
  state: OpenClawState;
  logs: ActionLog[];
  murmur: string;
  history: ChatMessage[];
  streamingContent: string;
  suggestions: string[];
  
  // Actions
  init: (config?: Partial<OpenClawConfig>) => Promise<boolean>;
  shutdown: () => void;
  chat: (message: string) => Promise<void>;
  execute: (command: string) => Promise<{ success: boolean; output: string }>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string, reason?: string) => Promise<void>;
  updateSuggestions: (prefix: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
  setConfig: (config: Partial<OpenClawConfig>) => void;
  clearHistory: () => void;
}

export function useOpenClaw(): UseOpenClawReturn {
  const [state, setState] = useState<OpenClawState>(getOpenClawState());
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [murmur, setMurmur] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = onStateChange(setState);
    return unsubscribe;
  }, []);

  // Set up murmur callback
  useEffect(() => {
    setMurmurCallback((msg) => {
      setMurmur(msg);
      // Clear after 5 seconds
      setTimeout(() => setMurmur(''), 5000);
    });
  }, []);

  // Initialize
  const init = useCallback(async (config?: Partial<OpenClawConfig>) => {
    const success = await initOpenClaw(config);
    if (success) {
      await refreshLogs();
    }
    return success;
  }, []);

  // Shutdown
  const shutdown = useCallback(() => {
    shutdownOpenClaw();
    setHistory([]);
    setStreamingContent('');
  }, []);

  // Chat
  const chat = useCallback(async (message: string) => {
    // Add user message to history
    const userMessage: ChatMessage = { role: 'user', content: message };
    setHistory(prev => [...prev, userMessage]);
    setStreamingContent('');

    let fullResponse = '';
    
    try {
      for await (const chunk of chatWithOpenClaw(message, history)) {
        fullResponse += chunk;
        setStreamingContent(fullResponse);
      }

      // Add assistant response to history
      const assistantMessage: ChatMessage = { role: 'assistant', content: fullResponse };
      setHistory(prev => [...prev, assistantMessage]);
      setStreamingContent('');
      
      // Refresh logs
      await refreshLogs();
    } catch (error) {
      console.error('Chat error:', error);
      setStreamingContent('');
    }
  }, [history]);

  // Execute command
  const execute = useCallback(async (command: string) => {
    const result = await executeWithLogging(command);
    await refreshLogs();
    return result;
  }, []);

  // Read file
  const readFile = useCallback(async (path: string) => {
    const content = await readFileWithLogging(path);
    await refreshLogs();
    return content;
  }, []);

  // Write file
  const writeFile = useCallback(async (path: string, content: string, reason?: string) => {
    await writeFileWithLogging(path, content, reason);
    await refreshLogs();
  }, []);

  // Update suggestions
  const updateSuggestions = useCallback(async (prefix: string) => {
    if (prefix.length >= 2) {
      const results = await getSuggestions(prefix);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  }, []);

  // Refresh logs
  const refreshLogs = useCallback(async () => {
    const recentLogs = await getRecentLogs(50);
    setLogs(recentLogs);
  }, []);

  // Set config
  const setConfig = useCallback((config: Partial<OpenClawConfig>) => {
    updateConfig(config);
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setStreamingContent('');
  }, []);

  return {
    state,
    logs,
    murmur,
    history,
    streamingContent,
    suggestions,
    
    init,
    shutdown,
    chat,
    execute,
    readFile,
    writeFile,
    updateSuggestions,
    refreshLogs,
    setConfig,
    clearHistory,
  };
}
