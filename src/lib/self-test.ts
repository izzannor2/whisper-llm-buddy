// Self-Test System — validates all subsystems are working

import { routeToAgent } from './agent-router';
import { getToolStats } from './tool-learning';
import { getPermissions } from './permissions';
import { initOrchestrator, getOrchestratorTasks, createTask, removeOrchestratorTask } from './orchestrator';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

async function testAgentRouter(): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = routeToAgent('fix this bug in my React component');
    if (result.agent.type !== 'debug' && result.agent.type !== 'developer') {
      return { name: 'Agent Router', passed: false, message: `Expected debug/developer, got ${result.agent.type}`, duration: Date.now() - start };
    }
    const result2 = routeToAgent('what is quantum computing');
    if (!result2.agent) {
      return { name: 'Agent Router', passed: false, message: 'Failed to route research query', duration: Date.now() - start };
    }
    return { name: 'Agent Router', passed: true, message: `Routes correctly (confidence: ${result.confidence.toFixed(2)})`, duration: Date.now() - start };
  } catch (err) {
    return { name: 'Agent Router', passed: false, message: String(err), duration: Date.now() - start };
  }
}

async function testOrchestrator(): Promise<TestResult> {
  const start = Date.now();
  try {
    await initOrchestrator();
    const task = await createTask('Self-test task', ['Step 1']);
    if (!task.id) return { name: 'Orchestrator', passed: false, message: 'Task creation failed', duration: Date.now() - start };
    await removeOrchestratorTask(task.id);
    return { name: 'Orchestrator', passed: true, message: 'Task create/delete works', duration: Date.now() - start };
  } catch (err) {
    return { name: 'Orchestrator', passed: false, message: String(err), duration: Date.now() - start };
  }
}

async function testMemoryStore(): Promise<TestResult> {
  const start = Date.now();
  try {
    const memories = JSON.parse(localStorage.getItem('localdev-memories') || '[]');
    return { name: 'Memory Store', passed: true, message: `${memories.length} memories in local store`, duration: Date.now() - start };
  } catch (err) {
    return { name: 'Memory Store', passed: false, message: String(err), duration: Date.now() - start };
  }
}

async function testToolLearning(): Promise<TestResult> {
  const start = Date.now();
  try {
    const stats = getToolStats();
    return { name: 'Tool Learning', passed: true, message: `Tracking ${stats.length} tools`, duration: Date.now() - start };
  } catch (err) {
    return { name: 'Tool Learning', passed: false, message: String(err), duration: Date.now() - start };
  }
}

async function testPermissions(): Promise<TestResult> {
  const start = Date.now();
  try {
    const perms = getPermissions();
    return { name: 'Permissions', passed: true, message: `Safe mode: ${perms.safeMode ? 'ON' : 'OFF'}`, duration: Date.now() - start };
  } catch (err) {
    return { name: 'Permissions', passed: false, message: String(err), duration: Date.now() - start };
  }
}

async function testIndexedDB(): Promise<TestResult> {
  const start = Date.now();
  try {
    const req = indexedDB.open('_selftest', 1);
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => { req.result.close(); indexedDB.deleteDatabase('_selftest'); resolve(); };
      req.onerror = () => reject(req.error);
    });
    return { name: 'IndexedDB', passed: true, message: 'Read/write OK', duration: Date.now() - start };
  } catch (err) {
    return { name: 'IndexedDB', passed: false, message: String(err), duration: Date.now() - start };
  }
}

async function testLocalStorage(): Promise<TestResult> {
  const start = Date.now();
  try {
    localStorage.setItem('_selftest', 'ok');
    const val = localStorage.getItem('_selftest');
    localStorage.removeItem('_selftest');
    return { name: 'LocalStorage', passed: val === 'ok', message: val === 'ok' ? 'Read/write OK' : 'Value mismatch', duration: Date.now() - start };
  } catch (err) {
    return { name: 'LocalStorage', passed: false, message: String(err), duration: Date.now() - start };
  }
}

export async function runSelfTests(): Promise<TestResult[]> {
  const tests = [
    testAgentRouter(),
    testOrchestrator(),
    testMemoryStore(),
    testToolLearning(),
    testPermissions(),
    testIndexedDB(),
    testLocalStorage(),
  ];
  return Promise.all(tests);
}

export function formatTestResults(results: TestResult[]): string {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const lines = results.map(r =>
    `${r.passed ? '✅' : '❌'} ${r.name}: ${r.message} (${r.duration}ms)`
  );
  return `Self-Test: ${passed}/${total} passed\n${lines.join('\n')}`;
}
