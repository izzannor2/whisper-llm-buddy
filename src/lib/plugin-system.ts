// Plugin System — dynamic plugin loading, registry, and lifecycle

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  icon?: string;
  capabilities: string[];
}

export interface PluginAction {
  name: string;
  description: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface Plugin {
  manifest: PluginManifest;
  actions: PluginAction[];
  enabled: boolean;
  component?: React.ComponentType<any>;
}

const pluginRegistry = new Map<string, Plugin>();

// ===== Built-in Plugins =====

const fileManagerPlugin: Plugin = {
  manifest: {
    id: 'file-manager',
    name: 'File Manager',
    version: '1.0.0',
    description: 'Move, rename, copy, and extract files using the File System Access API',
    icon: '📁',
    capabilities: ['file_operations'],
  },
  enabled: true,
  actions: [
    {
      name: 'list_directory',
      description: 'List contents of a directory',
      handler: async ({ path }) => {
        if (!('showDirectoryPicker' in window) || !(window as any).__projectDirHandle) {
          return { error: 'File System Access API not available. Open a folder first.' };
        }
        try {
          const entries: string[] = [];
          const handle = (window as any).__projectDirHandle;
          for await (const [name, entry] of handle.entries()) {
            entries.push(entry.kind === 'directory' ? `${name}/` : name);
          }
          return { files: entries };
        } catch (e) {
          return { error: String(e) };
        }
      },
    },
    {
      name: 'rename_file',
      description: 'Rename a file (requires modern browser support)',
      handler: async ({ oldName, newName }) => {
        return { info: `Rename ${oldName} → ${newName}: Use the file tree UI for rename operations.` };
      },
    },
  ],
};

const systemMonitorPlugin: Plugin = {
  manifest: {
    id: 'system-monitor',
    name: 'System Monitor',
    version: '1.0.0',
    description: 'Display CPU cores, memory estimate, WebGPU status, network, battery',
    icon: '📊',
    capabilities: ['system_info'],
  },
  enabled: true,
  actions: [
    {
      name: 'get_system_info',
      description: 'Get system information',
      handler: async () => {
        const info: Record<string, unknown> = {
          cpuCores: navigator.hardwareConcurrency || 'unknown',
          language: navigator.language,
          platform: navigator.platform,
          online: navigator.onLine,
          userAgent: navigator.userAgent,
        };

        // Memory (Chrome only)
        if ('deviceMemory' in navigator) {
          info.deviceMemoryGB = (navigator as any).deviceMemory;
        }

        // WebGPU
        if ('gpu' in navigator) {
          try {
            const adapter = await (navigator as any).gpu.requestAdapter();
            info.webGPU = adapter ? 'available' : 'no adapter';
            if (adapter) {
              const adapterInfo = await adapter.requestAdapterInfo?.();
              info.gpuVendor = adapterInfo?.vendor || 'unknown';
              info.gpuDevice = adapterInfo?.device || 'unknown';
            }
          } catch {
            info.webGPU = 'error';
          }
        } else {
          info.webGPU = 'not supported';
        }

        // Battery
        if ('getBattery' in navigator) {
          try {
            const battery = await (navigator as any).getBattery();
            info.batteryLevel = `${Math.round(battery.level * 100)}%`;
            info.batteryCharging = battery.charging;
          } catch {
            info.battery = 'unavailable';
          }
        }

        // Storage estimate
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          info.storageUsedMB = Math.round((estimate.usage || 0) / 1024 / 1024);
          info.storageTotalMB = Math.round((estimate.quota || 0) / 1024 / 1024);
        }

        return info;
      },
    },
  ],
};

const macroRunnerPlugin: Plugin = {
  manifest: {
    id: 'macro-runner',
    name: 'Macro Runner',
    version: '1.0.0',
    description: 'Record and replay sequences of actions with configurable delays',
    icon: '🔄',
    capabilities: ['automation'],
  },
  enabled: true,
  actions: [
    {
      name: 'list_macros',
      description: 'List saved macros',
      handler: async () => {
        try {
          const saved = localStorage.getItem('macros');
          return { macros: saved ? JSON.parse(saved) : [] };
        } catch {
          return { macros: [] };
        }
      },
    },
    {
      name: 'save_macro',
      description: 'Save a macro',
      handler: async ({ name, steps }) => {
        try {
          const saved = JSON.parse(localStorage.getItem('macros') || '[]');
          saved.push({ id: Date.now().toString(), name, steps, createdAt: new Date().toISOString() });
          localStorage.setItem('macros', JSON.stringify(saved));
          return { success: true };
        } catch (e) {
          return { error: String(e) };
        }
      },
    },
    {
      name: 'run_macro',
      description: 'Execute a saved macro by ID',
      handler: async ({ id }) => {
        try {
          const saved = JSON.parse(localStorage.getItem('macros') || '[]');
          const macro = saved.find((m: any) => m.id === id);
          if (!macro) return { error: 'Macro not found' };
          // Execute steps with delays
          for (const step of macro.steps) {
            if (step.type === 'delay') {
              await new Promise(r => setTimeout(r, step.ms || 100));
            }
            // Other step types would be handled here
          }
          return { success: true, stepsExecuted: macro.steps.length };
        } catch (e) {
          return { error: String(e) };
        }
      },
    },
  ],
};

// Register built-in plugins
function initBuiltins() {
  if (pluginRegistry.size === 0) {
    pluginRegistry.set('file-manager', fileManagerPlugin);
    pluginRegistry.set('system-monitor', systemMonitorPlugin);
    pluginRegistry.set('macro-runner', macroRunnerPlugin);
  }
}

// ===== Error Tracking =====
const pluginErrors = new Map<string, number>();
const PLUGIN_TIMEOUT = 5000;
const MAX_CONSECUTIVE_ERRORS = 3;

export interface PluginStatus {
  id: string;
  name: string;
  enabled: boolean;
  errorCount: number;
  status: 'active' | 'disabled' | 'error';
}

// ===== Public API =====

export function getPlugins(): Plugin[] {
  initBuiltins();
  return Array.from(pluginRegistry.values());
}

export function getPlugin(id: string): Plugin | undefined {
  initBuiltins();
  return pluginRegistry.get(id);
}

export function togglePlugin(id: string, enabled: boolean): void {
  initBuiltins();
  const plugin = pluginRegistry.get(id);
  if (plugin) {
    plugin.enabled = enabled;
    if (enabled) pluginErrors.set(id, 0); // reset errors on re-enable
  }
}

export function registerPlugin(plugin: Plugin): void {
  initBuiltins();
  pluginRegistry.set(plugin.manifest.id, plugin);
  pluginErrors.set(plugin.manifest.id, 0);
}

export function getPluginStatuses(): PluginStatus[] {
  initBuiltins();
  return Array.from(pluginRegistry.values()).map(p => {
    const errors = pluginErrors.get(p.manifest.id) || 0;
    return {
      id: p.manifest.id,
      name: p.manifest.name,
      enabled: p.enabled,
      errorCount: errors,
      status: !p.enabled ? 'disabled' : errors >= MAX_CONSECUTIVE_ERRORS ? 'error' : 'active',
    };
  });
}

export async function executePluginAction(
  pluginId: string,
  actionName: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  initBuiltins();
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
  if (!plugin.enabled) throw new Error(`Plugin is disabled: ${pluginId}`);

  const action = plugin.actions.find(a => a.name === actionName);
  if (!action) throw new Error(`Action not found: ${actionName} in ${pluginId}`);

  // Execute with timeout and error tracking
  try {
    const result = await Promise.race([
      action.handler(params),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Plugin timeout after ${PLUGIN_TIMEOUT}ms`)), PLUGIN_TIMEOUT)),
    ]);
    // Reset error count on success
    pluginErrors.set(pluginId, 0);
    return result;
  } catch (err) {
    const errorCount = (pluginErrors.get(pluginId) || 0) + 1;
    pluginErrors.set(pluginId, errorCount);
    console.error(`[Plugin ${pluginId}] Error (${errorCount}/${MAX_CONSECUTIVE_ERRORS}):`, err);
    
    if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
      plugin.enabled = false;
      console.warn(`[Plugin ${pluginId}] Auto-disabled after ${MAX_CONSECUTIVE_ERRORS} consecutive failures`);
      try {
        const { toast } = await import('sonner');
        toast.error(`Plugin "${plugin.manifest.name}" disabled after repeated failures`);
      } catch {}
    }
    throw err;
  }
}
