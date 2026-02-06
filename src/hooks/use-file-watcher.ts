// File watcher hook - monitors external changes and auto-syncs

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentDirectory, listFiles, readFile } from '@/lib/file-system';
import { createBackup } from '@/lib/openclaw-store';

interface WatchedFile {
  path: string;
  lastModified: number;
  size: number;
}

interface FileChange {
  path: string;
  type: 'modified' | 'added' | 'deleted';
  timestamp: number;
}

export interface UseFileWatcherReturn {
  isWatching: boolean;
  changes: FileChange[];
  watchedFiles: number;
  lastCheck: number | null;
  startWatching: () => void;
  stopWatching: () => void;
  clearChanges: () => void;
  refreshNow: () => Promise<void>;
}

export function useFileWatcher(options: {
  autoBackup?: boolean;
  pollInterval?: number;
  onFileChange?: (change: FileChange) => void;
} = {}): UseFileWatcherReturn {
  const {
    autoBackup = true,
    pollInterval = 2000,
    onFileChange,
  } = options;

  const [isWatching, setIsWatching] = useState(false);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [watchedFiles, setWatchedFiles] = useState(0);
  const [lastCheck, setLastCheck] = useState<number | null>(null);

  const fileCache = useRef<Map<string, WatchedFile>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scan directory recursively
  const scanDirectory = useCallback(async (
    path: string = '',
    depth: number = 0,
    maxDepth: number = 5
  ): Promise<WatchedFile[]> => {
    if (depth > maxDepth) return [];

    const files: WatchedFile[] = [];
    const currentDir = getCurrentDirectory();
    if (!currentDir) return [];

    try {
      const entries = await listFiles(undefined, path);

      for (const entry of entries) {
        if (entry.isDirectory) {
          // Skip node_modules and hidden directories
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const subFiles = await scanDirectory(entry.path, depth + 1, maxDepth);
          files.push(...subFiles);
        } else {
          // Get file info
          try {
            const content = await readFile(entry.path);
            files.push({
              path: entry.path,
              lastModified: Date.now(), // File System Access API doesn't give us mtime
              size: content.length,
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch (error) {
      console.error('Error scanning directory:', error);
    }

    return files;
  }, []);

  // Check for changes
  const checkForChanges = useCallback(async () => {
    const currentDir = getCurrentDirectory();
    if (!currentDir) return;

    const currentFiles = await scanDirectory();
    const newChanges: FileChange[] = [];
    const currentPaths = new Set<string>();

    for (const file of currentFiles) {
      currentPaths.add(file.path);
      const cached = fileCache.current.get(file.path);

      if (!cached) {
        // New file
        newChanges.push({
          path: file.path,
          type: 'added',
          timestamp: Date.now(),
        });
      } else if (cached.size !== file.size) {
        // Modified file
        newChanges.push({
          path: file.path,
          type: 'modified',
          timestamp: Date.now(),
        });

        // Auto-backup before acknowledging change
        if (autoBackup) {
          try {
            const content = await readFile(file.path);
            await createBackup(file.path, content, 'External modification detected');
          } catch {
            // Backup failed, continue
          }
        }
      }

      fileCache.current.set(file.path, file);
    }

    // Check for deleted files
    for (const cachedPath of fileCache.current.keys()) {
      if (!currentPaths.has(cachedPath)) {
        newChanges.push({
          path: cachedPath,
          type: 'deleted',
          timestamp: Date.now(),
        });
        fileCache.current.delete(cachedPath);
      }
    }

    // Notify about changes
    if (newChanges.length > 0) {
      setChanges(prev => [...prev, ...newChanges]);
      newChanges.forEach(change => onFileChange?.(change));
    }

    setWatchedFiles(currentFiles.length);
    setLastCheck(Date.now());
  }, [scanDirectory, autoBackup, onFileChange]);

  // Refresh now
  const refreshNow = useCallback(async () => {
    await checkForChanges();
  }, [checkForChanges]);

  // Start watching
  const startWatching = useCallback(() => {
    if (isWatching) return;

    setIsWatching(true);
    
    // Initial scan
    checkForChanges();

    // Start polling
    intervalRef.current = setInterval(checkForChanges, pollInterval);
  }, [isWatching, checkForChanges, pollInterval]);

  // Stop watching
  const stopWatching = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsWatching(false);
  }, []);

  // Clear changes
  const clearChanges = useCallback(() => {
    setChanges([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isWatching,
    changes,
    watchedFiles,
    lastCheck,
    startWatching,
    stopWatching,
    clearChanges,
    refreshNow,
  };
}
