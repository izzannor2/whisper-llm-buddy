// Tool Learning System — tracks tool usage, success rates, and reliability

const STORAGE_KEY = 'localdev-tool-learning';

export interface ToolStats {
  name: string;
  callCount: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  lastUsed: number;
  failureReasons: string[];
}

function loadStats(): Record<string, ToolStats> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveStats(stats: Record<string, ToolStats>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function recordToolUse(name: string, success: boolean, duration: number, error?: string): void {
  const stats = loadStats();
  if (!stats[name]) {
    stats[name] = { name, callCount: 0, successCount: 0, failureCount: 0, totalDuration: 0, lastUsed: 0, failureReasons: [] };
  }
  const s = stats[name];
  s.callCount++;
  if (success) s.successCount++;
  else {
    s.failureCount++;
    if (error) s.failureReasons = [...s.failureReasons.slice(-9), error];
  }
  s.totalDuration += duration;
  s.lastUsed = Date.now();
  saveStats(stats);
}

export function getToolStats(): ToolStats[] {
  return Object.values(loadStats()).sort((a, b) => b.callCount - a.callCount);
}

export function getToolReliability(name: string): number {
  const stats = loadStats();
  const s = stats[name];
  if (!s || s.callCount === 0) return 1; // Unknown tools get benefit of doubt
  return s.successCount / s.callCount;
}

export function getToolAvgDuration(name: string): number {
  const stats = loadStats();
  const s = stats[name];
  if (!s || s.callCount === 0) return 0;
  return s.totalDuration / s.callCount;
}

export function getBestToolForTask(toolNames: string[]): string | null {
  if (toolNames.length === 0) return null;
  const stats = loadStats();
  return toolNames.sort((a, b) => {
    const ra = getToolReliability(a);
    const rb = getToolReliability(b);
    if (Math.abs(ra - rb) > 0.1) return rb - ra;
    return (stats[a]?.callCount || 0) - (stats[b]?.callCount || 0);
  })[0];
}

export function getToolLearningHints(): string {
  const allStats = getToolStats();
  if (allStats.length === 0) return '';
  const hints = allStats
    .filter(s => s.callCount >= 3)
    .map(s => {
      const rate = ((s.successCount / s.callCount) * 100).toFixed(0);
      const avg = (s.totalDuration / s.callCount / 1000).toFixed(1);
      return `- ${s.name}: ${rate}% success, ~${avg}s avg`;
    });
  if (hints.length === 0) return '';
  return `\n## Tool Reliability\n${hints.join('\n')}\n`;
}

export function clearToolStats(): void {
  localStorage.removeItem(STORAGE_KEY);
}
